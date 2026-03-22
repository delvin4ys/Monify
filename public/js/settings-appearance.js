document.addEventListener("DOMContentLoaded", async function () {
  await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "settings");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "settings");

  function syncThemeBtn() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    document.getElementById("btn-theme-toggle").textContent = dark ? "Mode gelap: aktif" : "Mode gelap: mati";
  }

  syncThemeBtn();

  document.getElementById("btn-theme-toggle").onclick = function () {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("monify-theme");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("monify-theme", "dark");
    }
    syncThemeBtn();
  };
});
