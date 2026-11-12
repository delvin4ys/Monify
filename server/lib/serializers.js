/**
 * Bentuk JSON yang dikirim ke klien. BigInt dari database diubah menjadi Number
 * di sini (nominal dibatasi validate.MAX_AMOUNT sehingga selalu aman).
 */
const { toDay } = require("./dates");

const num = (v) => (v == null ? null : Number(v));

function user(u, extra = {}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name || "",
    displayCurrency: u.displayCurrency === "USD" ? "USD" : "IDR",
    dateFormat: u.dateFormat || "DMY",
    numberFormat: u.numberFormat || "id-ID",
    theme: u.theme || "system",
    defaultWalletId: u.defaultWalletId || null,
    aiConsent: Boolean(u.aiConsentAt),
    createdAt: u.createdAt,
    ...extra,
  };
}

function wallet(w) {
  return {
    id: w.id,
    name: w.name,
    type: w.type || "bank",
    currency: w.currency,
    balance: num(w.balance),
    initialBalance: num(w.initialBalance),
    active: w.active,
    logo: w.logo || null,
    color: w.color || null,
  };
}

function categoryParent(p) {
  return { id: p.id, name: p.name, kind: p.kind, sortOrder: p.sortOrder, isSystem: p.userId == null };
}

function category(c) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    icon: c.icon,
    color: c.color || null,
    archived: Boolean(c.archived),
    parentId: c.parentId || null,
  };
}

/** @param t Transaction dengan include { category, wallet } bila tersedia */
function transaction(t) {
  return {
    id: t.id,
    kind: t.kind,
    direction: t.direction,
    amount: num(t.amount),
    title: t.title,
    date: toDay(t.date),
    status: t.status,
    currency: t.currency || "IDR",
    walletId: t.walletId,
    walletName: t.wallet ? t.wallet.name : undefined,
    walletLogo: t.wallet ? t.wallet.logo || null : undefined,
    walletColor: t.wallet ? t.wallet.color || null : undefined,
    categoryId: t.categoryId || null,
    categoryName: t.category ? t.category.name : null,
    categoryIcon: t.category ? t.category.icon : null,
    categoryColor: t.category ? t.category.color || null : null,
    counterparty: t.counterparty || null,
    relatedParty: t.relatedParty || null,
    hasAttachment: Boolean(t.attachmentKey || t.imageUrl),
    legacyImageUrl: t.attachmentKey ? null : t.imageUrl || null,
    source: t.source || "manual",
    transferId: t.transferId || null,
    debtId: t.debtId || null,
    createdAt: t.createdAt,
  };
}

function transfer(t) {
  return {
    id: t.id,
    fromWalletId: t.fromWalletId,
    toWalletId: t.toWalletId,
    fromWalletName: t.fromWallet ? t.fromWallet.name : undefined,
    toWalletName: t.toWallet ? t.toWallet.name : undefined,
    amount: num(t.amount),
    date: toDay(t.date),
    note: t.note || null,
  };
}

function debtPayment(p) {
  return {
    id: p.id,
    amount: num(p.amount),
    date: toDay(p.date),
    note: p.note || null,
    transactionId: p.transactionId || null,
    walletId: p.transaction ? p.transaction.walletId : null,
    walletName: p.transaction && p.transaction.wallet ? p.transaction.wallet.name : null,
  };
}

function debt(d) {
  const principal = num(d.principal);
  const outstanding = num(d.outstanding);
  return {
    id: d.id,
    type: d.type,
    personName: d.personName,
    principal,
    outstanding,
    paid: principal - outstanding,
    progress: principal > 0 ? Math.round(((principal - outstanding) / principal) * 1000) / 10 : 0,
    date: toDay(d.date),
    dueDate: toDay(d.dueDate),
    description: d.description || null,
    status: d.status,
    walletId: d.walletId || null,
    walletName: d.wallet ? d.wallet.name : null,
    payments: d.payments ? d.payments.map(debtPayment) : undefined,
  };
}

function savingsEntry(e) {
  return {
    id: e.id,
    amount: num(e.amount),
    date: toDay(e.date),
    note: e.note || null,
    movedMoney: Boolean(e.transferId),
  };
}

module.exports = { num, user, wallet, categoryParent, category, transaction, transfer, debt, debtPayment, savingsEntry };
