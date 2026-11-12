/**
 * Menguji migrasi v1 terhadap database berskema LAMA yang berisi data lama:
 * tidak ada baris yang hilang, dan klasifikasi/backfill-nya benar.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const MIG = path.join(__dirname, "..", "prisma", "migrations");
const read = (name) => fs.readFileSync(path.join(MIG, name, "migration.sql"), "utf8");
const dbName = "legacy_" + Date.now();
let admin, db;

before(async () => {
  admin = new Client({ connectionString: process.env.TEST_PG_ADMIN_URL.split("?")[0] });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  db = new Client({ connectionString: process.env.TEST_PG_ADMIN_URL.split("?")[0].replace(/\/postgres$/, "/" + dbName) });
  await db.connect();
});

after(async () => {
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end();
});

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const all = async (sql, params) => (await db.query(sql, params)).rows;

test("migrasi v1 pada data lama: aditif, klasifikasi dan backfill benar", async () => {
  // ——— 1. Skema lama + data lama (dibentuk seperti yang ditulis aplikasi versi lama) ———
  await db.query(read("0_init"));
  await db.query(`INSERT INTO "User" (id, email, name, "passwordHash") VALUES ('u1', 'lama@monify.test', 'Lama', 'x')`);
  await db.query(`INSERT INTO "Wallet" (id, "userId", name, currency, balance, flag) VALUES
    ('bca', 'u1', 'BCA', 'IDR', 5250000, 'ID'), ('bri', 'u1', 'BRI', 'IDR', 1300000, 'ID')`);
  await db.query(`INSERT INTO "Category" (id, "userId", name, type, "debtSubtype", icon) VALUES
    ('gaji', 'u1', 'Gaji', 'income', NULL, '💰'), ('makan', 'u1', 'Makan', 'expense', NULL, '🍜'),
    ('tin', 'u1', 'Transfer Masuk', 'income', NULL, '📥'), ('tout', 'u1', 'Transfer Keluar', 'expense', NULL, '📤'),
    ('hutang', 'u1', 'Hutang', 'debt', 'DEBT', '⚠️'), ('lunas', 'u1', 'Pelunasan', 'debt', 'REPAYMENT', '💳'),
    ('pinjam', 'u1', 'Pinjaman', 'debt', 'LOAN', '🤝'), ('tagih', 'u1', 'Penagihan Piutang', 'debt', 'DEBT_COLLECTION', '✅')`);
  const tx = (id, wallet, cat, amount, type, date, extra = {}) =>
    db.query(
      `INSERT INTO "Transaction" (id, "userId", "walletId", "categoryId", amount, type, title, date, status, counterparty, "parentTransactionId", "remainingAmount", "paidOff")
       VALUES ($1, 'u1', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, wallet, cat, amount, type, "Judul " + id, date + "T12:00:00.000Z", extra.status || "success", extra.counterparty || null, extra.parent || null, extra.remaining ?? null, extra.paidOff || false]
    );
  await tx("t1", "bca", "gaji", 5000000, "income", "2026-03-01");
  await tx("t2", "bca", "makan", 200000, "expense", "2026-03-02");
  await tx("t3", "bca", "tout", 1000000, "expense", "2026-03-10"); // pasangan transfer
  await tx("t4", "bri", "tin", 1000000, "income", "2026-03-10");
  await tx("t5", "bca", "tout", 50000, "expense", "2026-03-11"); // tanpa pasangan
  // Hutang 2jt dengan cicilan 500rb. remainingAmount lama SALAH (2jt) akibat bug C4.
  await tx("t6", "bca", "hutang", 2000000, "debt", "2026-03-12", { counterparty: "Andi", remaining: 2000000 });
  await tx("t7", "bca", "lunas", 500000, "debt", "2026-03-20", { counterparty: "Andi", parent: "t6" });
  await tx("t8", "bri", "pinjam", 300000, "debt", "2026-03-13", { counterparty: "Budi", remaining: 0, paidOff: true });
  await tx("t9", "bri", "tagih", 300000, "debt", "2026-03-25", { counterparty: "Budi", parent: "t8" });
  await tx("t10", "bca", "makan", 99000, "expense", "2026-03-26", { status: "pending" });
  await tx("t11", "bca", "lunas", 100000, "debt", "2026-03-27", { counterparty: "Tanpa Induk" }); // pelunasan yatim
  await db.query(`INSERT INTO "Budget" (id, "userId", year, month, "limitAmount", "targetKind", "targetId") VALUES ('b1', 'u1', 2026, 3, 750000, 'CATEGORY', 'makan')`);

  const before1 = await one(`SELECT (SELECT count(*) FROM "Transaction")::int AS tx, (SELECT count(*) FROM "Category")::int AS cat, (SELECT count(*) FROM "Wallet")::int AS w, (SELECT count(*) FROM "Budget")::int AS b`);

  // ——— 2. Terapkan migrasi ———
  await db.query(read("20261112000000_v1_foundation"));

  // ——— 3. Tidak ada yang hilang ———
  const after1 = await one(`SELECT (SELECT count(*) FROM "Transaction")::int AS tx, (SELECT count(*) FROM "Category")::int AS cat, (SELECT count(*) FROM "Wallet")::int AS w, (SELECT count(*) FROM "Budget")::int AS b`);
  assert.deepEqual(after1, before1, "jumlah baris tidak berubah");
  const legacy = await one(`SELECT "remainingAmount"::text AS r, "paidOff", "parentTransactionId", type FROM "Transaction" WHERE id = 't6'`);
  assert.equal(legacy.r, "2000000", "kolom warisan dipertahankan apa adanya");
  assert.equal((await one(`SELECT "limitAmount"::text AS l FROM "Budget" WHERE id = 'b1'`)).l, "750000");

  // ——— 4. Klasifikasi kind + direction ———
  const kinds = Object.fromEntries((await all(`SELECT id, kind, direction FROM "Transaction"`)).map((r) => [r.id, r.kind + "/" + r.direction]));
  assert.deepEqual(kinds, {
    t1: "income/in", t2: "expense/out", t3: "transfer/out", t4: "transfer/in", t5: "transfer/out",
    t6: "debt/in", t7: "debt/out", t8: "debt/out", t9: "debt/in", t10: "expense/out", t11: "debt/out",
  });

  // ——— 5. Laporan: transfer & hutang tidak lagi dihitung sebagai income/expense ———
  const sums = Object.fromEntries((await all(`SELECT kind, sum(amount)::text AS s FROM "Transaction" WHERE status = 'success' GROUP BY kind`)).map((r) => [r.kind, Number(r.s)]));
  assert.equal(sums.income, 5000000, "sebelumnya 6.000.000 karena Transfer Masuk ikut terhitung");
  assert.equal(sums.expense, 200000, "sebelumnya 1.250.000 karena Transfer Keluar ikut terhitung");

  // ——— 6. Saldo awal: saldo tidak berubah dan lolos rekonsiliasi ———
  const wallets = await all(`
    SELECT w.id, w.balance::text AS balance, w."initialBalance"::text AS initial,
           COALESCE((SELECT sum(CASE WHEN t.direction = 'in' THEN t.amount ELSE -t.amount END) FROM "Transaction" t WHERE t."walletId" = w.id AND t.status = 'success'), 0)::text AS moved
    FROM "Wallet" w ORDER BY w.id`);
  assert.deepEqual(wallets.map((w) => [w.id, Number(w.balance), Number(w.initial)]), [["bca", 5250000, 100000], ["bri", 1300000, 300000]]);
  for (const w of wallets) assert.equal(Number(w.initial) + Number(w.moved), Number(w.balance), "initialBalance + Σ mutasi = balance");

  // ——— 7. Transfer berpasangan ———
  const transfers = await all(`SELECT id, "fromWalletId", "toWalletId", amount::text AS amount FROM "Transfer"`);
  assert.equal(transfers.length, 1);
  assert.deepEqual([transfers[0].fromWalletId, transfers[0].toWalletId, Number(transfers[0].amount)], ["bca", "bri", 1000000]);
  const linked = (await all(`SELECT id FROM "Transaction" WHERE "transferId" IS NOT NULL ORDER BY id`)).map((r) => r.id);
  assert.deepEqual(linked, ["t3", "t4"], "t5 tanpa pasangan tetap berdiri sendiri");

  // ——— 8. Hutang/piutang + pembayaran; sisa dihitung ulang dari pembayaran nyata ———
  const debts = Object.fromEntries((await all(`SELECT id, type, "personName", principal::text AS p, outstanding::text AS o, status, "walletId" FROM "Debt"`)).map((d) => [d.id, d]));
  assert.equal(Object.keys(debts).length, 2);
  assert.deepEqual([debts.debt_t6.type, debts.debt_t6.personName, Number(debts.debt_t6.p), Number(debts.debt_t6.o), debts.debt_t6.status], ["PAYABLE", "Andi", 2000000, 1500000, "OPEN"]);
  assert.deepEqual([debts.debt_t8.type, debts.debt_t8.personName, Number(debts.debt_t8.p), Number(debts.debt_t8.o), debts.debt_t8.status], ["RECEIVABLE", "Budi", 300000, 0, "PAID"]);
  const pays = (await all(`SELECT "debtId", "transactionId", amount::text AS a FROM "DebtPayment" ORDER BY "transactionId"`)).map((p) => [p.debtId, p.transactionId, Number(p.a)]);
  assert.deepEqual(pays, [["debt_t6", "t7", 500000], ["debt_t8", "t9", 300000]]);
  const debtLinks = Object.fromEntries((await all(`SELECT id, "debtId" FROM "Transaction" WHERE kind = 'debt'`)).map((r) => [r.id, r.debtId]));
  assert.deepEqual(debtLinks, { t6: "debt_t6", t7: "debt_t6", t8: "debt_t8", t9: "debt_t8", t11: null });

  // ——— 9. Kategori transfer & hutang diarsipkan, bukan dihapus ———
  const archived = (await all(`SELECT id FROM "Category" WHERE archived ORDER BY id`)).map((r) => r.id);
  assert.deepEqual(archived, ["hutang", "lunas", "pinjam", "tagih", "tin", "tout"]);

  // ——— 10. Aturan integritas di tingkat database ———
  const reject = (sql) => assert.rejects(db.query(sql), /violates check constraint/);
  await reject(`UPDATE "Transaction" SET amount = 0 WHERE id = 't2'`);
  await reject(`UPDATE "Transaction" SET amount = -5 WHERE id = 't2'`);
  await reject(`UPDATE "Transaction" SET kind = 'apa-saja' WHERE id = 't2'`);
  await reject(`UPDATE "Debt" SET outstanding = principal + 1 WHERE id = 'debt_t6'`);
  await reject(`UPDATE "Transfer" SET "toWalletId" = "fromWalletId"`);
  await assert.rejects(db.query(`DELETE FROM "Wallet" WHERE id = 'bca'`), /foreign key/, "dompet berisi transaksi tidak bisa dihapus (RESTRICT)");
  await assert.rejects(db.query(`DELETE FROM "Category" WHERE id = 'makan'`), /foreign key/);

  // ——— 11. Index yang dibutuhkan query utama tersedia ———
  const idx = (await all(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).map((r) => r.indexname);
  for (const name of ["Transaction_userId_date_idx", "Transaction_userId_kind_date_idx", "Transaction_walletId_date_idx", "Wallet_userId_idx", "Category_userId_type_idx", "Budget_userId_idx", "Session_expiresAt_idx"]) {
    assert.ok(idx.includes(name), "index hilang: " + name);
  }
});

test("migrasi v1 pada database kosong (instalasi baru) berjalan tanpa error", async () => {
  const name = dbName + "_empty";
  await admin.query(`CREATE DATABASE "${name}"`);
  const c = new Client({ connectionString: process.env.TEST_PG_ADMIN_URL.split("?")[0].replace(/\/postgres$/, "/" + name) });
  await c.connect();
  try {
    await c.query(read("0_init"));
    await c.query(read("20261112000000_v1_foundation"));
    assert.equal((await c.query(`SELECT count(*)::int AS n FROM "Debt"`)).rows[0].n, 0);
  } finally {
    await c.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  }
});
