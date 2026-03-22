document.addEventListener("DOMContentLoaded", async function () {
  var me = await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "settings");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "settings");

  document.getElementById("u-name").textContent = (me.user && me.user.name) || "—";
  document.getElementById("u-email").textContent = (me.user && me.user.email) || "—";

  fetch("/api/admin/me", { credentials: "include" })
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (d.admin) document.getElementById("admin-box").style.display = "block";
    })
    .catch(function () {});
});
