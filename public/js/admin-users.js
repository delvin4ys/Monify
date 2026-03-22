document.addEventListener("DOMContentLoaded", async function () {
  await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "admin");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "settings");

  var err = document.getElementById("err");
  try {
    var res = await fetch("/api/admin/users", { credentials: "include" });
    if (res.status === 403) {
      err.textContent = "Anda tidak punya akses admin. Set ADMIN_EMAILS di .env.";
      err.style.display = "block";
      return;
    }
    if (!res.ok) throw new Error();
    var data = await res.json();
    var users = data.users || [];
    document.getElementById("tbody").innerHTML = users
      .map(function (u) {
        return (
          "<tr><td style=\"font-family:monospace;font-size:0.8rem\">" +
          u.email +
          "</td><td>" +
          (u.name || "—") +
          "</td><td>" +
          new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(
            new Date(u.createdAt)
          ) +
          '</td><td style="text-align:right">' +
          u._count.wallets +
          '</td><td style="text-align:right">' +
          u._count.categories +
          '</td><td style="text-align:right">' +
          u._count.transactions +
          "</td></tr>"
        );
      })
      .join("");
  } catch (e) {
    err.textContent = "Gagal memuat data.";
    err.style.display = "block";
  }
});
