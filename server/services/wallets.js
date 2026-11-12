const { prisma } = require("../lib/prisma");
const { badRequest, notFound, conflict } = require("../lib/errors");
const { toDate } = require("../lib/dates");
const S = require("../lib/serializers");
const ledger = require("./ledger");
const audit = require("./audit");

const WALLET_TYPES = ["cash", "bank", "ewallet", "savings", "investment", "other"];

async function owned(db, userId, id) {
  const w = await db.wallet.findFirst({ where: { id, userId } });
  if (!w) throw notFound("Dompet tidak ditemukan.");
  return w;
}

async function list(userId) {
  const rows = await prisma.wallet.findMany({ where: { userId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  return rows.map(S.wallet);
}

async function create(userId, input) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayCurrency: true } });
  const currency = user.displayCurrency === "USD" ? "USD" : "IDR";
  const initial = input.initialBalance || 0;
  const w = await prisma.$transaction(async (tx) => {
    const created = await tx.wallet.create({
      data: {
        userId,
        name: input.name,
        type: input.type || "bank",
        currency,
        // Saldo awal bukan pemasukan: disimpan terpisah dan tidak membuat transaksi.
        initialBalance: initial,
        balance: initial,
        flag: currency === "USD" ? "US" : "ID",
        logo: input.logo || null,
        color: input.color || null,
      },
    });
    await audit.record(tx, userId, "wallet.create", "Wallet", created.id, { initialBalance: initial });
    return created;
  });
  return S.wallet(w);
}

async function update(userId, id, input) {
  const w0 = await owned(prisma, userId, id);
  const data = {};
  if (input.name != null) data.name = input.name;
  if (input.type != null) data.type = input.type;
  if (input.color !== undefined) data.color = input.color;
  if (input.logo !== undefined) data.logo = input.logo;
  if (input.active !== undefined) data.active = input.active;

  const w = await prisma.$transaction(async (tx) => {
    if (input.initialBalance != null && input.initialBalance !== Number(w0.initialBalance)) {
      // Mengoreksi saldo awal menggeser saldo berjalan sebesar selisih yang sama.
      const diff = input.initialBalance - Number(w0.initialBalance);
      await ledger.applyDelta(tx, userId, id, diff);
      data.initialBalance = input.initialBalance;
      await audit.record(tx, userId, "wallet.initial_balance", "Wallet", id, { from: Number(w0.initialBalance), to: input.initialBalance });
    }
    return tx.wallet.update({ where: { id }, data });
  });
  return S.wallet(w);
}

/**
 * Samakan saldo dompet dengan saldo nyata. Selisihnya dicatat sebagai transaksi
 * `adjustment` sehingga riwayat tetap bisa direkonsiliasi; tidak masuk laporan
 * pemasukan/pengeluaran.
 */
async function adjustBalance(userId, id, { targetBalance, date, note }) {
  return prisma.$transaction(async (tx) => {
    const w = await owned(tx, userId, id);
    const diff = targetBalance - Number(w.balance);
    if (diff === 0) throw badRequest("Saldo sudah sesuai.", { targetBalance: "Saldo sudah sesuai." });
    const direction = diff > 0 ? "in" : "out";
    const amount = Math.abs(diff);
    await ledger.applyDelta(tx, userId, id, diff);
    const t = await tx.transaction.create({
      data: {
        userId,
        walletId: id,
        categoryId: null,
        amount,
        kind: "adjustment",
        direction,
        type: "adjustment",
        title: note || "Penyesuaian saldo",
        date: toDate(date),
        status: "success",
        currency: w.currency,
      },
    });
    await audit.record(tx, userId, "wallet.adjust", "Wallet", id, { diff, transactionId: t.id });
    const fresh = await tx.wallet.findUnique({ where: { id } });
    return S.wallet(fresh);
  });
}

/** Dompet yang punya riwayat tidak bisa dihapus — hanya diarsipkan. */
async function remove(userId, id) {
  await owned(prisma, userId, id);
  const [tx, tr, debts] = await Promise.all([
    prisma.transaction.count({ where: { walletId: id } }),
    prisma.transfer.count({ where: { OR: [{ fromWalletId: id }, { toWalletId: id }] } }),
    prisma.debt.count({ where: { walletId: id } }),
  ]);
  if (tx + tr + debts > 0) {
    throw conflict(
      `Dompet ini memiliki ${tx} transaksi sehingga tidak bisa dihapus. Arsipkan dompet untuk menyembunyikannya tanpa kehilangan riwayat.`,
      "WALLET_IN_USE"
    );
  }
  await prisma.$transaction(async (db) => {
    await db.user.updateMany({ where: { id: userId, defaultWalletId: id }, data: { defaultWalletId: null } });
    await db.wallet.delete({ where: { id } });
    await audit.record(db, userId, "wallet.delete", "Wallet", id);
  });
}

module.exports = { WALLET_TYPES, owned, list, create, update, adjustBalance, remove };
