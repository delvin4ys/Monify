document.addEventListener("DOMContentLoaded", async function () {
  try {
    var me = await MonifyAuth.requireAuth();
    var ccy = (me.user && me.user.displayCurrency) || "IDR";

    MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "dashboard");
    MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "dashboard");

    var kpiBalanceEl = document.getElementById("kpi-balance");
    var kpiEyeBtn = document.getElementById("kpi-balance-eye");
    var kpiEyeShowIcon = document.getElementById("kpi-balance-eye-show");
    var kpiEyeHideIcon = document.getElementById("kpi-balance-eye-hide");

    var balanceHidden = false;

    function maskBalanceHtml() {
      return (
        '<span class="amount-money kpi-balance-masked ' +
        (ccy === "USD" ? "amount-money--usd" : "amount-money--idr") +
        '">••••••</span>'
      );
    }

    function syncBalanceVisibility() {
      if (!kpiBalanceEl) return;

      if (balanceHidden) {
        kpiBalanceEl.innerHTML = maskBalanceHtml();
        if (kpiEyeBtn) {
          kpiEyeBtn.setAttribute("aria-pressed", "true");
          kpiEyeBtn.setAttribute("aria-label", "Tampilkan saldo");
        }
        if (kpiEyeShowIcon) kpiEyeShowIcon.style.display = "none";
        if (kpiEyeHideIcon) kpiEyeHideIcon.style.display = "";
      } else {
        var raw = kpiBalanceEl.dataset.rawValue;
        kpiBalanceEl.innerHTML = raw ? raw : "—";
        if (kpiEyeBtn) {
          kpiEyeBtn.setAttribute("aria-pressed", "false");
          kpiEyeBtn.setAttribute("aria-label", "Sembunyikan saldo");
        }
        if (kpiEyeShowIcon) kpiEyeShowIcon.style.display = "";
        if (kpiEyeHideIcon) kpiEyeHideIcon.style.display = "none";
      }
    }

    if (kpiEyeBtn) {
      kpiEyeBtn.addEventListener("click", function () {
        balanceHidden = !balanceHidden;
        syncBalanceVisibility();
      });
    }

    var walletEyeBtn = document.getElementById("kpi-wallet-eye");
    var walletEyeShowIcon = document.getElementById("kpi-wallet-eye-show");
    var walletEyeHideIcon = document.getElementById("kpi-wallet-eye-hide");
    var walletHidden = false;

    function syncWalletVisibility() {
      var els = document.querySelectorAll(".wallet-tile-bal");
      els.forEach(function (el) {
        if (walletHidden) {
          el.innerHTML = "••••••";
        } else {
          el.innerHTML = el.getAttribute("data-val");
        }
      });
      if (walletEyeBtn) {
        walletEyeBtn.setAttribute("aria-pressed", walletHidden ? "true" : "false");
        walletEyeBtn.setAttribute("aria-label", walletHidden ? "Tampilkan saldo dompet" : "Sembunyikan saldo dompet");
      }
      if (walletEyeShowIcon) walletEyeShowIcon.style.display = walletHidden ? "none" : "";
      if (walletEyeHideIcon) walletEyeHideIcon.style.display = walletHidden ? "" : "none";
    }

    if (walletEyeBtn) {
      walletEyeBtn.addEventListener("click", function () {
        walletHidden = !walletHidden;
        syncWalletVisibility();
      });
    }

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
      kpiBalanceEl = document.getElementById("kpi-balance");
      if (kpiBalanceEl) {
        kpiBalanceEl.dataset.rawValue = balHtml;
      }
      syncBalanceVisibility();
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
      var chartTipEl = document.createElement("div");
      chartTipEl.className = "chart-bars__tip";
      chartTipEl.setAttribute("role", "tooltip");
      chartTipEl.setAttribute("aria-hidden", "true");
      chartEl.appendChild(chartTipEl);

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

        bar.tabIndex = 0; // Allow keyboard focus to show tooltip.

        var fmt = ccy === "USD" ? formatUSDHtml(d.amount) : formatIDRHtml(d.amount);

        function showTip() {
          chartTipEl.innerHTML =
            '<div class="chart-bars__tip-month">' +
            (d.month || "") +
            "</div><div class=\"chart-bars__tip-value\">" +
            fmt +
            "</div>";

          var chartRect = chartEl.getBoundingClientRect();
          var barRect = bar.getBoundingClientRect();
          var x = barRect.left - chartRect.left + barRect.width / 2;
          var y = barRect.top - chartRect.top;

          chartTipEl.style.left = x + "px";
          chartTipEl.style.top = y + "px";
          chartTipEl.classList.add("is-open");
          chartTipEl.setAttribute("aria-hidden", "false");
        }

        function hideTip() {
          chartTipEl.classList.remove("is-open");
          chartTipEl.setAttribute("aria-hidden", "true");
        }

        bar.addEventListener("mouseenter", showTip);
        bar.addEventListener("mouseleave", hideTip);
        bar.addEventListener("focus", showTip);
        bar.addEventListener("blur", hideTip);

        col.appendChild(bar);
        col.appendChild(lab);
        chartEl.appendChild(col);
      });

      var wallets = await MonifyApi.fetchJson("/api/wallets");
      var wList = wallets.wallets || [];
      var wg = document.getElementById("wallet-grid");
      var eyeBtn = document.getElementById("kpi-wallet-eye");
      if (wList.length === 0) {
        if (eyeBtn) eyeBtn.style.display = "none";
        wg.style.display = "none";
        var emptyEl = document.getElementById("wallet-empty-state");
        if (!emptyEl) {
          emptyEl = document.createElement("div");
          emptyEl.id = "wallet-empty-state";
          emptyEl.style.cssText = "text-align: center; padding: 2.5rem 0;";
          emptyEl.innerHTML = '<div class="text-muted" style="font-size: 0.85rem; margin: 1.2rem 0;">Tambahkan dompetmu untuk memulai transaksi</div><a href="/wallets" class="btn btn--primary" style="display: inline-block; color: #fff;">+ Dompet</a>';
          wg.parentNode.appendChild(emptyEl);
        }
        emptyEl.style.display = "block";
      } else {
        if (eyeBtn) eyeBtn.style.display = "flex";
        wg.style.display = "";
        var emptyEl = document.getElementById("wallet-empty-state");
        if (emptyEl) emptyEl.style.display = "none";
        wg.innerHTML = wList
          .map(function (w, i) {
            var bal = w.currency === "IDR" ? formatIDRHtml(w.balance) : formatUSDHtml(w.balance);
            var bg = 'var(--card)';
            var logoHtml = "";
            if (w.logo && (w.logo.startsWith("/") || w.logo.startsWith("http"))) {
              logoHtml = '<img src="' + w.logo + '" style="max-width:24px; max-height:24px; object-fit:contain;" />';
            } else if (w.logo) {
              logoHtml = '<span style="font-size:1.25rem; line-height:1;">' + w.logo + '</span>';
            } else {
              logoHtml = '<span style="font-size:1.25rem; line-height:1; opacity:0.5;">—</span>';
            }
            return (
              '<div class="card wallet-tile" style="background:' + bg + '; border: 1px solid var(--border); padding: 1.25rem; display: flex; flex-direction: column; min-height: 140px; box-shadow: var(--shadow);">' +
                '<div style="background: var(--bg); border: 1px solid var(--border); width: 42px; height: 42px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: auto;">' + logoHtml + '</div>' +
                '<div style="margin-top: 1.25rem;">' +
                  '<div style="font-weight: 600; font-size: 0.95rem; color: var(--text);">' + w.name + '</div>' +
                  '<div style="font-size: 0.85rem; color: var(--muted); margin-top: 0.25rem;"><strong><span class="wallet-tile-bal" data-val=\'' + bal + '\'>' +
                  (walletHidden ? "••••••" : bal) +
                  "</span></strong></div>" +
                '</div>' +
              '</div>'
            );
          })
          .join("");
        syncWalletVisibility();
      }

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
          var icon = t.categoryIcon || "🏷️";
          return (
            '<div style="display:flex;align-items:center;padding:0.5rem 1.25rem;border-bottom:1px solid var(--border);gap:0.75rem">' +
            '<div style="width:34px;height:34px;border-radius:50%;background:#ecfdf5;border:1px solid rgba(6,95,70,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1rem">' + icon + '</div>' +
            '<div style="min-width:0;flex:1">' +
            '<div style="font-weight:600;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (t.title || "") + '</div>' +
            '<div class="text-muted" style="font-size:0.75rem">' + (t.categoryName || "—") + ' · ' + formatDate(t.date, ccy) + '</div>' +
            '</div>' +
            '<div style="text-align:right;flex-shrink:0">' +
            '<div class="amount-money-cell" style="font-size:0.85rem">' + sign + fmtTx(t) + '</div>' +
            '<span class="badge ' + (t.status === "success" ? "badge--ok" : "badge--pending") + '" style="font-size:0.65rem">' +
            (t.status === "success" ? "Berhasil" : "Pending") + '</span>' +
            '</div></div>'
          );
        })
        .join("");
    }

    await loadDashboard();
  } catch (e) {
    console.error(e);
  }
});
