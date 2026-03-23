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
  var amountInput = document.getElementById("f-amount");
  var walletSelect = document.getElementById("f-wallet");
  var catPill = document.getElementById("cat-pill");
  var catPillIcon = document.getElementById("cat-pill-icon");

  function flagSvgHtml(ccy) {
    if (ccy === "USD") {
      return '<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect x="0" y="0" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="1.230769" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="2.461538" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="3.692307" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="4.923076" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="6.153845" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="7.384614" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="8.615383" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="9.846152" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="11.076921" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="12.30769" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="13.538459" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="14.769228" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="0" width="12" height="7.7" fill="#3C3B6E"></rect><circle cx="1.7" cy="1.6" r="0.35" fill="#FFFFFF"></circle><circle cx="4.2" cy="1.6" r="0.35" fill="#FFFFFF"></circle><circle cx="6.7" cy="1.6" r="0.35" fill="#FFFFFF"></circle><circle cx="9.2" cy="1.6" r="0.35" fill="#FFFFFF"></circle><circle cx="2.2" cy="3.2" r="0.35" fill="#FFFFFF"></circle><circle cx="4.7" cy="3.2" r="0.35" fill="#FFFFFF"></circle><circle cx="7.2" cy="3.2" r="0.35" fill="#FFFFFF"></circle><circle cx="9.7" cy="3.2" r="0.35" fill="#FFFFFF"></circle><circle cx="1.7" cy="4.8" r="0.35" fill="#FFFFFF"></circle><circle cx="4.2" cy="4.8" r="0.35" fill="#FFFFFF"></circle><circle cx="6.7" cy="4.8" r="0.35" fill="#FFFFFF"></circle><circle cx="9.2" cy="4.8" r="0.35" fill="#FFFFFF"></circle></svg>';
    }
    return '<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="8" fill="#D7263D"></rect><rect y="8" width="24" height="8" fill="#FFFFFF"></rect></svg>';
  }

  function syncWalletCurrencyPill() {
    var selected = wallets.find(function (w) {
      return w.id === walletSelect.value;
    });
    currency = selected && selected.currency === "USD" ? "USD" : "IDR";
    document.getElementById("wallet-ccy-flag").innerHTML = flagSvgHtml(currency);
    document.getElementById("wallet-ccy-code").textContent = currency;
    amountInput.placeholder = currency === "USD" ? "$ 0.00" : "Rp 0";
    amountInput.inputMode = currency === "USD" ? "decimal" : "numeric";
    formatAmountInput();
  }

  function formatAmountInput() {
    var raw = amountInput.value || "";
    if (!raw) return;
    if (currency === "IDR") {
      var digits = raw.replace(/\D/g, "");
      amountInput.value = digits
        ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(digits))
        : "";
      return;
    }
    var clean = raw.replace(/[^\d.]/g, "");
    var firstDot = clean.indexOf(".");
    var intRaw = "";
    var decRaw = "";
    if (firstDot === -1) {
      intRaw = clean.replace(/\D/g, "");
    } else {
      intRaw = clean.slice(0, firstDot).replace(/\D/g, "");
      decRaw = clean
        .slice(firstDot + 1)
        .replace(/\D/g, "")
        .slice(0, 2);
    }
    var intFmt = intRaw
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(intRaw))
      : "";
    amountInput.value = decRaw ? intFmt + "." + decRaw : intFmt;
  }

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
      var catObj = categories.find(function (c) {
        return c.id === selectedCatId;
      });
      catPillIcon.textContent = (catObj && catObj.icon) || "🏷️";
      catPill.classList.remove("is-empty");
    } catch (e) {}
  }

  function filterCats() {
    return categories.filter(function (c) {
      return c.type === kind;
    });
  }

  function fillWallets() {
    var pool = wallets.filter(function (w) {
      return w.active;
    });
    walletSelect.innerHTML = pool
      .map(function (w) {
        return '<option value="' + w.id + '">' + w.name + " (" + w.currency + ")</option>";
      })
      .join("");
    if (!pool.length) {
      walletSelect.innerHTML = '<option value="">— Tidak ada dompet aktif —</option>';
      return;
    }
    var bca = pool.find(function (w) {
      return /bca/i.test(w.name);
    });
    walletSelect.value = (bca || pool[0]).id;
    syncWalletCurrencyPill();
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
      catPillIcon.textContent = "🏷️";
      catPill.classList.add("is-empty");
    }
  }

  function syncDebtUi() {
    document.getElementById("debt-extra").style.display = kind === "debt" ? "block" : "none";
  }

  function syncRelatedPartyUi() {
    document.getElementById("related-party-extra").style.display = kind !== "debt" ? "block" : "none";
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
    syncRelatedPartyUi();
  };

  document.getElementById("f-file-trigger").onclick = function () {
    document.getElementById("f-file").click();
  };

  document.getElementById("f-file").onchange = function () {
    var f = document.getElementById("f-file").files && document.getElementById("f-file").files[0];
    document.getElementById("f-file-name").textContent = f ? f.name : "";
  };

  walletSelect.onchange = function () {
    syncWalletCurrencyPill();
    syncCategoryLink();
  };
  amountInput.oninput = formatAmountInput;

  fillWallets();
  syncCategoryLink();
  syncDebtUi();
  syncRelatedPartyUi();
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
      var n = parseFloat(String(raw).replace(/,/g, ""));
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

    var finalTitle = title;
    if (kind === "debt" && counterparty) {
      var selectedCat = categories.find(function (c) { return c.id === catId; });
      var ds = selectedCat && selectedCat.debtSubtype;
      var suffix = (ds === "REPAYMENT") ? " ke " : " dari ";
      finalTitle = title + suffix + counterparty;
    } else if (kind !== "debt" && relatedParty) {
      finalTitle = title + " dengan " + relatedParty;
    }

    try {
      await MonifyApi.fetchJson("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          title: finalTitle,
          amount: amount,
          categoryId: catId,
          walletId: walletId,
          currency: currency,
          date: date,
          counterparty: kind === "debt" ? counterparty : null,
          relatedParty: kind !== "debt" ? (relatedParty || null) : null,
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
