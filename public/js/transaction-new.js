document.addEventListener("DOMContentLoaded", async function () {
  await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "transactions");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "transactions");

  var kind = "expense";
  var currency = "IDR";
  var wallets = [];
  var categories = [];
  var selectedCatId = "";
  var selectedCatName = "";

  var resW = await MonifyApi.fetchJson("/api/wallets");
  var resC = await MonifyApi.fetchJson("/api/categories");
  wallets = resW.wallets || [];
  categories = resC.categories || [];

  document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);

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
    syncCategoryLink();
  };

  document.addEventListener("click", function (e) {
    if (e.target.closest("#ccy-root")) return;
    closeCcyMenu();
  });

  syncCcyUi();

  function categoryPickUrl() {
    return (
      "/transactions/category?kind=" +
      encodeURIComponent(kind) +
      "&currency=" +
      encodeURIComponent(currency) +
      "&return=" +
      encodeURIComponent("/transactions/new")
    );
  }

  function syncCategoryLink() {
    document.getElementById("cat-pick-link").href = categoryPickUrl();
  }

  function applyStoredCategory() {
    try {
      var raw = sessionStorage.getItem("monifyTxCategory");
      if (!raw) return;
      var o = JSON.parse(raw);
      sessionStorage.removeItem("monifyTxCategory");
      if (!o || !o.id) return;
      if (o.type && o.type !== kind) return;
      selectedCatId = o.id;
      selectedCatName = o.name || "—";
      document.getElementById("f-cat").value = selectedCatId;
      document.getElementById("cat-label").textContent = selectedCatName;
      document.getElementById("cat-label").classList.remove("text-muted");
    } catch (e) {}
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
    if (!pool.length) {
      sel.innerHTML = '<option value="">— Tidak ada dompet untuk mata uang ini —</option>';
      return;
    }
    var bca = pool.find(function (w) {
      return /bca/i.test(w.name);
    });
    sel.value = (bca || pool[0]).id;
  }

  function clearCategoryIfInvalid() {
    var pool = filterCats();
    var ok = pool.some(function (c) {
      return c.id === selectedCatId;
    });
    if (!ok) {
      selectedCatId = "";
      selectedCatName = "";
      document.getElementById("f-cat").value = "";
      document.getElementById("cat-label").textContent = "Belum dipilih";
      document.getElementById("cat-label").classList.add("text-muted");
    }
  }

  function syncDebtUi() {
    document.getElementById("debt-extra").style.display = kind === "debt" ? "block" : "none";
  }

  document.getElementById("tx-kind-tabs").onclick = function (e) {
    var btn = e.target.closest("[data-kind]");
    if (!btn) return;
    kind = btn.getAttribute("data-kind");
    document.querySelectorAll("#tx-kind-tabs .btn").forEach(function (b) {
      b.className = "btn btn--outline";
    });
    btn.className = "btn btn--primary";
    clearCategoryIfInvalid();
    syncCategoryLink();
    syncDebtUi();
  };

  document.getElementById("f-file-trigger").onclick = function () {
    document.getElementById("f-file").click();
  };

  document.getElementById("f-file").onchange = function () {
    var f = document.getElementById("f-file").files && document.getElementById("f-file").files[0];
    document.getElementById("f-file-name").textContent = f ? f.name : "";
  };

  fillWallets();
  syncCategoryLink();
  syncDebtUi();
  applyStoredCategory();

  document.getElementById("f-save").onclick = async function () {
    var errEl = document.getElementById("form-err");
    errEl.style.display = "none";

    var walletId = document.getElementById("f-wallet").value;
    var catId = document.getElementById("f-cat").value || selectedCatId;
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

    var imageUrl = null;
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
      await MonifyApi.fetchJson("/api/transactions", {
        method: "POST",
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
