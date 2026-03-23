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
    var me = await MonifyAuth.requireAuth();
    var currency = (me.user && me.user.displayCurrency) || "IDR";

    var html = "";
    var totalBal = 0;
    
    list.forEach(function (w) {
      if (w.balance > 0) totalBal += w.balance;
    });

    // VIZ RENDER
    var vizEl = document.getElementById("assets-viz");
    if (vizEl) {
      var vizHtml = '<div class="card"><h2 style="font-size:1.1rem;margin-bottom:1rem">Distribusi Aset</h2>';
      if (totalBal > 0) {
        vizHtml += '<div class="report-cat-list">';
        var sortedList = list.slice().sort(function(a, b) { return b.balance - a.balance; });
        sortedList.forEach(function (w) {
          if (w.balance <= 0) return;
          var pct = (w.balance / totalBal) * 100;
          vizHtml += '<div class="report-cat-row mt-2">' + 
            '<div class="flex-between text-sm"><span>' + w.name + '</span><strong>' + pct.toFixed(1) + '%</strong></div>' +
            '<div class="report-cat-bar"><div style="width:' + pct + '%"></div></div>' +
            '<div class="text-muted text-sm mt-1">' + formatBal(w) + '</div>' +
            '</div>';
        });
        vizHtml += '</div>';
      } else {
        vizHtml += '<p class="text-muted text-sm">Belum ada aset dengan saldo positif.</p>';
      }
      vizHtml += '</div>';
      vizEl.innerHTML = vizHtml;
    }

    // LIST RENDER
    var gSum = 0;
    list.forEach(function (w) {
      gSum += w.balance;
    });

    var totalHtml = currency === "USD" ? formatUSDHtml(gSum) : formatIDRHtml(gSum);
    html +=
      '<div class="asset-summary card"><div class="flex-between text-muted"><strong>Total Aset</strong></div>' +
      '<p class="asset-summary__total mt-1">' + totalHtml + "</p></div>";

    list.forEach(function (w) {
      html +=
        '<div class="asset-card card" data-id="' + w.id + '">' +
        '<div class="asset-card__head">' + logoBlock(w) +
        '<div class="asset-card__meta"><div class="asset-card__name">' + w.name + '</div></div></div>' +
        '<div class="asset-card__bal mt-3">' + formatBal(w) + "</div>" +
        '<div class="asset-card__upload mt-3">' +
        '<input type="file" accept="image/*" class="visually-hidden" id="up-' + w.id + '" data-wid="' + w.id + '" />' +
        '<button type="button" class="btn btn--outline btn--sm" data-trigger="' + w.id + '">Unggah logo</button>' +
        "</div></div>";
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
