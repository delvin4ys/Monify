const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");

before(H.start);
after(H.stop);

const D = "2026-10-15";

/** Test case 4 — User A tidak boleh membaca atau mengubah apa pun milik User B. */
test("Test case 4 — isolasi multi-user pada setiap jenis data", async () => {
  const a = await H.newUser("alice");
  const b = await H.newUser("bob");

  // Data milik B
  const bw = await H.wallet(b, "BCA-Bob", 9_000_000);
  const bw2 = await H.wallet(b, "Cash-Bob", 1_000_000);
  const bcat = await H.category(b, "expense");
  const btx = (await b.post("/api/transactions", { kind: "expense", amount: 123_456, walletId: bw.id, categoryId: bcat.id, title: "RAHASIA-BOB", date: D })).transaction;
  const btr = (await b.post("/api/transfers", { fromWalletId: bw.id, toWalletId: bw2.id, amount: 50_000, date: D })).transfer;
  const bdebt = (await b.post("/api/debts", { type: "PAYABLE", personName: "Kreditur Bob", amount: 800_000, date: D })).debt;
  const bpay = (await b.post(`/api/debts/${bdebt.id}/payments`, { amount: 100_000, date: D, walletId: bw.id })).debt.payments[0];
  const bgoal = (await b.post("/api/savings", { name: "Tujuan Bob", targetAmount: 1_000_000 })).goal;
  const bentry = (await b.post(`/api/savings/${bgoal.id}/entries`, { amount: 10_000, date: D })).goal.entries[0];
  const bbudget = await b.post("/api/budgets", { targetKind: "CATEGORY", targetId: bcat.id, limitAmount: 500_000, year: 2026, month: 10 });
  const snapshot = JSON.stringify([await b.get("/api/wallets"), await b.get("/api/transactions"), await b.get("/api/debts"), await b.get("/api/savings"), await b.get("/api/budgets?year=2026&month=10")]);

  // A punya dompet & kategori sendiri
  const aw = await H.wallet(a, "BCA-Alice", 1_000_000);
  const acat = await H.category(a, "expense");

  // 1. Membaca langsung dengan ID milik B -> 404 (bukan 403: keberadaan data pun tidak dibocorkan)
  for (const url of [`/api/transactions/${btx.id}`, `/api/transactions/${btx.id}/attachment`, `/api/transfers/${btr.id}`, `/api/debts/${bdebt.id}`, `/api/savings/${bgoal.id}`]) {
    await a.fail(404, "GET", url);
  }

  // 2. Daftar milik A tidak memuat apa pun dari B, juga lewat filter dan pencarian
  const leak = JSON.stringify([
    await a.get("/api/wallets"),
    await a.get("/api/transactions"),
    await a.get("/api/transactions?q=RAHASIA"),
    await a.get("/api/transactions?walletId=" + bw.id),
    await a.get("/api/transactions?debtId=" + bdebt.id),
    await a.get("/api/debts"),
    await a.get("/api/savings"),
    await a.get("/api/budgets?year=2026&month=10"),
    await a.get("/api/dashboard?today=" + D),
    await a.get("/api/reports?from=2026-10-01&to=2026-10-31"),
    await a.get("/api/reports?from=2026-10-01&to=2026-10-31&walletId=" + bw.id),
    await a.get("/api/bootstrap"),
    await a.get("/api/reconcile"),
  ]);
  for (const secret of ["RAHASIA-BOB", "BCA-Bob", "Kreditur Bob", "Tujuan Bob", "123456", bw.id, btx.id, bdebt.id, bgoal.id, b.email]) {
    assert.ok(!leak.includes(secret), "data B bocor ke A: " + secret);
  }
  assert.equal((await a.get("/api/dashboard?today=" + D)).balance, 1_000_000);

  // 3. Mengubah / menghapus milik B -> 404
  const writes = [
    ["PATCH", `/api/wallets/${bw.id}`, { name: "diretas" }],
    ["POST", `/api/wallets/${bw.id}/adjust`, { targetBalance: 0, date: D }],
    ["DELETE", `/api/wallets/${bw2.id}`],
    ["PATCH", `/api/categories/${bcat.id}`, { name: "diretas" }],
    ["DELETE", `/api/categories/${bcat.id}`],
    ["PATCH", `/api/transactions/${btx.id}`, { amount: 1 }],
    ["DELETE", `/api/transactions/${btx.id}`],
    ["PATCH", `/api/transfers/${btr.id}`, { amount: 1 }],
    ["DELETE", `/api/transfers/${btr.id}`],
    ["PATCH", `/api/debts/${bdebt.id}`, { personName: "diretas" }],
    ["DELETE", `/api/debts/${bdebt.id}`],
    ["PATCH", `/api/debts/${bdebt.id}/payments/${bpay.id}`, { amount: 1 }],
    ["DELETE", `/api/debts/${bdebt.id}/payments/${bpay.id}`],
    ["PATCH", `/api/savings/${bgoal.id}`, { name: "diretas" }],
    ["DELETE", `/api/savings/${bgoal.id}`],
    ["POST", `/api/savings/${bgoal.id}/entries`, { amount: 1000, date: D }],
    ["DELETE", `/api/savings/${bgoal.id}/entries/${bentry.id}`],
    ["PATCH", `/api/budgets/${bbudget.id}`, { limitAmount: 1 }],
    ["DELETE", `/api/budgets/${bbudget.id}`],
  ];
  for (const [method, url, body] of writes) await a.fail(404, method, url, body);

  // 4. Memakai ID milik B di dalam body request milik A -> ditolak
  const tx = { kind: "expense", amount: 1000, title: "x", date: D };
  await a.fail(400, "POST", "/api/transactions", { ...tx, walletId: bw.id, categoryId: acat.id });
  await a.fail(400, "POST", "/api/transactions", { ...tx, walletId: aw.id, categoryId: bcat.id });
  await a.fail(400, "POST", "/api/transfers", { fromWalletId: bw.id, toWalletId: aw.id, amount: 1000, date: D });
  await a.fail(400, "POST", "/api/transfers", { fromWalletId: aw.id, toWalletId: bw.id, amount: 1000, date: D });
  await a.fail(404, "POST", `/api/debts/${bdebt.id}/payments`, { amount: 1000, date: D, walletId: aw.id });
  await a.fail(400, "POST", "/api/debts", { type: "PAYABLE", personName: "x", amount: 1000, date: D, walletId: bw.id });
  await a.fail(400, "POST", "/api/budgets", { targetKind: "CATEGORY", targetId: bcat.id, limitAmount: 1000, year: 2026, month: 10 });
  await a.fail(400, "POST", "/api/budgets", { targetKind: "CATEGORY", targetId: acat.id, walletId: bw.id, limitAmount: 1000, year: 2026, month: 10 });
  await a.fail(400, "POST", "/api/savings", { name: "x", targetAmount: 1000, walletId: bw.id });
  await a.fail(400, "PATCH", "/api/user", { defaultWalletId: bw.id });
  const mine = (await a.post("/api/debts", { type: "PAYABLE", personName: "x", amount: 5000, date: D })).debt;
  await a.fail(400, "POST", `/api/debts/${mine.id}/payments`, { amount: 1000, date: D, walletId: bw.id });

  // 5. Lampiran: kunci di folder B ditolak
  const key = `${b.user.id}/${"a".repeat(32)}.png`;
  await a.fail(403, "GET", "/api/attachments?key=" + encodeURIComponent(key));
  await a.fail(403, "DELETE", "/api/attachments?key=" + encodeURIComponent(key));
  await a.fail(403, "POST", "/api/transactions", { ...tx, walletId: aw.id, categoryId: acat.id, attachmentKey: key });
  await a.fail(404, "GET", "/api/attachments?key=" + encodeURIComponent("../../etc/passwd"));

  // 6. Setelah semua percobaan itu, data B tidak berubah sedikit pun
  const now = JSON.stringify([await b.get("/api/wallets"), await b.get("/api/transactions"), await b.get("/api/debts"), await b.get("/api/savings"), await b.get("/api/budgets?year=2026&month=10")]);
  assert.equal(now, snapshot);
  assert.equal((await H.balances(a))["BCA-Alice"], 1_000_000);
  await H.assertReconciled(a);
  await H.assertReconciled(b);
});

test("halaman admin hanya untuk email admin", async () => {
  const user = await H.newUser("biasa");
  await user.fail(403, "GET", "/api/admin/users");
  const admin = new H.Client();
  await H.start();
  const r = await admin.raw("POST", "/api/auth/register", { body: { email: "admin@monify.test", password: "password-123", name: "Admin" } });
  if (r.status !== 201) await admin.post("/api/auth/login", { email: "admin@monify.test", password: "password-123" });
  const list = await admin.get("/api/admin/users");
  assert.ok(list.total >= 2);
  assert.ok(!JSON.stringify(list).includes("passwordHash"));
});
