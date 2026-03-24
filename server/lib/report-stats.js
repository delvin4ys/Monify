const { prisma } = require("./prisma");
const { getWalletDelta } = require("./wallet-delta");

function addToMap(map, cat, amount) {
  const id = cat.id;
  if (!map[id]) {
    map[id] = { id, name: cat.name, icon: cat.icon || "", amount: 0 };
  }
  map[id].amount += amount;
}

/**
 * Ringkatan laporan per mata uang untuk rentang tanggal (YYYY-MM-DD).
 */
async function getReportData(userId, fromStr, toStr) {
  const start = new Date(fromStr + "T00:00:00.000Z");
  const end = new Date(toStr + "T23:59:59.999Z");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  const txs = await prisma.transaction.findMany({
    where: {
      userId,
      status: "success",
      date: { gte: start, lte: end },
    },
    include: { category: true, wallet: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const byCurrency = {};

  for (const t of txs) {
    const cur = t.currency || "IDR";
    if (!byCurrency[cur]) {
      byCurrency[cur] = {
        currency: cur,
        expenseTotal: 0,
        incomeTotal: 0,
        debtTotal: 0, // USER REQUIREMENT: Separate liability/debt
        expenseByCategory: {},
        incomeByCategory: {},
        debtByCategory: {},
      };
    }
    const b = byCurrency[cur];
    const cat = t.category;
    const d = getWalletDelta(cat, t.amount);

    if (cat.type === "expense") {
      b.expenseTotal += t.amount;
      addToMap(b.expenseByCategory, cat, t.amount);
    } else if (cat.type === "income") {
      b.incomeTotal += t.amount;
      addToMap(b.incomeByCategory, cat, t.amount);
    } else if (cat.type === "debt") {
      // USER REQUIREMENT: Debt is not income or expense.
      b.debtTotal += t.amount;
      addToMap(b.debtByCategory, cat, t.amount);
    }
  }

  const currencies = {};
  for (const cur of Object.keys(byCurrency)) {
    const x = byCurrency[cur];
    const expArr = Object.values(x.expenseByCategory).sort((a, b) => b.amount - a.amount);
    const incArr = Object.values(x.incomeByCategory).sort((a, b) => b.amount - a.amount);
    const debtArr = Object.values(x.debtByCategory).sort((a, b) => b.amount - a.amount);
    const expenseTotal = x.expenseTotal;
    const incomeTotal = x.incomeTotal;
    const debtTotal = x.debtTotal;
    currencies[cur] = {
      currency: cur,
      expenseTotal,
      incomeTotal,
      debtTotal,
      net: incomeTotal - expenseTotal, // Net remains real income - consumptive expense
      expenseByCategory: expArr,
      incomeByCategory: incArr,
      debtByCategory: debtArr,
    };
  }

  return {
    from: fromStr,
    to: toStr,
    transactionCount: txs.length,
    currencies,
  };
}

module.exports = { getReportData };
