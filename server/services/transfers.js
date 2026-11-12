/**
 * Transfer antar dompet milik sendiri — satu input, dua sisi, atomic.
 *
 * Satu baris Transfer selalu punya tepat dua baris Transaction (kind "transfer"):
 * "out" pada dompet sumber dan "in" pada dompet tujuan. Karena berjenis
 * transfer, keduanya tidak pernah masuk laporan pemasukan/pengeluaran.
 */
const { Prisma } = require("@prisma/client");
const { prisma } = require("../lib/prisma");
const { badRequest, notFound } = require("../lib/errors");
const { toDate } = require("../lib/dates");
const S = require("../lib/serializers");
const ledger = require("./ledger");
const audit = require("./audit");

const INCLUDE = { fromWallet: true, toWallet: true };

async function loadWallets(tx, userId, fromWalletId, toWalletId) {
  if (fromWalletId === toWalletId) {
    throw badRequest("Dompet asal dan tujuan harus berbeda.", { toWalletId: "Pilih dompet tujuan yang berbeda." });
  }
  const ws = await tx.wallet.findMany({ where: { userId, id: { in: [fromWalletId, toWalletId] } } });
  const from = ws.find((w) => w.id === fromWalletId);
  const to = ws.find((w) => w.id === toWalletId);
  if (!from) throw badRequest("Dompet asal tidak ditemukan.", { fromWalletId: "Pilih dompet asal." });
  if (!to) throw badRequest("Dompet tujuan tidak ditemukan.", { toWalletId: "Pilih dompet tujuan." });
  if (from.currency !== to.currency) {
    throw badRequest("Transfer antar mata uang berbeda belum didukung.", { toWalletId: "Mata uang dompet harus sama." });
  }
  return { from, to };
}

function legs(userId, transfer, from, to, note) {
  const base = {
    userId,
    amount: transfer.amount,
    kind: "transfer",
    type: "transfer",
    date: transfer.date,
    status: "success",
    currency: from.currency,
    transferId: transfer.id,
    categoryId: null,
  };
  return [
    { ...base, walletId: from.id, direction: "out", title: note || `Transfer ke ${to.name}`, counterparty: to.name },
    { ...base, walletId: to.id, direction: "in", title: note || `Transfer dari ${from.name}`, counterparty: from.name },
  ];
}

/** Dipakai juga oleh savings.js; harus dipanggil di dalam transaksi database. */
async function createInTx(tx, userId, input) {
  const { from, to } = await loadWallets(tx, userId, input.fromWalletId, input.toWalletId);
  await ledger.applyDeltas(tx, userId, [
    { walletId: from.id, delta: -input.amount },
    { walletId: to.id, delta: input.amount },
  ]);
  const transfer = await tx.transfer.create({
    data: {
      userId,
      fromWalletId: from.id,
      toWalletId: to.id,
      amount: input.amount,
      date: toDate(input.date),
      note: input.note || null,
      idempotencyKey: input.idempotencyKey || null,
    },
  });
  await tx.transaction.createMany({ data: legs(userId, transfer, from, to, input.note) });
  await audit.record(tx, userId, "transfer.create", "Transfer", transfer.id, { from: from.id, to: to.id, amount: input.amount });
  return transfer;
}

async function findByKey(userId, key) {
  if (!key) return null;
  return prisma.transfer.findFirst({ where: { userId, idempotencyKey: key }, include: INCLUDE });
}

async function create(userId, input) {
  const existing = await findByKey(userId, input.idempotencyKey);
  if (existing) return { transfer: S.transfer(existing), replayed: true };
  try {
    const id = await prisma.$transaction(async (tx) => (await createInTx(tx, userId, input)).id);
    const t = await prisma.transfer.findUnique({ where: { id }, include: INCLUDE });
    return { transfer: S.transfer(t), replayed: false };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && input.idempotencyKey) {
      const winner = await findByKey(userId, input.idempotencyKey);
      if (winner) return { transfer: S.transfer(winner), replayed: true };
    }
    throw e;
  }
}

async function get(userId, id) {
  const t = await prisma.transfer.findFirst({ where: { id, userId }, include: INCLUDE });
  if (!t) throw notFound("Transfer tidak ditemukan.");
  return S.transfer(t);
}

/** Ubah transfer: dampak lama dibatalkan dan dampak baru diterapkan dalam satu transaksi. */
async function update(userId, id, input) {
  await prisma.$transaction(async (tx) => {
    const old = await tx.transfer.findFirst({ where: { id, userId } });
    if (!old) throw notFound("Transfer tidak ditemukan.");
    const next = {
      fromWalletId: input.fromWalletId || old.fromWalletId,
      toWalletId: input.toWalletId || old.toWalletId,
      amount: input.amount != null ? input.amount : Number(old.amount),
      date: input.date ? toDate(input.date) : old.date,
      note: input.note !== undefined ? input.note : old.note,
    };
    const { from, to } = await loadWallets(tx, userId, next.fromWalletId, next.toWalletId);
    await ledger.applyDeltas(tx, userId, [
      { walletId: old.fromWalletId, delta: Number(old.amount) },
      { walletId: old.toWalletId, delta: -Number(old.amount) },
      { walletId: from.id, delta: -next.amount },
      { walletId: to.id, delta: next.amount },
    ]);
    const transfer = await tx.transfer.update({
      where: { id },
      data: { fromWalletId: from.id, toWalletId: to.id, amount: next.amount, date: next.date, note: next.note || null },
    });
    await tx.transaction.deleteMany({ where: { transferId: id } });
    await tx.transaction.createMany({ data: legs(userId, transfer, from, to, next.note) });
    await audit.record(tx, userId, "transfer.update", "Transfer", id, { amount: next.amount });
  });
  return get(userId, id);
}

async function remove(userId, id) {
  await prisma.$transaction(async (tx) => {
    const t = await tx.transfer.findFirst({ where: { id, userId } });
    if (!t) throw notFound("Transfer tidak ditemukan.");
    await ledger.applyDeltas(tx, userId, [
      { walletId: t.fromWalletId, delta: Number(t.amount) },
      { walletId: t.toWalletId, delta: -Number(t.amount) },
    ]);
    // Setoran tabungan yang memakai transfer ini ikut dibatalkan.
    const entry = await tx.savingsEntry.findFirst({ where: { transferId: id } });
    if (entry) {
      await tx.savingsEntry.delete({ where: { id: entry.id } });
      await require("./savings").recalc(tx, entry.goalId);
    }
    await tx.transfer.delete({ where: { id } }); // kedua baris Transaction ikut terhapus (cascade)
    await audit.record(tx, userId, "transfer.delete", "Transfer", id, { amount: Number(t.amount) });
  });
  return { attachmentKey: null };
}

module.exports = { createInTx, create, get, update, remove };
