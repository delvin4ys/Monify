document.addEventListener("DOMContentLoaded", async function () {
  var me = await MonifyAuth.requireAuth();
  var displayCurrency = (me.user && me.user.displayCurrency) || "IDR";

  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "transactions");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "transactions");

  var period = "thisMonth";
  var searchTimer = null;
  var wallets = [];

  function formatTxAmount(t) {
    if (t.currency === "USD") {
      return formatUSDHtml(t.amount);
    }
    return formatIDRHtml(t.amount);
  }

  function ymLabel(ym) {
    var y = ym.slice(0, 4);
    var m = ym.slice(5, 7);
    return m + "/" + y;
  }

  function addMonths(ymStr, delta) {
    var p = ymStr.split("-").map(Number);
    var y = p[0];
    var m = p[1];
    m += delta;
    while (m > 12) {
      m -= 12;
      y++;
    }
    while (m < 1) {
      m += 12;
      y--;
    }
    return y + "-" + String(m).padStart(2, "0");
  }

  /** Chip berurutan: 24 bulan sebelum bulan lalu → Bulan lalu → Bulan ini → 12 bulan ke depan */
  function buildChipList() {
    var now = new Date();
    var y = now.getFullYear();
    var mo = now.getMonth() + 1;
    var thisKey = y + "-" + String(mo).padStart(2, "0");
    var last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var lastKey = last.getFullYear() + "-" + String(last.getMonth() + 1).padStart(2, "0");

    var items = [];
    var cursor = lastKey;
    for (var i = 0; i < 24; i++) {
      cursor = addMonths(cursor, -1);
      items.push({ key: cursor, label: ymLabel(cursor) });
    }
    items.reverse();

    items.push({ key: "lastMonth", label: "Bulan lalu (" + ymLabel(lastKey) + ")" });
    items.push({ key: "thisMonth", label: "Bulan ini (" + ymLabel(thisKey) + ")" });

    for (var j = 1; j <= 12; j++) {
      var fk = addMonths(thisKey, j);
      items.push({ key: fk, label: ymLabel(fk) });
    }

    return items;
  }

  function scrollMonthStripToEnd() {
    var el = document.getElementById("month-strip");
    if (!el) return;
    requestAnimationFrame(function () {
      el.scrollLeft = el.scrollWidth - el.clientWidth;
    });
  }

  function enableDragScroll(el) {
    if (!el || el._dragBound) return;
    el._dragBound = true;
    var down = false;
    var startX = 0;
    var scrollLeftStart = 0;
    el.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      down = true;
      startX = e.pageX;
      scrollLeftStart = el.scrollLeft;
      el.style.cursor = "grabbing";
    });
    document.addEventListener("mouseup", function () {
      down = false;
      el.style.cursor = "";
    });
    el.addEventListener("mouseleave", function () {
      down = false;
      el.style.cursor = "";
    });
    el.addEventListener("mousemove", function (e) {
      if (!down) return;
      e.preventDefault();
      el.scrollLeft = scrollLeftStart - (e.pageX - startX);
    });
  }

  function paintChips() {
    var items = buildChipList();
    var el = document.getElementById("month-strip");
    el.innerHTML = items
      .map(function (it) {
        var active = it.key === period ? " is-active" : "";
        return (
          '<button type="button" class="month-chip' +
          active +
          '" data-period="' +
          it.key +
          '">' +
          it.label +
          "</button>"
        );
      })
      .join("");
    el.onclick = function (e) {
      var b = e.target.closest("[data-period]");
      if (!b) return;
      period = b.getAttribute("data-period");
      paintChips();
      scrollMonthStripToEnd();
      load();
    };
    enableDragScroll(el);
    scrollMonthStripToEnd();
  }

  function fetchMonthsAndPaint(thenLoad) {
    paintChips();
    if (thenLoad) load();
  }

  function renderBalances() {
    var totalPreferred = 0;
    wallets.forEach(function (w) {
      if (w.currency === displayCurrency) totalPreferred += w.balance;
    });
    document.getElementById("balance-row").innerHTML =
      '<div class="balance-pill balance-pill--total"><span>Total (' +
      displayCurrency +
      ")</span><strong>" +
      (displayCurrency === "USD" ? formatUSDHtml(totalPreferred) : formatIDRHtml(totalPreferred)) +
      '</strong></div><a href="/wallets/assets" class="balance-pill balance-pill--link">Rincian aset per dompet →</a>';
  }

  function groupByDate(list) {
    var map = {};
    list.forEach(function (t) {
      var d = t.date;
      if (!map[d]) map[d] = [];
      map[d].push(t);
    });
    return Object.keys(map)
      .sort(function (a, b) {
        return b.localeCompare(a);
      })
      .map(function (d) {
        return { date: d, items: map[d] };
      });
  }

  function load() {
    var q = (document.getElementById("search").value || "").trim();
    var qs =
      "/api/transactions?period=" +
      encodeURIComponent(period) +
      (q ? "&q=" + encodeURIComponent(q) : "");
    return MonifyApi.fetchJson(qs).then(function (res) {
      var list = res.transactions || [];
      var groups = groupByDate(list);
      var body = document.getElementById("tx-body");
      if (!groups.length) {
        body.innerHTML =
          '<tr><td colspan="5" class="text-muted">Belum ada transaksi untuk filter ini.</td></tr>';
        return;
      }
      body.innerHTML = groups
        .map(function (g) {
          var rows = g.items
            .map(function (t) {
              var sign = t.direction === "in" ? "+" : "−";
              var typeLabel =
                t.type === "income"
                  ? "Pemasukan"
                  : t.type === "debt"
                    ? "Hutang/Pinjaman"
                    : "Pengeluaran";
              var extra = "";
              if (t.counterparty) {
                extra += '<div class="text-muted text-sm">Pihak: ' + t.counterparty + "</div>";
              }
              if (t.relatedParty) {
                extra += '<div class="text-muted text-sm">Terkait: ' + t.relatedParty + "</div>";
              }
              if (t.imageUrl) {
                extra +=
                  '<div class="mt-1"><img src="' +
                  t.imageUrl +
                  '" alt="" class="tx-thumb" /></div>';
              }
              return (
                "<tr><td>" +
                (t.title || "") +
                '<br><span class="text-muted text-sm">' +
                (t.categoryName || "—") +
                " · " +
                typeLabel +
                (t.walletName ? " · " + t.walletName : "") +
                "</span>" +
                extra +
                "</td><td>" +
                t.date +
                '</td><td style="text-align:right" class="amount-money-cell">' +
                sign +
                formatTxAmount(t) +
                '</td><td><span class="badge ' +
                (t.status === "success" ? "badge--ok" : "badge--pending") +
                '">' +
                (t.status === "success" ? "Berhasil" : "Pending") +
                '</span></td><td class="tx-actions">' +
                '<a href="/transactions/edit?id=' +
                t.id +
                '" class="text-sm">Edit</a>' +
                ' <span class="text-muted">·</span> ' +
                '<button type="button" class="tx-del text-sm" data-id="' +
                t.id +
                '">Hapus</button></td></tr>'
              );
            })
            .join("");
          return (
            '<tr class="tx-date-row"><td colspan="5"><strong>' +
            g.date +
            "</strong></td></tr>" +
            rows
          );
        })
        .join("");
    });
  }

  document.getElementById("search").oninput = function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      load();
    }, 320);
  };

  MonifyApi.fetchJson("/api/wallets").then(function (res) {
    wallets = res.wallets || [];
    renderBalances();
  });

  fetchMonthsAndPaint(true);

  document.getElementById("tx-table-wrap").addEventListener("click", function (e) {
    var btn = e.target.closest(".tx-del");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    if (!id || !window.confirm("Hapus transaksi ini? Tindakan tidak dapat dibatalkan.")) return;
    MonifyApi.fetchJson("/api/transactions/" + id, { method: "DELETE" })
      .then(function () {
        return MonifyApi.fetchJson("/api/wallets");
      })
      .then(function (res) {
        wallets = res.wallets || [];
        renderBalances();
        fetchMonthsAndPaint(false);
        return load();
      })
      .catch(function (err) {
        window.alert(err.message || "Gagal menghapus.");
      });
  });
});
