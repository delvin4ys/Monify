-- Skema: fondasi v1 (dihasilkan prisma migrate diff dari skema lama ke skema baru).
-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_walletId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_categoryId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiConsentAt" TIMESTAMP(3),
ADD COLUMN     "dateFormat" TEXT NOT NULL DEFAULT 'DMY',
ADD COLUMN     "defaultWalletId" TEXT,
ADD COLUMN     "numberFormat" TEXT NOT NULL DEFAULT 'id-ID',
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "color" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "initialBalance" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'bank',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "balance" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "color" TEXT;

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "walletId" TEXT,
ALTER COLUMN "limitAmount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "attachmentKey" TEXT,
ADD COLUMN     "debtId" TEXT,
ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'out',
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'expense',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "transferId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "categoryId" DROP NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE BIGINT,
ALTER COLUMN "remainingAmount" SET DATA TYPE BIGINT;

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromWalletId" TEXT NOT NULL,
    "toWalletId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "principal" BIGINT NOT NULL,
    "outstanding" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "walletId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" BIGINT NOT NULL,
    "savedAmount" BIGINT NOT NULL DEFAULT 0,
    "targetDate" TIMESTAMP(3),
    "icon" TEXT,
    "color" TEXT,
    "walletId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsEntry" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "transferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Transfer_userId_date_idx" ON "Transfer"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_userId_idempotencyKey_key" ON "Transfer"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Debt_userId_status_idx" ON "Debt"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DebtPayment_transactionId_key" ON "DebtPayment"("transactionId");

-- CreateIndex
CREATE INDEX "DebtPayment_debtId_date_idx" ON "DebtPayment"("debtId", "date");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_status_idx" ON "SavingsGoal"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsEntry_transferId_key" ON "SavingsEntry"("transferId");

-- CreateIndex
CREATE INDEX "SavingsEntry_goalId_date_idx" ON "SavingsEntry"("goalId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CategoryParent_userId_kind_idx" ON "CategoryParent"("userId", "kind");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "Category_userId_type_idx" ON "Category"("userId", "type");

-- CreateIndex
CREATE INDEX "Budget_userId_idx" ON "Budget"("userId");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_kind_date_idx" ON "Transaction"("userId", "kind", "date");

-- CreateIndex
CREATE INDEX "Transaction_walletId_date_idx" ON "Transaction"("walletId", "date");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");

-- CreateIndex
CREATE INDEX "Transaction_transferId_idx" ON "Transaction"("transferId");

-- CreateIndex
CREATE INDEX "Transaction_debtId_idx" ON "Transaction"("debtId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_userId_idempotencyKey_key" ON "Transaction"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toWalletId_fkey" FOREIGN KEY ("toWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsEntry" ADD CONSTRAINT "SavingsEntry_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsEntry" ADD CONSTRAINT "SavingsEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsEntry" ADD CONSTRAINT "SavingsEntry_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- Backfill data (ditulis tangan). Seluruhnya aditif: tidak ada baris atau kolom
-- yang dihapus. Kolom warisan (type, parentTransactionId, remainingAmount,
-- paidOff, imageUrl) tetap utuh sebagai jejak.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Klasifikasi tiap transaksi lama: kind (perlakuan laporan) + direction (arah saldo).
--    Sebelumnya keduanya diturunkan dari kategori saat runtime.
UPDATE "Transaction" t
SET "kind" = CASE
      WHEN c."name" IN ('Transfer Masuk', 'Transfer Keluar') THEN 'transfer'
      WHEN c."type" = 'debt' THEN 'debt'
      WHEN c."type" = 'income' THEN 'income'
      ELSE 'expense'
    END,
    "direction" = CASE
      WHEN c."type" = 'income' THEN 'in'
      WHEN c."type" = 'expense' THEN 'out'
      WHEN c."type" = 'debt' AND COALESCE(c."debtSubtype", 'DEBT') IN ('DEBT', 'DEBT_COLLECTION') THEN 'in'
      ELSE 'out'
    END
FROM "Category" c
WHERE c."id" = t."categoryId";

-- 2. Saldo awal dompet = saldo sekarang − Σ mutasi tercatat, sehingga
--    initialBalance + Σ mutasi = balance berlaku untuk semua dompet lama.
UPDATE "Wallet" w
SET "initialBalance" = w."balance" - COALESCE((
  SELECT SUM(CASE WHEN t."direction" = 'in' THEN t."amount" ELSE -t."amount" END)
  FROM "Transaction" t
  WHERE t."walletId" = w."id" AND t."status" = 'success'
), 0);

-- 3. Pasangkan transfer lama (Transfer Keluar + Transfer Masuk) menjadi satu Transfer
--    bila cocok tepat: pengguna, tanggal, dan nominal sama, dompet berbeda.
--    Yang tidak berpasangan tetap berjenis transfer (tetap di luar laporan).
WITH o AS (
  SELECT t."id", t."userId", t."walletId", t."amount", t."date", t."title", t."createdAt",
         ROW_NUMBER() OVER (PARTITION BY t."userId", t."date"::date, t."amount" ORDER BY t."createdAt", t."id") AS rn
  FROM "Transaction" t
  WHERE t."kind" = 'transfer' AND t."direction" = 'out' AND t."status" = 'success'
), i AS (
  SELECT t."id", t."userId", t."walletId", t."amount", t."date",
         ROW_NUMBER() OVER (PARTITION BY t."userId", t."date"::date, t."amount" ORDER BY t."createdAt", t."id") AS rn
  FROM "Transaction" t
  WHERE t."kind" = 'transfer' AND t."direction" = 'in' AND t."status" = 'success'
), pairs AS (
  SELECT o."id" AS out_id, i."id" AS in_id, o."userId", o."walletId" AS from_wallet, i."walletId" AS to_wallet,
         o."amount", o."date", o."title", o."createdAt"
  FROM o
  JOIN i ON i."userId" = o."userId" AND i."date"::date = o."date"::date AND i."amount" = o."amount" AND i.rn = o.rn
  WHERE i."walletId" <> o."walletId"
), ins AS (
  INSERT INTO "Transfer" ("id", "userId", "fromWalletId", "toWalletId", "amount", "date", "note", "createdAt", "updatedAt")
  SELECT 'trf_' || p.out_id, p."userId", p.from_wallet, p.to_wallet, p."amount", p."date", p."title", p."createdAt", CURRENT_TIMESTAMP
  FROM pairs p
  RETURNING "id"
)
UPDATE "Transaction" t
SET "transferId" = 'trf_' || p.out_id
FROM pairs p
WHERE t."id" IN (p.out_id, p.in_id);

-- 4. Hutang/piutang lama (transaksi berkategori DEBT/LOAN) menjadi baris Debt.
INSERT INTO "Debt" ("id", "userId", "type", "personName", "principal", "outstanding", "date", "description", "status", "walletId", "createdAt", "updatedAt")
SELECT 'debt_' || t."id",
       t."userId",
       CASE WHEN c."debtSubtype" = 'DEBT' THEN 'PAYABLE' ELSE 'RECEIVABLE' END,
       COALESCE(NULLIF(BTRIM(t."counterparty"), ''), '—'),
       t."amount",
       t."amount",
       t."date",
       t."title",
       'OPEN',
       t."walletId",
       t."createdAt",
       CURRENT_TIMESTAMP
FROM "Transaction" t
JOIN "Category" c ON c."id" = t."categoryId"
WHERE c."type" = 'debt' AND c."debtSubtype" IN ('DEBT', 'LOAN') AND t."status" = 'success';

UPDATE "Transaction" t
SET "debtId" = 'debt_' || t."id"
WHERE EXISTS (SELECT 1 FROM "Debt" d WHERE d."id" = 'debt_' || t."id");

-- 5. Cicilan lama (punya parentTransactionId yang valid) menjadi DebtPayment.
INSERT INTO "DebtPayment" ("id", "debtId", "userId", "amount", "date", "transactionId", "createdAt")
SELECT 'pay_' || ch."id", 'debt_' || ch."parentTransactionId", ch."userId", ch."amount", ch."date", ch."id", ch."createdAt"
FROM "Transaction" ch
WHERE ch."parentTransactionId" IS NOT NULL
  AND ch."status" = 'success'
  AND EXISTS (SELECT 1 FROM "Debt" d WHERE d."id" = 'debt_' || ch."parentTransactionId" AND d."userId" = ch."userId");

UPDATE "Transaction" ch
SET "debtId" = 'debt_' || ch."parentTransactionId"
WHERE EXISTS (SELECT 1 FROM "DebtPayment" p WHERE p."transactionId" = ch."id");

-- 6. Sisa hutang dihitung ulang dari pembayaran yang benar-benar ada.
--    (remainingAmount lama bisa salah: menghapus cicilan tidak pernah mengembalikannya.)
UPDATE "Debt" d
SET "outstanding" = GREATEST(d."principal" - COALESCE((SELECT SUM(p."amount") FROM "DebtPayment" p WHERE p."debtId" = d."id"), 0), 0);

UPDATE "Debt" SET "status" = 'PAID' WHERE "outstanding" = 0;

-- 7. Kategori transfer dan hutang tidak lagi dipilih manual (digantikan fitur
--    Transfer dan Hutang/Piutang). Diarsipkan, bukan dihapus.
UPDATE "Category"
SET "archived" = true
WHERE "type" = 'debt' OR "name" IN ('Transfer Masuk', 'Transfer Keluar');

-- 8. Aturan integritas di tingkat database.
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_direction_valid" CHECK ("direction" IN ('in', 'out'));
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_kind_valid" CHECK ("kind" IN ('expense', 'income', 'transfer', 'debt', 'adjustment'));
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_distinct_wallets" CHECK ("fromWalletId" <> "toWalletId");
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_amounts_valid" CHECK ("principal" > 0 AND "outstanding" >= 0 AND "outstanding" <= "principal");
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_amounts_valid" CHECK ("targetAmount" > 0 AND "savedAmount" >= 0);
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_limit_positive" CHECK ("limitAmount" > 0);
