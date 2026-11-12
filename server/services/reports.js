/**
 * Laporan & analitik.
 *
 * Aturan perhitungan (satu sumber kebenaran untuk seluruh aplikasi):
 * - Pemasukan  = Σ transaksi kind "income"  berstatus success.
 * - Pengeluaran = Σ transaksi kind "expense" berstatus success.
 * - Arus kas bersih = Pemasukan − Pengeluaran  (surplus / defisit / seimbang).
 * - Transfer, pokok hutang/piutang, dan penyesuaian saldo TIDAK dihitung.
 * - Hanya satu mata uang per laporan; tidak ada penjumlahan lintas mata uang.
 *
 * Semua agregasi dilakukan database (groupBy / date_trunc), bukan di JavaScript.
 */
const { Prisma } = require("@prisma/client");
const { prisma } = require("../lib/prisma");
const { badRequest } = require("../lib/errors");
const { dayRange, addDays, diffDays, toDay, monthOf, addMonths, monthBounds, today } = require("../lib/dates");
const ledger = require("./ledger");
const budgets = require("./budgets");

const GRANULARITIES = ["day", "week", "month", "quarter", "year"];
const MAX_BUCKETS = 400;

function autoGranularity(from, to) {
  const days = diffDays(from, to) + 1;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  if (days <= 800) return "month";
  if (days <= 2200) return "quarter";
  return "year";
}

/** Awal bucket yang memuat `day` (selaras dengan date_trunc Postgres; minggu mulai Senin). */
function bucketStart(day, g) {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  if (g === "day") return day;
  if (g === "week") {
    const dow = (new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7;
    return addDays(day, -dow);
  }
  if (g === "month") return `${y}-${String(m).padStart(2, "0")}-01`;
  if (g === "quarter") return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  return `${y}-01-01`;
}

function nextBucket(start, g) {
  if (g === "day") return addDays(start, 1);
  if (g === "week") return addDays(start, 7);
  const y = Number(start.slice(0, 4));
  const m = Number(start.slice(5, 7));
  const step = g === "month" ? 1 : g === "quarter" ? 3 : 12;
  const n = addMonths(y, m, step);
  return `${n.year}-${String(n.month).padStart(2, "0")}-01`;
}

function pctChange(cur, prev) {
  if (!prev) return null; // tidak ada pembanding — jangan tampilkan persentase palsu
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

function totalsFrom(groups) {
  const by = Object.fromEntries(groups.map((g) => [g.kind, ledger.num(g._sum.amount)]));
  const income = by.income || 0;
  const expense = by.expense || 0;
  const net = income - expense;
  return { income, expense, net, status: net > 0 ? "surplus" : net < 0 ? "deficit" : "balanced" };
}

async function series(userId, { from, to, granularity, currency, walletId }) {
  const r = dayRange(from, to);
  const rows = await prisma.$queryRaw`
    SELECT date_trunc(${granularity}::text, "date") AS bucket, "kind", SUM("amount")::bigint AS total
    FROM "Transaction"
    WHERE "userId" = ${userId}
      AND "status" = 'success'
      AND "kind" IN ('income', 'expense')
      AND "currency" = ${currency}
      AND "date" >= ${r.gte} AND "date" <= ${r.lte}
      ${walletId ? Prisma.sql`AND "walletId" = ${walletId}` : Prisma.empty}
    GROUP BY 1, 2
    ORDER BY 1`;
  const map = new Map();
  for (const row of rows) {
    const key = toDay(row.bucket);
    if (!map.has(key)) map.set(key, { income: 0, expense: 0 });
    map.get(key)[row.kind] = Number(row.total);
  }
  const out = [];
  let cumulative = 0;
  for (let b = bucketStart(from, granularity); b <= to; b = nextBucket(b, granularity)) {
    const v = map.get(b) || { income: 0, expense: 0 };
    const net = v.income - v.expense;
    cumulative += net;
    out.push({ bucket: b, income: v.income, expense: v.expense, net, cumulative });
    if (out.length > MAX_BUCKETS) throw badRequest("Rentang terlalu panjang untuk granularitas ini. Pilih granularitas yang lebih besar.");
  }
  return out;
}

async function byCategory(userId, where) {
  const [rows, cats] = await Promise.all([
    prisma.transaction.groupBy({ by: ["kind", "categoryId"], where: { ...where, kind: { in: ["income", "expense"] } }, _sum: { amount: true }, _count: true }),
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true, icon: true, color: true } }),
  ]);
  const cat = new Map(cats.map((c) => [c.id, c]));
  const build = (kind) => {
    const list = rows
      .filter((r) => r.kind === kind)
      .map((r) => {
        const c = r.categoryId ? cat.get(r.categoryId) : null;
        return {
          categoryId: r.categoryId,
          name: c ? c.name : "Tanpa kategori",
          icon: c ? c.icon : "🏷️",
          color: c ? c.color : null,
          amount: ledger.num(r._sum.amount),
          count: r._count,
        };
      })
      .sort((a, b) => b.amount - a.amount);
    const total = list.reduce((n, x) => n + x.amount, 0);
    for (const x of list) x.percent = total > 0 ? Math.round((x.amount / total) * 1000) / 10 : 0;
    return list;
  };
  return { expense: build("expense"), income: build("income") };
}

function buildInsights({ totals, previous, change, categories, days, largest }) {
  const out = [];
  if (totals.income === 0 && totals.expense === 0) return out;
  if (totals.status === "surplus") {
    const rate = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : 0;
    out.push({ tone: "positive", title: "Surplus", text: `Pemasukan melebihi pengeluaran. Kamu menyisakan ${rate}% dari pemasukan periode ini.`, amount: totals.net });
  } else if (totals.status === "deficit") {
    out.push({ tone: "negative", title: "Defisit", text: "Pengeluaran melebihi pemasukan pada periode ini.", amount: totals.net });
  } else {
    out.push({ tone: "neutral", title: "Seimbang", text: "Pemasukan dan pengeluaran periode ini sama besar.", amount: 0 });
  }
  if (change.expense != null && previous.expense > 0) {
    const up = change.expense > 0;
    out.push({
      tone: up ? "warning" : "positive",
      title: up ? "Pengeluaran naik" : "Pengeluaran turun",
      text: `Pengeluaran ${up ? "naik" : "turun"} ${Math.abs(change.expense)}% dibanding periode sebelumnya.`,
      amount: totals.expense - previous.expense,
    });
  }
  const top = categories.expense[0];
  if (top) out.push({ tone: "neutral", title: "Pengeluaran terbesar", text: `${top.icon} ${top.name} menyerap ${top.percent}% dari seluruh pengeluaran.`, amount: top.amount });
  const low = categories.expense.length > 1 ? categories.expense[categories.expense.length - 1] : null;
  if (low) out.push({ tone: "neutral", title: "Pengeluaran terkecil", text: `${low.icon} ${low.name} adalah kategori dengan pengeluaran paling kecil.`, amount: low.amount });
  if (totals.expense > 0) out.push({ tone: "neutral", title: "Rata-rata harian", text: `Rata-rata pengeluaran per hari selama ${days} hari.`, amount: Math.round(totals.expense / days) });
  if (largest) out.push({ tone: "neutral", title: "Transaksi terbesar", text: `${largest.title} pada ${toDay(largest.date)}.`, amount: Number(largest.amount) });
  return out;
}

async function report(userId, opts) {
  const { from, to, walletId } = opts;
  const currency = opts.currency === "USD" ? "USD" : "IDR";
  const range = dayRange(from, to);
  const days = diffDays(from, to) + 1;
  const granularity = GRANULARITIES.includes(opts.granularity) ? opts.granularity : autoGranularity(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  const base = { userId, status: "success", currency, ...(walletId ? { walletId } : {}) };
  const where = { ...base, date: range };
  const kinds = { in: ["income", "expense"] };
  const endMonth = monthOf(to);

  const [cur, prev, cats, points, wallets, largest, budgetData, counts] = await Promise.all([
    prisma.transaction.groupBy({ by: ["kind"], where: { ...where, kind: kinds }, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ["kind"], where: { ...base, kind: kinds, date: dayRange(prevFrom, prevTo) }, _sum: { amount: true } }),
    byCategory(userId, where),
    series(userId, { from, to, granularity, currency, walletId }),
    prisma.wallet.findMany({ where: { userId, currency, active: true }, select: { id: true, name: true, balance: true, color: true, type: true }, orderBy: { balance: "desc" } }),
    prisma.transaction.findFirst({ where: { ...where, kind: "expense" }, orderBy: { amount: "desc" }, select: { title: true, amount: true, date: true } }),
    budgets.listForMonth(userId, Number(endMonth.from.slice(0, 4)), Number(endMonth.from.slice(5, 7)), to),
    prisma.transaction.groupBy({ by: ["kind"], where, _sum: { amount: true }, _count: true }),
  ]);

  const totals = totalsFrom(cur);
  const previous = totalsFrom(prev);
  const change = { income: pctChange(totals.income, previous.income), expense: pctChange(totals.expense, previous.expense), net: pctChange(totals.net, previous.net) };
  const excluded = Object.fromEntries(counts.filter((c) => !["income", "expense"].includes(c.kind)).map((c) => [c.kind, { amount: ledger.num(c._sum.amount), count: c._count }]));
  const walletTotal = wallets.reduce((n, w) => n + Math.max(Number(w.balance), 0), 0);

  return {
    from,
    to,
    days,
    currency,
    granularity,
    totals,
    previous: { from: prevFrom, to: prevTo, ...previous },
    change,
    transactionCount: counts.reduce((n, c) => n + c._count, 0),
    /** Mutasi yang sengaja tidak dihitung sebagai pemasukan/pengeluaran, ditampilkan agar transparan. */
    excluded: { transfer: excluded.transfer || { amount: 0, count: 0 }, debt: excluded.debt || { amount: 0, count: 0 }, adjustment: excluded.adjustment || { amount: 0, count: 0 } },
    series: points,
    expenseByCategory: cats.expense,
    incomeByCategory: cats.income,
    highestSpending: cats.expense[0] || null,
    lowestSpending: cats.expense.length > 1 ? cats.expense[cats.expense.length - 1] : null,
    walletDistribution: wallets.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      color: w.color,
      balance: Number(w.balance),
      percent: walletTotal > 0 ? Math.round((Math.max(Number(w.balance), 0) / walletTotal) * 1000) / 10 : 0,
    })),
    budgetUtilization: { year: budgetData.year, month: budgetData.month, summary: budgetData.summary, budgets: budgetData.budgets },
    insights: buildInsights({ totals, previous, change, categories: cats, days, largest }),
  };
}

/** Semua data Dashboard dalam satu request; seluruh query berjalan paralel. */
async function dashboard(userId, { todayStr = today(), currency = "IDR" } = {}) {
  const ccy = currency === "USD" ? "USD" : "IDR";
  const month = monthOf(todayStr);
  const y = Number(todayStr.slice(0, 4));
  const m = Number(todayStr.slice(5, 7));
  const p = addMonths(y, m, -1);
  const prev = monthBounds(p.year, p.month);
  const six = addMonths(y, m, -5);
  const trendFrom = monthBounds(six.year, six.month).from;
  const INCLUDE = { category: true, wallet: true };
  const S = require("../lib/serializers");

  const walletsP = prisma.wallet.findMany({ where: { userId }, orderBy: [{ active: "desc" }, { balance: "desc" }] });
  const catsP = prisma.category.findMany({ where: { userId }, select: { id: true, name: true, icon: true, color: true, parentId: true } });
  const [wallets, debtTotals, goals, budgetData, recent, trend, top, cats] = await Promise.all([
    walletsP,
    prisma.debt.groupBy({ by: ["type"], where: { userId, status: "OPEN" }, _sum: { outstanding: true }, _count: true }),
    prisma.savingsGoal.findMany({ where: { userId, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "asc" }, take: 4 }),
    // Dompet & kategori dibagikan ke perhitungan budget agar tidak di-query dua kali.
    budgets.listForMonth(userId, y, m, todayStr, { wallets: walletsP, categories: catsP }),
    prisma.transaction.findMany({ where: { userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 8, include: INCLUDE }),
    series(userId, { from: trendFrom, to: month.to, granularity: "month", currency: ccy }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, status: "success", currency: ccy, kind: "expense", date: dayRange(month.from, month.to) },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }),
    catsP,
  ]);

  // Total bulan ini dan bulan lalu diambil dari deret bulanan yang sama (bucket terakhir
  // dan sebelumnya) — satu sumber angka untuk kartu ringkasan dan grafik.
  const fromBucket = (p) => {
    const income = p ? p.income : 0;
    const expense = p ? p.expense : 0;
    const net = income - expense;
    return { income, expense, net, status: net > 0 ? "surplus" : net < 0 ? "deficit" : "balanced" };
  };
  const totals = fromBucket(trend.find((p) => p.bucket === month.from));
  const previous = fromBucket(trend.find((p) => p.bucket === prev.from));
  const catById = new Map(cats.map((c) => [c.id, c]));
  const d = Object.fromEntries(debtTotals.map((x) => [x.type, { amount: ledger.num(x._sum.outstanding), count: x._count }]));
  const active = wallets.filter((w) => w.active && w.currency === ccy);
  const goalTarget = goals.reduce((n, g) => n + Number(g.targetAmount), 0);
  const goalSaved = goals.reduce((n, g) => n + Number(g.savedAmount), 0);

  return {
    today: todayStr,
    currency: ccy,
    month: { from: month.from, to: month.to },
    balance: active.reduce((n, w) => n + Number(w.balance), 0),
    totals,
    previous,
    change: { income: pctChange(totals.income, previous.income), expense: pctChange(totals.expense, previous.expense), net: pctChange(totals.net, previous.net) },
    debts: { payable: d.PAYABLE ? d.PAYABLE.amount : 0, payableCount: d.PAYABLE ? d.PAYABLE.count : 0, receivable: d.RECEIVABLE ? d.RECEIVABLE.amount : 0, receivableCount: d.RECEIVABLE ? d.RECEIVABLE.count : 0 },
    savings: {
      target: goalTarget,
      saved: goalSaved,
      percent: goalTarget > 0 ? Math.min(Math.round((goalSaved / goalTarget) * 1000) / 10, 100) : 0,
      goals: goals.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon || "🎯",
        color: g.color || null,
        targetAmount: Number(g.targetAmount),
        savedAmount: Number(g.savedAmount),
        percent: Number(g.targetAmount) > 0 ? Math.min(Math.round((Number(g.savedAmount) / Number(g.targetAmount)) * 1000) / 10, 100) : 0,
      })),
    },
    budget: { summary: budgetData.summary, attention: budgetData.budgets.filter((b) => b.status !== "ok").sort((a, b) => b.percent - a.percent).slice(0, 4), count: budgetData.budgets.length },
    wallets: wallets.map(S.wallet),
    recent: recent.map(S.transaction),
    trend,
    topExpenses: top.map((t) => {
      const c = t.categoryId ? catById.get(t.categoryId) : null;
      const amount = ledger.num(t._sum.amount);
      return { categoryId: t.categoryId, name: c ? c.name : "Tanpa kategori", icon: c ? c.icon : "🏷️", color: c ? c.color : null, amount, percent: totals.expense > 0 ? Math.round((amount / totals.expense) * 1000) / 10 : 0 };
    }),
  };
}

module.exports = { report, dashboard, GRANULARITIES, autoGranularity, bucketStart, nextBucket };
