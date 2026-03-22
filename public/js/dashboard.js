document.addEventListener("DOMContentLoaded", async function () {
  try {
    var me = await MonifyAuth.requireAuth();
    var ccy = (me.user && me.user.displayCurrency) || "IDR";

    MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "dashboard");
    MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "dashboard");

    document.getElementById("welcome-name").textContent =
      (me.user && me.user.name ? me.user.name : "Pengguna").split(" ")[0];

    document.getElementById("kpi-balance-label").textContent =
      "Saldo gabungan (" + ccy + ")";
    document.getElementById("kpi-savings-note").textContent =
      "pemasukan − pengeluaran (" + ccy + ")";

    function fmtTx(t) {
      if (t.currency === "USD") {
        return formatUSDHtml(t.amount);
      }
      return formatIDRHtml(t.amount);
    }

    function fmtCatRow(c, total) {
      var pct = total > 0 ? Math.round((c.amount / total) * 100) : 0;
      var icon = c.icon ? c.icon + " " : "";
      var amt = formatIDRHtml(c.amount);
      return (
        '<div class="report-cat-row"><div class="flex-between text-sm"><span>' +
        icon +
        c.name +
        '</span><span>' +
        amt +
        " (" +
        pct +
        '%)</span></div><div class="report-cat-bar"><div style="width:' +
        pct +
        '%"></div></div></div>'
      );
    }

    async function loadDashboard() {
      var summary = await MonifyApi.fetchJson("/api/summary?currency=" + encodeURIComponent(ccy));
      var balHtml =
        ccy === "USD" ? formatUSDHtml(summary.balance) : formatIDRHtml(summary.balance);
      document.getElementById("kpi-balance").innerHTML = balHtml;
      document.getElementById("kpi-balance-delta").textContent = fmtPct(summary.balanceDeltaPct) + "%";
      document.getElementById("kpi-expense").innerHTML =
        ccy === "USD" ? formatUSDHtml(summary.expensesMonth) : formatIDRHtml(summary.expensesMonth);
      document.getElementById("kpi-expense-delta").textContent = fmtPct(summary.expensesDeltaPct) + "%";
      document.getElementById("kpi-savings").innerHTML =
        ccy === "USD" ? formatUSDHtml(summary.savingsMonth) : formatIDRHtml(summary.savingsMonth);
      document.getElementById("kpi-savings-delta").textContent = fmtPct(summary.savingsDeltaPct) + "%";

      var inc = await MonifyApi.fetchJson("/api/monthly-income?currency=" + encodeURIComponent(ccy));
      var data = inc.data || [];
      var max = Math.max.apply(
        null,
        data.map(function (d) {
          return d.amount;
        })
      );
      if (max < 1) max = 1;
      var chartEl = document.getElementById("chart-bars");
      chartEl.innerHTML = "";
      var chartH = 180;
      data.forEach(function (d, i) {
        var col = document.createElement("div");
        col.className = "chart-bars__col";
        var bar = document.createElement("div");
        bar.className = "chart-bars__bar" + (i === data.length - 1 ? " is-hi" : "");
        bar.style.height = Math.max(4, (d.amount / max) * chartH) + "px";
        var lab = document.createElement("span");
        lab.className = "chart-bars__label";
        lab.textContent = d.month;
        col.appendChild(bar);
        col.appendChild(lab);
        chartEl.appendChild(col);
      });

      var wallets = await MonifyApi.fetchJson("/api/wallets");
      var wg = document.getElementById("wallet-grid");
      wg.innerHTML = (wallets.wallets || [])
        .map(function (w) {
          var bal = w.currency === "IDR" ? formatIDRHtml(w.balance) : formatUSDHtml(w.balance);
          var logo = w.logo ? '<span style="font-size:1.25rem">' + w.logo + "</span> " : "";
          return (
            '<div class="wallet-tile"><div class="flex-between"><span>' +
            logo +
            w.flag +
            '</span><span class="text-sm">' +
            (w.active ? "Aktif" : "Off") +
            '</span></div><div class="text-muted mt-1">' +
            w.name +
            " · " +
            w.currency +
            "</div><div><strong>" +
            bal +
            "</strong></div></div>"
          );
        })
        .join("");

      var today = new Date();
      var monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      var fromStr = monthStart.toISOString().slice(0, 10);
      var toStr = today.toISOString().slice(0, 10);
      try {
        var rep = await MonifyApi.fetchJson(
          "/api/reports?from=" + encodeURIComponent(fromStr) + "&to=" + encodeURIComponent(toStr)
        );
        var idr = rep.currencies && rep.currencies.IDR;
        var topEl = document.getElementById("dash-top-exp");
        if (ccy === "USD") {
          topEl.innerHTML =
            '<p class="text-muted text-sm">Top kategori untuk USD tersedia di halaman Laporan (filter rentang).</p>';
        } else if (!idr || !idr.expenseByCategory || !idr.expenseByCategory.length) {
          topEl.innerHTML = '<p class="text-muted text-sm">Belum ada pengeluaran terklasifikasi bulan ini.</p>';
        } else {
          var top = idr.expenseByCategory.slice(0, 5);
          var expTotal = idr.expenseTotal;
          topEl.innerHTML = top
            .map(function (c) {
              return fmtCatRow(c, expTotal);
            })
            .join("");
        }
      } catch (e) {
        document.getElementById("dash-top-exp").innerHTML =
          '<p class="text-muted text-sm">Tidak dapat memuat ringkasan kategori.</p>';
      }

      var tx = await MonifyApi.fetchJson("/api/transactions?period=thisMonth");
      var rows = (tx.transactions || []).slice(0, 6);
      document.getElementById("recent-tx").innerHTML = rows
        .map(function (t) {
          var sign = t.direction === "in" ? "+" : "−";
          return (
            "<tr><td>" +
            (t.title || "") +
            '<br><span class="text-muted text-sm">' +
            (t.categoryName || "—") +
            "</span></td><td>" +
            t.date +
            '</td><td style="text-align:right" class="amount-money-cell">' +
            sign +
            fmtTx(t) +
            '</td><td><span class="badge ' +
            (t.status === "success" ? "badge--ok" : "badge--pending") +
            '">' +
            (t.status === "success" ? "Berhasil" : "Pending") +
            "</span></td></tr>"
          );
        })
        .join("");
    }

    await loadDashboard();
  } catch (e) {
    console.error(e);
  }
});
