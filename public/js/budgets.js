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
  var editingBudgetId = null;

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

  function openModal(editData) {
    editingBudgetId = editData ? editData.id : null;
    var title = document.getElementById("budget-modal-title");
    if (title) title.textContent = editData ? "Edit budget" : "Budget baru";
    var saveBtn = document.getElementById("b-save");
    if (saveBtn) saveBtn.textContent = editData ? "Simpan perubahan" : "Simpan";

    var err = document.getElementById("budget-err");
    if (err) err.style.display = "none";
    var limitEl = document.getElementById("b-limit");
    if (limitEl) {
      limitEl.oninput = function () {
        var digits = limitEl.value.replace(/\D/g, "");
        limitEl.value = digits ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(digits)) : "";
      };
      if (editData) {
        limitEl.value = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(editData.limit);
      } else {
        limitEl.value = "";
      }
    }

    // When editing, lock the selectors to existing values, only limit is editable
    var kindEl = document.getElementById("b-target-kind");
    var targetIdEl = document.getElementById("b-target-id");
    var modeEl = document.getElementById("b-period-mode");

    if (editData) {
      if (kindEl) { kindEl.value = editData.targetKind || "CATEGORY"; kindEl.disabled = true; }
      fillTargetSelect();
      if (targetIdEl) { targetIdEl.value = editData.targetId || ""; targetIdEl.disabled = true; }
      if (modeEl) { modeEl.value = editData.periodStart ? "custom" : "monthly"; modeEl.disabled = true; }
    } else {
      if (kindEl) { kindEl.disabled = false; }
      if (targetIdEl) { targetIdEl.disabled = false; }
      if (modeEl) { modeEl.value = ""; modeEl.disabled = false; }
      fillTargetSelect();
    }

    var d0 = new Date();
    var d1 = new Date(d0.getTime() + 14 * 24 * 60 * 60 * 1000);
    var ps = document.getElementById("b-p-start");
    var pe = document.getElementById("b-p-end");
    if (ps) ps.value = d0.toISOString().slice(0, 10);
    if (pe) pe.value = d1.toISOString().slice(0, 10);
    syncPeriodMode();

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
        var daysLeft = summary.daysLeftInMonth || 0;
        var pct = totalLimit > 0 ? Math.min(100, Math.round((totalSpent / totalLimit) * 100)) : 0;

        // Gauge arc: semicircle has total length ~251.33
        var arcLen = 251.33;
        var filled = (pct / 100) * arcLen;
        var gaugeFill = document.getElementById("gauge-fill");
        if (gaugeFill) gaugeFill.style.strokeDashoffset = (arcLen - filled);

        // Position the dot along the semicircle arc
        // Arc goes from (-π, 0) to (0, 0) i.e. 180° to 0°
        var angle = Math.PI - (pct / 100) * Math.PI;
        var cx = 100 + 80 * Math.cos(angle);
        var cy = 100 - 80 * Math.sin(angle);
        var gaugeDot = document.getElementById("gauge-dot");
        if (gaugeDot) {
          gaugeDot.setAttribute("cx", cx.toFixed(1));
          gaugeDot.setAttribute("cy", cy.toFixed(1));
        }

        // Change fill color based on severity
        if (gaugeFill) {
          gaugeFill.style.stroke = pct > 100 ? "#dc2626" : pct > 85 ? "#f59e0b" : "";
        }
        if (gaugeDot) {
          gaugeDot.style.fill = pct > 100 ? "#dc2626" : pct > 85 ? "#f59e0b" : "";
        }

        var sl = document.getElementById("sum-limit");
        if (sl) sl.innerHTML = formatIDRHtml(totalLimit);
        var ss = document.getElementById("sum-spent");
        if (ss) ss.innerHTML = formatIDRHtml(totalSpent);
        var sr = document.getElementById("sum-remain");
        if (sr) sr.innerHTML = formatIDRHtml(remaining);
        var sd = document.getElementById("sum-daily");
        if (sd) sd.innerHTML = formatIDRHtml(daily);
        var sdl = document.getElementById("sum-days-left");
        if (sdl) sdl.textContent = daysLeft + " hari";
      }
    }

    var el = document.getElementById("budget-list");
    if (!el) return;
    if (rows.length === 0) {
      el.innerHTML =
        '<div class="card"><p class="text-muted">Belum ada anggaran.</p></div>';
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
          '</strong><div style="display:flex;gap:0.35rem">' +
          '<button type="button" class="btn btn--outline" style="padding:0.25rem 0.6rem;font-size:0.8rem" data-edit="' + b.id + '" data-limit="' + b.limit + '" data-target-kind="' + escHtml(b.targetKind || 'CATEGORY') + '" data-target-id="' + escHtml(b.targetId || '') + '" data-period-start="' + escHtml(b.periodStart || '') + '">Edit</button>' +
          '<button type="button" class="btn btn--outline" style="padding:0.25rem 0.6rem;font-size:0.8rem;color:var(--danger)" data-del="' +
          b.id +
          '">Hapus</button></div></div></div>' +
          '<p class="text-muted text-sm mt-2">Terpakai ' +
          formatIDRHtml(b.spent) +
          ' dari ' +
          formatIDRHtml(b.limit) +
          '</p>' +
          '<div class="progress-bar-bg" style="height:10px;border-radius:999px;margin-top:0.75rem;overflow:hidden"><div style="height:100%;width:' +
          pct +
          '%;background:' +
          (over ? '#dc2626' : pct > 85 ? '#f59e0b' : 'var(--brand)') +
          '"></div></div>' +

          '<div style="margin-top:0.75rem">' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.85rem">' +
              '<tr><td style="color:var(--text-muted);padding:0.15rem 0">Sisa</td>' +
                  '<td style="text-align:right;padding:0.15rem 0;font-weight:600">' + formatIDRHtml(remain) + '</td></tr>' +
              '<tr><td style="color:var(--text-muted);padding:0.15rem 0">Rekomendasi</td>' +
                  '<td style="text-align:right;padding:0.15rem 0;font-weight:600">~' + formatIDRHtml(perDay) + '/hari</td></tr>' +
            '</table>' +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.75rem;padding-top:0.65rem;border-top:1px solid var(--border)">' +
            '<span class="badge ' + badgeClass + '" style="margin:0">' + badge + '</span>' +
            '<span style="background:' + (over ? '#fef2f2' : pct > 85 ? '#fffbeb' : 'var(--brand-light)') + ';color:' + (over ? '#dc2626' : pct > 85 ? '#d97706' : 'var(--brand)') + ';padding:0.25rem 0.65rem;border-radius:999px;font-size:0.75rem;font-weight:600;white-space:nowrap">±' + daysLeft + ' hari tersisa</span>' +
          '</div>' +

          '</div>'
        );
      })
      .join("");

    el.onclick = async function (e) {
      var editBtn = e.target.closest("[data-edit]");
      if (editBtn) {
        openModal({
          id: editBtn.getAttribute("data-edit"),
          limit: Number(editBtn.getAttribute("data-limit")),
          targetKind: editBtn.getAttribute("data-target-kind"),
          targetId: editBtn.getAttribute("data-target-id"),
          periodStart: editBtn.getAttribute("data-period-start"),
        });
        return;
      }
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
    overlay.addEventListener("mousedown", function (e) {
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
        if (editingBudgetId) {
          await MonifyApi.fetchJson("/api/budgets/" + editingBudgetId, {
            method: "PATCH",
            body: JSON.stringify({ limitAmount: limit }),
          });
        } else {
          await MonifyApi.fetchJson("/api/budgets", {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        editingBudgetId = null;
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
