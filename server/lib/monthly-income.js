const { prisma } = require("./prisma");
const { getWalletDelta } = require("./wallet-delta");

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

async function getMonthlyIncomeSeries(userId, currency = "IDR") {
  const cur = currency === "USD" ? "USD" : "IDR";
  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth();

  const points = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(endYear, endMonth - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);

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
      const delta = getWalletDelta(t.category, t.amount);
      if (delta > 0) income += delta;
      else if (delta < 0) expense += Math.abs(delta);
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
