document.addEventListener("DOMContentLoaded", async function () {
  var me = await MonifyAuth.requireAuth();
  var ccy = (me.user && me.user.displayCurrency) || "IDR";

  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "reports");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "reports");

  var isUsd = ccy === "USD";
  document.getElementById("rep-ccy-label").textContent = isUsd ? "USD" : "IDR";

  function fmtCatRow(c, total, isUsdRow) {
    var pct = total > 0 ? Math.round((c.amount / total) * 100) : 0;
    var amt = isUsdRow ? formatUSDHtml(c.amount) : formatIDRHtml(c.amount);
    var icon = c.icon ? c.icon + " " : "";
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

  function renderCatList(el, list, total, isUsdRow) {
    if (!list || !list.length) {
      el.innerHTML = '<p class="text-muted text-sm">Tidak ada data.</p>';
      return;
    }
    el.innerHTML = list.map(function (c) {
      return fmtCatRow(c, total, isUsdRow);
    }).join("");
  }

  async function loadReport() {
    var err = document.getElementById("rep-err");
    err.style.display = "none";
    var from = document.getElementById("rep-from").value;
    var to = document.getElementById("rep-to").value;
    try {
      var data = await MonifyApi.fetchJson("/api/reports?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to));
      document.getElementById("rep-count").textContent =
        (data.transactionCount || 0) + " transaksi dalam rentang ini";

      var cur = data.currencies || {};
      var block = isUsd ? cur.USD : cur.IDR;

      if (!block) {
        document.getElementById("rep-kpi-main").style.display = "none";
        document.getElementById("rep-exp-cat").innerHTML =
          '<p class="text-muted text-sm">Tidak ada data ' + (isUsd ? "USD" : "IDR") + " dalam rentang ini.</p>";
        document.getElementById("rep-inc-cat").innerHTML =
          '<p class="text-muted text-sm">Tidak ada data ' + (isUsd ? "USD" : "IDR") + " dalam rentang ini.</p>";
        document.getElementById("rep-debt-cat").innerHTML =
          '<p class="text-muted text-sm">Tidak ada data ' + (isUsd ? "USD" : "IDR") + " dalam rentang ini.</p>";
        return;
      }

      document.getElementById("rep-kpi-main").style.display = "grid";
      document.getElementById("rep-exp").innerHTML = isUsd ? formatUSDHtml(block.expenseTotal) : formatIDRHtml(block.expenseTotal);
      document.getElementById("rep-inc").innerHTML = isUsd ? formatUSDHtml(block.incomeTotal) : formatIDRHtml(block.incomeTotal);
      document.getElementById("rep-debt").innerHTML = isUsd ? formatUSDHtml(block.debtTotal) : formatIDRHtml(block.debtTotal);
      document.getElementById("rep-net").innerHTML = isUsd ? formatUSDHtml(block.net) : formatIDRHtml(block.net);

      renderCatList(document.getElementById("rep-exp-cat"), block.expenseByCategory, block.expenseTotal, isUsd);
      renderCatList(document.getElementById("rep-inc-cat"), block.incomeByCategory, block.incomeTotal, isUsd);
      renderCatList(document.getElementById("rep-debt-cat"), block.debtByCategory, block.debtTotal, isUsd);
    } catch (e) {
      err.textContent = e.message || "Gagal memuat laporan.";
      err.style.display = "block";
    }
  }

  var today = new Date();
  document.getElementById("rep-from").value = today.toISOString().slice(0, 10);
  document.getElementById("rep-to").value = today.toISOString().slice(0, 10);
  document.getElementById("rep-load").onclick = loadReport;

  var inc = await MonifyApi.fetchJson("/api/monthly-income?currency=" + encodeURIComponent(ccy));
  var data = inc.data || [];
  var max = 1;
  var totInc = 0;
  var totExp = 0;
  var maxExpVal = 0;
  var maxExpMo = "—";
  data.forEach(function(d) {
    if (d.amount > max) max = d.amount;
    if (d.expense > max) max = d.expense;
    totInc += d.amount || 0;
    totExp += d.expense || 0;
    if ((d.expense || 0) > maxExpVal) {
      maxExpVal = d.expense || 0;
      maxExpMo = d.month;
    }
  });

  var avgInc = totInc / 12;
  var avgExp = totExp / 12;
  document.getElementById("chart-avg-inc").innerHTML = isUsd ? formatUSDHtml(avgInc) : formatIDRHtml(avgInc);
  document.getElementById("chart-avg-exp").innerHTML = isUsd ? formatUSDHtml(avgExp) : formatIDRHtml(avgExp);
  
  document.getElementById("chart-max-exp").innerHTML = isUsd ? formatUSDHtml(maxExpVal) : formatIDRHtml(maxExpVal);
  document.getElementById("chart-max-exp-mo").textContent = "pada bulan " + maxExpMo;

  var chartH = 180;
  var chartEl = document.getElementById("chart-bars");
  chartEl.innerHTML = "";
  
  var tipEl = document.createElement("div");
  tipEl.className = "chart-bars__tip";
  chartEl.appendChild(tipEl);

  function showTip(d, colEl) {
    var rect = colEl.getBoundingClientRect();
    var cref = chartEl.getBoundingClientRect();
    var left = rect.left - cref.left + rect.width / 2;
    var top = rect.top - cref.top;
    
    var tot = d.amount + d.expense;
    var pctInc = tot > 0 ? Math.round((d.amount / tot) * 100) : 0;
    var pctExp = tot > 0 ? Math.round((d.expense / tot) * 100) : 0;
    
    var incHTML = isUsd ? formatUSDHtml(d.amount) : formatIDRHtml(d.amount);
    var expHTML = isUsd ? formatUSDHtml(d.expense) : formatIDRHtml(d.expense);

    tipEl.innerHTML = 
      '<div class="chart-bars__tip-month">' + d.month + '</div>' +
      '<div style="display:flex; gap:16px; align-items:flex-end;">' +
        '<div style="text-align:center;">' +
          '<div style="color:#a7f3d0; font-size:0.7rem; margin-bottom:2px;">Pemasukan (' + pctInc + '%)</div>' +
          '<div>' + incHTML + '</div>' +
        '</div>' +
        '<div style="text-align:center;">' +
          '<div style="color:#fecaca; font-size:0.7rem; margin-bottom:2px;">Pengeluaran (' + pctExp + '%)</div>' +
          '<div>' + expHTML + '</div>' +
        '</div>' +
      '</div>';
      
    tipEl.style.left = left + "px";
    tipEl.style.top = (top - 10) + "px";
    tipEl.classList.add("is-open");
  }

  function hideTip() {
    tipEl.classList.remove("is-open");
  }

  data.forEach(function (d, i) {
    var isHi = i === data.length - 1 ? " is-hi" : "";
    var col = document.createElement("div");
    col.className = "chart-bars__col" + isHi;
    
    var wrap = document.createElement("div");
    wrap.className = "chart-bars__wrap";
    
    var expBar = document.createElement("div");
    expBar.className = "chart-bars__bar chart-bars__bar--exp";
    expBar.style.height = Math.max(4, (d.expense / max) * chartH) + "px";
    
    var incBar = document.createElement("div");
    incBar.className = "chart-bars__bar chart-bars__bar--inc";
    incBar.style.height = Math.max(4, (d.amount / max) * chartH) + "px";

    wrap.appendChild(expBar);
    wrap.appendChild(incBar);
    
    var lab = document.createElement("span");
    lab.className = "chart-bars__label";
    lab.textContent = d.month;
    
    col.appendChild(wrap);
    col.appendChild(lab);
    
    col.onmouseenter = function() { showTip(d, col); };
    col.onmouseleave = hideTip;
    
    chartEl.appendChild(col);
  });

  await loadReport();
});
