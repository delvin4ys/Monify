document.addEventListener("DOMContentLoaded", async function () {
  await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "wallets");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "wallets");

  var currency = document.getElementById("w-currency") ? document.getElementById("w-currency").value : "IDR";
  var menu = document.getElementById("w-ccy-menu");
  var ccyBtn = document.getElementById("w-ccy-btn");
  var balInput = document.getElementById("w-balance");

  function flagSvgHtml(ccy) {
    if (ccy === "USD") {
      return (
        '<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" width="24" height="16" role="img" aria-label="Amerika Serikat">' +
        '<rect x="0" y="0" width="24" height="1.230769" fill="#B22234"></rect>' +
        '<rect x="0" y="1.230769" width="24" height="1.230769" fill="#FFFFFF"></rect>' +
        '<rect x="0" y="2.461538" width="24" height="1.230769" fill="#B22234"></rect>' +
        '<rect x="0" y="3.692307" width="24" height="1.230769" fill="#FFFFFF"></rect>' +
        '<rect x="0" y="4.923076" width="24" height="1.230769" fill="#B22234"></rect>' +
        '<rect x="0" y="6.153845" width="24" height="1.230769" fill="#FFFFFF"></rect>' +
        '<rect x="0" y="7.384614" width="24" height="1.230769" fill="#B22234"></rect>' +
        '<rect x="0" y="8.615383" width="24" height="1.230769" fill="#FFFFFF"></rect>' +
        '<rect x="0" y="9.846152" width="24" height="1.230769" fill="#B22234"></rect>' +
        '<rect x="0" y="11.076921" width="24" height="1.230769" fill="#FFFFFF"></rect>' +
        '<rect x="0" y="12.30769" width="24" height="1.230769" fill="#B22234"></rect>' +
        '<rect x="0" y="13.538459" width="24" height="1.230769" fill="#FFFFFF"></rect>' +
        '<rect x="0" y="14.769228" width="24" height="1.230769" fill="#B22234"></rect>' +
        '<rect x="0" y="0" width="12" height="7.7" fill="#3C3B6E"></rect>' +
        '<circle cx="1.7" cy="1.6" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="4.2" cy="1.6" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="6.7" cy="1.6" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="9.2" cy="1.6" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="2.2" cy="3.2" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="4.7" cy="3.2" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="7.2" cy="3.2" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="9.7" cy="3.2" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="1.7" cy="4.8" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="4.2" cy="4.8" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="6.7" cy="4.8" r="0.35" fill="#FFFFFF"></circle>' +
        '<circle cx="9.2" cy="4.8" r="0.35" fill="#FFFFFF"></circle>' +
        "</svg>"
      );
    }

    return (
      '<svg viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg" width="24" height="16" role="img" aria-label="Indonesia">' +
      '<rect width="24" height="8" fill="#D7263D"></rect>' +
      '<rect y="8" width="24" height="8" fill="#FFFFFF"></rect>' +
      "</svg>"
    );
  }

  function syncCcyUi() {
    if (!menu) return;
    var opt = menu.querySelector('[data-currency="' + currency + '"]');
    if (!opt) return;
    var flagEl = document.getElementById("w-ccy-flag");
    if (flagEl) flagEl.innerHTML = flagSvgHtml(currency);
    document.getElementById("w-ccy-label").textContent = opt.getAttribute("data-label") || "";
    var hidden = document.getElementById("w-currency");
    if (hidden) hidden.value = currency;
  }

  function formatIntGroups(value, locale) {
    if (!value) return "";
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(value));
  }

  function formatBalanceInput() {
    if (!balInput) return;
    var raw = balInput.value || "";

    if (currency === "IDR") {
      var digits = raw.replace(/\D/g, "");
      balInput.value = digits ? formatIntGroups(digits, "id-ID") : "";
      return;
    }

    // USD: allow optional decimal (max 2), thousands separated by comma.
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
    var intFmt = intRaw ? formatIntGroups(intRaw, "en-US") : "";
    balInput.value = decRaw ? intFmt + "." + decRaw : intFmt;
  }

  function parseBalanceForSubmit(activeCurrency) {
    if (!balInput) return 0;
    var raw = (balInput.value || "").trim();
    if (!raw) return 0;
    if (activeCurrency === "IDR") {
      return Number(raw.replace(/\D/g, ""));
    }
    var normalized = raw.replace(/,/g, "");
    var n = parseFloat(normalized);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function syncBalanceInputUi() {
    if (!balInput) return;
    balInput.placeholder = currency === "USD" ? "$ 0.00" : "Rp 0";
    balInput.inputMode = currency === "USD" ? "decimal" : "numeric";
    formatBalanceInput();
  }

  function closeCcyMenu() {
    if (!menu) return;
    menu.setAttribute("hidden", "");
    if (ccyBtn) ccyBtn.setAttribute("aria-expanded", "false");
  }

  function toggleCcyMenu() {
    if (!menu) return;
    var open = menu.hasAttribute("hidden");
    if (open) {
      menu.removeAttribute("hidden");
      if (ccyBtn) ccyBtn.setAttribute("aria-expanded", "true");
    } else {
      closeCcyMenu();
    }
  }

  if (ccyBtn) {
    ccyBtn.onclick = function (e) {
      e.stopPropagation();
      toggleCcyMenu();
    };
  }

  if (menu) {
    menu.onclick = function (e) {
      var btn = e.target.closest("[data-currency]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      currency = btn.getAttribute("data-currency");
      syncCcyUi();
      syncBalanceInputUi();
      closeCcyMenu();
    };
  }

  document.addEventListener("click", function (e) {
    var root = e.target.closest("#w-ccy-root");
    if (root) return;
    closeCcyMenu();
  });

  syncCcyUi();
  syncBalanceInputUi();

  if (balInput) {
    balInput.addEventListener("input", formatBalanceInput);
  }

  document.getElementById("w-logo-file-btn").onclick = function () {
    document.getElementById("w-logo-file").click();
  };
  document.getElementById("w-logo-file").onchange = function () {
    var f = document.getElementById("w-logo-file").files && document.getElementById("w-logo-file").files[0];
    document.getElementById("w-logo-file-name").textContent = f ? f.name : "";
  };

  function logoHtml(w) {
    if (w.logo && typeof w.logo === "string" && w.logo.charAt(0) === "/") {
      return '<img class="wallet-tile__logo" src="' + w.logo + '" alt="" />';
    }
    if (w.logo) {
      return '<span class="wallet-tile__emoji">' + w.logo + "</span>";
    }
    return '<span class="wallet-tile__emoji wallet-tile__emoji--empty">—</span>';
  }

  async function render() {
    var wallets = await MonifyApi.fetchJson("/api/wallets");
    document.getElementById("wallet-grid").innerHTML = (wallets.wallets || [])
      .map(function (w) {
        return (
          '<div class="card wallet-tile wallet-tile--compact"><div class="wallet-tile__row">' +
          logoHtml(w) +
          '<div class="wallet-tile__body"><strong>' +
          w.name +
          '</strong><div class="text-muted text-sm mt-1">' +
          w.flag +
          " " +
          w.currency +
          " · " +
          (w.active ? "Aktif" : "Nonaktif") +
          "</div></div></div></div>"
        );
      })
      .join("");
  }

  document.getElementById("w-add").onclick = async function () {
    var err = document.getElementById("w-err");
    err.style.display = "none";
    var name = document.getElementById("w-name").value.trim();
    var currencyRaw = document.getElementById("w-currency").value;
    var selectedCurrency = currencyRaw === "USD" ? "USD" : "IDR";
    var balance = parseBalanceForSubmit(selectedCurrency);
    if (!name) {
      err.textContent = "Isi nama dompet.";
      err.style.display = "block";
      return;
    }

    var logo = null;
    var fileEl = document.getElementById("w-logo-file");
    if (fileEl.files && fileEl.files[0]) {
      var fd = new FormData();
      fd.append("file", fileEl.files[0]);
      var up = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
      if (!up.ok) {
        var ue = await up.json().catch(function () {
          return {};
        });
        err.textContent = ue.error || "Upload logo gagal.";
        err.style.display = "block";
        return;
      }
      var ud = await up.json();
      logo = ud.url;
    }

    try {
      await MonifyApi.fetchJson("/api/wallets", {
        method: "POST",
        body: JSON.stringify({
          name: name,
          logo: logo,
          currency: selectedCurrency,
          balance: balance,
        }),
      });
      document.getElementById("w-name").value = "";
      document.getElementById("w-balance").value = "";
      document.getElementById("w-logo-file").value = "";
      document.getElementById("w-logo-file-name").textContent = "";
      await render();
    } catch (e) {
      err.textContent = e.message || "Gagal";
      err.style.display = "block";
    }
  };

  await render();
});
