document.addEventListener("DOMContentLoaded", async function () {
  await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "wallets");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "wallets");

  var root = document.getElementById("assets-root");
  var errEl = document.getElementById("assets-err");

  function logoBlock(w) {
    if (w.logo && typeof w.logo === "string" && w.logo.charAt(0) === "/") {
      return '<img class="asset-card__logo-img" src="' + w.logo + '" alt="" />';
    }
    if (w.logo && typeof w.logo === "string" && w.logo.length > 0 && w.logo.charAt(0) !== "/") {
      return '<span class="asset-card__logo-fallback">' + w.logo + "</span>";
    }
    return '<span class="asset-card__logo-fallback asset-card__logo-fallback--empty">?</span>';
  }

  function formatBal(w) {
    return w.currency === "USD" ? formatUSDHtml(w.balance) : formatIDRHtml(w.balance);
  }

  async function render() {
    errEl.style.display = "none";
    var res = await MonifyApi.fetchJson("/api/wallets");
    var list = res.wallets || [];
    var byCcy = {};
    list.forEach(function (w) {
      if (!byCcy[w.currency]) byCcy[w.currency] = { sum: 0, items: [] };
      byCcy[w.currency].sum += w.balance;
      byCcy[w.currency].items.push(w);
    });

    var html = "";
    ["IDR", "USD"].forEach(function (ccy) {
      if (!byCcy[ccy]) return;
      var g = byCcy[ccy];
      var totalHtml =
        ccy === "USD"
          ? '<p class="asset-summary__total">' + formatUSDHtml(g.sum) + "</p>"
          : '<p class="asset-summary__total">' + formatIDRHtml(g.sum) + "</p>";
      html +=
        '<div class="asset-summary card"><div class="flex-between"><strong>' +
        (ccy === "USD" ? "🇺🇸 Total USD" : "🇮🇩 Total IDR") +
        "</strong></div>" +
        totalHtml +
        "</div>";

      g.items.forEach(function (w) {
        html +=
          '<div class="asset-card card" data-id="' +
          w.id +
          '">' +
          '<div class="asset-card__head">' +
          logoBlock(w) +
          '<div class="asset-card__meta"><div class="asset-card__name">' +
          w.name +
          '</div><div class="text-muted text-sm">' +
          w.flag +
          " " +
          w.currency +
          " · " +
          (w.active ? "Aktif" : "Nonaktif") +
          "</div></div></div>" +
          '<div class="asset-card__bal mt-3">' +
          formatBal(w) +
          "</div>" +
          '<div class="asset-card__upload mt-3">' +
          '<input type="file" accept="image/*" class="visually-hidden" id="up-' +
          w.id +
          '" data-wid="' +
          w.id +
          '" />' +
          '<button type="button" class="btn btn--outline btn--sm" data-trigger="' +
          w.id +
          '">Unggah logo</button>' +
          "</div></div>";
      });
    });

    root.innerHTML = html || '<p class="text-muted">Belum ada dompet.</p>';

    root.querySelectorAll("[data-trigger]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-trigger");
        document.getElementById("up-" + id).click();
      };
    });

    root.querySelectorAll('input[type="file"][data-wid]').forEach(function (inp) {
      inp.onchange = async function () {
        var wid = inp.getAttribute("data-wid");
        var f = inp.files && inp.files[0];
        inp.value = "";
        if (!f) return;
        var fd = new FormData();
        fd.append("file", f);
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
        try {
          await MonifyApi.fetchJson("/api/wallets/" + encodeURIComponent(wid), {
            method: "PATCH",
            body: JSON.stringify({ logo: ud.url }),
          });
          await render();
        } catch (e) {
          errEl.textContent = e.message || "Gagal menyimpan logo.";
          errEl.style.display = "block";
        }
      };
    });
  }

  await render();
});
