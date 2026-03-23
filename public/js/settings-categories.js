document.addEventListener("DOMContentLoaded", async function () {
  await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "settings");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "settings");

  var parents = [];
  var categories = [];

  function kindForSelect(val) {
    if (val === "income") return "income";
    if (val === "debt") return "debt";
    return "expense";
  }

  function fillParentDropdown() {
    var t = kindForSelect(document.getElementById("nc-type").value);
    var sel = document.getElementById("nc-parent");
    var pool = parents.filter(function (p) {
      return p.kind === t;
    });
    sel.innerHTML = pool
      .map(function (p) {
        return '<option value="' + p.id + '">' + p.name + (p.isSystem ? " (preset)" : "") + "</option>";
      })
      .join("");
    if (!pool.length) {
      sel.innerHTML = '<option value="">— Tambah induk dulu —</option>';
    }
  }

  function syncDebtUi() {
    document.getElementById("nc-debt-wrap").style.display =
      document.getElementById("nc-type").value === "debt" ? "block" : "none";
  }

  document.getElementById("nc-type").onchange = function () {
    fillParentDropdown();
    syncDebtUi();
  };

  async function load() {
    var pr = await MonifyApi.fetchJson("/api/category-parents");
    var cr = await MonifyApi.fetchJson("/api/categories");
    parents = pr.parents || [];
    categories = cr.categories || [];

    document.getElementById("parent-list").innerHTML = parents
      .filter(function (p) {
        return !p.isSystem;
      })
      .map(function (p) {
        return (
          "<li>" +
          p.name +
          ' <span class="text-muted">(' +
          p.kind +
          ')</span> <button type="button" class="text-sm" data-del-p="' +
          p.id +
          '" style="color:var(--danger);border:none;background:none;cursor:pointer">hapus</button></li>'
        );
      })
      .join("");

    document.getElementById("parent-list").onclick = async function (e) {
      var b = e.target.closest("[data-del-p]");
      if (!b) return;
      if (!confirm("Hapus induk ini? Pastikan tidak ada kategori anak.")) return;
      try {
        await MonifyApi.fetchJson("/api/category-parents/" + b.getAttribute("data-del-p"), {
          method: "DELETE",
        });
        await load();
      } catch (err) {
        alert(err.message);
      }
    };

    fillParentDropdown();
    syncDebtUi();

    document.getElementById("cat-list").innerHTML = categories
      .map(function (c) {
        // Only show icon if it looks like an emoji (not a text name like 'alert-circle')
        var iconDisplay = "";
        if (c.icon && /^[^a-zA-Z0-9]/.test(c.icon) && c.icon.length <= 4) {
          iconDisplay = c.icon + " ";
        }
        return (
          '<div class="flex-between mt-2" style="border-bottom:1px solid var(--border);padding-bottom:0.5rem"><span>' +
          iconDisplay +
          c.name +
          ' <span class="text-muted">(' +
          c.type +
          (c.parentName ? " · " + c.parentName : "") +
          ')</span></span><button type="button" class="text-sm btn btn--outline" data-del-c="' +
          c.id +
          '">Hapus</button></div>'
        );
      })
      .join("");

    document.getElementById("cat-list").onclick = async function (e) {
      var b = e.target.closest("[data-del-c]");
      if (!b) return;
      if (!confirm("Hapus kategori ini?")) return;
      try {
        await MonifyApi.fetchJson("/api/categories/" + b.getAttribute("data-del-c"), {
          method: "DELETE",
        });
        await load();
      } catch (err) {
        alert(err.message);
      }
    };
  }

  document.getElementById("np-add").onclick = async function () {
    var name = document.getElementById("np-name").value.trim();
    var kind = document.getElementById("np-kind").value;
    if (!name) return;
    try {
      await MonifyApi.fetchJson("/api/category-parents", {
        method: "POST",
        body: JSON.stringify({ name: name, kind: kind }),
      });
      document.getElementById("np-name").value = "";
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  document.getElementById("nc-add").onclick = async function () {
    var err = document.getElementById("nc-err");
    err.style.display = "none";
    var type = document.getElementById("nc-type").value;
    var parentId = document.getElementById("nc-parent").value;
    var name = document.getElementById("nc-name").value.trim();
    var icon = document.getElementById("nc-icon").value.trim() || "dot";
    var debtSubtype = type === "debt" ? document.getElementById("nc-debt-sub").value : null;
    if (!parentId || !name) {
      err.textContent = "Pilih induk dan isi nama.";
      err.style.display = "block";
      return;
    }
    try {
      await MonifyApi.fetchJson("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          type: type === "income" ? "income" : type === "debt" ? "debt" : "expense",
          parentId: parentId,
          name: name,
          icon: icon,
          debtSubtype: debtSubtype,
        }),
      });
      document.getElementById("nc-name").value = "";
      document.getElementById("nc-icon").value = "";
      await load();
    } catch (e) {
      err.textContent = e.message || "Gagal";
      err.style.display = "block";
    }
  };

  try {
    await load();
  } catch (e) {
    console.error(e);
  }
});
