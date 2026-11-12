/**
 * Akun dan data DEMO untuk pengembangan lokal.
 *
 * - Menolak berjalan bila DATABASE_URL bukan database lokal (127.0.0.1 / localhost).
 * - Hanya menyentuh akun demo; pengguna lain tidak diubah.
 * - Seluruh data dibuat lewat service yang sama dengan aplikasi, sehingga saldo,
 *   transfer, dan hutang konsisten dengan aturan ledger.
 */
import "dotenv/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const url = new URL(process.env.DATABASE_URL || "postgresql://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || process.env.VERCEL || process.env.NODE_ENV === "production") {
  console.error("seed-demo hanya boleh dijalankan pada database lokal. Dibatalkan.");
  process.exit(1);
}

const { prisma } = require("../server/lib/prisma.js");
const dates = require("../server/lib/dates.js");
const users = require("../server/services/users.js");
const wallets = require("../server/services/wallets.js");
const transactions = require("../server/services/transactions.js");
const transfers = require("../server/services/transfers.js");
const debts = require("../server/services/debts.js");
const budgets = require("../server/services/budgets.js");
const savings = require("../server/services/savings.js");

const email = (process.env.DEMO_USER_EMAIL || "demo@monify.local").toLowerCase();
const password = process.env.DEMO_USER_PASSWORD || "demo123456";
const today = dates.today();
const ago = (n) => dates.addDays(today, -n);

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  await prisma.$transaction([
    prisma.savingsEntry.deleteMany({ where: { userId: existing.id } }),
    prisma.debtPayment.deleteMany({ where: { userId: existing.id } }),
    prisma.transaction.deleteMany({ where: { userId: existing.id } }),
    prisma.transfer.deleteMany({ where: { userId: existing.id } }),
    prisma.user.delete({ where: { id: existing.id } }),
  ]);
}

const user = await users.register({ email, password, name: "Pengguna Demo" });
const uid = user.id;
const cats = Object.fromEntries((await prisma.category.findMany({ where: { userId: uid } })).map((c) => [c.name, c]));

const bca = await wallets.create(uid, { name: "BCA", type: "bank", color: "#2563eb", logo: "/assets/logo/BCA.png", initialBalance: 6_500_000 });
const bri = await wallets.create(uid, { name: "BRI", type: "bank", color: "#0ea5e9", logo: "/assets/logo/BRI.png", initialBalance: 2_000_000 });
const cash = await wallets.create(uid, { name: "Tunai", type: "cash", color: "#22c55e", logo: "/assets/logo/Cash.png", initialBalance: 450_000 });
const gopay = await wallets.create(uid, { name: "GoPay", type: "ewallet", color: "#10b981", initialBalance: 150_000 });
const jago = await wallets.create(uid, { name: "Tabungan Jago", type: "savings", color: "#f59e0b", logo: "/assets/logo/Jago.png", initialBalance: 3_000_000 });
await users.updateProfile(uid, { defaultWalletId: bca.id });

const tx = (kind, amount, wallet, category, title, date) =>
  transactions.create(uid, { kind, amount, walletId: wallet.id, categoryId: cats[category].id, title, date });

// Deterministik: pola pengeluaran 120 hari terakhir.
const pattern = [
  ["Makan di Luar", "Makan siang", 38_000, cash],
  ["Kopi & Camilan", "Kopi susu", 24_000, gopay],
  ["Ojek / Taksi Online", "Ojek ke kantor", 17_000, gopay],
  ["Belanja Dapur", "Belanja sayur", 86_000, cash],
  ["Bensin", "Isi bensin", 50_000, bca],
  ["Makan di Luar", "Makan malam", 62_000, bca],
  ["Nonton / Film", "Nonton bioskop", 55_000, bca],
  ["Self Reward", "Es krim", 28_000, gopay],
];
for (let m = 3; m >= 0; m--) {
  const base = m * 30;
  await tx("income", 8_500_000, bca, "Gaji Pokok", "Gaji bulanan", ago(base + 27));
  if (m % 2 === 0) await tx("income", 1_750_000, bca, "Hasil Proyek", "Proyek lepas", ago(base + 14));
  await transfers.create(uid, { fromWalletId: bca.id, toWalletId: gopay.id, amount: 400_000, date: ago(base + 26), note: "Isi GoPay" });
  await transfers.create(uid, { fromWalletId: bca.id, toWalletId: cash.id, amount: 600_000, date: ago(base + 26), note: "Tarik tunai" });
  await tx("expense", 1_800_000, bca, "Sewa / Kos", "Bayar kos", ago(base + 25));
  await tx("expense", 320_000 + m * 15_000, bca, "Listrik & Air", "Token listrik", ago(base + 22));
  await tx("expense", 350_000, bca, "Internet & Pulsa", "Internet rumah", ago(base + 20));
  await tx("expense", 780_000 + m * 40_000, bca, "Belanja Bulanan", "Belanja bulanan", ago(base + 18));
  for (let d = 0; d < 24; d++) {
    const [category, title, amount, wallet] = pattern[(d + m) % pattern.length];
    await tx("expense", amount + ((d * 7 + m * 3) % 9) * 1_000, wallet, category, title, ago(base + ((d * 29) % 28)));
  }
}
await tx("income", 120_000, gopay, "Cashback Belanja", "Cashback promo", ago(3));

// Hutang & piutang
const loan = await debts.create(uid, { type: "PAYABLE", personName: "Kak Rina", amount: 3_000_000, date: ago(75), dueDate: dates.addDays(today, 45), description: "Pinjam untuk servis motor", walletId: bca.id });
await debts.addPayment(uid, loan.id, { amount: 1_000_000, date: ago(45), walletId: bca.id, note: "Cicilan 1" });
await debts.addPayment(uid, loan.id, { amount: 750_000, date: ago(15), walletId: bca.id, note: "Cicilan 2" });
const lend = await debts.create(uid, { type: "RECEIVABLE", personName: "Bima", amount: 500_000, date: ago(30), dueDate: dates.addDays(today, 10), description: "Talangan tiket konser", walletId: cash.id });
await debts.addPayment(uid, lend.id, { amount: 200_000, date: ago(8), walletId: gopay.id });

// Tujuan tabungan
const emergency = await savings.create(uid, { name: "Dana Darurat", targetAmount: 15_000_000, icon: "🛡️", color: "#22c55e", walletId: jago.id });
await savings.addEntry(uid, emergency.id, { amount: 3_000_000, date: ago(100), note: "Saldo awal tabungan" });
for (const n of [80, 50, 20]) await savings.addEntry(uid, emergency.id, { amount: 750_000, date: ago(n), walletId: bca.id });
const laptop = await savings.create(uid, { name: "Laptop Baru", targetAmount: 12_000_000, targetDate: dates.addDays(today, 240), icon: "💻", color: "#f97316" });
await savings.addEntry(uid, laptop.id, { amount: 2_400_000, date: ago(60) });
await savings.addEntry(uid, laptop.id, { amount: 1_100_000, date: ago(12) });

// Budget bulan ini
const y = Number(today.slice(0, 4));
const mo = Number(today.slice(5, 7));
for (const [name, limit] of [["Makan di Luar", 1_200_000], ["Kopi & Camilan", 250_000], ["Belanja Bulanan", 900_000], ["Bensin", 300_000], ["Nonton / Film", 200_000]]) {
  await budgets.create(uid, { targetKind: "CATEGORY", targetId: cats[name].id, limitAmount: limit, year: y, month: mo });
}

console.log(`Data demo dibuat untuk ${email} (password dari DEMO_USER_PASSWORD).`);
await prisma.$disconnect();
