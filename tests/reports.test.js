const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");

before(H.start);
after(H.stop);

async function seed(c) {
  const bca = await H.wallet(c, "BCA", 20_000_000);
  const bri = await H.wallet(c, "BRI", 5_000_000);
  const salary = await H.category(c, "income", "Gaji Pokok");
  const food = await H.category(c, "expense", "Makan di Luar");
  const bills = await H.category(c, "expense", "Listrik & Air");
  const tx = (kind, amount, cat, date, wallet = bca) => c.post("/api/transactions", { kind, amount, walletId: wallet.id, categoryId: cat.id, title: kind, date });
  return { bca, bri, salary, food, bills, tx };
}

test("Test case 3 — income 10jt, expense 7jt, transfer internal 2jt → surplus 3jt", async () => {
  const c = await H.newUser("tc3");
  const s = await seed(c);
  await s.tx("income", 10_000_000, s.salary, "2026-10-01");
  await s.tx("expense", 4_500_000, s.food, "2026-10-10");
  await s.tx("expense", 2_500_000, s.bills, "2026-10-20");
  await c.post("/api/transfers", { fromWalletId: s.bca.id, toWalletId: s.bri.id, amount: 2_000_000, date: "2026-10-12" });

  const r = await c.get("/api/reports?from=2026-10-01&to=2026-10-31");
  assert.equal(r.totals.income, 10_000_000);
  assert.equal(r.totals.expense, 7_000_000);
  assert.equal(r.totals.net, 3_000_000);
  assert.equal(r.totals.status, "surplus");
  assert.equal(r.excluded.transfer.count, 2, "transfer internal dilaporkan terpisah, bukan income/expense");
  assert.equal(r.highestSpending.name, "Makan di Luar");
  assert.equal(r.lowestSpending.name, "Listrik & Air");
  assert.equal(r.expenseByCategory[0].percent, 64.3);
  assert.equal(r.series.reduce((n, p) => n + p.income, 0), 10_000_000, "deret waktu konsisten dengan total");
  assert.equal(r.series.reduce((n, p) => n + p.expense, 0), 7_000_000);
  assert.equal(r.series[r.series.length - 1].cumulative, 3_000_000);
  assert.ok(r.insights.some((i) => i.title === "Surplus"));
  const total = r.walletDistribution.reduce((n, w) => n + w.balance, 0);
  assert.equal(total, 25_000_000 + 3_000_000);
});

test("defisit dan seimbang", async () => {
  const c = await H.newUser("deficit");
  const s = await seed(c);
  await s.tx("income", 1_000_000, s.salary, "2026-08-01");
  await s.tx("expense", 1_000_000, s.food, "2026-08-02");
  assert.equal((await c.get("/api/reports?from=2026-08-01&to=2026-08-31")).totals.status, "balanced");
  await s.tx("expense", 1, s.food, "2026-08-03");
  const r = await c.get("/api/reports?from=2026-08-01&to=2026-08-31");
  assert.equal(r.totals.net, -1);
  assert.equal(r.totals.status, "deficit");
});

test("rentang tanggal kustom: batas inklusif, tanggal di luar rentang tidak ikut", async () => {
  const c = await H.newUser("range");
  const s = await seed(c);
  await s.tx("expense", 100, s.food, "2025-12-31");
  await s.tx("expense", 200, s.food, "2026-01-01"); // batas awal
  await s.tx("expense", 400, s.food, "2026-06-15");
  await s.tx("expense", 800, s.food, "2026-10-31"); // batas akhir
  await s.tx("expense", 1600, s.food, "2026-11-01");
  const r = await c.get("/api/reports?from=2026-01-01&to=2026-10-31");
  assert.equal(r.totals.expense, 200 + 400 + 800);
  assert.equal(r.days, 304);
  assert.equal(r.granularity, "month");
  assert.equal(r.series.length, 10, "satu titik per bulan Jan–Okt, termasuk bulan kosong");
  assert.equal(r.series[0].bucket, "2026-01-01");
  assert.equal(r.series[0].expense, 200);
  assert.equal(r.series[5].expense, 400);
  assert.equal(r.series[9].expense, 800);
  // satu hari saja
  assert.equal((await c.get("/api/reports?from=2026-10-31&to=2026-10-31")).totals.expense, 800);
  await c.fail(400, "GET", "/api/reports?from=2026-10-31&to=2026-10-01");
  await c.fail(400, "GET", "/api/reports?from=2026-13-01&to=2026-12-31");
  await c.fail(400, "GET", "/api/reports");
});

test("granularitas harian, mingguan, kuartalan, tahunan", async () => {
  const c = await H.newUser("gran");
  const s = await seed(c);
  await s.tx("expense", 1000, s.food, "2026-03-02"); // Senin
  await s.tx("expense", 2000, s.food, "2026-03-08"); // Minggu, minggu yang sama
  await s.tx("expense", 4000, s.food, "2026-03-09"); // Senin berikutnya
  await s.tx("income", 9000, s.salary, "2026-07-01");

  const day = await c.get("/api/reports?from=2026-03-01&to=2026-03-10&granularity=day");
  assert.equal(day.series.length, 10);
  assert.equal(day.series[1].expense, 1000);
  const week = await c.get("/api/reports?from=2026-03-02&to=2026-03-15&granularity=week");
  assert.deepEqual(week.series.map((p) => [p.bucket, p.expense]), [["2026-03-02", 3000], ["2026-03-09", 4000]]);
  const quarter = await c.get("/api/reports?from=2026-01-01&to=2026-12-31&granularity=quarter");
  assert.deepEqual(quarter.series.map((p) => p.bucket), ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"]);
  assert.equal(quarter.series[0].expense, 7000);
  assert.equal(quarter.series[2].income, 9000);
  const year = await c.get("/api/reports?from=2025-01-01&to=2026-12-31&granularity=year");
  assert.deepEqual(year.series.map((p) => [p.bucket, p.net]), [["2025-01-01", 0], ["2026-01-01", 2000]]);
});

test("perbandingan dengan periode sebelumnya", async () => {
  const c = await H.newUser("prev");
  const s = await seed(c);
  await s.tx("expense", 200_000, s.food, "2026-09-15"); // periode sebelumnya (30 hari sebelum 1 Okt = 1–30 Sep)
  await s.tx("expense", 300_000, s.food, "2026-10-15");
  const r = await c.get("/api/reports?from=2026-10-01&to=2026-10-30");
  assert.equal(r.previous.from, "2026-09-01");
  assert.equal(r.previous.to, "2026-09-30");
  assert.equal(r.previous.expense, 200_000);
  assert.equal(r.change.expense, 50);
  assert.equal(r.change.income, null, "tanpa pembanding tidak ada persentase palsu");
});

test("transaksi pending tidak masuk laporan maupun saldo", async () => {
  const c = await H.newUser("pending");
  const s = await seed(c);
  await c.post("/api/transactions", { kind: "expense", amount: 500_000, walletId: s.bca.id, categoryId: s.food.id, title: "Belum dibayar", date: "2026-10-05", status: "pending" });
  assert.equal((await c.get("/api/reports?from=2026-10-01&to=2026-10-31")).totals.expense, 0);
  assert.equal((await H.balances(c)).BCA, 20_000_000);
});

test("filter laporan per dompet", async () => {
  const c = await H.newUser("bywallet");
  const s = await seed(c);
  await s.tx("expense", 100_000, s.food, "2026-10-05", s.bca);
  await s.tx("expense", 40_000, s.food, "2026-10-06", s.bri);
  assert.equal((await c.get("/api/reports?from=2026-10-01&to=2026-10-31&walletId=" + s.bri.id)).totals.expense, 40_000);
  assert.equal((await c.get("/api/reports?from=2026-10-01&to=2026-10-31")).totals.expense, 140_000);
});

test("dashboard: satu request berisi seluruh ringkasan yang benar", async () => {
  const c = await H.newUser("dash");
  const s = await seed(c);
  await s.tx("income", 8_000_000, s.salary, "2026-10-01");
  await s.tx("expense", 1_000_000, s.food, "2026-10-03");
  await s.tx("expense", 500_000, s.bills, "2026-09-10");
  await c.post("/api/debts", { type: "PAYABLE", personName: "A", amount: 700_000, date: "2026-10-02" });
  await c.post("/api/debts", { type: "RECEIVABLE", personName: "B", amount: 300_000, date: "2026-10-02" });
  const goal = (await c.post("/api/savings", { name: "Dana Darurat", targetAmount: 1_000_000 })).goal;
  await c.post(`/api/savings/${goal.id}/entries`, { amount: 250_000, date: "2026-10-04" });
  await c.post("/api/budgets", { targetKind: "CATEGORY", targetId: s.food.id, limitAmount: 1_100_000, year: 2026, month: 10 });

  const d = await c.get("/api/dashboard?today=2026-10-15");
  assert.equal(d.balance, 25_000_000 + 8_000_000 - 1_000_000 - 500_000);
  assert.equal(d.totals.income, 8_000_000);
  assert.equal(d.totals.expense, 1_000_000);
  assert.equal(d.totals.net, 7_000_000);
  assert.equal(d.previous.expense, 500_000);
  assert.equal(d.change.expense, 100);
  assert.equal(d.debts.payable, 700_000);
  assert.equal(d.debts.receivable, 300_000);
  assert.equal(d.savings.saved, 250_000);
  assert.equal(d.savings.percent, 25);
  assert.equal(d.budget.summary.totalSpent, 1_000_000);
  assert.equal(d.budget.attention[0].status, "warning");
  assert.equal(d.recent.length, 3);
  assert.equal(d.trend.length, 6);
  assert.equal(d.trend[5].bucket, "2026-10-01");
  assert.equal(d.trend[4].expense, 500_000);
  assert.equal(d.topExpenses[0].name, "Makan di Luar");
  assert.equal(d.wallets.length, 2);
});
