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

    var byParent = {};
    categories.forEach(function (c) {
      if (!byParent[c.parentId]) byParent[c.parentId] = [];
      byParent[c.parentId].push(c);
    });

    function iconOrFallback(ic) {
      if (!ic) return "◆";
      return ic;
    }

    var html = '<div class="cat-tree">';
    
    // Sort parents by kind then sortOrder
    var sortedParents = parents.sort(function(a, b) {
      var kindOrder = { expense: 1, income: 2, debt: 3 };
      if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind];
      return (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
    });

    // Render Independent Categories (Top-level/Orphans)
    var orphans = categories.filter(function(c) { return !c.parentId; });
    orphans.forEach(function (c) {
      html += '<div class="cat-tree-node cat-tree-node--orphan">';
      html += '  <div class="cat-tree-parent" style="border-bottom:none; margin-bottom:0;">';
      html += '    <div class="cat-tree-parent-icon">' + iconOrFallback(c.icon) + '</div>';
      html += '    <div class="cat-tree-parent-name" style="flex:1">' + c.name + ' <span class="text-muted" style="font-weight:400;font-size:0.8rem">(' + (c.type === "debt" ? "hutang/pinjaman" : c.type) + ')</span></div>';
      html += '    <button type="button" class="btn-wallet-del" data-del-c="' + c.id + '" title="Hapus Kategori">×</button>';
      html += '  </div>';
      html += '</div>';
    });

    sortedParents.forEach(function (p) {
      var children = byParent[p.id] || [];
      html += '<div class="cat-tree-node">';
      html += '<div class="cat-tree-parent">';
      html += '  <div class="cat-tree-parent-icon">' + iconOrFallback(p.icon || "📂") + '</div>';
      html += '  <div class="cat-tree-parent-name" style="flex:1">' + p.name + ' <span class="text-muted" style="font-weight:400;font-size:0.8rem">(' + p.kind + ')</span></div>';
      if (!p.isSystem) {
        html += '  <button type="button" class="btn-wallet-del" data-del-p="' + p.id + '" title="Hapus Induk">×</button>';
      }
      html += '</div>';

      html += '<div class="cat-tree-children">';
      children.sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function (c) {
        html += '<div class="cat-tree-child">';
        html += '  <div class="cat-tree-child-icon">' + iconOrFallback(c.icon) + '</div>';
        html += '  <div class="cat-tree-child-name" style="flex:1">' + c.name + '</div>';
        html += '  <button type="button" class="btn-wallet-del" data-del-c="' + c.id + '" title="Hapus Kategori">×</button>';
        html += '</div>';
      });
      
      if (children.length === 0) {
        html += '<div class="text-muted" style="padding: 0.5rem 0 0.5rem 2rem; font-size: 0.85rem; font-style: italic;">Belum ada sub-kategori</div>';
      }
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
    document.getElementById("cat-tree-container").innerHTML = html;
    fillParentDropdown();
    syncDebtUi();
  }

  document.getElementById("cat-tree-container").onclick = async function (e) {
    var delP = e.target.closest("[data-del-p]");
    if (delP) {
      if (!confirm("Hapus induk ini? Pastikan tidak ada kategori anak.")) return;
      try {
        await MonifyApi.fetchJson("/api/category-parents/" + delP.getAttribute("data-del-p"), {
          method: "DELETE",
        });
        MonifyLayout.showToast("success", "Dihapus", "Induk kategori berhasil dihapus.");
        await load();
      } catch (err) { MonifyLayout.showToast("error", "Gagal", err.message); }
      return;
    }

    var delC = e.target.closest("[data-del-c]");
    if (delC) {
      if (!confirm("Hapus kategori ini?")) return;
      try {
        await MonifyApi.fetchJson("/api/categories/" + delC.getAttribute("data-del-c"), {
          method: "DELETE",
        });
        MonifyLayout.showToast("success", "Dihapus", "Kategori berhasil dihapus.");
        await load();
      } catch (err) { MonifyLayout.showToast("error", "Gagal", err.message); }
    }
  };

  document.getElementById("np-add").onclick = async function () {
    var name = document.getElementById("np-name").value.trim();
    var kind = document.getElementById("np-kind").value;
    if (!name) return;
    try {
      await MonifyApi.fetchJson("/api/category-parents", {
        method: "POST",
        body: JSON.stringify({ name: name, kind: kind }),
      });
      MonifyLayout.showToast("success", "Berhasil", "Induk kategori '" + name + "' ditambahkan.");
      document.getElementById("np-name").value = "";
      await load();
    } catch (e) {
      MonifyLayout.showToast("error", "Gagal", e.message);
    }
  };

  document.getElementById("nc-add").onclick = async function () {
    var err = document.getElementById("nc-err");
    err.style.display = "none";
    var type = document.getElementById("nc-type").value;
    var parentId = document.getElementById("nc-parent").value;
    var name = document.getElementById("nc-name").value.trim();
    var icon = document.getElementById("nc-icon").value.trim() || "🏷️";
    var debtSubtype = type === "debt" ? document.getElementById("nc-debt-sub").value : null;
    if (!parentId || !name) {
      MonifyLayout.showToast("info", "Lengkapi Data", "Pilih induk dan isi nama kategori.");
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
      MonifyLayout.showToast("success", "Berhasil", "Kategori '" + name + "' berhasil ditambahkan.");
      document.getElementById("nc-name").value = "";
      document.getElementById("nc-icon").value = "";
      await load();
    } catch (e) {
      MonifyLayout.showToast("error", "Gagal", e.message);
    }
  };

  try {
    await load();
  } catch (e) {
    console.error(e);
  }
});
