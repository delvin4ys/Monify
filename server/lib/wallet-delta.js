/**
 * Dampak ke saldo dompet (integer positif = uang masuk).
 * amount selalu positif (nilai absolut transaksi).
 */
function getWalletDelta(category, amount) {
  if (!category || !Number.isFinite(amount) || amount <= 0) return 0;
  const t = category.type;
  if (t === "expense") return -amount;
  if (t === "income") return amount;
  if (t === "debt") {
    const ds = category.debtSubtype || "DEBT";
    switch (ds) {
      case "DEBT":
        return amount;           // User meminjam uang → uang masuk
      case "LOAN":
        return -amount;          // User meminjamkan uang → uang keluar
      case "REPAYMENT":
        return -amount;          // User bayar hutang → uang keluar
      case "DEBT_COLLECTION":
        return amount;           // Pihak peminjam bayar balik → uang masuk
      default:
        return -amount;
    }
  }
  return 0;
}

/** Apakah transaksi dihitung sebagai "pengeluaran" untuk budget (kategori pengeluaran). */
function countsAsBudgetSpend(category) {
  if (!category) return false;
  if (category.type === "expense") return true;
  if (category.type === "debt") {
    const ds = category.debtSubtype || "DEBT";
    return ds === "REPAYMENT" || ds === "DEBT";
  }
  return false;
}

/** Tampilan tanda di UI: + inflow, − outflow */
function isOutflow(category) {
  return getWalletDelta(category, 1) < 0;
}

module.exports = { getWalletDelta, countsAsBudgetSpend, isOutflow };
