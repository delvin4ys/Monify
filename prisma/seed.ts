import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { ensureSystemParents, findSystemParentByName } = require("../server/lib/system-parents.js");
const { getWalletDelta } = require("../server/lib/wallet-delta.js");

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL ?? "demo@monify.local";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? "demo123456";

/** PNG 1×1 transparan — dipakai sebagai lampiran contoh (/uploads/demo-receipt.png). */
const DEMO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, name: "Pengguna Demo", passwordHash },
    update: { name: "Pengguna Demo", passwordHash },
  });

  await prisma.budget.deleteMany({ where: { userId: user.id } });
  await prisma.transaction.deleteMany({ where: { userId: user.id } });
  await prisma.category.deleteMany({ where: { userId: user.id } });
  await prisma.wallet.deleteMany({ where: { userId: user.id } });
  await prisma.categoryParent.deleteMany({ where: { userId: user.id } });

  await ensureSystemParents();

  const pFood = await findSystemParentByName("Makan & Minuman", "expense");
  const pTrans = await findSystemParentByName("Transportasi", "expense");
  const pShop = await findSystemParentByName("Belanja", "expense");
  const pBill = await findSystemParentByName("Tagihan & Utilitas", "expense");
  const pGaji = await findSystemParentByName("Gaji & Upah", "income");
  const pFree = await findSystemParentByName("Freelance & Usaha", "income");
  const pPelunasan = await findSystemParentByName("Pelunasan", "debt");
  const pPinjaman = await findSystemParentByName("Pinjaman", "debt");

  if (!pTrans || !pFood) {
    throw new Error("Preset induk kategori sistem tidak lengkap. Jalankan ensureSystemParents.");
  }

  /** Induk kategori buatan user — dicek di Pengaturan → Induk kategori kustom */
  const parentHobi = await prisma.categoryParent.create({
    data: {
      userId: user.id,
      name: "Hobi & Proyek (contoh)",
      kind: "expense",
      sortOrder: 2,
    },
  });

  const uploadDir = path.join(__dirname, "..", "storage", "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, "demo-receipt.png"), DEMO_PNG);

  await prisma.wallet.createMany({
    data: [
      { id: "w1", userId: user.id, name: "BCA", currency: "IDR", balance: 12_450_000, active: true, flag: "🇮🇩", logo: "🏦" },
      { id: "w2", userId: user.id, name: "BRI", currency: "IDR", balance: 45_200_000, active: true, flag: "🇮🇩", logo: "🏦" },
      { id: "w3", userId: user.id, name: "ShopeePay", currency: "IDR", balance: 500_000, active: true, flag: "🇮🇩", logo: "🛒" },
      { id: "w4", userId: user.id, name: "USD Cash", currency: "USD", balance: 50_000, active: true, flag: "🇺🇸", logo: "💵" },
    ],
  });

  await prisma.category.createMany({
    data: [
      { id: "c1", userId: user.id, name: "Makan & Minum", type: "expense", icon: "🍜", parentId: pFood?.id ?? null },
      { id: "c2", userId: user.id, name: "Transport", type: "expense", icon: "🚗", parentId: pTrans?.id ?? null },
      { id: "c3", userId: user.id, name: "Belanja", type: "expense", icon: "🛍️", parentId: pShop?.id ?? null },
      { id: "c4", userId: user.id, name: "Tagihan", type: "expense", icon: "🧾", parentId: pBill?.id ?? null },
      { id: "c5", userId: user.id, name: "Gaji", type: "income", icon: "💼", parentId: pGaji?.id ?? null },
      { id: "c6", userId: user.id, name: "Freelance", type: "income", icon: "💻", parentId: pFree?.id ?? null },
      { id: "c7", userId: user.id, name: "Cicilan pinjaman", type: "debt", debtSubtype: "REPAYMENT", icon: "💳", parentId: pPelunasan?.id ?? null },
      { id: "c8", userId: user.id, name: "Terima pinjaman", type: "debt", debtSubtype: "LOAN", icon: "🤝", parentId: pPinjaman?.id ?? null },
      {
        id: "c9",
        userId: user.id,
        name: "Koleksi & miniatur",
        type: "expense",
        icon: "🎁",
        parentId: parentHobi.id,
      },
    ],
  });

  const now = new Date();
  const budgetYear = now.getFullYear();
  const budgetMonth = now.getMonth() + 1;
  const y = budgetYear;
  const m = now.getMonth();
  const txDay = (day: number) => new Date(y, m, day, 12, 0, 0, 0);

  const periodStart = new Date(y, m, 1, 0, 0, 0, 0);
  const periodEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);

  await prisma.budget.createMany({
    data: [
      /** Budget bulanan per kategori daun */
      { userId: user.id, targetKind: "CATEGORY", targetId: "c1", year: budgetYear, month: budgetMonth, limitAmount: 2_500_000 },
      { userId: user.id, targetKind: "CATEGORY", targetId: "c2", year: budgetYear, month: budgetMonth, limitAmount: 1_200_000 },
      { userId: user.id, targetKind: "CATEGORY", targetId: "c3", year: budgetYear, month: budgetMonth, limitAmount: 3_000_000 },
      { userId: user.id, targetKind: "CATEGORY", targetId: "c4", year: budgetYear, month: budgetMonth, limitAmount: 2_000_000 },
      /** Agregat semua anak di bawah induk "Transportasi" */
      { userId: user.id, targetKind: "PARENT", targetId: pTrans.id, year: budgetYear, month: budgetMonth, limitAmount: 1_500_000 },
      /** Rentang kustom (bulan berjalan) untuk kategori Hobi */
      {
        userId: user.id,
        targetKind: "CATEGORY",
        targetId: "c9",
        year: null,
        month: null,
        limitAmount: 800_000,
        periodStart,
        periodEnd,
      },
    ],
  });

  await prisma.transaction.createMany({
    data: [
      {
        userId: user.id,
        walletId: "w1",
        categoryId: "c1",
        amount: 45_000,
        type: "expense",
        title: "Warung makan siang",
        date: txDay(21),
        status: "success",
        currency: "IDR",
      },
      {
        userId: user.id,
        walletId: "w1",
        categoryId: "c2",
        amount: 28_000,
        type: "expense",
        title: "Gojek ke kantor",
        date: txDay(21),
        status: "success",
        currency: "IDR",
      },
      {
        userId: user.id,
        walletId: "w1",
        categoryId: "c5",
        amount: 15_000_000,
        type: "income",
        title: "Gaji bulan ini",
        date: txDay(1),
        status: "success",
        currency: "IDR",
      },
      {
        userId: user.id,
        walletId: "w2",
        categoryId: "c6",
        amount: 2_500_000,
        type: "income",
        title: "Proyek freelance (contoh)",
        date: txDay(10),
        status: "success",
        currency: "IDR",
      },
      {
        userId: user.id,
        walletId: "w1",
        categoryId: "c3",
        amount: 312_500,
        type: "expense",
        title: "Supermarket",
        date: txDay(20),
        status: "success",
        currency: "IDR",
      },
      {
        userId: user.id,
        walletId: "w1",
        categoryId: "c4",
        amount: 450_000,
        type: "expense",
        title: "Listrik PLN (pending)",
        date: txDay(18),
        status: "pending",
        currency: "IDR",
      },
      {
        userId: user.id,
        walletId: "w1",
        categoryId: "c7",
        amount: 500_000,
        type: "debt",
        title: "Cicilan ke bank",
        date: txDay(5),
        status: "success",
        currency: "IDR",
        counterparty: "Bank BCA",
        relatedParty: "Keluarga",
      },
      {
        userId: user.id,
        walletId: "w1",
        categoryId: "c8",
        amount: 3_000_000,
        type: "debt",
        title: "Terima pinjaman teman (contoh LOAN)",
        date: txDay(3),
        status: "success",
        currency: "IDR",
        counterparty: "Budi",
        relatedParty: "—",
      },
      {
        userId: user.id,
        walletId: "w1",
        categoryId: "c1",
        amount: 88_000,
        type: "expense",
        title: "Makan + lampiran bukti (contoh upload)",
        date: txDay(19),
        status: "success",
        currency: "IDR",
        imageUrl: "/uploads/demo-receipt.png",
      },
      {
        userId: user.id,
        walletId: "w3",
        categoryId: "c9",
        amount: 150_000,
        type: "expense",
        title: "Miniatur koleksi (induk kategori kustom)",
        date: txDay(17),
        status: "success",
        currency: "IDR",
      },
      /** amount dalam sen USD */
      {
        userId: user.id,
        walletId: "w4",
        categoryId: "c3",
        amount: 1_250,
        type: "expense",
        title: "Kopi (USD, contoh multi-mata uang)",
        date: txDay(16),
        status: "success",
        currency: "USD",
      },
    ],
  });

  const initialBal: Record<string, number> = {
    w1: 12_450_000,
    w2: 45_200_000,
    w3: 500_000,
    w4: 50_000,
  };
  const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });
  for (const w of wallets) {
    const txs = await prisma.transaction.findMany({
      where: { walletId: w.id },
      include: { category: true },
    });
    let d = 0;
    for (const t of txs) {
      if (t.status !== "success") continue;
      d += getWalletDelta(t.category, t.amount);
    }
    await prisma.wallet.update({
      where: { id: w.id },
      data: { balance: (initialBal[w.id] ?? 0) + d },
    });
  }

  console.log("");
  console.log("=== Seed demo Monify OK ===");
  console.log("Login:", DEMO_EMAIL, "  Password:", DEMO_PASSWORD);
  console.log("Buka /demo untuk daftar fitur & apa yang dicek di UI.");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
