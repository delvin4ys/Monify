/**
 * Budget. Pengeluaran yang dihitung hanya transaksi berjenis "expense";
 * transfer, hutang, dan penyesuaian saldo tidak pernah mengurangi budget.
 * Budget ber-`walletId` hanya menghitung pengeluaran dari dompet itu.
 */
const { prisma } = require("../lib/prisma");
const { badRequest, notFound, conflict } = require("../lib/errors");
const { toDate, toDay, dayRange, monthBounds, diffDays, today } = require("../lib/dates");
const ledger = require("./ledger");

const WARN_AT = 80;

function bounds(b) {
  if (b.periodStart && b.periodEnd) return { from: toDay(b.periodStart), to: toDay(b.periodEnd) };
  return monthBounds(b.year, b.month);
}

/**
 * Semua budget yang beririsan dengan bulan yang dilihat, lengkap dengan realisasi.
 * Jumlah query tetap (tidak bergantung jumlah budget): budget, kategori, induk,
 * dompet, ditambah satu groupBy per rentang tanggal unik (biasanya satu).
 */
/**
 * @param preloaded data referensi yang sudah diambil pemanggil (opsional), agar tidak di-query ulang
 */
async function listForMonth(userId, year, month, todayStr = today(), preloaded = {}) {
  const view = monthBounds(year, month);
  const [all, cats, parents, wallets] = await Promise.all([
    prisma.budget.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    preloaded.categories || prisma.category.findMany({ where: { userId }, select: { id: true, name: true, icon: true, color: true, parentId: true } }),
    prisma.categoryParent.findMany({ where: { OR: [{ userId: null }, { userId }] }, select: { id: true, name: true } }),
    preloaded.wallets || prisma.wallet.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);
  const budgets = all.map((b) => ({ b, range: bounds(b) })).filter((x) => x.range.from <= view.to && x.range.to >= view.from);

  const ranges = new Map();
  for (const x of budgets) ranges.set(x.range.from + "|" + x.range.to, x.range);
  const spendByRange = new Map();
  await Promise.all(
    [...ranges.entries()].map(async ([key, r]) => {
      const rows = await prisma.transaction.groupBy({
        by: ["categoryId", "walletId"],
        where: { userId, kind: "expense", status: "success", date: dayRange(r.from, r.to) },
        _sum: { amount: true },
      });
      spendByRange.set(key, rows);
    })
  );

  const catById = new Map(cats.map((c) => [c.id, c]));
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const walletById = new Map(wallets.map((w) => [w.id, w]));
  const childrenOf = new Map();
  for (const c of cats) {
    if (!c.parentId) continue;
    if (!childrenOf.has(c.parentId)) childrenOf.set(c.parentId, []);
    childrenOf.get(c.parentId).push(c);
  }

  const items = budgets.map(({ b, range }) => {
    const isParent = b.targetKind === "PARENT";
    const children = isParent ? childrenOf.get(b.targetId) || [] : [];
    const ids = new Set(isParent ? children.map((c) => c.id) : [b.targetId]);
    let spent = 0;
    for (const row of spendByRange.get(range.from + "|" + range.to) || []) {
      if (!ids.has(row.categoryId)) continue;
      if (b.walletId && row.walletId !== b.walletId) continue;
      spent += ledger.num(row._sum.amount);
    }
    const limit = Number(b.limitAmount);
    const cat = isParent ? null : catById.get(b.targetId);
    const first = children.slice().sort((a, z) => a.name.localeCompare(z.name))[0];
    const pct = limit > 0 ? Math.round((spent / limit) * 1000) / 10 : 0;
    const daysLeft = todayStr > range.to ? 0 : diffDays(todayStr < range.from ? range.from : todayStr, range.to) + 1;
    const remaining = limit - spent;
    return {
      id: b.id,
      targetKind: b.targetKind,
      targetId: b.targetId,
      name: isParent ? (parentById.get(b.targetId) || {}).name || "—" : cat ? cat.name : "—",
      icon: isParent ? (first ? first.icon : "🗂️") : cat ? cat.icon : "🏷️",
      color: isParent ? (first ? first.color : null) : cat ? cat.color : null,
      walletId: b.walletId || null,
      walletName: b.walletId ? (walletById.get(b.walletId) || {}).name || null : null,
      limit,
      spent,
      remaining,
      percent: pct,
      status: pct >= 100 ? "over" : pct >= WARN_AT ? "warning" : "ok",
      isMonthly: !(b.periodStart && b.periodEnd),
      year: b.year,
      month: b.month,
      from: range.from,
      to: range.to,
      daysLeft,
      suggestedDaily: daysLeft > 0 && remaining > 0 ? Math.floor(remaining / daysLeft) : 0,
    };
  });

  const totalLimit = items.reduce((n, i) => n + i.limit, 0);
  const totalSpent = items.reduce((n, i) => n + i.spent, 0);
  return {
    year,
    month,
    budgets: items,
    summary: {
      totalLimit,
      totalSpent,
      remaining: totalLimit - totalSpent,
      percent: totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 1000) / 10 : 0,
      overCount: items.filter((i) => i.status === "over").length,
      warningCount: items.filter((i) => i.status === "warning").length,
    },
  };
}

async function assertTarget(userId, targetKind, targetId) {
  if (targetKind === "CATEGORY") {
    const c = await prisma.category.findFirst({ where: { id: targetId, userId } });
    if (!c || c.type !== "expense") throw badRequest("Pilih kategori pengeluaran.", { targetId: "Kategori tidak valid." });
  } else {
    const p = await prisma.categoryParent.findFirst({ where: { id: targetId, OR: [{ userId: null }, { userId }] } });
    if (!p || p.kind !== "expense") throw badRequest("Pilih grup pengeluaran.", { targetId: "Grup tidak valid." });
  }
}

async function create(userId, input) {
  await assertTarget(userId, input.targetKind, input.targetId);
  if (input.walletId) {
    const w = await prisma.wallet.findFirst({ where: { id: input.walletId, userId } });
    if (!w) throw badRequest("Dompet tidak ditemukan.", { walletId: "Pilih dompet." });
  }
  const custom = Boolean(input.periodStart && input.periodEnd);
  if (custom && input.periodEnd < input.periodStart) throw badRequest("Rentang tanggal tidak valid.", { periodEnd: "Harus setelah tanggal mulai." });
  if (!custom) {
    const dup = await prisma.budget.findFirst({
      where: { userId, targetKind: input.targetKind, targetId: input.targetId, year: input.year, month: input.month, walletId: input.walletId || null, periodStart: null },
    });
    if (dup) throw conflict("Budget untuk target, dompet, dan bulan ini sudah ada.", "BUDGET_EXISTS");
  }
  const b = await prisma.budget.create({
    data: {
      userId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      walletId: input.walletId || null,
      limitAmount: input.limitAmount,
      year: custom ? null : input.year,
      month: custom ? null : input.month,
      periodStart: custom ? toDate(input.periodStart) : null,
      periodEnd: custom ? toDate(input.periodEnd) : null,
    },
  });
  return { id: b.id };
}

async function update(userId, id, input) {
  const b = await prisma.budget.findFirst({ where: { id, userId } });
  if (!b) throw notFound("Budget tidak ditemukan.");
  const data = {};
  if (input.limitAmount != null) data.limitAmount = input.limitAmount;
  if (input.walletId !== undefined) {
    if (input.walletId) {
      const w = await prisma.wallet.findFirst({ where: { id: input.walletId, userId } });
      if (!w) throw badRequest("Dompet tidak ditemukan.", { walletId: "Pilih dompet." });
    }
    data.walletId = input.walletId || null;
  }
  await prisma.budget.update({ where: { id }, data });
  return { id };
}

async function remove(userId, id) {
  const r = await prisma.budget.deleteMany({ where: { id, userId } });
  if (r.count === 0) throw notFound("Budget tidak ditemukan.");
}

module.exports = { listForMonth, create, update, remove, WARN_AT };
