const { prisma } = require("./prisma");
const { getWalletDelta } = require("./wallet-delta");

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

async function getMonthlyIncomeSeries(userId, currency = "IDR", toDateStr = null) {
  const cur = currency === "USD" ? "USD" : "IDR";
  
  let now = new Date();
  if (toDateStr) {
    const d = new Date(toDateStr);
    if (!isNaN(d.getTime())) now = d;
  }
  
  const endYear = now.getFullYear();
  const endMonth = now.getMonth();

  const points = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(endYear, endMonth - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    let end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    
    // If this is the "current" month in the 12-mo series, cap it by the 'now' date
    if (i === 0) {
      end = now;
      end.setHours(23, 59, 59, 999);
    }

    const txs = await prisma.transaction.findMany({
      where: {
        userId,
        status: "success",
        date: { gte: start, lte: end },
        wallet: { currency: cur },
      },
      include: { category: true },
    });

    let income = 0;
    let expense = 0;
    for (const t of txs) {
      if (t.category.type === "income") {
        income += t.amount;
      } else if (t.category.type === "expense") {
        expense += t.amount;
      }
      // USER REQUIREMENT: Debt is excluded from standard income/expense charts.
    }

    points.push({
      month: MONTH_LABELS[m],
      amount: income,
      expense,
    });
  }

  return points;
}

module.exports = { getMonthlyIncomeSeries };
