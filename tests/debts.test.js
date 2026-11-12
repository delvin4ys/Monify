const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");

before(H.start);
after(H.stop);

const D = "2026-10-15";
const RANGE = "from=2026-10-01&to=2026-10-31";

test("Test case 2 — hutang 5jt, pembayaran pertama 1jt", async () => {
  const c = await H.newUser("tc2");
  const w = await H.wallet(c, "BCA", 3_000_000);
  // hutang yang tidak melewati dompet (mis. dibelikan barang)
  const debt = (await c.post("/api/debts", { type: "PAYABLE", personName: "Andi", amount: 5_000_000, date: "2026-10-01", dueDate: "2026-12-31", description: "Pinjam untuk laptop" })).debt;
  assert.equal(debt.outstanding, 5_000_000);
  assert.equal(debt.status, "OPEN");

  const r = await c.post(`/api/debts/${debt.id}/payments`, { amount: 1_000_000, date: D, walletId: w.id, note: "Cicilan 1" });
  assert.equal(r.debt.paid, 1_000_000, "total paid = 1jt");
  assert.equal(r.debt.outstanding, 4_000_000, "sisa hutang = 4jt");
  assert.equal(r.debt.payments.length, 1, "riwayat pembayaran tercatat satu kali");
  assert.equal(r.debt.payments[0].date, D, "tanggal pembayaran tersimpan");
  assert.equal(r.debt.payments[0].walletName, "BCA");
  assert.equal((await H.balances(c)).BCA, 2_000_000, "dompet sumber berkurang 1jt");

  // tidak ada hitungan ganda: satu mutasi dompet, dan bukan pengeluaran
  const tx = (await c.get("/api/transactions")).items;
  assert.equal(tx.length, 1);
  assert.equal(tx[0].kind, "debt");
  assert.equal(tx[0].debtId, debt.id);
  const rep = await c.get("/api/reports?" + RANGE);
  assert.equal(rep.totals.expense, 0, "pelunasan pokok bukan pengeluaran");
  assert.equal(rep.excluded.debt.amount, 1_000_000);

  const dash = await c.get("/api/dashboard?today=" + D);
  assert.equal(dash.debts.payable, 4_000_000, "dashboard ikut diperbarui");
  assert.equal(dash.balance, 2_000_000);
  await H.assertReconciled(c);
});

test("pembayaran sebagian lalu lunas; kelebihan bayar ditolak", async () => {
  const c = await H.newUser("partial");
  const w = await H.wallet(c, "Cash", 1_000_000);
  const debt = (await c.post("/api/debts", { type: "PAYABLE", personName: "Sari", amount: 600_000, date: "2026-10-01" })).debt;
  const pay = (amount) => ({ amount, date: D, walletId: w.id });

  await c.post(`/api/debts/${debt.id}/payments`, pay(250_000));
  const over = await c.fail(400, "POST", `/api/debts/${debt.id}/payments`, pay(350_001));
  assert.equal(over.code, "OVERPAYMENT");
  const done = (await c.post(`/api/debts/${debt.id}/payments`, pay(350_000))).debt;
  assert.equal(done.outstanding, 0);
  assert.equal(done.status, "PAID");
  assert.equal(done.progress, 100);
  const again = await c.fail(400, "POST", `/api/debts/${debt.id}/payments`, pay(1));
  assert.equal(again.code, "OVERPAYMENT");
  assert.equal((await H.balances(c)).Cash, 400_000);
  await c.fail(400, "POST", `/api/debts/${debt.id}/payments`, pay(0));
  await H.assertReconciled(c);
});

test("pembayaran bersamaan tidak bisa bersama-sama melebihi sisa hutang", async () => {
  const c = await H.newUser("payrace");
  const w = await H.wallet(c, "BCA", 5_000_000);
  const debt = (await c.post("/api/debts", { type: "PAYABLE", personName: "Rudi", amount: 1_000_000, date: "2026-10-01" })).debt;
  const res = await Promise.all(Array.from({ length: 10 }, () => c.raw("POST", `/api/debts/${debt.id}/payments`, { body: { amount: 300_000, date: D, walletId: w.id } })));
  assert.equal(res.filter((r) => r.status === 201).length, 3, "hanya 3 × 300rb yang muat dalam 1jt");
  const d = (await c.get("/api/debts/" + debt.id)).debt;
  assert.equal(d.outstanding, 100_000);
  assert.equal(d.payments.length, 3);
  assert.equal((await H.balances(c)).BCA, 5_000_000 - 900_000);
  await H.assertReconciled(c);
});

test("pembayaran duplikat (Idempotency-Key) hanya tercatat sekali", async () => {
  const c = await H.newUser("payidem");
  const w = await H.wallet(c, "BCA", 1_000_000);
  const debt = (await c.post("/api/debts", { type: "PAYABLE", personName: "Tono", amount: 900_000, date: "2026-10-01" })).debt;
  const headers = { "Idempotency-Key": "pay-key-0000001" };
  const res = await Promise.all(Array.from({ length: 5 }, () => c.raw("POST", `/api/debts/${debt.id}/payments`, { body: { amount: 200_000, date: D, walletId: w.id }, headers })));
  assert.ok(res.every((r) => r.status === 200 || r.status === 201), res.map((r) => r.status).join(","));
  const d = (await c.get("/api/debts/" + debt.id)).debt;
  assert.equal(d.payments.length, 1);
  assert.equal(d.outstanding, 700_000);
  assert.equal((await H.balances(c)).BCA, 800_000);
});

test("ubah dan hapus pembayaran menghitung ulang sisa hutang dan saldo", async () => {
  const c = await H.newUser("payedit");
  const w = await H.wallet(c, "BCA", 2_000_000);
  const w2 = await H.wallet(c, "Cash", 500_000);
  const debt = (await c.post("/api/debts", { type: "PAYABLE", personName: "Dewi", amount: 1_000_000, date: "2026-10-01" })).debt;
  let d = (await c.post(`/api/debts/${debt.id}/payments`, { amount: 400_000, date: D, walletId: w.id })).debt;
  const pid = d.payments[0].id;

  d = (await c.patch(`/api/debts/${debt.id}/payments/${pid}`, { amount: 250_000, walletId: w2.id })).debt;
  assert.equal(d.outstanding, 750_000);
  assert.deepEqual(await H.balances(c), { BCA: 2_000_000, Cash: 250_000 });
  // mengubah pembayaran menjadi lebih besar dari pokok ditolak dan tidak mengubah apa pun
  await c.fail(409, "PATCH", `/api/debts/${debt.id}/payments/${pid}`, { amount: 1_000_001 });
  assert.equal((await c.get("/api/debts/" + debt.id)).debt.outstanding, 750_000);

  // menghapus lewat daftar transaksi juga memulihkan sisa hutang (bug lama C4)
  const leg = (await c.get("/api/transactions?debtId=" + debt.id)).items[0];
  await c.del("/api/transactions/" + leg.id);
  d = (await c.get("/api/debts/" + debt.id)).debt;
  assert.equal(d.outstanding, 1_000_000);
  assert.equal(d.status, "OPEN");
  assert.equal(d.payments.length, 0);
  assert.deepEqual(await H.balances(c), { BCA: 2_000_000, Cash: 500_000 });
  await H.assertReconciled(c);
});

test("hutang yang masuk ke dompet: pokok menambah saldo tetapi bukan pemasukan", async () => {
  const c = await H.newUser("borrow");
  const w = await H.wallet(c, "BCA", 0);
  const debt = (await c.post("/api/debts", { type: "PAYABLE", personName: "Bank", amount: 2_000_000, date: D, walletId: w.id })).debt;
  assert.equal((await H.balances(c)).BCA, 2_000_000);
  const rep = await c.get("/api/reports?" + RANGE);
  assert.equal(rep.totals.income, 0, "uang pinjaman bukan pemasukan");

  // menaikkan pokok menyesuaikan mutasi dompet; menurunkan di bawah yang sudah dibayar ditolak
  await c.post(`/api/debts/${debt.id}/payments`, { amount: 500_000, date: D, walletId: w.id });
  await c.patch("/api/debts/" + debt.id, { amount: 2_500_000 });
  assert.equal((await H.balances(c)).BCA, 2_000_000);
  assert.equal((await c.get("/api/debts/" + debt.id)).debt.outstanding, 2_000_000);
  await c.fail(400, "PATCH", "/api/debts/" + debt.id, { amount: 400_000 });

  // menghapus catatan hutang membalik seluruh mutasinya
  await c.del("/api/debts/" + debt.id);
  assert.equal((await H.balances(c)).BCA, 0);
  assert.equal((await c.get("/api/transactions")).items.length, 0);
  await H.assertReconciled(c);
});

test("piutang: meminjamkan mengurangi saldo, penagihan menambah, tidak ada pemasukan palsu", async () => {
  const c = await H.newUser("recv");
  const w = await H.wallet(c, "BCA", 1_000_000);
  const loan = (await c.post("/api/debts", { type: "RECEIVABLE", personName: "Kiki", amount: 600_000, date: D, walletId: w.id })).debt;
  assert.equal((await H.balances(c)).BCA, 400_000);
  const d = (await c.post(`/api/debts/${loan.id}/payments`, { amount: 200_000, date: D, walletId: w.id })).debt;
  assert.equal(d.outstanding, 400_000);
  assert.equal((await H.balances(c)).BCA, 600_000);
  const list = await c.get("/api/debts");
  assert.equal(list.totals.receivable, 400_000);
  assert.equal(list.totals.payable, 0);
  const rep = await c.get("/api/reports?" + RANGE);
  assert.equal(rep.totals.income, 0);
  assert.equal(rep.totals.expense, 0);
  await c.fail(400, "POST", `/api/debts/${loan.id}/payments`, { amount: 100_000, date: D, walletId: w.id, feeAmount: 5000 }); // bunga hanya untuk hutang
  await H.assertReconciled(c);
});

test("bunga/biaya dicatat terpisah sebagai pengeluaran, pokok tetap di luar laporan", async () => {
  const c = await H.newUser("fee");
  const w = await H.wallet(c, "BCA", 2_000_000);
  const fee = await H.category(c, "expense", "Bunga & Biaya Admin");
  const debt = (await c.post("/api/debts", { type: "PAYABLE", personName: "Koperasi", amount: 1_000_000, date: "2026-10-01" })).debt;
  const d = (await c.post(`/api/debts/${debt.id}/payments`, { amount: 500_000, date: D, walletId: w.id, feeAmount: 25_000, feeCategoryId: fee.id })).debt;
  assert.equal(d.outstanding, 500_000, "bunga tidak mengurangi pokok");
  assert.equal((await H.balances(c)).BCA, 2_000_000 - 525_000);
  const rep = await c.get("/api/reports?" + RANGE);
  assert.equal(rep.totals.expense, 25_000, "hanya bunga yang menjadi pengeluaran");
  assert.equal(rep.expenseByCategory[0].name, "Bunga & Biaya Admin");
  await H.assertReconciled(c);
});

test("pencatatan hutang duplikat (Idempotency-Key sama, dikirim bersamaan) hanya dibuat sekali", async () => {
  const c = await H.newUser("debtidem");
  const w = await H.wallet(c, "BCA", 500_000);
  const headers = { "Idempotency-Key": "debt-key-0000001" };
  const body = { type: "PAYABLE", personName: "Sari", amount: 1_000_000, date: D, walletId: w.id };
  const res = await Promise.all(Array.from({ length: 5 }, () => c.raw("POST", "/api/debts", { body, headers })));
  assert.ok(res.every((r) => r.status === 201), res.map((r) => r.status).join(","));
  const ids = new Set(res.map((r) => r.json.data.debt.id));
  assert.equal(ids.size, 1, "semua respons menunjuk catatan yang sama");
  const list = await c.get("/api/debts");
  assert.equal(list.debts.length, 1);
  assert.equal(list.totals.payable, 1_000_000);
  assert.equal((await H.balances(c)).BCA, 1_500_000, "pokok pinjaman hanya masuk sekali");

  // Tanpa dompet (tidak ada mutasi) juga terlindungi; pengguna lain dengan kunci sama tidak terpengaruh.
  const h2 = { "Idempotency-Key": "debt-key-0000002" };
  await Promise.all(Array.from({ length: 3 }, () => c.raw("POST", "/api/debts", { body: { type: "RECEIVABLE", personName: "Adi", amount: 200_000, date: D }, headers: h2 })));
  assert.equal((await c.get("/api/debts")).debts.length, 2);
  const other = await H.newUser("debtidem2");
  await other.raw("POST", "/api/debts", { body: { type: "RECEIVABLE", personName: "Adi", amount: 200_000, date: D }, headers: h2 });
  assert.equal((await other.get("/api/debts")).debts.length, 1);
});
