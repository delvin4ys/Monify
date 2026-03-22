const { prisma } = require("./prisma");
const { countsAsBudgetSpend } = require("./wallet-delta");

function monthBounds(year, month1to12) {
  const start = new Date(year, month1to12 - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month1to12, 0, 23, 59, 59, 999);
  return { start, end };
}

function getBudgetEffectiveBounds(budget) {
  if (budget.periodStart && budget.periodEnd) {
    const start = new Date(budget.periodStart);
    const end = new Date(budget.periodEnd);
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }
  if (budget.year != null && budget.month != null) {
    return monthBounds(budget.year, budget.month);
  }
  return null;
}

function budgetOverlapsMonth(budget, year, month1to12) {
  const { start, end } = monthBounds(year, month1to12);
  if (budget.periodStart && budget.periodEnd) {
    const ps = new Date(budget.periodStart);
    const pe = new Date(budget.periodEnd);
    pe.setUTCHours(23, 59, 59, 999);
    return ps <= end && pe >= start;
  }
  return budget.year === year && budget.month === month1to12;
}

function formatPeriodLabel(budget) {
  if (budget.periodStart && budget.periodEnd) {
    const a = new Date(budget.periodStart);
    const b = new Date(budget.periodEnd);
    const opts = { day: "numeric", month: "short", year: "numeric" };
    return a.toLocaleDateString("id-ID", opts) + " – " + b.toLocaleDateString("id-ID", opts);
  }
  if (budget.year != null && budget.month != null) {
    return String(budget.month).padStart(2, "0") + "/" + budget.year + " (bulanan)";
  }
  return "—";
}

function daysRemainingInViewMonth(year, month1to12) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const lastDay = new Date(year, month1to12, 0).getDate();
  const end = new Date(year, month1to12, 0, 23, 59, 59, 999);
  if (year === y && month1to12 === m) {
    const today = now.getDate();
    return Math.max(1, lastDay - today + 1);
  }
  if (end < now) return 0;
  return lastDay;
}

function daysRemainingInBudgetPeriod(budget) {
  const now = new Date();
  if (budget.periodStart && budget.periodEnd) {
    const start = new Date(budget.periodStart);
    const end = new Date(budget.periodEnd);
    end.setUTCHours(23, 59, 59, 999);
    if (now > end) return 0;
    const from = now < start ? start : now;
    const diffMs = end.getTime() - from.getTime();
    return Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  }
  if (budget.year != null && budget.month != null) {
    return daysRemainingInViewMonth(budget.year, budget.month);
  }
  return 1;
}

async function sumSpentForCategories(userId, categoryIds, start, end) {
  if (!categoryIds.length) return 0;
  const txs = await prisma.transaction.findMany({
    where: {
      userId,
      status: "success",
      date: { gte: start, lte: end },
      categoryId: { in: categoryIds },
    },
    include: { category: true },
  });
  let sum = 0;
  for (const t of txs) {
    if (countsAsBudgetSpend(t.category)) sum += t.amount;
  }
  return sum;
}

async function getSpentForBudgetRow(userId, budget) {
  const bounds = getBudgetEffectiveBounds(budget);
  if (!bounds) return 0;
  const { start, end } = bounds;

  if (budget.targetKind === "CATEGORY") {
    return sumSpentForCategories(userId, [budget.targetId], start, end);
  }
  if (budget.targetKind === "PARENT") {
    const children = await prisma.category.findMany({
      where: { userId, parentId: budget.targetId },
      select: { id: true },
    });
    return sumSpentForCategories(
      userId,
      children.map((c) => c.id),
      start,
      end
    );
  }
  return 0;
}

async function resolveBudgetLabel(userId, budget) {
  if (budget.targetKind === "CATEGORY") {
    const c = await prisma.category.findFirst({ where: { id: budget.targetId, userId } });
    return c ? c.name : "—";
  }
  if (budget.targetKind === "PARENT") {
    const p = await prisma.categoryParent.findFirst({ where: { id: budget.targetId } });
    return p ? p.name : "—";
  }
  return "—";
}

/** Ikon kategori: URL (/uploads/...) atau emoji/teks di field Category.icon. Untuk target PARENT pakai ikon kategori anak pertama (nama ASC). */
async function resolveBudgetIcon(userId, budget) {
  if (budget.targetKind === "CATEGORY") {
    const c = await prisma.category.findFirst({
      where: { id: budget.targetId, userId },
      select: { icon: true },
    });
    return c && c.icon ? String(c.icon).trim() : null;
  }
  if (budget.targetKind === "PARENT") {
    const first = await prisma.category.findFirst({
      where: { userId, parentId: budget.targetId },
      select: { icon: true },
      orderBy: { name: "asc" },
    });
    return first && first.icon ? String(first.icon).trim() : null;
  }
  return null;
}

async function getBudgetRowsForMonth(userId, year, month1to12) {
  const all = await prisma.budget.findMany({
    where: { userId },
    orderBy: { id: "asc" },
  });
  const budgets = all.filter((b) => budgetOverlapsMonth(b, year, month1to12));

  const rows = [];
  for (const b of budgets) {
    const spent = await getSpentForBudgetRow(userId, b);
    const name = await resolveBudgetLabel(userId, b);
    const icon = await resolveBudgetIcon(userId, b);
    const daysLeft = daysRemainingInBudgetPeriod(b);
    const remain = Math.max(0, b.limitAmount - spent);
    const suggestedDaily = daysLeft > 0 ? Math.round(remain / daysLeft) : remain;

    rows.push({
      id: b.id,
      targetKind: b.targetKind,
      targetId: b.targetId,
      categoryName: name,
      categoryIcon: icon,
      limit: b.limitAmount,
      spent,
      year: b.year,
      month: b.month,
      periodStart: b.periodStart ? b.periodStart.toISOString().slice(0, 10) : null,
      periodEnd: b.periodEnd ? b.periodEnd.toISOString().slice(0, 10) : null,
      periodLabel: formatPeriodLabel(b),
      daysLeft,
      suggestedDaily,
    });
  }
  return rows;
}

async function getBudgetMonthSummary(userId, year, month1to12) {
  const rows = await getBudgetRowsForMonth(userId, year, month1to12);
  let totalLimit = 0;
  let totalSpent = 0;
  for (const r of rows) {
    totalLimit += r.limit;
    totalSpent += r.spent;
  }
  const remaining = Math.max(0, totalLimit - totalSpent);
  const daysLeft = daysRemainingInViewMonth(year, month1to12);
  const dailySuggestion = daysLeft > 0 ? Math.round(remaining / daysLeft) : remaining;

  return {
    totalLimit,
    totalSpent,
    remaining,
    daysLeftInMonth: daysLeft,
    dailySuggestion,
  };
}

module.exports = {
  getBudgetRowsForMonth,
  getBudgetMonthSummary,
  monthBounds,
  getSpentForBudgetRow,
  sumSpentForCategories,
  getBudgetEffectiveBounds,
  budgetOverlapsMonth,
};
