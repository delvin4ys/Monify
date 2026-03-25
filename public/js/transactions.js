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

  /** Chip berurutan sesuai request Point 10 */
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
        items.unshift({ key: cursor, label: ymLabel(cursor) });
    }

    items.push({ key: "lastMonth", label: "Bulan lalu" });
    items.push({ key: "thisMonth", label: "Bulan ini" });
    items.push({ key: "future", label: "Bulan di masa depan" });

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
      
      // Auto target position so active chip is visible nicely 
      // but without forcing extreme scroll unless needed
      var activeEl = el.querySelector(".is-active");
      if (activeEl) {
         el.scrollLeft = activeEl.offsetLeft - el.clientWidth / 2 + activeEl.clientWidth / 2;
      }
      
      load();
    };

    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      if (e.deltaY < 0) {
        el.scrollLeft -= 50; 
      } else {
        el.scrollLeft += 50;
      }
    });

    enableDragScroll(el);
    setTimeout(function() {
      var activeEl = el.querySelector(".is-active");
      if (activeEl) {
         el.scrollLeft = activeEl.offsetLeft - el.clientWidth / 2 + activeEl.clientWidth / 2;
      } else {
         scrollMonthStripToEnd();
      }
    }, 50);
  }

  function fetchMonthsAndPaint(thenLoad) {
    paintChips();
    if (thenLoad) load();
  }

  function renderBalances() {
    // Legacy UI element removed per iteration 2 user feedback.
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

  function formatSignedTotal(amount, ccy) {
    var sign = amount >= 0 ? "+" : "−";
    var val = Math.abs(amount);
    if (ccy === "USD") {
      return sign + formatUSDHtml(val);
    }
    return sign + formatIDRHtml(val);
  }

  function renderWalletLogoHtml(logo) {
    if (!logo) return '<span class="tx-meta-icon tx-meta-icon--wallet tx-wallet-logo-emoji tx-wallet-logo-emoji--empty">—</span>';
    if (typeof logo === "string" && (logo.startsWith("/") || logo.startsWith("http"))) {
      return '<span class="tx-meta-icon tx-meta-icon--wallet"><img src="' + logo + '" alt="" class="tx-wallet-logo-img" /></span>';
    }
    return '<span class="tx-meta-icon tx-meta-icon--wallet tx-wallet-logo-emoji">' + logo + "</span>";
  }

  function renderWalletLogoInner(logo) {
    if (!logo) return "—";
    if (typeof logo === "string" && (logo.startsWith("/") || logo.startsWith("http"))) {
      return '<img src="' + logo + '" alt="" class="tx-wallet-logo-img" />';
    }
    return logo;
  }

  function renderCategoryIconInner(icon) {
    return icon || "—";
  }

  function renderAttachIconHtml(hasImage) {
    if (!hasImage) return "";
    return (
      '<span class="tx-attach-ind tx-meta-icon" title="Ada lampiran gambar" aria-label="Ada lampiran gambar">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />' +
      "</svg>" +
      "</span>"
    );
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
          '<tr><td colspan="7" class="text-muted">Belum ada transaksi untuk filter ini.</td></tr>';
        return;
      }
      body.innerHTML = groups
        .map(function (g) {
          var sumByCcy = {};
          g.items.forEach(function (t) {
            if (!sumByCcy[t.currency]) sumByCcy[t.currency] = 0;
            sumByCcy[t.currency] += t.direction === "in" ? t.amount : -t.amount;
          });
          var keys = Object.keys(sumByCcy);
          var totalBadge = "";
          if (keys.length === 1) {
            var only = keys[0];
            var total = sumByCcy[only];
            totalBadge =
              '<span class="tx-date-total ' +
              (total >= 0 ? "is-up" : "is-down") +
              '">' +
              formatSignedTotal(total, only) +
              "</span>";
          } else if (keys.length > 1) {
            totalBadge = '<span class="tx-date-total is-mix">Campuran mata uang</span>';
          }

          var rows = g.items
            .map(function (t) {
              var sign = t.direction === "in" ? "+" : "−";
              var typeLabel =
                t.type === "income"
                  ? "Pemasukan"
                  : t.type === "debt"
                    ? "Hutang/Pinjaman"
                    : "Pengeluaran";
              var catIcon = t.categoryIcon || "🏷️";
              var attachIconHtml = renderAttachIconHtml(!!t.imageUrl);
              var typeIcon = "🧾";
              if (t.type === "income") typeIcon = "💰";
              if (t.type === "debt") typeIcon = "🏦";

              // Remaining balance for DEBT/LOAN
              var remainingHtml = "";
              var isDebtOrLoan = t.debtSubtype === "DEBT" || t.debtSubtype === "LOAN";
              if (isDebtOrLoan && t.remainingAmount != null) {
                if (t.paidOff) {
                  remainingHtml = '<div class="tx-activity-row"><span class="tx-remaining tx-remaining--done">Lunas ✓</span></div>';
                } else {
                  var remFmt = t.currency === "USD" ? formatUSDHtml(t.remainingAmount) : formatIDRHtml(t.remainingAmount);
                  remainingHtml = '<div class="tx-activity-row"><span class="tx-remaining">' + remFmt + ' left</span></div>';
                }
              }

              // Update button for DEBT/LOAN that are not paid off
              var updateBtnHtml = "";
              if (isDebtOrLoan && !t.paidOff) {
                updateBtnHtml =
                  '<button type="button" class="tx-pay-btn tx-icon-btn tx-icon-btn--update" data-id="' + t.id +
                  '" data-remaining="' + (t.remainingAmount != null ? t.remainingAmount : t.amount) +
                  '" data-currency="' + t.currency +
                  '" data-subtype="' + (t.debtSubtype || '') +
                  '" data-wallet="' + t.walletId +
                  '" data-counterparty="' + (t.counterparty || '') +
                  '" title="Update pembayaran" aria-label="Update pembayaran">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>' +
                  '</button>';
              }

              var rowClass = t.paidOff ? ' class="tx-row--paid-off"' : '';

              return (
                "<tr" + rowClass + ">" +
                "<td>" +
                '<div class="tx-activity">' +
                '<div class="tx-activity-icons">' +
                '<div class="tx-iconbox tx-iconbox--cat" title="Kategori">' +
                renderCategoryIconInner(catIcon) +
                "</div>" +
                '<div class="tx-iconbox tx-iconbox--wallet" title="Dompet">' +
                renderWalletLogoInner(t.walletLogo) +
                "</div>" +
                "</div>" +
                '<div class="tx-activity-body">' +
                '<div class="tx-activity-row tx-activity-row--note">' +
                '<span class="tx-activity-note">' +
                (t.title || "") +
                "</span>" +
                "</div>" +
                (attachIconHtml
                  ? '<div class="tx-activity-row tx-activity-row--attach">' +
                    attachIconHtml +
                    "</div>"
                  : "") +
                remainingHtml +
                "</div>" +
                "</div>" +
                "</td>" +
                '<td class="tx-kategori-col">' +
                '<div class="tx-kategori-name">' +
                (t.categoryName || "—") +
                "</div>" +
                '<div class="tx-kategori-type">' +
                typeLabel +
                "</div>" +
                "</td>" +
                '<td class="tx-wallet-col">' +
                (t.walletName || "—") +
                "</td>" +
                "<td>" +
                formatDate(t.date, displayCurrency) +
                "</td>" +
                '<td style="text-align:right" class="amount-money-cell">' +
                sign +
                formatTxAmount(t) +
                "</td>" +
                '<td><span class="badge ' +
                (t.status === "success" ? "badge--ok" : "badge--pending") +
                '">' +
                (t.status === "success" ? "Berhasil" : "Pending") +
                "</span></td>" +
                '<td class="tx-actions"><div class="tx-actions-inner">' +
                updateBtnHtml +
                '<a href="/transactions/edit?id=' +
                t.id +
                '" class="tx-icon-btn tx-icon-btn--edit" title="Edit transaksi" aria-label="Edit transaksi">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>' +
                "</a>" +
                '<button type="button" class="tx-del tx-icon-btn tx-icon-btn--delete" data-id="' +
                t.id +
                '" title="Hapus transaksi" aria-label="Hapus transaksi">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>' +
                "</button></div></td></tr>"
              );
            })
            .join("");
          return (
            '<tr class="tx-date-row"><td colspan="7"><div class="tx-date-head"><strong>' +
            formatDate(g.date, displayCurrency) +
            "</strong>" +
            totalBadge +
            "</div></td></tr>" +
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

  // ——— Payment modal ———
  var payOverlay = document.getElementById("payment-overlay");
  var payAmountEl = document.getElementById("pay-amount");
  var payDateEl = document.getElementById("pay-date");
  var payWalletEl = document.getElementById("pay-wallet");
  var payTxIdEl = document.getElementById("pay-tx-id");
  var payErrEl = document.getElementById("pay-err");
  var payHintEl = document.getElementById("pay-remaining-hint");
  var payModalTitle = document.getElementById("pay-modal-title");

  function openPayModal(btn) {
    var txId = btn.getAttribute("data-id");
    var remaining = Number(btn.getAttribute("data-remaining"));
    var ccy = btn.getAttribute("data-currency") || "IDR";
    var subtype = btn.getAttribute("data-subtype");
    var walletId = btn.getAttribute("data-wallet");
    var counterparty = btn.getAttribute("data-counterparty");

    payTxIdEl.value = txId;
    payAmountEl.value = "";
    payDateEl.value = new Date().toISOString().slice(0, 10);
    payErrEl.style.display = "none";

    var title = subtype === "DEBT"
      ? "Bayar Hutang" + (counterparty ? " ke " + counterparty : "")
      : "Terima Pembayaran" + (counterparty ? " dari " + counterparty : "");
    payModalTitle.textContent = title;

    var remFmt = ccy === "USD"
      ? "$" + (remaining / 100).toFixed(2)
      : "Rp " + new Intl.NumberFormat("id-ID").format(remaining);
    payHintEl.textContent = "Sisa: " + remFmt;
    payAmountEl.setAttribute("data-currency", ccy);
    payAmountEl.setAttribute("data-max", remaining);
    payAmountEl.placeholder = ccy === "USD" ? "$ 0.00" : "Rp 0";
    payAmountEl.inputMode = ccy === "USD" ? "decimal" : "numeric";

    // Fill wallet dropdown
    var pool = wallets.filter(function (w) { return w.active && w.currency === ccy; });
    payWalletEl.innerHTML = pool.map(function (w) {
      return '<option value="' + w.id + '">' + w.name + '</option>';
    }).join("");
    payWalletEl.value = walletId;

    payOverlay.classList.add("is-open");
  }

  function closePayModal() {
    payOverlay.classList.remove("is-open");
  }

  // Open payment modal on update button click
  document.getElementById("tx-table-wrap").addEventListener("click", function (e) {
    var btn = e.target.closest(".tx-pay-btn");
    if (!btn) return;
    openPayModal(btn);
  });

  document.getElementById("pay-cancel").onclick = closePayModal;
  payOverlay.addEventListener("click", function (e) {
    if (e.target === payOverlay) closePayModal();
  });

  // Format payment amount input
  payAmountEl.oninput = function () {
    var ccy = payAmountEl.getAttribute("data-currency") || "IDR";
    var raw = payAmountEl.value || "";
    if (!raw) return;
    if (ccy === "IDR") {
      var digits = raw.replace(/\D/g, "");
      payAmountEl.value = digits
        ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(digits))
        : "";
    }
  };

  document.getElementById("pay-save").onclick = async function () {
    payErrEl.style.display = "none";
    var txId = payTxIdEl.value;
    var ccy = payAmountEl.getAttribute("data-currency") || "IDR";
    var maxAmount = Number(payAmountEl.getAttribute("data-max"));
    var rawVal = payAmountEl.value.trim();
    var date = payDateEl.value;
    var walletId = payWalletEl.value;

    var amount = 0;
    if (ccy === "IDR") {
      amount = Number(String(rawVal).replace(/\D/g, ""));
    } else {
      var n = parseFloat(String(rawVal).replace(/,/g, ""));
      amount = Number.isFinite(n) ? Math.round(n * 100) : 0;
    }

    if (!amount || amount <= 0) {
      payErrEl.textContent = "Masukkan jumlah pembayaran.";
      payErrEl.style.display = "block";
      return;
    }
    if (amount > maxAmount) {
      payErrEl.textContent = "Jumlah melebihi sisa.";
      payErrEl.style.display = "block";
      return;
    }
    if (!date) {
      payErrEl.textContent = "Pilih tanggal pembayaran.";
      payErrEl.style.display = "block";
      return;
    }

    try {
      await MonifyApi.fetchJson("/api/transactions/" + txId + "/payment", {
        method: "POST",
        body: JSON.stringify({ amount: amount, date: date, walletId: walletId }),
      });
      closePayModal();
      // Refresh wallets + transaction list
      var res = await MonifyApi.fetchJson("/api/wallets");
      wallets = res.wallets || [];
      renderBalances();
      load();
    } catch (e) {
      payErrEl.textContent = e.message || "Gagal membayar.";
      payErrEl.style.display = "block";
    }
  };
});
