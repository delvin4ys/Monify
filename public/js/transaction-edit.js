document.addEventListener("DOMContentLoaded", async function () {
  var params = new URLSearchParams(window.location.search);
  var txId = params.get("id");
  if (!txId) {
    window.location.href = "/transactions";
    return;
  }

  await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "transactions");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "transactions");

  var kind = "expense";
  var currency = "IDR";
  var wallets = [];
  var categories = [];
  var existingImageUrl = null;

  var resW = await MonifyApi.fetchJson("/api/wallets");
  var resC = await MonifyApi.fetchJson("/api/categories");
  wallets = resW.wallets || [];
  categories = resC.categories || [];

  var txRes = await MonifyApi.fetchJson("/api/transactions/" + encodeURIComponent(txId));
  var tx = txRes.transaction;
  if (!tx) {
    window.location.href = "/transactions";
    return;
  }

  kind = tx.categoryType || "expense";
  currency = tx.currency === "USD" ? "USD" : "IDR";
  existingImageUrl = tx.imageUrl || null;

  var menu = document.getElementById("ccy-menu");
  var ccyBtn = document.getElementById("ccy-btn");

  function syncCcyUi() {
    var opt = menu.querySelector('[data-currency="' + currency + '"]');
    if (!opt) return;
    document.getElementById("ccy-flag").textContent = opt.getAttribute("data-flag") || "";
    document.getElementById("ccy-label").textContent = opt.getAttribute("data-label") || "";
    document.getElementById("ccy-code").textContent = currency;
  }

  function closeCcyMenu() {
    menu.setAttribute("hidden", "");
    ccyBtn.setAttribute("aria-expanded", "false");
  }

  function toggleCcyMenu() {
    var open = menu.hasAttribute("hidden");
    if (open) {
      menu.removeAttribute("hidden");
      ccyBtn.setAttribute("aria-expanded", "true");
    } else {
      closeCcyMenu();
    }
  }

  ccyBtn.onclick = function (e) {
    e.stopPropagation();
    toggleCcyMenu();
  };

  menu.onclick = function (e) {
    var btn = e.target.closest("[data-currency]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    currency = btn.getAttribute("data-currency");
    syncCcyUi();
    closeCcyMenu();
    fillWallets();
  };

  document.addEventListener("click", function (e) {
    if (e.target.closest("#ccy-root")) return;
    closeCcyMenu();
  });

  syncCcyUi();

  document.getElementById("f-status").value = tx.status === "pending" ? "pending" : "success";

  function setKindTabs() {
    document.querySelectorAll("#tx-kind-tabs .btn").forEach(function (b) {
      b.className = "btn btn--outline";
    });
    var active = document.querySelector('#tx-kind-tabs [data-kind="' + kind + '"]');
    if (active) active.className = "btn btn--primary";
  }

  function filterCats() {
    return categories.filter(function (c) {
      return c.type === kind;
    });
  }

  function fillWallets() {
    var sel = document.getElementById("f-wallet");
    var pool = wallets.filter(function (w) {
      return w.currency === currency && w.active;
    });
    sel.innerHTML = pool
      .map(function (w) {
        return '<option value="' + w.id + '">' + w.name + " (" + w.currency + ")</option>";
      })
      .join("");
    sel.value = tx.walletId;
    var ok = pool.some(function (w) {
      return w.id === tx.walletId;
    });
    if (!ok && pool.length) sel.value = pool[0].id;
  }

  function fillCats() {
    var sel = document.getElementById("f-cat");
    var pool = filterCats();
    sel.innerHTML = pool
      .map(function (c) {
        var sub = c.parentName ? " · " + c.parentName : "";
        return '<option value="' + c.id + '">' + c.name + sub + "</option>";
      })
      .join("");
    sel.value = tx.categoryId;
  }

  function syncDebtUi() {
    document.getElementById("debt-extra").style.display = kind === "debt" ? "block" : "none";
  }

  document.getElementById("f-title").value = tx.title || "";
  document.getElementById("f-date").value = tx.date || "";
  document.getElementById("f-counterparty").value = tx.counterparty || "";
  document.getElementById("f-related").value = tx.relatedParty || "";

  if (currency === "USD") {
    document.getElementById("f-amount").value = (tx.amount / 100).toFixed(2);
  } else {
    document.getElementById("f-amount").value = String(tx.amount);
  }

  var prev = document.getElementById("img-preview");
  if (existingImageUrl) {
    prev.innerHTML =
      '<img src="' + existingImageUrl + '" alt="" style="max-width:100%;max-height:140px;border-radius:8px" />';
  } else {
    prev.innerHTML = "";
  }

  document.getElementById("f-file-trigger").onclick = function () {
    document.getElementById("f-file").click();
  };

  document.getElementById("f-file").onchange = function () {
    var f = document.getElementById("f-file").files && document.getElementById("f-file").files[0];
    document.getElementById("f-file-name").textContent = f ? f.name : "";
  };

  setKindTabs();
  fillWallets();
  fillCats();
  syncDebtUi();

  document.getElementById("tx-kind-tabs").onclick = function (e) {
    var btn = e.target.closest("[data-kind]");
    if (!btn) return;
    kind = btn.getAttribute("data-kind");
    setKindTabs();
    fillCats();
    syncDebtUi();
  };

  document.getElementById("f-save").onclick = async function () {
    var errEl = document.getElementById("form-err");
    errEl.style.display = "none";

    var walletId = document.getElementById("f-wallet").value;
    var catId = document.getElementById("f-cat").value;
    var title = document.getElementById("f-title").value.trim();
    var date = document.getElementById("f-date").value;
    var raw = document.getElementById("f-amount").value.trim();
    var counterparty = document.getElementById("f-counterparty").value.trim();
    var relatedParty = document.getElementById("f-related").value.trim();
    var status = document.getElementById("f-status").value === "pending" ? "pending" : "success";

    var amount = 0;
    if (currency === "IDR") {
      amount = Number(String(raw).replace(/\D/g, ""));
    } else {
      var n = parseFloat(String(raw).replace(/,/g, "."));
      amount = Number.isFinite(n) ? Math.round(n * 100) : 0;
    }

    if (!walletId || !catId || !title || !date || !amount || amount <= 0) {
      errEl.textContent = "Lengkapi dompet, kategori, judul, tanggal, dan jumlah.";
      errEl.style.display = "block";
      return;
    }

    if (kind === "debt" && !counterparty) {
      errEl.textContent = "Isi pihak (peminjam / pemberi pinjaman).";
      errEl.style.display = "block";
      return;
    }

    var imageUrl = existingImageUrl;
    var fileEl = document.getElementById("f-file");
    if (fileEl.files && fileEl.files[0]) {
      var fd = new FormData();
      fd.append("file", fileEl.files[0]);
      var up = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
      if (!up.ok) {
        var ue = await up.json().catch(function () {
          return {};
        });
        errEl.textContent = ue.error || "Upload gagal.";
        errEl.style.display = "block";
        return;
      }
      var ud = await up.json();
      imageUrl = ud.url;
    }

    try {
      await MonifyApi.fetchJson("/api/transactions/" + encodeURIComponent(txId), {
        method: "PATCH",
        body: JSON.stringify({
          title: title,
          amount: amount,
          categoryId: catId,
          walletId: walletId,
          currency: currency,
          date: date,
          counterparty: kind === "debt" ? counterparty : null,
          relatedParty: relatedParty || null,
          imageUrl: imageUrl,
          status: status,
        }),
      });
      window.location.href = "/transactions";
    } catch (e) {
      errEl.textContent = e.message || "Gagal menyimpan.";
      errEl.style.display = "block";
    }
  };
});
