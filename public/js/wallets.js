document.addEventListener("DOMContentLoaded", async function () {
  var me = await MonifyAuth.requireAuth();
  var currency = (me.user && me.user.displayCurrency) || "IDR";
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "wallets");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "wallets");

  var balInput = document.getElementById("w-balance");

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

  syncBalanceInputUi();

  if (balInput) {
    balInput.addEventListener("input", formatBalanceInput);
  }

  var editingWalletId = null;

  function cancelEdit() {
    editingWalletId = null;
    document.getElementById("w-form-title").textContent = "Tambah dompet";
    document.getElementById("w-add").textContent = "Simpan dompet";
    document.getElementById("w-cancel").style.display = "none";
    document.getElementById("w-name").value = "";
    var balInp = document.getElementById("w-balance");
    if (balInp) {
      balInp.value = "";
      var evt = document.createEvent("HTMLEvents");
      evt.initEvent("input", false, true);
      balInp.dispatchEvent(evt);
    }
    document.getElementById("w-logo-file").value = "";
    document.getElementById("w-logo-file-name").textContent = "";
    document.getElementById("w-err").style.display = "none";
  }

  var cancelBtn = document.getElementById("w-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", cancelEdit);

  document.getElementById("wallet-grid").addEventListener("click", async function (e) {
    var btnDel = e.target.closest(".btn-wallet-del");
    if (btnDel) {
      var id = btnDel.getAttribute("data-id");
      if (confirm("Hapus dompet ini beserta seluruh transaksinya?")) {
        try {
          await MonifyApi.fetchJson("/api/wallets/" + id, { method: "DELETE" });
          if (editingWalletId === id) cancelEdit();
          await render();
        } catch (err) {
          alert(err.message || "Gagal menghapus dompet.");
        }
      }
      return;
    }

    var btnEdit = e.target.closest(".btn-wallet-edit");
    if (btnEdit) {
      var id = btnEdit.getAttribute("data-id");
      try {
        var walletsData = await MonifyApi.fetchJson("/api/wallets");
        var w = (walletsData.wallets || []).find(function (x) { return x.id === id; });
        if (w) {
          editingWalletId = w.id;
          document.getElementById("w-form-title").textContent = "Edit dompet";
          document.getElementById("w-add").textContent = "Simpan Perubahan";
          document.getElementById("w-cancel").style.display = "inline-block";
          document.getElementById("w-name").value = w.name;
          var balInp = document.getElementById("w-balance");
          if (balInp) {
            balInp.value = w.balance;
            var evt = document.createEvent("HTMLEvents");
            evt.initEvent("input", false, true);
            balInp.dispatchEvent(evt);
          }
          document.getElementById("w-logo-file-name").textContent = "";
          document.getElementById("w-name").focus();
          window.scrollTo(0, 0);
        }
      } catch (err) {
        console.error(err);
      }
    }
  });

  document.getElementById("w-logo-file-btn").onclick = function () {
    document.getElementById("w-logo-file").click();
  };
  document.getElementById("w-logo-file").onchange = function () {
    var f = document.getElementById("w-logo-file").files && document.getElementById("w-logo-file").files[0];
    document.getElementById("w-logo-file-name").textContent = f ? f.name : "";
  };

  function logoHtml(w) {
    if (w.logo && typeof w.logo === "string" && (w.logo.startsWith("/") || w.logo.startsWith("http"))) {
      return '<img class="wallet-tile__logo" src="' + w.logo + '" alt="" />';
    }
    if (w.logo) {
      return '<span class="wallet-tile__emoji">' + w.logo + "</span>";
    }
    return '<span class="wallet-tile__emoji wallet-tile__emoji--empty">—</span>';
  }

  async function render() {
    var wallets = await MonifyApi.fetchJson("/api/wallets");
    var wList = wallets.wallets || [];
    var totalBal = 0;
    var listHtml = wList.map(function (w, i) {
      totalBal += w.balance;
      var bg = 'var(--card)';
      var balHtml = currency === "USD" ? formatUSDHtml(w.balance) : formatIDRHtml(w.balance);
      return (
        '<div class="card wallet-tile" style="background:' + bg + '; border: 1px solid var(--border); padding: 1.25rem; display: flex; flex-direction: column; min-height: 140px; box-shadow: var(--shadow); position: relative;">' +
        '<div style="width: 100%; display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: auto; gap: 1rem;">' +
        '<div style="background: var(--bg); border: 1px solid var(--border); width: 42px; height: 42px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">' + logoHtml(w) + '</div>' +
        '<div style="display: flex; gap: 0.25rem; flex-shrink: 0;">' +
        '<button type="button" class="btn-wallet-edit" data-id="' + w.id + '" title="Edit dompet">&#x270E;</button>' +
        '<button type="button" class="btn-wallet-del" data-id="' + w.id + '" title="Hapus dompet">&#x1F5D1;</button>' +
        '</div>' +
        '</div>' +
        '<div style="margin-top: 1.25rem;">' +
        '<div style="font-weight: 600; font-size: 0.95rem; color: var(--text);">' + w.name + '</div>' +
        '<div style="font-size: 0.85rem; color: var(--muted); margin-top: 0.25rem;"><strong>' + balHtml + '</strong></div>' +
        '</div>' +
        '</div>'
      );
    }).join("");

    var fmtTotal = currency === "USD" ? formatUSDHtml(totalBal) : formatIDRHtml(totalBal);
    var totalHtml =
      '<div class="card wallet-tile" style="background: var(--brand-light); border: 1px solid rgba(5, 150, 105, 0.2); padding: 1.25rem; display: flex; flex-direction: column; min-height: 140px; box-shadow: var(--shadow);">' +
      '<div style="background: white; border: 1px solid rgba(5, 150, 105, 0.2); width: 42px; height: 42px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: auto;"><span class="wallet-tile__emoji">🌍</span></div>' +
      '<div style="margin-top: 1.25rem;">' +
      '<div style="font-weight: 600; font-size: 0.95rem; color: var(--text);">Total</div>' +
      '<div style="font-size: 0.85rem; color: var(--brand); margin-top: 0.25rem;"><strong>' + fmtTotal + '</strong></div>' +
      '</div>' +
      '</div>';

    document.getElementById("wallet-grid").innerHTML = totalHtml + listHtml;
  }

  document.getElementById("w-add").onclick = async function () {
    var err = document.getElementById("w-err");
    err.style.display = "none";
    var name = document.getElementById("w-name").value.trim();
    var balance = parseBalanceForSubmit(currency);
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
      if (editingWalletId) {
        var payload = { name: name, balance: balance };
        if (logo) payload.logo = logo;
        await MonifyApi.fetchJson("/api/wallets/" + editingWalletId, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        cancelEdit();
      } else {
        await MonifyApi.fetchJson("/api/wallets", {
          method: "POST",
          body: JSON.stringify({
            name: name,
            logo: logo,
            balance: balance,
          }),
        });
        document.getElementById("w-name").value = "";
        document.getElementById("w-balance").value = "";
        document.getElementById("w-logo-file").value = "";
        document.getElementById("w-logo-file-name").textContent = "";
      }
      await render();
    } catch (e) {
      err.textContent = e.message || "Gagal";
      err.style.display = "block";
    }
  };

  await render();
});
