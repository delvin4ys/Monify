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
  var amountInput = document.getElementById("f-amount");

  function flagSvgHtml(ccy) {
    if (ccy === "USD") {
      return (
        '<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect x="0" y="0" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="1.230769" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="2.461538" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="3.692307" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="4.923076" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="6.153845" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="7.384614" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="8.615383" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="9.846152" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="11.076921" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="12.30769" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="13.538459" width="24" height="1.230769" fill="#FFFFFF"></rect><rect x="0" y="14.769228" width="24" height="1.230769" fill="#B22234"></rect><rect x="0" y="0" width="12" height="7.7" fill="#3C3B6E"></rect><circle cx="1.7" cy="1.6" r="0.35" fill="#FFFFFF"></circle><circle cx="4.2" cy="1.6" r="0.35" fill="#FFFFFF"></circle><circle cx="6.7" cy="1.6" r="0.35" fill="#FFFFFF"></circle><circle cx="9.2" cy="1.6" r="0.35" fill="#FFFFFF"></circle><circle cx="2.2" cy="3.2" r="0.35" fill="#FFFFFF"></circle><circle cx="4.7" cy="3.2" r="0.35" fill="#FFFFFF"></circle><circle cx="7.2" cy="3.2" r="0.35" fill="#FFFFFF"></circle><circle cx="9.7" cy="3.2" r="0.35" fill="#FFFFFF"></circle><circle cx="1.7" cy="4.8" r="0.35" fill="#FFFFFF"></circle><circle cx="4.2" cy="4.8" r="0.35" fill="#FFFFFF"></circle><circle cx="6.7" cy="4.8" r="0.35" fill="#FFFFFF"></circle><circle cx="9.2" cy="4.8" r="0.35" fill="#FFFFFF"></circle></svg>'
      );
    }
    return (
      '<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="8" fill="#D7263D"></rect><rect y="8" width="24" height="8" fill="#FFFFFF"></rect></svg>'
    );
  }

  function syncCcyUi() {
    var opt = menu.querySelector('[data-currency="' + currency + '"]');
    if (!opt) return;
    document.getElementById("ccy-flag").innerHTML = flagSvgHtml(currency);
    document.getElementById("ccy-label").textContent = opt.getAttribute("data-label") || "";
    document.getElementById("ccy-code").textContent = currency;
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
        return '<option value="' + w.id + '">' + w.name + '</option>';
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

  function syncRelatedPartyUi() {
    document.getElementById("related-party-extra").style.display = kind !== "debt" ? "block" : "none";
  }

  var loadedTitle = tx.title || "";
  if (tx.counterparty) {
    var debtSuffix = (tx.debtSubtype === "REPAYMENT") ? " ke " : " dari ";
    if (loadedTitle.endsWith(debtSuffix + tx.counterparty)) {
      loadedTitle = loadedTitle.slice(0, loadedTitle.length - (debtSuffix + tx.counterparty).length);
    }
  } else if (tx.relatedParty && loadedTitle.endsWith(" dengan " + tx.relatedParty)) {
    loadedTitle = loadedTitle.slice(0, loadedTitle.length - (" dengan " + tx.relatedParty).length);
  }
  document.getElementById("f-title").value = loadedTitle;
  document.getElementById("f-date").value = tx.date || "";
  document.getElementById("f-counterparty").value = tx.counterparty || "";
  document.getElementById("f-related").value = tx.relatedParty || "";

  if (currency === "USD") {
    amountInput.value = (tx.amount / 100).toFixed(2);
  } else {
    amountInput.value = String(tx.amount);
  }
  formatAmountInput();

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
  amountInput.oninput = formatAmountInput;

  setKindTabs();
  fillWallets();
  fillCats();
  syncDebtUi();
  syncRelatedPartyUi();

  document.getElementById("tx-kind-tabs").onclick = function (e) {
    var btn = e.target.closest("[data-kind]");
    if (!btn) return;
    kind = btn.getAttribute("data-kind");
    setKindTabs();
    fillCats();
    syncDebtUi();
    syncRelatedPartyUi();
  };

  document.getElementById("f-save").onclick = async function () {
    var errEl = document.getElementById("form-err");
    errEl.style.display = "none";

    var walletId = document.getElementById("f-wallet").value;
    var catId = document.getElementById("f-cat").value;
    var title = document.getElementById("f-title").value.trim();
    var date = document.getElementById("f-date").value;
    var raw = amountInput.value.trim();
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
      await MonifyApi.fetchJson("/api/transactions/" + encodeURIComponent(txId), {
        method: "PATCH",
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
