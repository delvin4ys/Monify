(function () {
  const SVG = {
    home:
      '<svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z"/></svg>',
    chart:
      '<svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-4"/><path d="M12 16V8"/><path d="M16 16v-7"/></svg>',
    list:
      '<svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
    pie:
      '<svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2v10l8.5 4.9A10 10 0 112.5 12.5L12 2z"/></svg>',
    wallet:
      '<svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 12h.01"/><path d="M2 10h20"/></svg>',
    gear:
      '<svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    users:
      '<svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    logout:
      '<svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
    repeat:
      '<svg class="sidebar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
  };

  const NAV = [
    { href: "/dashboard", key: "dashboard", label: "Dashboard", icon: SVG.home },
    { href: "/reports", key: "reports", label: "Laporan", icon: SVG.chart },
    { href: "/transactions", key: "transactions", label: "Transaksi", icon: SVG.list },
    { href: "/liabilities", key: "liabilities", label: "Liabilitas", icon: SVG.repeat },
    { href: "/budgets", key: "budgets", label: "Budget", icon: SVG.pie },
    { href: "/wallets", key: "wallets", label: "Dompet", icon: SVG.wallet },
    { href: "/settings", key: "settings", label: "Pengaturan", icon: SVG.gear },
  ];

  function linkClass(active, key) {
    return "sidebar__link" + (active === key ? " is-active" : "");
  }

  window.MonifyLayout = {
    renderSidebar: function (navEl, active) {
      if (!navEl) return;
      let html = '<p class="sidebar__label">Menu</p>';
      NAV.forEach(function (l) {
        html +=
          '<a href="' +
          l.href +
          '" class="' +
          linkClass(active, l.key) +
          '">' +
          l.icon +
          "<span>" +
          l.label +
          "</span></a>";
      });
      html +=
        '<div style="margin-top: 2.5rem;">' +
        '<button type="button" class="sidebar__link" id="sidebar-logout" style="width: 100%; text-align: left; background-color: transparent; border: none; cursor: pointer; font-family: inherit; transition: all 0.2s;">' +
        SVG.logout +
        "<span>Keluar</span></button></div>";

      navEl.innerHTML = html;
      var logoutBtn = document.getElementById("sidebar-logout");
      if (logoutBtn) {
        logoutBtn.onclick = function () {
          if (confirm("Apakah Anda yakin ingin keluar dari akun ini?")) {
            if (confirm("Langkah ini akan mengakhiri sesi Anda. Lanjutkan proses Keluar?")) {
              fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(function () {
                window.location.href = "/login";
              });
            }
          }
        };
      }

      fetch("/api/auth/me", { credentials: "include" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (u) {
          if (!u) return;
          var topbar = document.querySelector(".topbar");
          if (topbar && !document.getElementById("topbar-profile")) {
            var name = (u.user && u.user.name) ? u.user.name : "User";
            var email = (u.user && u.user.email) ? u.user.email : "";
            var init = name.substring(0, 1).toUpperCase();
            var html = '<div id="topbar-profile" style="display:flex;align-items:center;gap:0.75rem;margin-left:auto;">' +
                       '<div style="text-align:right;line-height:1.2"><div style="font-weight:600;font-size:0.85rem;color:var(--text)">' + name + '</div><div style="font-size:0.7rem" class="text-muted">' + email + '</div></div>' +
                       '<div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg, var(--brand), #064e3b);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;box-shadow:0 2px 5px rgba(0,0,0,0.1)">' + init + '</div>' +
                       '</div>';
            var wrap = document.createElement("div");
            wrap.style.display = "flex";
            wrap.style.alignItems = "center";
            wrap.style.flex = "1";
            wrap.style.justifyContent = "flex-end";
            wrap.innerHTML = html;
            topbar.appendChild(wrap);
            
            // Check if topbar needs help grouping left items
            var children = Array.from(topbar.children);
            if (children.length > 2) {
               var leftGroup = document.createElement("div");
               leftGroup.style.display = "flex";
               leftGroup.style.alignItems = "center";
               leftGroup.style.gap = "0.75rem";
               for (var i = 0; i < children.length - 1; i++) {
                 leftGroup.appendChild(children[i]);
               }
               topbar.insertBefore(leftGroup, topbar.firstChild);
            }
          }
        })
        .catch(function () {});


      fetch("/api/admin/me", { credentials: "include" })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (!d.admin) return;
          var div = document.createElement("div");
          div.className = "sidebar-admin-block";
          div.innerHTML =
            '<p class="sidebar__label">Admin</p>' +
            '<a href="/admin/users" class="' +
            linkClass(active, "admin") +
            '">' +
            SVG.users +
            "<span>Pengguna terdaftar</span></a>";
          navEl.appendChild(div);
        })
        .catch(function () {});
    },

    renderMobileNav: function (container, active) {
      if (!container) return;
      var items = [
        { href: "/dashboard", key: "dashboard", label: "Home", icon: SVG.home },
        { href: "/transactions", key: "transactions", label: "Tx", icon: SVG.list },
        { href: "/budgets", key: "budgets", label: "Budget", icon: SVG.pie },
        { href: "/reports", key: "reports", label: "Laporan", icon: SVG.chart },
        { href: "/wallets", key: "wallets", label: "Dompet", icon: SVG.wallet },
      ];
      container.innerHTML = items
        .map(function (it) {
          return (
            '<a href="' +
            it.href +
            '" class="mobile-nav__link ' +
            (active === it.key ? "is-active" : "") +
            '">' +
            '<span class="mobile-nav__icon">' +
            it.icon +
            "</span>" +
            '<span class="mobile-nav__txt">' +
            it.label +
            "</span></a>"
          );
        })
        .join("");
    },

    showToast: function (type, title, message) {
      let container = document.getElementById("monify-toast-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "monify-toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
      }

      const toast = document.createElement("div");
      toast.className = "toast toast--" + (type || "info");
      
      let icon = "🔔";
      if (type === "success") icon = "✅";
      if (type === "error") icon = "❌";
      if (type === "info") icon = "ℹ️";

      toast.innerHTML = 
        '<div class="toast__icon">' + icon + '</div>' +
        '<div class="toast__content">' +
          '<div class="toast__title">' + title + '</div>' +
          '<div class="toast__msg">' + message + '</div>' +
        '</div>' +
        '<button type="button" class="toast__close">&times;</button>';

      container.appendChild(toast);

      // Trigger animation
      setTimeout(function() { toast.classList.add("is-visible"); }, 10);

      const closeToast = function() {
        toast.classList.remove("is-visible");
        setTimeout(function() { if (toast.parentNode) toast.remove(); }, 400);
      };

      toast.querySelector(".toast__close").onclick = closeToast;
      setTimeout(closeToast, 4000);
    },

    saveToastAndRedirect: function(url, type, title, message) {
      sessionStorage.setItem("monify_pending_toast", JSON.stringify({ type: type, title: title, message: message }));
      window.location.href = url;
    }
  };

  // Check for pending toast on load
  const pending = sessionStorage.getItem("monify_pending_toast");
  if (pending) {
    try {
      const t = JSON.parse(pending);
      sessionStorage.removeItem("monify_pending_toast");
      window.addEventListener("load", function() {
        setTimeout(function() {
          window.MonifyLayout.showToast(t.type, t.title, t.message);
        }, 500);
      });
    } catch(e) {}
  }

  // Mobile Sidebar Toggle
  window.addEventListener("DOMContentLoaded", function() {
    var topbar = document.querySelector(".topbar");
    var sidebar = document.querySelector(".sidebar");
    
    if (topbar && sidebar) {
      if (!document.querySelector(".sidebar-backdrop")) {
        var backdrop = document.createElement("div");
        backdrop.className = "sidebar-backdrop";
        document.body.appendChild(backdrop);
        
        var btn = document.createElement("button");
        btn.className = "mobile-menu-btn";
        btn.setAttribute("aria-label", "Toggle Menu");
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
        
        topbar.insertBefore(btn, topbar.firstChild);
        
        function openSidebar() {
          sidebar.classList.add("is-open");
          backdrop.classList.add("is-open");
        }
        function closeSidebar() {
          sidebar.classList.remove("is-open");
          backdrop.classList.remove("is-open");
        }
        
        btn.addEventListener("click", openSidebar);
        backdrop.addEventListener("click", closeSidebar);
        
        sidebar.addEventListener("click", function(e) {
          if (e.target.closest(".sidebar__link") && window.innerWidth <= 1023) {
            closeSidebar();
          }
        });
      }
    }
  });

})();
