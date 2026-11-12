/**
 * Tujuan tabungan (savings goals).
 *
 * Dua cara mencatat setoran — dibedakan dengan jelas agar saldo tidak pernah
 * bertambah dua kali:
 *
 * 1. Alokasi (default). Setoran hanya menandai sebagian uang yang sudah ada
 *    sebagai "untuk tujuan ini". Tidak ada saldo dompet yang berubah.
 * 2. Pemindahan nyata. Bila tujuan punya dompet tabungan (`walletId`) dan
 *    setoran menyebut dompet sumber yang berbeda, dibuat satu Transfer internal
 *    dari sumber ke dompet tabungan. Total saldo pengguna tetap sama — uang
 *    hanya berpindah dompet.
 *
 * Di kedua cara, setoran BUKAN pemasukan dan BUKAN pengeluaran.
 */
const { prisma } = require("../lib/prisma");
const { badRequest, notFound } = require("../lib/errors");
const { toDate, toDay, today, diffDays, addDays } = require("../lib/dates");
const S = require("../lib/serializers");
const ledger = require("./ledger");
const transfers = require("./transfers");
const audit = require("./audit");
const idempotency = require("./idempotency");

function shape(g, todayStr = today()) {
  const target = Number(g.targetAmount);
  const saved = Number(g.savedAmount);
  const remaining = Math.max(target - saved, 0);
  const out = {
    id: g.id,
    name: g.name,
    icon: g.icon || "🎯",
    color: g.color || null,
    targetAmount: target,
    savedAmount: saved,
    remaining,
    percent: target > 0 ? Math.min(Math.round((saved / target) * 1000) / 10, 100) : 0,
    targetDate: toDay(g.targetDate),
    walletId: g.walletId || null,
    walletName: g.wallet ? g.wallet.name : null,
    status: g.status,
    estimatedCompletion: null,
    monthlyNeeded: null,
  };
  if (g.entries) {
    out.entries = g.entries.map(S.savingsEntry);
    // Perkiraan selesai: laju menabung rata-rata sejak setoran pertama.
    const first = g.entries.length ? toDay(g.entries[g.entries.length - 1].date) : null;
    if (remaining > 0 && saved > 0 && first) {
      const days = Math.max(diffDays(first, todayStr), 1);
      const perDay = saved / days;
      if (perDay > 0) {
        const eta = Math.ceil(remaining / perDay);
        if (eta < 36500) out.estimatedCompletion = addDays(todayStr, eta);
      }
    }
  }
  if (remaining > 0 && out.targetDate && out.targetDate > todayStr) {
    const months = Math.max(diffDays(todayStr, out.targetDate) / 30.4375, 1);
    out.monthlyNeeded = Math.ceil(remaining / months);
  }
  return out;
}

async function owned(db, userId, id, include) {
  const g = await db.savingsGoal.findFirst({ where: { id, userId }, include });
  if (!g) throw notFound("Tujuan tabungan tidak ditemukan.");
  return g;
}

async function recalc(tx, goalId) {
  const [goal, agg] = await Promise.all([
    tx.savingsGoal.findUnique({ where: { id: goalId } }),
    tx.savingsEntry.aggregate({ where: { goalId }, _sum: { amount: true } }),
  ]);
  const saved = ledger.num(agg._sum.amount);
  if (saved < 0) throw badRequest("Penarikan melebihi jumlah yang terkumpul.", { amount: "Melebihi tabungan terkumpul." });
  const status = goal.status === "ARCHIVED" ? "ARCHIVED" : saved >= Number(goal.targetAmount) ? "ACHIEVED" : "ACTIVE";
  return tx.savingsGoal.update({ where: { id: goalId }, data: { savedAmount: saved, status } });
}

async function list(userId) {
  const rows = await prisma.savingsGoal.findMany({
    where: { userId },
    include: { wallet: true },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  const goals = rows.map((g) => shape(g));
  const active = goals.filter((g) => g.status !== "ARCHIVED");
  return {
    goals,
    totals: {
      target: active.reduce((n, g) => n + g.targetAmount, 0),
      saved: active.reduce((n, g) => n + g.savedAmount, 0),
    },
  };
}

async function get(userId, id) {
  const g = await owned(prisma, userId, id, { wallet: true, entries: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] } });
  return shape(g);
}

async function checkWallet(userId, walletId) {
  if (!walletId) return null;
  const w = await prisma.wallet.findFirst({ where: { id: walletId, userId } });
  if (!w) throw badRequest("Dompet tidak ditemukan.", { walletId: "Pilih dompet." });
  return w.id;
}

async function create(userId, input) {
  const walletId = await checkWallet(userId, input.walletId);
  const g = await prisma.savingsGoal.create({
    data: {
      userId,
      name: input.name,
      targetAmount: input.targetAmount,
      targetDate: input.targetDate ? toDate(input.targetDate) : null,
      icon: input.icon || null,
      color: input.color || null,
      walletId,
    },
  });
  return get(userId, g.id);
}

async function update(userId, id, input) {
  await owned(prisma, userId, id);
  const data = {};
  if (input.name != null) data.name = input.name;
  if (input.targetAmount != null) data.targetAmount = input.targetAmount;
  if (input.targetDate !== undefined) data.targetDate = input.targetDate ? toDate(input.targetDate) : null;
  if (input.icon !== undefined) data.icon = input.icon;
  if (input.color !== undefined) data.color = input.color;
  if (input.walletId !== undefined) data.walletId = await checkWallet(userId, input.walletId);
  if (input.archived !== undefined) data.status = input.archived ? "ARCHIVED" : "ACTIVE";
  await prisma.$transaction(async (tx) => {
    await tx.savingsGoal.update({ where: { id }, data });
    await recalc(tx, id);
  });
  return get(userId, id);
}

/** Menghapus tujuan tidak membatalkan transfer yang sudah terjadi — uangnya tetap di dompet tabungan. */
async function remove(userId, id) {
  const r = await prisma.savingsGoal.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw notFound("Tujuan tabungan tidak ditemukan.");
}

/**
 * @param input.type      deposit | withdraw
 * @param input.walletId  dompet lawan (sumber setoran / tujuan penarikan), opsional
 */
async function addEntry(userId, goalId, input) {
  const result = await prisma.$transaction(async (tx) => {
    const g = await owned(tx, userId, goalId);
    // Request yang sama terkirim ulang (koneksi putus, klik ganda): jangan menabung dua kali.
    if (await idempotency.findReplay(tx, userId, "savings.entry", input.idempotencyKey)) return { replayed: true };
    if (g.status === "ARCHIVED") throw badRequest("Tujuan ini diarsipkan.");
    const isDeposit = input.type !== "withdraw";
    const signedAmount = isDeposit ? input.amount : -input.amount;

    let transferId = null;
    if (input.walletId) {
      if (!g.walletId) {
        throw badRequest("Tujuan ini belum punya dompet tabungan. Atur dompet tabungan dulu, atau catat sebagai alokasi tanpa memindahkan uang.", {
          walletId: "Tujuan belum punya dompet tabungan.",
        });
      }
      const transfer = await transfers.createInTx(tx, userId, {
        fromWalletId: isDeposit ? input.walletId : g.walletId,
        toWalletId: isDeposit ? g.walletId : input.walletId,
        amount: input.amount,
        date: input.date,
        note: (isDeposit ? "Setoran tabungan: " : "Penarikan tabungan: ") + g.name,
      });
      transferId = transfer.id;
    }

    const entry = await tx.savingsEntry.create({
      data: { goalId, userId, amount: signedAmount, date: toDate(input.date), note: input.note || null, transferId },
    });
    const goal = await recalc(tx, goalId);
    await audit.record(tx, userId, "savings.entry", "SavingsGoal", goalId, {
      amount: signedAmount,
      transferId,
      entryId: entry.id,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    });
    return { entryId: entry.id, achieved: goal.status === "ACHIEVED" && g.status !== "ACHIEVED" };
  });
  return { goal: await get(userId, goalId), movedMoney: Boolean(input.walletId), justAchieved: Boolean(result.achieved), replayed: Boolean(result.replayed) };
}

async function removeEntry(userId, goalId, entryId) {
  const e = await prisma.savingsEntry.findFirst({ where: { id: entryId, goalId, userId } });
  if (!e) throw notFound("Catatan tabungan tidak ditemukan.");
  if (e.transferId) {
    await transfers.remove(userId, e.transferId); // membatalkan transfer + menghapus entri + recalc
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.savingsEntry.delete({ where: { id: entryId } });
      await recalc(tx, goalId);
    });
  }
  return get(userId, goalId);
}

module.exports = { list, get, create, update, remove, addEntry, removeEntry, recalc };
