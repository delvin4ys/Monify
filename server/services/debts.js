/**
 * Hutang (PAYABLE) dan piutang (RECEIVABLE).
 *
 * Model akuntansi:
 * - Pokok hutang dan pembayarannya dicatat sebagai Transaction berjenis "debt".
 *   Jenis ini tidak masuk laporan pemasukan/pengeluaran: meminjam bukan
 *   pendapatan dan melunasi pokok bukan konsumsi, sehingga tidak ada hitungan ganda.
 * - Bunga atau biaya dicatat terpisah sebagai pengeluaran biasa (kind "expense")
 *   yang tertaut ke hutangnya, sehingga tetap muncul di laporan.
 * - `outstanding` selalu = principal − Σ pembayaran dan hanya diubah di sini.
 *
 * Satu pembayaran = satu DebtPayment + satu Transaction, dibuat bersamaan.
 * Pengguna tidak pernah perlu memasukkan pembayaran dua kali.
 */
const { Prisma } = require("@prisma/client");
const { prisma } = require("../lib/prisma");
const { badRequest, notFound, conflict } = require("../lib/errors");
const { toDate } = require("../lib/dates");
const S = require("../lib/serializers");
const ledger = require("./ledger");
const audit = require("./audit");

const DETAIL = {
  wallet: true,
  payments: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { transaction: { include: { wallet: true } } } },
};

/** Arah uang terhadap dompet saya. */
const principalDirection = (type) => (type === "PAYABLE" ? "in" : "out"); // meminjam = masuk, meminjamkan = keluar
const paymentDirection = (type) => (type === "PAYABLE" ? "out" : "in"); // melunasi = keluar, menerima pelunasan = masuk

async function owned(db, userId, id, include) {
  const d = await db.debt.findFirst({ where: { id, userId }, include });
  if (!d) throw notFound("Catatan hutang/piutang tidak ditemukan.");
  return d;
}

async function wallet(db, userId, id, field = "walletId") {
  const w = await db.wallet.findFirst({ where: { id, userId } });
  if (!w) throw badRequest("Dompet tidak ditemukan.", { [field]: "Pilih dompet." });
  return w;
}

/** Hitung ulang sisa dan status dari pembayaran yang ada. */
async function recalc(tx, debtId) {
  const [debt, agg] = await Promise.all([
    tx.debt.findUnique({ where: { id: debtId } }),
    tx.debtPayment.aggregate({ where: { debtId }, _sum: { amount: true } }),
  ]);
  const paid = ledger.num(agg._sum.amount);
  const principal = Number(debt.principal);
  if (paid > principal) throw conflict("Total pembayaran melebihi jumlah hutang.", "OVERPAYMENT");
  const outstanding = principal - paid;
  return tx.debt.update({ where: { id: debtId }, data: { outstanding, status: outstanding === 0 ? "PAID" : "OPEN" } });
}

async function list(userId, { status, type } = {}) {
  const [rows, totals] = await Promise.all([
    prisma.debt.findMany({
      where: { userId, ...(status ? { status } : {}), ...(type ? { type } : {}) },
      include: { wallet: true },
      orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { date: "desc" }],
    }),
    prisma.debt.groupBy({ by: ["type"], where: { userId, status: "OPEN" }, _sum: { outstanding: true }, _count: true }),
  ]);
  const t = Object.fromEntries(totals.map((x) => [x.type, { outstanding: ledger.num(x._sum.outstanding), count: x._count }]));
  return {
    debts: rows.map(S.debt),
    totals: {
      payable: t.PAYABLE ? t.PAYABLE.outstanding : 0,
      payableCount: t.PAYABLE ? t.PAYABLE.count : 0,
      receivable: t.RECEIVABLE ? t.RECEIVABLE.outstanding : 0,
      receivableCount: t.RECEIVABLE ? t.RECEIVABLE.count : 0,
    },
  };
}

async function get(userId, id) {
  return S.debt(await owned(prisma, userId, id, DETAIL));
}

/**
 * @param input.walletId  bila diisi, pokok dicatat sebagai mutasi dompet
 *                        (uang pinjaman masuk / uang yang dipinjamkan keluar).
 *                        Kosongkan untuk hutang yang tidak melewati dompet.
 */
async function create(userId, input) {
  const id = await prisma.$transaction(async (tx) => {
    const w = input.walletId ? await wallet(tx, userId, input.walletId) : null;
    const debt = await tx.debt.create({
      data: {
        userId,
        type: input.type,
        personName: input.personName,
        principal: input.amount,
        outstanding: input.amount,
        date: toDate(input.date),
        dueDate: input.dueDate ? toDate(input.dueDate) : null,
        description: input.description || null,
        walletId: w ? w.id : null,
      },
    });
    if (w) {
      const direction = principalDirection(input.type);
      await ledger.applyDelta(tx, userId, w.id, ledger.signed(direction, input.amount));
      await tx.transaction.create({
        data: {
          userId,
          walletId: w.id,
          amount: input.amount,
          kind: "debt",
          direction,
          type: "debt",
          title: (input.type === "PAYABLE" ? "Pinjaman dari " : "Meminjamkan ke ") + input.personName,
          date: debt.date,
          currency: w.currency,
          counterparty: input.personName,
          debtId: debt.id,
        },
      });
    }
    await audit.record(tx, userId, "debt.create", "Debt", debt.id, { type: input.type, amount: input.amount });
    return debt.id;
  });
  return get(userId, id);
}

async function update(userId, id, input) {
  await prisma.$transaction(async (tx) => {
    const d = await owned(tx, userId, id);
    const data = {};
    if (input.personName != null) data.personName = input.personName;
    if (input.description !== undefined) data.description = input.description;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? toDate(input.dueDate) : null;
    if (input.date) data.date = toDate(input.date);

    if (input.amount != null && input.amount !== Number(d.principal)) {
      const paid = Number(d.principal) - Number(d.outstanding);
      if (input.amount < paid) {
        throw badRequest("Jumlah tidak boleh lebih kecil dari yang sudah dibayar.", { amount: "Lebih kecil dari total pembayaran." });
      }
      data.principal = input.amount;
      // Mutasi pokok di dompet (bila ada) ikut disesuaikan.
      const leg = await tx.transaction.findFirst({ where: { debtId: id, userId, kind: "debt", payment: { is: null } } });
      if (leg) {
        const diff = input.amount - Number(leg.amount);
        await ledger.applyDelta(tx, userId, leg.walletId, ledger.signed(leg.direction, diff));
        await tx.transaction.update({ where: { id: leg.id }, data: { amount: input.amount } });
      }
    }
    if (data.date || data.personName) {
      const leg = await tx.transaction.findFirst({ where: { debtId: id, userId, kind: "debt", payment: { is: null } } });
      if (leg) {
        await tx.transaction.update({
          where: { id: leg.id },
          data: { ...(data.date ? { date: data.date } : {}), ...(data.personName ? { counterparty: data.personName } : {}) },
        });
      }
    }
    await tx.debt.update({ where: { id }, data });
    await recalc(tx, id);
    await audit.record(tx, userId, "debt.update", "Debt", id);
  });
  return get(userId, id);
}

/** Hapus catatan hutang beserta seluruh mutasinya; saldo dompet dikembalikan. */
async function remove(userId, id) {
  await prisma.$transaction(async (tx) => {
    await owned(tx, userId, id);
    const legs = await tx.transaction.findMany({ where: { debtId: id, userId, status: "success" } });
    await ledger.applyDeltas(tx, userId, legs.map((l) => ({ walletId: l.walletId, delta: -ledger.signed(l.direction, l.amount) })));
    await tx.debt.delete({ where: { id } }); // pembayaran & mutasi ikut terhapus (cascade)
    await audit.record(tx, userId, "debt.delete", "Debt", id, { reversedTransactions: legs.length });
  });
}

/**
 * Catat pembayaran (sebagian atau penuh).
 * @param input.feeAmount  bunga/biaya opsional — dicatat sebagai pengeluaran terpisah.
 */
async function addPayment(userId, debtId, input) {
  if (input.idempotencyKey) {
    const dup = await prisma.transaction.findFirst({ where: { userId, idempotencyKey: input.idempotencyKey } });
    if (dup) return { debt: await get(userId, debtId), replayed: true };
  }
  try {
    await prisma.$transaction(async (tx) => {
      const d = await owned(tx, userId, debtId);
      const w = await wallet(tx, userId, input.walletId);

      // Kurangi sisa hutang dengan syarat pada UPDATE yang sama: dua pembayaran
      // bersamaan tidak bisa bersama-sama melebihi sisa.
      const dec = await tx.debt.updateMany({
        where: { id: debtId, userId, outstanding: { gte: input.amount } },
        data: { outstanding: { decrement: input.amount } },
      });
      if (dec.count === 0) {
        const cur = await tx.debt.findUnique({ where: { id: debtId } });
        throw badRequest(
          Number(cur.outstanding) === 0 ? "Catatan ini sudah lunas." : "Jumlah melebihi sisa yang belum dibayar.",
          { amount: `Maksimal ${Number(cur.outstanding)}.` },
          "OVERPAYMENT"
        );
      }

      const direction = paymentDirection(d.type);
      const date = toDate(input.date);
      await ledger.applyDelta(tx, userId, w.id, ledger.signed(direction, input.amount));
      const leg = await tx.transaction.create({
        data: {
          userId,
          walletId: w.id,
          amount: input.amount,
          kind: "debt",
          direction,
          type: "debt",
          title: (d.type === "PAYABLE" ? "Bayar hutang ke " : "Terima pembayaran dari ") + d.personName,
          date,
          currency: w.currency,
          counterparty: d.personName,
          debtId,
          idempotencyKey: input.idempotencyKey || null,
        },
      });
      await tx.debtPayment.create({
        data: { debtId, userId, amount: input.amount, date, note: input.note || null, transactionId: leg.id },
      });

      if (input.feeAmount) {
        if (d.type !== "PAYABLE") throw badRequest("Bunga/biaya hanya berlaku untuk pembayaran hutang.", { feeAmount: "Tidak berlaku." });
        const cat = input.feeCategoryId ? await tx.category.findFirst({ where: { id: input.feeCategoryId, userId, type: "expense" } }) : null;
        if (input.feeCategoryId && !cat) throw badRequest("Kategori biaya tidak ditemukan.", { feeCategoryId: "Pilih kategori pengeluaran." });
        await ledger.applyDelta(tx, userId, w.id, -input.feeAmount);
        await tx.transaction.create({
          data: {
            userId,
            walletId: w.id,
            categoryId: cat ? cat.id : null,
            amount: input.feeAmount,
            kind: "expense",
            direction: "out",
            type: "expense",
            title: "Bunga/biaya hutang ke " + d.personName,
            date,
            currency: w.currency,
            counterparty: d.personName,
          },
        });
      }

      await recalc(tx, debtId);
      await audit.record(tx, userId, "debt.payment", "Debt", debtId, { amount: input.amount, transactionId: leg.id });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && input.idempotencyKey) {
      return { debt: await get(userId, debtId), replayed: true };
    }
    throw e;
  }
  return { debt: await get(userId, debtId), replayed: false };
}

async function updatePayment(userId, debtId, paymentId, input) {
  await prisma.$transaction(async (tx) => {
    await owned(tx, userId, debtId);
    const p = await tx.debtPayment.findFirst({ where: { id: paymentId, debtId, userId }, include: { transaction: true } });
    if (!p) throw notFound("Pembayaran tidak ditemukan.");
    const amount = input.amount != null ? input.amount : Number(p.amount);
    const date = input.date ? toDate(input.date) : p.date;
    const leg = p.transaction;
    if (leg) {
      const w = input.walletId ? await wallet(tx, userId, input.walletId) : { id: leg.walletId, currency: leg.currency };
      await ledger.applyDeltas(tx, userId, [
        { walletId: leg.walletId, delta: -ledger.signed(leg.direction, leg.amount) },
        { walletId: w.id, delta: ledger.signed(leg.direction, amount) },
      ]);
      await tx.transaction.update({ where: { id: leg.id }, data: { amount, date, walletId: w.id, currency: w.currency } });
    }
    await tx.debtPayment.update({ where: { id: paymentId }, data: { amount, date, ...(input.note !== undefined ? { note: input.note } : {}) } });
    await recalc(tx, debtId); // menolak bila total pembayaran melebihi pokok
    await audit.record(tx, userId, "debt.payment_update", "Debt", debtId, { paymentId, amount });
  });
  return get(userId, debtId);
}

async function removePayment(userId, debtId, paymentId) {
  await prisma.$transaction(async (tx) => {
    await owned(tx, userId, debtId);
    const p = await tx.debtPayment.findFirst({ where: { id: paymentId, debtId, userId }, include: { transaction: true } });
    if (!p) throw notFound("Pembayaran tidak ditemukan.");
    if (p.transaction) {
      await ledger.applyDelta(tx, userId, p.transaction.walletId, -ledger.signed(p.transaction.direction, p.transaction.amount));
      await tx.transaction.delete({ where: { id: p.transaction.id } }); // DebtPayment ikut terhapus (cascade)
    } else {
      await tx.debtPayment.delete({ where: { id: paymentId } });
    }
    await recalc(tx, debtId);
    await audit.record(tx, userId, "debt.payment_delete", "Debt", debtId, { paymentId, amount: Number(p.amount) });
  });
  return { attachmentKey: null };
}

module.exports = { list, get, create, update, remove, addPayment, updatePayment, removePayment, recalc };
