document.addEventListener("DOMContentLoaded", async function () {
  await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "transactions");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "transactions");

  var params = new URLSearchParams(window.location.search);
  var kind = params.get("kind") || "expense";
  if (kind !== "income" && kind !== "debt") kind = "expense";
  var currency = params.get("currency") === "USD" ? "USD" : "IDR";
  var allowParent = params.get("allowParent") === "true";
  var ret = params.get("return") || "/transactions/new";

  document.getElementById("cat-back").href = ret;

  var kindLabel =
    kind === "income" ? "Pemasukan" : kind === "debt" ? "Hutang / Pinjaman" : "Pengeluaran";
  document.getElementById("cat-kind-hint").textContent =
    kindLabel + " · " + currency + " — ketuk kartu untuk memilih.";

  var resC = await MonifyApi.fetchJson("/api/categories");
  var resP = await MonifyApi.fetchJson("/api/category-parents");
  var cats = (resC.categories || []).filter(function (c) {
    return c.type === kind;
  });
  var parents = resP.parents || [];

  var parentsForKind = parents
    .filter(function (p) {
      return p.kind === kind;
    })
    .sort(function (a, b) {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      return (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name);
    });

  var byParent = {};
  cats.forEach(function (c) {
    var pid = c.parentId || "_none";
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push(c);
  });

  function iconOrFallback(ic) {
    if (!ic) return "◆";
    return ic;
  }

  var html = '<div class="cat-tree">';
  parentsForKind.forEach(function (p) {
    var children = byParent[p.id] || [];
    
    html += '<div class="cat-tree-node">';
    
    // Parent Card
    html += '<div class="cat-tree-parent" data-id="' + p.id + '" data-name="' + p.name.replace(/"/g, "&quot;") + '" data-type="PARENT">';
    html += '  <div class="cat-tree-parent-icon">' + iconOrFallback(p.icon || "📂") + '</div>';
    html += '  <div class="cat-tree-parent-name">' + p.name + '</div>';
    html += '</div>';

    // Children list
    if (children.length > 0) {
      html += '<div class="cat-tree-children">';
      children
        .sort(function (a, b) {
          return a.name.localeCompare(b.name);
        })
        .forEach(function (c) {
          html += '<button type="button" class="cat-tree-child" data-id="' + c.id + '" data-name="' + c.name.replace(/"/g, "&quot;") + '" data-type="CATEGORY">';
          html += '  <div class="cat-tree-child-icon">' + iconOrFallback(c.icon) + '</div>';
          html += '  <div class="cat-tree-child-name">' + c.name + '</div>';
          html += '</button>';
        });
      html += '</div>';
    }
    
    html += '</div>';
  });

  var orphans = byParent["_none"] || [];
  if (orphans.length) {
    html += '<div class="cat-tree-node">';
    html += '  <div class="cat-tree-parent">';
    html += '    <div class="cat-tree-parent-icon">📦</div>';
    html += '    <div class="cat-tree-parent-name">Tanpa induk</div>';
    html += '  </div>';
    html += '  <div class="cat-tree-children">';
    orphans.forEach(function (c) {
      html += '<button type="button" class="cat-tree-child" data-id="' + c.id + '" data-name="' + c.name.replace(/"/g, "&quot;") + '" data-type="CATEGORY">';
      html += '  <div class="cat-tree-child-icon">' + iconOrFallback(c.icon) + '</div>';
      html += '  <div class="cat-tree-child-name">' + c.name + '</div>';
      html += '</button>';
    });
    html += '  </div>';
    html += '</div>';
  }
  html += '</div>';

  if (parentsForKind.length === 0 && orphans.length === 0) {
    html =
      '<p class="text-muted">Belum ada kategori untuk jenis ini. Buat di <a href="/settings">Pengaturan</a>.</p>';
  }

  document.getElementById("cat-tree").innerHTML = html;

  document.getElementById("cat-tree").onclick = function (e) {
    var b = e.target.closest(".cat-tree-child");
    if (b) {
      var id = b.getAttribute("data-id");
      var name = b.getAttribute("data-name");
      sessionStorage.setItem(
        "monifyTxCategory",
        JSON.stringify({ id: id, name: name, type: kind, targetKind: "CATEGORY" })
      );
      window.location.href = ret;
      return;
    }

    if (allowParent) {
      var p = e.target.closest(".cat-tree-parent");
      if (p && p.getAttribute("data-id")) {
        var pid = p.getAttribute("data-id");
        var pname = p.getAttribute("data-name");
        sessionStorage.setItem(
          "monifyTxCategory",
          JSON.stringify({ id: pid, name: pname, type: kind, targetKind: "PARENT" })
        );
        window.location.href = ret;
      }
    }
  };
});
