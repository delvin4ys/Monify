document.addEventListener("DOMContentLoaded", async function () {
  await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "wallets");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "wallets");

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
    var currency = document.getElementById("w-currency").value;
    var balRaw = document.getElementById("w-balance").value.trim();
    var balance = 0;
    if (currency === "IDR") {
      balance = Number(String(balRaw).replace(/\D/g, ""));
    } else {
      var n = parseFloat(String(balRaw).replace(/,/g, "."));
      balance = Number.isFinite(n) ? Math.round(n * 100) : 0;
    }
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
          currency: currency,
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
