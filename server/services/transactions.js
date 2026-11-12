const { Prisma } = require("@prisma/client");
const { prisma } = require("../lib/prisma");
const { badRequest, notFound, conflict } = require("../lib/errors");
const { toDate, dayRange } = require("../lib/dates");
const S = require("../lib/serializers");
const ledger = require("./ledger");
const audit = require("./audit");

const INCLUDE = { category: true, wallet: true };
const SORTS = {
  date_desc: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  date_asc: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  amount_desc: [{ amount: "desc" }, { id: "desc" }],
  amount_asc: [{ amount: "asc" }, { id: "asc" }],
};

function buildWhere(userId, f) {
  const where = { userId };
  if (f.from && f.to) where.date = dayRange(f.from, f.to);
  if (f.walletId) where.walletId = f.walletId;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.kind) where.kind = f.kind;
  if (f.status) where.status = f.status;
  if (f.debtId) where.debtId = f.debtId;
  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" };
    where.OR = [
      { title: contains },
      { counterparty: contains },
      { relatedParty: contains },
      { category: { name: contains } },
      { wallet: { name: contains } },
    ];
  }
  return where;
}

/**
 * Daftar transaksi ber-pagination (cursor) + total pemasukan/pengeluaran untuk
 * filter yang sama. Total dihitung database, bukan dari halaman yang dimuat.
 */
async function list(userId, f) {
  const where = buildWhere(userId, f);
  const limit = Math.min(Math.max(f.limit || 50, 1), 100);
  const [rows, sums] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: SORTS[f.sort] || SORTS.date_desc,
      include: INCLUDE,
      take: limit + 1,
      ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    }),
    f.cursor
      ? null
      : prisma.transaction.groupBy({ by: ["kind"], where: { ...where, status: "success" }, _sum: { amount: true }, _count: true }),
  ]);
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(S.transaction);
  const out = { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  if (sums) {
    const by = Object.fromEntries(sums.map((s) => [s.kind, { sum: ledger.num(s._sum.amount), count: s._count }]));
    out.totals = {
      income: by.income ? by.income.sum : 0,
      expense: by.expense ? by.expense.sum : 0,
      count: sums.reduce((n, s) => n + s._count, 0),
    };
    out.totals.net = out.totals.income - out.totals.expense;
  }
  return out;
}

async function get(userId, id) {
  const t = await prisma.transaction.findFirst({ where: { id, userId }, include: INCLUDE });
  if (!t) throw notFound("Transaksi tidak ditemukan.");
  return S.transaction(t);
}

/**
 * Validasi kepemilikan dompet & kategori dan tentukan klasifikasi transaksi.
 * kind:
 *  - expense / income : butuh kategori berjenis sama
 *  - transfer         : transfer eksternal non-pengeluaran (ke/dari orang lain),
 *                       butuh nama pihak, tanpa kategori, tidak masuk laporan
 */
async function resolve(db, userId, input) {
  const wallet = await db.wallet.findFirst({ where: { id: input.walletId, userId } });
  if (!wallet) throw badRequest("Dompet tidak ditemukan.", { walletId: "Pilih dompet." });
  if (!wallet.active) throw badRequest("Dompet ini diarsipkan.", { walletId: "Dompet diarsipkan." });

  let category = null;
  let direction;
  if (input.kind === "transfer") {
    if (!input.counterparty) throw badRequest("Isi nama penerima / pengirim.", { counterparty: "Wajib diisi untuk transfer." });
    direction = input.direction === "in" ? "in" : "out";
  } else {
    category = await db.category.findFirst({ where: { id: input.categoryId || "", userId } });
    if (!category) throw badRequest("Kategori tidak ditemukan.", { categoryId: "Pilih kategori." });
    if (category.type !== input.kind) throw badRequest("Kategori tidak sesuai dengan jenis transaksi.", { categoryId: "Kategori tidak sesuai." });
    direction = input.kind === "income" ? "in" : "out";
  }
  return { wallet, category, direction };
}

async function findByKey(db, userId, key) {
  if (!key) return null;
  return db.transaction.findFirst({ where: { userId, idempotencyKey: key }, include: INCLUDE });
}

async function create(userId, input) {
  const existing = await findByKey(prisma, userId, input.idempotencyKey);
  if (existing) return { transaction: S.transaction(existing), replayed: true };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const { wallet, category, direction } = await resolve(tx, userId, input);
      const status = input.status === "pending" ? "pending" : "success";
      if (status === "success") {
        await ledger.applyDelta(tx, userId, wallet.id, ledger.signed(direction, input.amount));
      }
      const t = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          categoryId: category ? category.id : null,
          amount: input.amount,
          kind: input.kind,
          direction,
          type: input.kind,
          title: input.title,
          date: toDate(input.date),
          status,
          // Mata uang mengikuti dompet, bukan preferensi tampilan.
          currency: wallet.currency,
          counterparty: input.counterparty || null,
          relatedParty: input.relatedParty || null,
          attachmentKey: input.attachmentKey || null,
          source: input.source === "receipt_ai" ? "receipt_ai" : "manual",
          idempotencyKey: input.idempotencyKey || null,
        },
        include: INCLUDE,
      });
      await audit.record(tx, userId, "transaction.create", "Transaction", t.id, { kind: t.kind, amount: input.amount, source: t.source });
      return t;
    });
    return { transaction: S.transaction(created), replayed: false };
  } catch (e) {
    // Dua request identik tiba bersamaan: yang kalah mengembalikan hasil pemenang.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && input.idempotencyKey) {
      const winner = await findByKey(prisma, userId, input.idempotencyKey);
      if (winner) return { transaction: S.transaction(winner), replayed: true };
    }
    throw e;
  }
}

function assertPlain(t) {
  if (t.transferId) throw conflict("Ini bagian dari transfer antar dompet. Ubah lewat menu Transfer.", "MANAGED_BY_TRANSFER");
  if (t.debtId) throw conflict("Ini bagian dari catatan hutang/piutang. Ubah lewat menu Hutang & Piutang.", "MANAGED_BY_DEBT");
  if (t.kind === "adjustment") throw conflict("Penyesuaian saldo tidak bisa diubah. Hapus lalu buat penyesuaian baru.", "ADJUSTMENT_LOCKED");
}

async function update(userId, id, input) {
  const updated = await prisma.$transaction(async (tx) => {
    const old = await tx.transaction.findFirst({ where: { id, userId } });
    if (!old) throw notFound("Transaksi tidak ditemukan.");
    assertPlain(old);
    if (!["expense", "income", "transfer"].includes(old.kind)) throw conflict("Transaksi ini tidak bisa diubah.", "LOCKED");

    const next = {
      kind: input.kind || old.kind,
      walletId: input.walletId || old.walletId,
      categoryId: input.categoryId !== undefined ? input.categoryId : old.categoryId,
      direction: input.direction || old.direction,
      counterparty: input.counterparty !== undefined ? input.counterparty : old.counterparty,
      amount: input.amount != null ? input.amount : Number(old.amount),
    };
    const { wallet, category, direction } = await resolve(tx, userId, next);
    const status = input.status || old.status;

    // Batalkan dampak lama, terapkan dampak baru — dalam satu langkah atomic.
    const changes = [];
    if (old.status === "success") changes.push({ walletId: old.walletId, delta: -ledger.signed(old.direction, old.amount) });
    if (status === "success") changes.push({ walletId: wallet.id, delta: ledger.signed(direction, next.amount) });
    await ledger.applyDeltas(tx, userId, changes);

    const t = await tx.transaction.update({
      where: { id },
      data: {
        walletId: wallet.id,
        categoryId: category ? category.id : null,
        amount: next.amount,
        kind: next.kind,
        direction,
        type: next.kind,
        title: input.title != null ? input.title : old.title,
        date: input.date ? toDate(input.date) : old.date,
        status,
        currency: wallet.currency,
        counterparty: next.counterparty || null,
        relatedParty: input.relatedParty !== undefined ? input.relatedParty : old.relatedParty,
        attachmentKey: input.attachmentKey !== undefined ? input.attachmentKey : old.attachmentKey,
        imageUrl: input.attachmentKey !== undefined ? null : old.imageUrl,
      },
      include: INCLUDE,
    });
    await audit.record(tx, userId, "transaction.update", "Transaction", id, {
      before: { amount: Number(old.amount), walletId: old.walletId, status: old.status },
      after: { amount: next.amount, walletId: wallet.id, status },
    });
    return t;
  });
  return S.transaction(updated);
}

/**
 * Hapus transaksi. Baris yang dikelola fitur lain diteruskan ke service-nya
 * supaya pasangan/induknya ikut konsisten.
 */
async function remove(userId, id) {
  const t = await prisma.transaction.findFirst({ where: { id, userId }, include: { payment: true } });
  if (!t) throw notFound("Transaksi tidak ditemukan.");
  if (t.transferId) return require("./transfers").remove(userId, t.transferId);
  if (t.payment) return require("./debts").removePayment(userId, t.debtId, t.payment.id);
  if (t.debtId) {
    throw conflict("Ini pencatatan pokok hutang/piutang. Hapus catatannya lewat menu Hutang & Piutang.", "MANAGED_BY_DEBT");
  }
  await prisma.$transaction(async (tx) => {
    const cur = await tx.transaction.findFirst({ where: { id, userId } });
    if (!cur) throw notFound("Transaksi tidak ditemukan.");
    if (cur.status === "success") {
      await ledger.applyDelta(tx, userId, cur.walletId, -ledger.signed(cur.direction, cur.amount));
    }
    await tx.transaction.delete({ where: { id } });
    await audit.record(tx, userId, "transaction.delete", "Transaction", id, { kind: cur.kind, amount: Number(cur.amount) });
  });
  return { attachmentKey: t.attachmentKey || null };
}

module.exports = { INCLUDE, list, get, create, update, remove };
