document.addEventListener("DOMContentLoaded", async function () {
  await MonifyAuth.requireAuth();
  MonifyLayout.renderSidebar(document.getElementById("sidebar-nav"), "transactions");
  MonifyLayout.renderMobileNav(document.getElementById("mobile-nav"), "transactions");

  var params = new URLSearchParams(window.location.search);
  var kind = params.get("kind") || "expense";
  if (kind !== "income" && kind !== "debt") kind = "expense";
  var currency = params.get("currency") === "USD" ? "USD" : "IDR";
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

  function cardHtml(c, isChild) {
    var cls = "cat-pick-card" + (isChild ? " cat-pick-card--child" : "");
    return (
      '<button type="button" class="' +
      cls +
      '" data-id="' +
      c.id +
      '" data-name="' +
      c.name.replace(/"/g, "&quot;") +
      '">' +
      '<span class="cat-pick-card__icon">' +
      iconOrFallback(c.icon) +
      "</span>" +
      '<span class="cat-pick-card__name">' +
      c.name +
      "</span></button>"
    );
  }

  var html = "";
  parentsForKind.forEach(function (p) {
    var children = byParent[p.id];
    if (!children || !children.length) return;
    html += '<div class="cat-group">';
    html +=
      '<div class="cat-group__parent"><span class="cat-group__parent-label">' +
      (p.isSystem ? "Preset" : "Induk") +
      '</span><span class="cat-group__parent-name">' +
      p.name +
      "</span></div>";
    html += '<div class="cat-group__children">';
    children
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      })
      .forEach(function (c) {
        html += cardHtml(c, true);
      });
    html += "</div></div>";
  });

  var orphans = byParent["_none"] || [];
  if (orphans.length) {
    html += '<div class="cat-group">';
    html +=
      '<div class="cat-group__parent"><span class="cat-group__parent-label">Lainnya</span><span class="cat-group__parent-name">Tanpa induk</span></div>';
    html += '<div class="cat-group__children">';
    orphans.forEach(function (c) {
      html += cardHtml(c, true);
    });
    html += "</div></div>";
  }

  if (!html) {
    html =
      '<p class="text-muted">Belum ada kategori untuk jenis ini. Buat di <a href="/settings">Pengaturan</a>.</p>';
  }

  document.getElementById("cat-tree").innerHTML = html;

  document.getElementById("cat-tree").onclick = function (e) {
    var b = e.target.closest(".cat-pick-card");
    if (!b) return;
    var id = b.getAttribute("data-id");
    var name = b.getAttribute("data-name");
    sessionStorage.setItem(
      "monifyTxCategory",
      JSON.stringify({ id: id, name: name, type: kind })
    );
    window.location.href = ret;
  };
});
