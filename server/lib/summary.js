const { prisma } = require("./prisma");
const { getWalletDelta } = require("./wallet-delta");

function pctDelta(cur, prev) {
  if (prev === 0) return cur === 0 ? 0 : Math.round(cur > 0 ? 100 : -100);
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

function currentAndPrevMonthBounds() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const curStart = new Date(y, m, 1, 0, 0, 0, 0);
  const curEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);

  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 11 : m - 1;
  const prevStart = new Date(py, pm, 1, 0, 0, 0, 0);
  const prevEnd = new Date(py, pm + 1, 0, 23, 59, 59, 999);

  return { curStart, curEnd, prevStart, prevEnd };
}

async function getFinancialSummary(userId, currency = "IDR") {
  const ccy = currency === "USD" ? "USD" : "IDR";
  const { curStart, curEnd, prevStart, prevEnd } = currentAndPrevMonthBounds();

  const balanceAgg = await prisma.wallet.aggregate({
    where: { userId, currency: ccy },
    _sum: { balance: true },
  });
  const balancePrimary = balanceAgg._sum.balance ?? 0;

  const [curTx, prevTx] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        status: "success",
        date: { gte: curStart, lte: curEnd },
        wallet: { currency: ccy },
      },
      include: { category: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        status: "success",
        date: { gte: prevStart, lte: prevEnd },
        wallet: { currency: ccy },
      },
      include: { category: true },
    }),
  ]);

  function sumInOut(rows) {
    let expenses = 0;
    let income = 0;
    for (const r of rows) {
      const d = getWalletDelta(r.category, r.amount);
      if (d < 0) expenses += -d;
      else if (d > 0) income += d;
    }
    return { expenses, income };
  }

  const currentMonth = sumInOut(curTx);
  const previousMonth = sumInOut(prevTx);

  const expensesMonth = currentMonth.expenses;
  const incomeMonth = currentMonth.income;
  const expensesPrev = previousMonth.expenses;
  const incomePrev = previousMonth.income;

  const savingsMonth = incomeMonth - expensesMonth;
  const savingsPrev = incomePrev - expensesPrev;

  const expensesDeltaPct =
    expensesPrev === 0 ? 0 : Math.round(((expensesMonth - expensesPrev) / expensesPrev) * 1000) / 10;

  const balanceDeltaPct = pctDelta(savingsMonth, savingsPrev);
  const savingsDeltaPct = pctDelta(savingsMonth, savingsPrev);

  return {
    currency: ccy,
    balance: balancePrimary,
    balanceIdr: ccy === "IDR" ? balancePrimary : null,
    balanceUsd: ccy === "USD" ? balancePrimary : null,
    balanceDeltaPct,
    expensesMonth,
    expensesDeltaPct,
    savingsMonth,
    savingsDeltaPct,
  };
}

module.exports = { getFinancialSummary };
