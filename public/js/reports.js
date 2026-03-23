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
        return;
      }

      document.getElementById("rep-kpi-main").style.display = "grid";
      document.getElementById("rep-exp").innerHTML = isUsd ? formatUSDHtml(block.expenseTotal) : formatIDRHtml(block.expenseTotal);
      document.getElementById("rep-inc").innerHTML = isUsd ? formatUSDHtml(block.incomeTotal) : formatIDRHtml(block.incomeTotal);
      document.getElementById("rep-net").innerHTML = isUsd ? formatUSDHtml(block.net) : formatIDRHtml(block.net);

      renderCatList(document.getElementById("rep-exp-cat"), block.expenseByCategory, block.expenseTotal, isUsd);
      renderCatList(document.getElementById("rep-inc-cat"), block.incomeByCategory, block.incomeTotal, isUsd);
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
  var max = Math.max.apply(
    null,
    data.map(function (d) {
      return d.amount;
    })
  );
  if (max < 1) max = 1;
  var chartH = 180;
  var chartEl = document.getElementById("chart-bars");
  chartEl.innerHTML = "";
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

  await loadReport();
});
