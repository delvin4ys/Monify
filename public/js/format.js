(function () {
  window.formatIDR = function (n) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  };

  /** Untuk innerHTML: nominal Rupiah dengan penekanan saldo (font-weight 600). */
  window.formatIDRHtml = function (n) {
    return '<span class="amount-money amount-money--idr">' + formatIDR(n) + "</span>";
  };

  window.fmtPct = function (n) {
    return (n >= 0 ? "+" : "") + n;
  };

  /** amount dalam sen USD */
  window.formatUSD = function (cents) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  };

  window.formatUSDHtml = function (cents) {
    return '<span class="amount-money amount-money--usd">' + formatUSD(cents) + "</span>";
  };

  /** Memformat tanggal sesuai resolusi poin 9: IDR=DD/MM/YYYY, USD=MM/DD/YYYY */
  window.formatDate = function (dateObj, currency) {
    if (!dateObj) return "";
    var d = new Date(dateObj);
    if (isNaN(d.getTime())) return "";
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yyyy = d.getFullYear();
    
    if (currency === "USD") {
      return mm + "/" + dd + "/" + yyyy;
    }
    return dd + "/" + mm + "/" + yyyy;
  };
})();
