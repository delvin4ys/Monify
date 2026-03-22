document.addEventListener("DOMContentLoaded", async function () {
  try {
    await MonifyAuth.requireAuth();
  } catch (e) {
    return;
  }

  var nav = document.getElementById("sidebar-nav");
  var mobile = document.getElementById("mobile-nav");
  try {
    MonifyLayout.renderSidebar(nav, "budgets");
    MonifyLayout.renderMobileNav(mobile, "budgets");
  } catch (e) {
    console.error("Layout:", e);
  }

  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1;

  var cats = [];
  var parents = [];

  async function loadMeta() {
    var c = await MonifyApi.fetchJson("/api/categories");
    var p = await MonifyApi.fetchJson("/api/category-parents");
    cats = (c.categories || []).filter(function (x) {
      return x.type === "expense";
    });
    parents = (p.parents || []).filter(function (x) {
      return x.kind === "expense";
    });
    fillTargetSelect();
  }

  function fillTargetSelect() {
    var kindEl = document.getElementById("b-target-kind");
    var sel = document.getElementById("b-target-id");
    if (!kindEl || !sel) return;
    var kind = kindEl.value;
    if (kind === "CATEGORY") {
      if (!cats.length) {
        sel.innerHTML = '<option value="">— Buat kategori pengeluaran dulu (Pengaturan → Kategori) —</option>';
        return;
      }
      sel.innerHTML = cats
        .map(function (c) {
          return '<option value="' + c.id + '">' + c.name + (c.parentName ? " (" + c.parentName + ")" : "") + "</option>";
        })
        .join("");
    } else {
      if (!parents.length) {
        sel.innerHTML = '<option value="">— Tidak ada induk pengeluaran —</option>';
        return;
      }
      sel.innerHTML = parents
        .map(function (p) {
          return '<option value="' + p.id + '">' + p.name + (p.isSystem ? " (preset)" : "") + "</option>";
        })
        .join("");
    }
  }

  function syncPeriodMode() {
    var modeEl = document.getElementById("b-period-mode");
    var hint = document.getElementById("b-month-hint");
    var range = document.getElementById("b-range-wrap");
    if (!modeEl || !hint || !range) return;
    var mode = modeEl.value;
    hint.style.display = mode === "monthly" ? "block" : "none";
    range.style.display = mode === "custom" ? "block" : "none";
  }

  function openModal() {
    var err = document.getElementById("budget-err");
    if (err) err.style.display = "none";
    var limitEl = document.getElementById("b-limit");
    if (limitEl) limitEl.value = "";
    var modeEl = document.getElementById("b-period-mode");
    if (modeEl) modeEl.value = "monthly";
    var d0 = new Date();
    var d1 = new Date(d0.getTime() + 14 * 24 * 60 * 60 * 1000);
    var ps = document.getElementById("b-p-start");
    var pe = document.getElementById("b-p-end");
    if (ps) ps.value = d0.toISOString().slice(0, 10);
    if (pe) pe.value = d1.toISOString().slice(0, 10);
    syncPeriodMode();
    fillTargetSelect();

    var overlay = document.getElementById("modal-budget");
    if (!overlay) return;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    var overlay = document.getElementById("modal-budget");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
  }

  function escHtml(s) {
    if (s == null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function budgetIconHtml(icon) {
    if (!icon || !String(icon).trim()) {
      return '<span class="budget-card__icon budget-card__icon--placeholder" aria-hidden="true">📊</span>';
    }
    var s = String(icon).trim();
    if (s.charAt(0) === "/" && s.indexOf('"') < 0) {
      return '<img class="budget-card__icon-img" src="' + escHtml(s) + '" alt="" />';
    }
    return '<span class="budget-card__icon">' + escHtml(s) + "</span>";
  }

  async function refresh() {
    var res = await MonifyApi.fetchJson("/api/budgets?year=" + year + "&month=" + month);
    var rows = res.budgets || [];
    var summary = res.summary || {};

    var card = document.getElementById("budget-summary-card");
    if (card) {
      if (rows.length === 0) {
        card.style.display = "none";
      } else {
        card.style.display = "block";
        var totalLimit = summary.totalLimit || 0;
        var totalSpent = summary.totalSpent || 0;
        var remaining = summary.remaining || 0;
        var daily = summary.dailySuggestion || 0;
        var pct = totalLimit > 0 ? Math.min(100, Math.round((totalSpent / totalLimit) * 100)) : 0;
        var deg = (totalSpent / Math.max(totalLimit, 1)) * 360;
        deg = Math.min(360, deg);

        var ring = document.getElementById("budget-ring");
        if (ring) ring.style.setProperty("--p", deg + "deg");
        var rp = document.getElementById("ring-pct");
        if (rp) rp.textContent = pct + "%";
        var sl = document.getElementById("sum-limit");
        if (sl) sl.innerHTML = formatIDRHtml(totalLimit);
        var ss = document.getElementById("sum-spent");
        if (ss) ss.innerHTML = formatIDRHtml(totalSpent);
        var sr = document.getElementById("sum-remain");
        if (sr) sr.innerHTML = formatIDRHtml(remaining);
        var sd = document.getElementById("sum-daily");
        if (sd) sd.innerHTML = formatIDRHtml(daily);
      }
    }

    var el = document.getElementById("budget-list");
    if (!el) return;
    if (rows.length === 0) {
      el.innerHTML =
        '<div class="card"><p class="text-muted">Belum ada anggaran. Klik <strong>+ Buat anggaran</strong>.</p></div>';
      el.onclick = null;
      return;
    }
    el.innerHTML = rows
      .map(function (b) {
        var pct = b.limit > 0 ? Math.min(100, Math.round((b.spent / b.limit) * 100)) : 0;
        var over = b.spent > b.limit;
        var badge = over ? "Melebihi" : pct > 85 ? "Perhatian" : "Aman";
        var badgeClass = over ? "badge--pending" : "badge--ok";
        var remain = Math.max(0, b.limit - b.spent);
        var daysLeft = b.daysLeft != null ? b.daysLeft : summary.daysLeftInMonth || 1;
        var perDay = b.suggestedDaily != null ? b.suggestedDaily : Math.round(remain / Math.max(1, daysLeft));
        var pl = b.periodLabel ? '<p class="text-muted text-sm mt-0 mb-2">' + escHtml(b.periodLabel) + "</p>" : "";
        return (
          '<div class="card budget-card">' +
          pl +
          '<div class="budget-card__head">' +
          '<div class="budget-card__icon-wrap">' +
          budgetIconHtml(b.categoryIcon) +
          '</div>' +
          '<div class="budget-card__title-row flex-between">' +
          '<strong>' +
          escHtml(b.categoryName) +
          '</strong><button type="button" class="btn btn--outline" style="padding:0.25rem 0.6rem;font-size:0.8rem" data-del="' +
          b.id +
          '">Hapus</button></div></div><p class="text-muted text-sm mt-2">Terpakai ' +
          formatIDRHtml(b.spent) +
          " dari " +
          formatIDRHtml(b.limit) +
          '</p><div style="height:10px;background:#f1f5f9;border-radius:999px;margin-top:0.75rem;overflow:hidden"><div style="height:100%;width:' +
          pct +
          "%;background:" +
          (over ? "#dc2626" : pct > 85 ? "#f59e0b" : "var(--brand)") +
          '"></div></div><p class="text-muted text-sm mt-2">Sisa: ' +
          formatIDRHtml(remain) +
          " · ~" +
          formatIDRHtml(perDay) +
          " / hari (±" +
          daysLeft +
          ' hari tersisa)</p><p class="text-sm mt-1"><span class="badge ' +
          badgeClass +
          '">' +
          badge +
          "</span></p></div>"
        );
      })
      .join("");

    el.onclick = async function (e) {
      var btn = e.target.closest("[data-del]");
      if (!btn) return;
      if (!confirm("Hapus budget ini?")) return;
      try {
        await MonifyApi.fetchJson("/api/budgets/" + btn.getAttribute("data-del"), { method: "DELETE" });
        await refresh();
      } catch (err) {
        alert(err.message);
      }
    };
  }

  var viewMonth = document.getElementById("view-month");
  if (viewMonth) {
    viewMonth.value = year + "-" + String(month).padStart(2, "0");
    viewMonth.addEventListener("change", function () {
      var v = viewMonth.value;
      if (!v) return;
      year = parseInt(v.slice(0, 4), 10);
      month = parseInt(v.slice(5, 7), 10);
      refresh().catch(function (e) {
        console.error(e);
        alert(e.message || "Gagal memuat budget.");
      });
    });
  }

  var btnOpen = document.getElementById("btn-open-budget");
  if (btnOpen) {
    btnOpen.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
  }

  var bCancel = document.getElementById("b-cancel");
  if (bCancel) {
    bCancel.addEventListener("click", function (e) {
      e.preventDefault();
      closeModal();
    });
  }

  var overlay = document.getElementById("modal-budget");
  if (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        closeModal();
      }
    });
  }

  var bTargetKind = document.getElementById("b-target-kind");
  if (bTargetKind) {
    bTargetKind.addEventListener("change", fillTargetSelect);
  }

  var bPeriodMode = document.getElementById("b-period-mode");
  if (bPeriodMode) {
    bPeriodMode.addEventListener("change", syncPeriodMode);
  }

  var bSave = document.getElementById("b-save");
  if (bSave) {
    bSave.addEventListener("click", async function (e) {
      e.preventDefault();
      var err = document.getElementById("budget-err");
      if (err) err.style.display = "none";
      var targetKind = document.getElementById("b-target-kind");
      var targetIdEl = document.getElementById("b-target-id");
      var limitEl = document.getElementById("b-limit");
      var modeEl = document.getElementById("b-period-mode");
      if (!targetKind || !targetIdEl || !limitEl || !modeEl) return;

      var targetId = targetIdEl.value;
      var limit = Number(String(limitEl.value).replace(/\D/g, ""));
      var mode = modeEl.value;
      if (!targetId || !limit || limit <= 0) {
        if (err) {
          err.textContent = "Pilih target dan isi limit.";
          err.style.display = "block";
        }
        return;
      }
      var body = {
        targetKind: targetKind.value,
        targetId: targetId,
        limitAmount: limit,
      };
      if (mode === "custom") {
        var ps = document.getElementById("b-p-start");
        var pe = document.getElementById("b-p-end");
        body.periodStart = ps ? ps.value : "";
        body.periodEnd = pe ? pe.value : "";
        if (!body.periodStart || !body.periodEnd) {
          if (err) {
            err.textContent = "Lengkapi tanggal mulai dan selesai.";
            err.style.display = "block";
          }
          return;
        }
      } else {
        body.year = year;
        body.month = month;
      }
      try {
        await MonifyApi.fetchJson("/api/budgets", {
          method: "POST",
          body: JSON.stringify(body),
        });
        closeModal();
        await refresh();
      } catch (ex) {
        if (err) {
          err.textContent =
            ex.message && ex.message.indexOf("sudah ada") !== -1
              ? "Budget untuk target & periode ini sudah ada. Hapus yang lama atau pilih target lain."
              : ex.message || "Gagal";
          err.style.display = "block";
        }
      }
    });
  }

  try {
    await loadMeta();
    await refresh();
  } catch (e) {
    console.error(e);
    var list = document.getElementById("budget-list");
    if (list) {
      list.innerHTML =
        '<div class="card"><p class="text-muted">Gagal memuat data: ' + (e.message || "error") + "</p></div>";
    }
  }
});
