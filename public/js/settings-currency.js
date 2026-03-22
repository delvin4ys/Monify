document.addEventListener("DOMContentLoaded", async function () {
  var me = await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "settings");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "settings");

  var displayCurrency = (me.user && me.user.displayCurrency) || "IDR";

  function syncCcyUi() {
    document.getElementById("ccy-status").textContent =
      "Aktif: " + (displayCurrency === "USD" ? "USD — ringkasan & total utama dalam dolar." : "IDR — ringkasan & total utama dalam rupiah.");
    document.getElementById("btn-ccy-idr").className =
      "btn " + (displayCurrency === "IDR" ? "btn--primary" : "btn--outline");
    document.getElementById("btn-ccy-usd").className =
      "btn " + (displayCurrency === "USD" ? "btn--primary" : "btn--outline");
  }

  syncCcyUi();

  document.getElementById("btn-ccy-idr").onclick = async function () {
    try {
      await MonifyApi.fetchJson("/api/user/preferences", {
        method: "PATCH",
        body: JSON.stringify({ displayCurrency: "IDR" }),
      });
      displayCurrency = "IDR";
      syncCcyUi();
    } catch (e) {
      alert(e.message);
    }
  };

  document.getElementById("btn-ccy-usd").onclick = async function () {
    try {
      await MonifyApi.fetchJson("/api/user/preferences", {
        method: "PATCH",
        body: JSON.stringify({ displayCurrency: "USD" }),
      });
      displayCurrency = "USD";
      syncCcyUi();
    } catch (e) {
      alert(e.message);
    }
  };
});
