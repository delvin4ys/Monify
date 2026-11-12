const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");

before(H.start);
after(H.stop);

const D = "2026-10-15";
const RANGE = "from=2026-10-01&to=2026-10-31";

test("Test case 1 — transfer internal: BRI 5jt → BCA 2jt, pindah 1jt", async () => {
  const c = await H.newUser("tc1");
  const bri = await H.wallet(c, "BRI", 5_000_000);
  const bca = await H.wallet(c, "BCA", 2_000_000);

  const r = await c.post("/api/transfers", { fromWalletId: bri.id, toWalletId: bca.id, amount: 1_000_000, date: D, note: "Pindah dana" });
  assert.equal(r.transfer.amount, 1_000_000);

  const b = await H.balances(c);
  assert.equal(b.BRI, 4_000_000);
  assert.equal(b.BCA, 3_000_000);
  assert.equal(b.BRI + b.BCA, 7_000_000, "total saldo tidak berubah");

  const rep = await c.get("/api/reports?" + RANGE);
  assert.equal(rep.totals.income, 0, "income tidak bertambah");
  assert.equal(rep.totals.expense, 0, "expense tidak bertambah");
  assert.equal(rep.excluded.transfer.count, 2);

  // satu input -> dua riwayat yang saling terhubung, satu di tiap dompet
  const tx = (await c.get("/api/transactions")).items;
  assert.equal(tx.length, 2);
  assert.ok(tx.every((t) => t.kind === "transfer" && t.transferId === r.transfer.id));
  assert.equal(tx.find((t) => t.walletId === bri.id).direction, "out");
  assert.equal(tx.find((t) => t.walletId === bca.id).direction, "in");

  const dash = await c.get("/api/dashboard?today=" + D);
  assert.equal(dash.balance, 7_000_000);
  assert.equal(dash.totals.income, 0);
  assert.equal(dash.totals.expense, 0);
  await H.assertReconciled(c);
});

test("transfer atomic: bila saldo sumber kurang, tidak ada sisi yang berubah", async () => {
  const c = await H.newUser("atomic");
  const a = await H.wallet(c, "A", 100_000);
  const b = await H.wallet(c, "B", 0);
  const e = await c.fail(409, "POST", "/api/transfers", { fromWalletId: a.id, toWalletId: b.id, amount: 100_001, date: D });
  assert.equal(e.code, "INSUFFICIENT_BALANCE");
  assert.deepEqual(await H.balances(c), { A: 100_000, B: 0 });
  assert.equal((await c.get("/api/transactions")).items.length, 0);
});

test("transfer: validasi dompet sama, nominal nol, dompet orang lain", async () => {
  const c = await H.newUser("tval");
  const other = await H.newUser("tval-other");
  const a = await H.wallet(c, "A", 100_000);
  const foreign = await H.wallet(other, "Asing", 0);
  await c.fail(400, "POST", "/api/transfers", { fromWalletId: a.id, toWalletId: a.id, amount: 1000, date: D });
  await c.fail(400, "POST", "/api/transfers", { fromWalletId: a.id, toWalletId: foreign.id, amount: 1000, date: D });
  await c.fail(400, "POST", "/api/transfers", { fromWalletId: a.id, toWalletId: foreign.id, amount: 0, date: D });
  assert.equal((await H.balances(c)).A, 100_000);
  assert.equal((await H.balances(other)).Asing, 0, "dompet pengguna lain tidak boleh tersentuh");
});

test("transfer duplikat (Idempotency-Key sama, dikirim bersamaan) hanya dieksekusi sekali", async () => {
  const c = await H.newUser("tidem");
  const a = await H.wallet(c, "A", 1_000_000);
  const b = await H.wallet(c, "B", 0);
  const body = { fromWalletId: a.id, toWalletId: b.id, amount: 200_000, date: D };
  const headers = { "Idempotency-Key": "transfer-key-00001" };
  const burst = await Promise.all(Array.from({ length: 8 }, () => c.raw("POST", "/api/transfers", { body, headers })));
  assert.ok(burst.every((r) => r.status === 200 || r.status === 201), burst.map((r) => r.status).join(","));
  assert.equal(new Set(burst.map((r) => r.json.data.transfer.id)).size, 1);
  assert.deepEqual(await H.balances(c), { A: 800_000, B: 200_000 });
  assert.equal((await c.get("/api/transactions")).items.length, 2);
});

test("transfer berlawanan arah secara bersamaan tidak deadlock dan total saldo tetap", async () => {
  const c = await H.newUser("tcross");
  const a = await H.wallet(c, "A", 1_000_000);
  const b = await H.wallet(c, "B", 1_000_000);
  const jobs = [];
  for (let i = 0; i < 10; i++) {
    jobs.push(c.raw("POST", "/api/transfers", { body: { fromWalletId: a.id, toWalletId: b.id, amount: 10_000, date: D } }));
    jobs.push(c.raw("POST", "/api/transfers", { body: { fromWalletId: b.id, toWalletId: a.id, amount: 7_000, date: D } }));
  }
  const res = await Promise.all(jobs);
  assert.ok(res.every((r) => r.status === 201), res.map((r) => r.status).join(","));
  const bal = await H.balances(c);
  assert.equal(bal.A, 1_000_000 - 10 * 10_000 + 10 * 7_000);
  assert.equal(bal.B, 1_000_000 + 10 * 10_000 - 10 * 7_000);
  await H.assertReconciled(c);
});

test("ubah dan hapus transfer menjaga kedua dompet tetap konsisten", async () => {
  const c = await H.newUser("tedit");
  const a = await H.wallet(c, "A", 500_000);
  const b = await H.wallet(c, "B", 0);
  const x = await H.wallet(c, "C", 0);
  const t = (await c.post("/api/transfers", { fromWalletId: a.id, toWalletId: b.id, amount: 100_000, date: D })).transfer;
  await c.patch("/api/transfers/" + t.id, { amount: 150_000, toWalletId: x.id });
  assert.deepEqual(await H.balances(c), { A: 350_000, B: 0, C: 150_000 });
  assert.equal((await c.get("/api/transactions")).items.length, 2);
  // menghapus salah satu baris transaksi menghapus seluruh transfer
  const leg = (await c.get("/api/transactions")).items[0];
  await c.del("/api/transactions/" + leg.id);
  assert.deepEqual(await H.balances(c), { A: 500_000, B: 0, C: 0 });
  assert.equal((await c.get("/api/transactions")).items.length, 0);
  // baris transfer tidak bisa diedit sebagai transaksi biasa
  const t2 = (await c.post("/api/transfers", { fromWalletId: a.id, toWalletId: b.id, amount: 1000, date: D })).transfer;
  const leg2 = (await c.get("/api/transactions")).items[0];
  const e = await c.fail(409, "PATCH", "/api/transactions/" + leg2.id, { amount: 5 });
  assert.equal(e.code, "MANAGED_BY_TRANSFER");
  await c.del("/api/transfers/" + t2.id);
  await H.assertReconciled(c);
});

test("transfer eksternal: pengguna memilih pengeluaran atau non-pengeluaran", async () => {
  const c = await H.newUser("ext");
  const w = await H.wallet(c, "BCA", 1_000_000);
  const family = await H.category(c, "expense", "Kebutuhan Keluarga");
  // (a) kirim uang ke keluarga sebagai pengeluaran
  await c.post("/api/transactions", { kind: "expense", amount: 300_000, walletId: w.id, categoryId: family.id, title: "Kirim ke Ibu", date: D, counterparty: "Ibu" });
  // (b) titip uang ke teman — bukan pengeluaran
  const nx = (await c.post("/api/transactions", { kind: "transfer", direction: "out", amount: 200_000, walletId: w.id, title: "Titip ke Budi", date: D, counterparty: "Budi" })).transaction;
  assert.equal(nx.kind, "transfer");
  assert.equal(nx.transferId, null);
  await c.fail(400, "POST", "/api/transactions", { kind: "transfer", amount: 1000, walletId: w.id, title: "tanpa nama", date: D });

  assert.equal((await H.balances(c)).BCA, 500_000, "kedua-duanya mengurangi saldo");
  const rep = await c.get("/api/reports?" + RANGE);
  assert.equal(rep.totals.expense, 300_000, "hanya yang diklasifikasikan pengeluaran yang masuk laporan");
  assert.equal(rep.excluded.transfer.amount, 200_000);
  await H.assertReconciled(c);
});
