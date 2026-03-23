function walletToJson(w) {
  return {
    id: w.id,
    name: w.name,
    currency: w.currency,
    balance: w.balance,
    active: w.active,
    flag: w.flag,
    logo: w.logo || null,
  };
}

function categoryParentToJson(p) {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    sortOrder: p.sortOrder,
    isSystem: p.userId == null,
  };
}

function categoryToJson(c) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    icon: c.icon,
    parentId: c.parentId || null,
    debtSubtype: c.debtSubtype || null,
    parentName: c.parent ? c.parent.name : null,
  };
}

function transactionToJson(t) {
  return {
    id: t.id,
    title: t.title,
    categoryId: t.categoryId,
    walletId: t.walletId,
    amount: t.amount,
    type: t.type,
    date: t.date.toISOString().slice(0, 10),
    status: t.status,
    currency: t.currency || "IDR",
    counterparty: t.counterparty || null,
    relatedParty: t.relatedParty || null,
    imageUrl: t.imageUrl || null,
    parentTransactionId: t.parentTransactionId || null,
    remainingAmount: t.remainingAmount != null ? t.remainingAmount : null,
    paidOff: !!t.paidOff,
  };
}

module.exports = { walletToJson, categoryToJson, transactionToJson, categoryParentToJson };
