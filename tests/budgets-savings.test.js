const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");

before(H.start);
after(H.stop);

test("budget per dompet tidak tercampur dengan dompet lain", async () => {
  const c = await H.newUser("budget");
  const bca = await H.wallet(c, "BCA", 10_000_000);
  const cash = await H.wallet(c, "Cash", 10_000_000);
  const food = await H.category(c, "expense", "Makan di Luar");
  const fuel = await H.category(c, "expense", "Bensin");
  const spend = (w, cat, amount, date = "2026-10-10") => c.post("/api/transactions", { kind: "expense", amount, walletId: w.id, categoryId: cat.id, title: "x", date });

  await c.post("/api/budgets", { targetKind: "CATEGORY", targetId: food.id, walletId: bca.id, limitAmount: 1_500_000, year: 2026, month: 10 });
  await c.post("/api/budgets", { targetKind: "CATEGORY", targetId: food.id, limitAmount: 3_000_000, year: 2026, month: 10 }); // semua dompet
  await c.post("/api/budgets", { targetKind: "CATEGORY", targetId: fuel.id, limitAmount: 500_000, year: 2026, month: 10 });
  const dup = await c.fail(409, "POST", "/api/budgets", { targetKind: "CATEGORY", targetId: food.id, walletId: bca.id, limitAmount: 1, year: 2026, month: 10 });
  assert.equal(dup.code, "BUDGET_EXISTS");

  await spend(bca, food, 1_200_000);
  await spend(cash, food, 700_000);
  await spend(bca, fuel, 520_000);
  await spend(bca, food, 999_999, "2026-09-30"); // bulan lain
  await spend(bca, food, 999_999, "2026-11-01"); // bulan lain
  await c.post("/api/transfers", { fromWalletId: bca.id, toWalletId: cash.id, amount: 1_000_000, date: "2026-10-11" }); // bukan belanja

  const r = await c.get("/api/budgets?year=2026&month=10&today=2026-10-21");
  const byKey = (name, wallet) => r.budgets.find((b) => b.name === name && b.walletName === wallet);
  const foodBca = byKey("Makan di Luar", "BCA");
  const foodAll = byKey("Makan di Luar", null);
  const fuelAll = byKey("Bensin", null);

  assert.equal(foodBca.spent, 1_200_000, "hanya pengeluaran dari BCA");
  assert.equal(foodBca.status, "warning");
  assert.equal(foodBca.percent, 80);
  assert.equal(foodBca.remaining, 300_000);
  assert.equal(foodBca.daysLeft, 11);
  assert.equal(foodBca.suggestedDaily, Math.floor(300_000 / 11));
  assert.equal(foodAll.spent, 1_900_000, "budget tanpa dompet menghitung semua dompet");
  assert.equal(foodAll.status, "ok");
  assert.equal(fuelAll.status, "over");
  assert.equal(fuelAll.remaining, -20_000);
  assert.equal(r.summary.totalLimit, 5_000_000);
  assert.equal(r.summary.totalSpent, 1_200_000 + 1_900_000 + 520_000);
  assert.equal(r.summary.overCount, 1);
  assert.equal(r.summary.warningCount, 1);

  await c.patch("/api/budgets/" + fuelAll.id, { limitAmount: 1_000_000 });
  assert.equal((await c.get("/api/budgets?year=2026&month=10")).budgets.find((b) => b.id === fuelAll.id).status, "ok");
  await c.del("/api/budgets/" + fuelAll.id);
  assert.equal((await c.get("/api/budgets?year=2026&month=10")).budgets.length, 2);
  assert.equal((await c.get("/api/budgets?year=2026&month=9")).budgets.length, 0);
});

test("budget per grup kategori dan rentang tanggal kustom", async () => {
  const c = await H.newUser("budget2");
  const w = await H.wallet(c, "BCA", 10_000_000);
  const { categories, parents } = await c.get("/api/categories");
  const group = parents.find((p) => p.name === "Makan & Minuman");
  const kids = categories.filter((x) => x.parentId === group.id);
  assert.ok(kids.length >= 2);
  await c.post("/api/budgets", { targetKind: "PARENT", targetId: group.id, limitAmount: 2_000_000, periodStart: "2026-10-10", periodEnd: "2026-11-09" });
  await c.fail(400, "POST", "/api/budgets", { targetKind: "PARENT", targetId: group.id, limitAmount: 1000, periodStart: "2026-10-10", periodEnd: "2026-10-01" });
  const spend = (cat, amount, date) => c.post("/api/transactions", { kind: "expense", amount, walletId: w.id, categoryId: cat.id, title: "x", date });
  await spend(kids[0], 100_000, "2026-10-09"); // sehari sebelum mulai
  await spend(kids[0], 300_000, "2026-10-10");
  await spend(kids[1], 500_000, "2026-11-09");
  await spend(kids[1], 900_000, "2026-11-10"); // sehari setelah selesai
  for (const month of [10, 11]) {
    const b = (await c.get(`/api/budgets?year=2026&month=${month}`)).budgets[0];
    assert.equal(b.spent, 800_000, "budget kustom muncul di tiap bulan yang beririsan dengan total rentangnya");
    assert.equal(b.isMonthly, false);
  }
  const income = await H.category(c, "income");
  await c.fail(400, "POST", "/api/budgets", { targetKind: "CATEGORY", targetId: income.id, limitAmount: 1000, year: 2026, month: 10 });
});

test("tabungan sebagai alokasi: saldo dompet dan laporan tidak berubah", async () => {
  const c = await H.newUser("save1");
  await H.wallet(c, "BCA", 3_000_000);
  const goal = (await c.post("/api/savings", { name: "Laptop Baru", targetAmount: 1_000_000, targetDate: "2027-06-30", icon: "💻" })).goal;
  const r = await c.post(`/api/savings/${goal.id}/entries`, { amount: 400_000, date: "2026-10-01" });
  assert.equal(r.movedMoney, false);
  assert.equal(r.goal.savedAmount, 400_000);
  assert.equal(r.goal.remaining, 600_000);
  assert.equal(r.goal.percent, 40);
  assert.ok(r.goal.monthlyNeeded > 0);
  assert.equal((await H.balances(c)).BCA, 3_000_000, "alokasi tidak menyentuh saldo");
  assert.equal((await c.get("/api/transactions")).items.length, 0);

  const over = await c.fail(400, "POST", `/api/savings/${goal.id}/entries`, { type: "withdraw", amount: 400_001, date: "2026-10-02" });
  assert.ok(over.fields.amount);
  const w = await c.post(`/api/savings/${goal.id}/entries`, { type: "withdraw", amount: 150_000, date: "2026-10-02" });
  assert.equal(w.goal.savedAmount, 250_000);
  const done = await c.post(`/api/savings/${goal.id}/entries`, { amount: 750_000, date: "2026-10-03" });
  assert.equal(done.goal.status, "ACHIEVED");
  assert.equal(done.justAchieved, true);
  assert.equal(done.goal.entries.length, 3);
});

test("tabungan dengan pemindahan nyata: uang pindah dompet, total saldo tidak bertambah dua kali", async () => {
  const c = await H.newUser("save2");
  const bca = await H.wallet(c, "BCA", 3_000_000);
  const pot = await H.wallet(c, "Tabungan", 0, { type: "savings" });
  const goal = (await c.post("/api/savings", { name: "Dana Darurat", targetAmount: 5_000_000, walletId: pot.id })).goal;

  const r = await c.post(`/api/savings/${goal.id}/entries`, { amount: 1_000_000, date: "2026-10-05", walletId: bca.id });
  assert.equal(r.movedMoney, true);
  assert.equal(r.goal.savedAmount, 1_000_000);
  let b = await H.balances(c);
  assert.deepEqual(b, { BCA: 2_000_000, Tabungan: 1_000_000 });
  assert.equal(b.BCA + b.Tabungan, 3_000_000, "total saldo tetap 3jt — tidak bertambah");
  const rep = await c.get("/api/reports?from=2026-10-01&to=2026-10-31");
  assert.equal(rep.totals.income, 0);
  assert.equal(rep.totals.expense, 0, "menabung bukan pengeluaran");

  await c.post(`/api/savings/${goal.id}/entries`, { type: "withdraw", amount: 300_000, date: "2026-10-06", walletId: bca.id });
  assert.deepEqual(await H.balances(c), { BCA: 2_300_000, Tabungan: 700_000 });

  // menghapus setoran membatalkan transfernya juga
  const g = (await c.get("/api/savings/" + goal.id)).goal;
  const deposit = g.entries.find((e) => e.amount === 1_000_000);
  // membatalkan setoran saat sebagian sudah ditarik ditolak (dompet tabungan tidak cukup) dan tidak mengubah apa pun
  await c.fail(409, "DELETE", `/api/savings/${goal.id}/entries/${deposit.id}`);
  assert.deepEqual(await H.balances(c), { BCA: 2_300_000, Tabungan: 700_000 });
  const withdrawal = g.entries.find((e) => e.amount === -300_000);
  await c.del(`/api/savings/${goal.id}/entries/${withdrawal.id}`);
  const after = (await c.del(`/api/savings/${goal.id}/entries/${deposit.id}`)).goal;
  assert.equal(after.savedAmount, 0);
  assert.deepEqual(await H.balances(c), { BCA: 3_000_000, Tabungan: 0 });
  assert.equal((await c.get("/api/transactions")).items.length, 0);

  // tujuan tanpa dompet tabungan tidak bisa memindahkan uang
  const plain = (await c.post("/api/savings", { name: "Liburan", targetAmount: 1_000_000 })).goal;
  await c.fail(400, "POST", `/api/savings/${plain.id}/entries`, { amount: 1000, date: "2026-10-05", walletId: bca.id });
  await H.assertReconciled(c);
});

test("setoran tabungan duplikat (Idempotency-Key sama, dikirim bersamaan) hanya tercatat sekali", async () => {
  const c = await H.newUser("saveidem");
  const bca = await H.wallet(c, "BCA", 2_000_000);
  const jago = await H.wallet(c, "Jago", 0);
  const goal = (await c.post("/api/savings", { name: "Dana Darurat", targetAmount: 5_000_000, walletId: jago.id })).goal;

  // Pemindahan nyata: lima request identik → satu setoran, satu transfer.
  const headers = { "Idempotency-Key": "save-key-0000001" };
  const res = await Promise.all(Array.from({ length: 5 }, () => c.raw("POST", `/api/savings/${goal.id}/entries`, { body: { amount: 300_000, date: "2026-10-05", walletId: bca.id }, headers })));
  assert.ok(res.every((r) => r.status === 201), res.map((r) => r.status).join(","));
  let g = (await c.get("/api/savings/" + goal.id)).goal;
  assert.equal(g.entries.length, 1);
  assert.equal(g.savedAmount, 300_000);
  const b = await H.balances(c);
  assert.equal(b.BCA, 1_700_000);
  assert.equal(b.Jago, 300_000);

  // Alokasi saja (tanpa mutasi dompet) juga terlindungi.
  const h2 = { "Idempotency-Key": "save-key-0000002" };
  await Promise.all(Array.from({ length: 4 }, () => c.raw("POST", `/api/savings/${goal.id}/entries`, { body: { amount: 100_000, date: "2026-10-06" }, headers: h2 })));
  g = (await c.get("/api/savings/" + goal.id)).goal;
  assert.equal(g.entries.length, 2);
  assert.equal(g.savedAmount, 400_000);

  // Kunci berbeda = niat berbeda → tercatat.
  await c.raw("POST", `/api/savings/${goal.id}/entries`, { body: { amount: 100_000, date: "2026-10-06" }, headers: { "Idempotency-Key": "save-key-0000003" } });
  assert.equal((await c.get("/api/savings/" + goal.id)).goal.savedAmount, 500_000);
  const rec = await c.get("/api/reconcile");
  assert.equal(rec.consistent, true);
});
