const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");

before(H.start);
after(H.stop);

const D = "2026-10-15";

test("saldo awal bukan pemasukan dan tidak membuat transaksi", async () => {
  const c = await H.newUser("initial");
  const w = await H.wallet(c, "BCA", 5_000_000);
  assert.equal(w.balance, 5_000_000);
  assert.equal(w.initialBalance, 5_000_000);
  const list = await c.get("/api/transactions");
  assert.equal(list.items.length, 0);
  const rep = await c.get(`/api/reports?from=2026-01-01&to=2026-12-31`);
  assert.equal(rep.totals.income, 0);
  assert.equal(rep.totals.expense, 0);
  await H.assertReconciled(c);
});

test("pengeluaran dan pemasukan mengubah saldo; edit dan hapus mengembalikannya dengan tepat", async () => {
  const c = await H.newUser("crud");
  const w = await H.wallet(c, "Cash", 1_000_000);
  const w2 = await H.wallet(c, "OVO", 0);
  const food = await H.category(c, "expense");
  const salary = await H.category(c, "income");

  const exp = (await c.post("/api/transactions", { kind: "expense", amount: 250_000, walletId: w.id, categoryId: food.id, title: "Makan", date: D })).transaction;
  assert.equal(exp.direction, "out");
  assert.equal(exp.date, D, "tanggal transaksi = tanggal yang dimasukkan pengguna");
  await c.post("/api/transactions", { kind: "income", amount: 400_000, walletId: w.id, categoryId: salary.id, title: "Gaji", date: D });
  assert.deepEqual(await H.balances(c), { Cash: 1_150_000, OVO: 0 });

  // ubah nominal
  await c.patch("/api/transactions/" + exp.id, { amount: 100_000 });
  assert.equal((await H.balances(c)).Cash, 1_300_000);
  // pindah dompet: dompet lama dikembalikan, dompet baru dipotong -> saldo OVO tidak cukup
  const err = await c.fail(409, "PATCH", "/api/transactions/" + exp.id, { walletId: w2.id });
  assert.equal(err.code, "INSUFFICIENT_BALANCE");
  assert.equal((await H.balances(c)).Cash, 1_300_000, "perubahan gagal tidak boleh meninggalkan efek sebagian");
  // jadikan pending: dampak saldo dicabut
  await c.patch("/api/transactions/" + exp.id, { status: "pending" });
  assert.equal((await H.balances(c)).Cash, 1_400_000);
  await c.patch("/api/transactions/" + exp.id, { status: "success" });
  await c.del("/api/transactions/" + exp.id);
  assert.equal((await H.balances(c)).Cash, 1_400_000);
  await H.assertReconciled(c);
});

test("validasi server: nominal nol/negatif/pecahan, kategori salah jenis, tanggal tidak valid", async () => {
  const c = await H.newUser("validate");
  const w = await H.wallet(c, "BCA", 100_000);
  const food = await H.category(c, "expense");
  const base = { kind: "expense", walletId: w.id, categoryId: food.id, title: "x", date: D };
  for (const amount of [0, -5, 10.5, "abc", null, 1e18]) {
    const e = await c.fail(400, "POST", "/api/transactions", { ...base, amount });
    assert.equal(e.code, "VALIDATION_ERROR");
    assert.ok(e.fields.amount);
  }
  await c.fail(400, "POST", "/api/transactions", { ...base, amount: 1000, kind: "income" }); // kategori expense dipakai untuk income
  await c.fail(400, "POST", "/api/transactions", { ...base, amount: 1000, date: "2026-02-30" });
  await c.fail(400, "POST", "/api/transactions", { ...base, amount: 1000, date: "15/10/2026" });
  assert.equal((await H.balances(c)).BCA, 100_000);
});

test("saldo tidak bisa menjadi negatif", async () => {
  const c = await H.newUser("overdraft");
  const w = await H.wallet(c, "Cash", 50_000);
  const food = await H.category(c, "expense");
  const e = await c.fail(409, "POST", "/api/transactions", { kind: "expense", amount: 50_001, walletId: w.id, categoryId: food.id, title: "x", date: D });
  assert.equal(e.code, "INSUFFICIENT_BALANCE");
  assert.equal((await c.get("/api/transactions")).items.length, 0, "transaksi yang ditolak tidak boleh tersimpan");
});

test("transaksi bersamaan pada dompet yang sama: tidak ada perubahan saldo yang hilang", async () => {
  const c = await H.newUser("race");
  const w = await H.wallet(c, "BCA", 1_000_000);
  const food = await H.category(c, "expense");
  const N = 25;
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) => c.raw("POST", "/api/transactions", { body: { kind: "expense", amount: 10_000, walletId: w.id, categoryId: food.id, title: "p" + i, date: D } }))
  );
  assert.equal(results.filter((r) => r.status === 201).length, N);
  assert.equal((await H.balances(c)).BCA, 1_000_000 - N * 10_000);
  await H.assertReconciled(c);
});

test("pengeluaran bersamaan yang melebihi saldo: tepat sebanyak yang mampu dibayar yang berhasil", async () => {
  const c = await H.newUser("race2");
  const w = await H.wallet(c, "Cash", 100_000);
  const food = await H.category(c, "expense");
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) => c.raw("POST", "/api/transactions", { body: { kind: "expense", amount: 30_000, walletId: w.id, categoryId: food.id, title: "p" + i, date: D } }))
  );
  const okCount = results.filter((r) => r.status === 201).length;
  assert.equal(okCount, 3, "100.000 hanya cukup untuk 3 × 30.000");
  assert.equal(results.filter((r) => r.status === 409).length, 9);
  assert.equal((await H.balances(c)).Cash, 10_000);
  await H.assertReconciled(c);
});

test("request duplikat dengan Idempotency-Key yang sama hanya membuat satu transaksi", async () => {
  const c = await H.newUser("idem");
  const w = await H.wallet(c, "BCA", 500_000);
  const food = await H.category(c, "expense");
  const body = { kind: "expense", amount: 75_000, walletId: w.id, categoryId: food.id, title: "Sekali saja", date: D };
  const key = { "Idempotency-Key": "test-key-0001-abcdef" };
  const first = await c.raw("POST", "/api/transactions", { body, headers: key });
  const again = await c.raw("POST", "/api/transactions", { body, headers: key });
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(again.json.data.replayed, true);
  assert.equal(again.json.data.transaction.id, first.json.data.transaction.id);
  // dikirim bersamaan
  const key2 = { "Idempotency-Key": "test-key-0002-abcdef" };
  const burst = await Promise.all(Array.from({ length: 6 }, () => c.raw("POST", "/api/transactions", { body, headers: key2 })));
  assert.equal(new Set(burst.map((r) => r.json.data.transaction.id)).size, 1);
  assert.equal((await c.get("/api/transactions")).items.length, 2);
  assert.equal((await H.balances(c)).BCA, 500_000 - 2 * 75_000);
});

test("penyesuaian saldo tercatat sebagai adjustment dan tidak masuk laporan", async () => {
  const c = await H.newUser("adjust");
  const w = await H.wallet(c, "Cash", 200_000);
  const after1 = (await c.post(`/api/wallets/${w.id}/adjust`, { targetBalance: 180_000, date: D })).wallet;
  assert.equal(after1.balance, 180_000);
  const list = await c.get("/api/transactions");
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].kind, "adjustment");
  assert.equal(list.items[0].amount, 20_000);
  const rep = await c.get(`/api/reports?from=2026-10-01&to=2026-10-31`);
  assert.equal(rep.totals.expense, 0);
  assert.equal(rep.excluded.adjustment.amount, 20_000);
  // koreksi saldo awal menggeser saldo berjalan
  const after2 = (await c.patch("/api/wallets/" + w.id, { initialBalance: 250_000 })).wallet;
  assert.equal(after2.balance, 230_000);
  await H.assertReconciled(c);
});

test("dompet yang punya transaksi tidak bisa dihapus, hanya diarsipkan", async () => {
  const c = await H.newUser("wdel");
  const w = await H.wallet(c, "BCA", 100_000);
  const empty = await H.wallet(c, "Kosong", 0);
  const food = await H.category(c, "expense");
  await c.post("/api/transactions", { kind: "expense", amount: 10_000, walletId: w.id, categoryId: food.id, title: "x", date: D });
  const e = await c.fail(409, "DELETE", "/api/wallets/" + w.id);
  assert.equal(e.code, "WALLET_IN_USE");
  assert.equal((await c.get("/api/transactions")).items.length, 1, "riwayat tidak boleh ikut terhapus");
  await c.del("/api/wallets/" + empty.id);
  const archived = (await c.patch("/api/wallets/" + w.id, { active: false })).wallet;
  assert.equal(archived.active, false);
  await c.fail(400, "POST", "/api/transactions", { kind: "expense", amount: 1000, walletId: w.id, categoryId: food.id, title: "x", date: D });
});

test("kategori: buat, ubah, arsipkan; hapus ditolak bila masih dipakai", async () => {
  const c = await H.newUser("cat");
  const w = await H.wallet(c, "BCA", 100_000);
  const cat = (await c.post("/api/categories", { name: "Hobi", type: "expense", icon: "🎮", color: "#ff0000" })).category;
  const upd = (await c.patch("/api/categories/" + cat.id, { name: "Hobi & Game", color: "#00ff00" })).category;
  assert.equal(upd.name, "Hobi & Game");
  assert.equal(upd.color, "#00ff00");
  await c.post("/api/transactions", { kind: "expense", amount: 10_000, walletId: w.id, categoryId: cat.id, title: "x", date: D });
  const e = await c.fail(409, "DELETE", "/api/categories/" + cat.id);
  assert.equal(e.code, "CATEGORY_IN_USE");
  await c.patch("/api/categories/" + cat.id, { archived: true });
  const unused = (await c.post("/api/categories", { name: "Sementara", type: "income" })).category;
  await c.del("/api/categories/" + unused.id);
  await c.fail(400, "POST", "/api/categories", { name: "Salah", type: "debt" });
});

test("pagination cursor, filter, pencarian, dan total dari database", async () => {
  const c = await H.newUser("page");
  const w = await H.wallet(c, "BCA", 10_000_000);
  const w2 = await H.wallet(c, "Cash", 1_000_000);
  const food = await H.category(c, "expense");
  const salary = await H.category(c, "income");
  for (let i = 1; i <= 23; i++) {
    await c.post("/api/transactions", { kind: "expense", amount: 1000 * i, walletId: i % 2 ? w.id : w2.id, categoryId: food.id, title: i === 7 ? "Kopi Tuku" : "Belanja " + i, date: `2026-09-${String(i).padStart(2, "0")}` });
  }
  await c.post("/api/transactions", { kind: "income", amount: 500_000, walletId: w.id, categoryId: salary.id, title: "Gaji", date: "2026-09-25" });

  const p1 = await c.get("/api/transactions?limit=10");
  assert.equal(p1.items.length, 10);
  assert.ok(p1.nextCursor);
  assert.equal(p1.totals.count, 24);
  assert.equal(p1.totals.expense, (23 * 24 / 2) * 1000);
  assert.equal(p1.totals.income, 500_000);
  const p2 = await c.get("/api/transactions?limit=10&cursor=" + p1.nextCursor);
  const p3 = await c.get("/api/transactions?limit=10&cursor=" + p2.nextCursor);
  assert.equal(p3.items.length, 4);
  assert.equal(p3.nextCursor, null);
  const ids = [...p1.items, ...p2.items, ...p3.items].map((t) => t.id);
  assert.equal(new Set(ids).size, 24, "tidak ada baris yang terlewat atau terulang");
  assert.equal(p1.items[0].date, "2026-09-25", "urutan default: terbaru dulu");

  const range = await c.get("/api/transactions?from=2026-09-10&to=2026-09-12");
  assert.deepEqual(range.items.map((t) => t.date), ["2026-09-12", "2026-09-11", "2026-09-10"], "batas rentang inklusif");
  const byWallet = await c.get("/api/transactions?walletId=" + w2.id);
  assert.equal(byWallet.items.length, 11);
  const byKind = await c.get("/api/transactions?kind=income");
  assert.equal(byKind.items.length, 1);
  const search = await c.get("/api/transactions?q=kopi");
  assert.equal(search.items.length, 1);
  assert.equal(search.items[0].title, "Kopi Tuku");
  const sorted = await c.get("/api/transactions?kind=expense&sort=amount_desc&limit=3");
  assert.deepEqual(sorted.items.map((t) => t.amount), [23000, 22000, 21000]);
});
