import { html, mount, icon, raw, sk, emptyState, dialog, confirmDialog, toast, field, showErrors, busy, tile, $ } from "../ui.js";
import { live } from "../page.js";
import { api } from "../api.js";
import { boot } from "../store.js";
import { money, percent, parseMoney, bindMoneyInput, moneyInputValue, today, monthLabel, date as fmtDate, symbol } from "../format.js";
import { emptyArt, buddy } from "../art.js";
import { go } from "../forms.js";

const STATUS = {
  ok: { cls: "progress--lava", badge: "", label: "Aman" },
  warning: { cls: "progress--warn", badge: "badge--warn", label: "Hampir habis" },
  over: { cls: "progress--neg", badge: "badge--neg", label: "Lewat batas" },
};

function budgetForm(year, month, b) {
  const editing = Boolean(b);
  const expenseCats = boot.categories.filter((c) => c.type === "expense" && !c.archived);
  const groups = boot.categoryParents.filter((p) => p.kind === "expense" && expenseCats.some((c) => c.parentId === p.id));
  const d = dialog({
    title: editing ? "Ubah budget" : "Budget baru",
    body: html`<form class="stack" novalidate>
      ${editing
        ? html`<div class="row-flex">${tile({ glyph: b.icon, color: b.color })}<div><div class="row__title">${b.name}</div><div class="row__meta">${b.isMonthly ? monthLabel(b.year, b.month) : `${fmtDate(b.from)} – ${fmtDate(b.to)}`}</div></div></div>`
        : html`${field({
              label: "Untuk kategori",
              name: "targetId",
              control: html`<select class="select" id="f-targetId" name="target">
                <option value="">Pilih kategori atau grup</option>
                <optgroup label="Grup (semua kategori di dalamnya)">${groups.map((p) => html`<option value="PARENT:${p.id}">🗂️ ${p.name}</option>`)}</optgroup>
                <optgroup label="Kategori">${expenseCats.map((c) => html`<option value="CATEGORY:${c.id}">${c.icon} ${c.name}</option>`)}</optgroup>
              </select>`,
            })}
            <div class="segmented segmented--block" data-period>
              <button type="button" data-p="month" aria-pressed="true">Bulanan · ${monthLabel(year, month)}</button>
              <button type="button" data-p="custom" aria-pressed="false">Rentang tanggal</button>
            </div>
            <div class="form-grid" data-custom hidden>
              ${field({ label: "Mulai", name: "periodStart", control: html`<input class="input" id="f-periodStart" type="date" name="periodStart" />` })}
              ${field({ label: "Selesai", name: "periodEnd", control: html`<input class="input" id="f-periodEnd" type="date" name="periodEnd" />` })}
            </div>`}
      <div class="field" data-field="limitAmount"><label for="f-limit">Batas pengeluaran</label>
        <div class="amount-input"><span>${symbol()}</span><input id="f-limit" name="limitAmount" placeholder="0" value="${b ? moneyInputValue(b.limit) : ""}" autofocus /></div>
        <span class="field__error" role="alert"></span></div>
      ${field({
        label: "Berlaku untuk dompet",
        name: "walletId",
        hint: "Pilih satu dompet bila budget ini hanya untuk pengeluaran dari dompet tersebut.",
        control: html`<select class="select" id="f-walletId" name="walletId"><option value="">Semua dompet</option>${boot.wallets.filter((w) => w.active || (b && b.walletId === w.id)).map((w) => html`<option value="${w.id}" ${b && b.walletId === w.id ? raw("selected") : ""}>${w.name}</option>`)}</select>`,
      })}
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`${editing ? html`<button class="btn btn--danger" data-delete style="margin-right:auto">${icon("trash", "icon--sm")}<span class="hide-sm">Hapus</span></button>` : ""}<button class="btn" data-close>Batal</button><button class="btn btn--primary" data-save>${editing ? "Simpan" : "Buat budget"}</button>`,
  });
  const form = d.el.querySelector("form");
  bindMoneyInput(form.elements.limitAmount);
  let period = "month";
  form.addEventListener("click", (e) => {
    const p = e.target.closest("[data-p]");
    if (!p) return;
    period = p.dataset.p;
    form.querySelectorAll("[data-p]").forEach((x) => x.setAttribute("aria-pressed", String(x === p)));
    form.querySelector("[data-custom]").hidden = period !== "custom";
  });
  d.el.querySelector("[data-save]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      const limitAmount = parseMoney(form.elements.limitAmount.value) || 0;
      const walletId = form.elements.walletId.value || null;
      try {
        if (editing) await api.patch("/api/budgets/" + b.id, { limitAmount, walletId });
        else {
          const [targetKind, targetId] = (form.elements.target.value || ":").split(":");
          await api.post("/api/budgets", {
            targetKind: targetKind || undefined,
            targetId: targetId || undefined,
            limitAmount,
            walletId,
            ...(period === "custom" ? { periodStart: form.elements.periodStart.value, periodEnd: form.elements.periodEnd.value } : { year, month }),
          });
        }
        d.close(true);
        toast(editing ? "Budget diperbarui." : "Budget dibuat.");
      } catch (err) {
        showErrors(form, err);
      }
    });
  const del = d.el.querySelector("[data-delete]");
  if (del)
    del.onclick = async () => {
      if (!(await confirmDialog({ title: "Hapus budget ini?", message: `Budget ${b.name} dihapus. Transaksi tidak terpengaruh.`, confirmLabel: "Hapus", danger: true }))) return;
      try {
        await api.del("/api/budgets/" + b.id);
        d.close(true);
        toast("Budget dihapus.");
      } catch (err) {
        toast(err.message, "error");
      }
    };
}

const skeleton = () => html`<div class="stack" aria-busy="true" aria-label="Memuat budget">
  <div class="card">${sk("30%", "0.9em")}<div style="margin:14px 0">${sk("46%", "2rem")}</div>${sk("100%", "12px")}</div>
  <div class="grid-cards">${[1, 2, 3].map(() => html`<div class="card"><div class="row-flex">${sk("40px", "40px")}<div class="grow">${sk("55%", "0.9em")}<br />${sk("35%", "0.7em")}</div></div><div style="margin:18px 0 8px">${sk("100%", "8px")}</div>${sk("70%", "0.8em")}</div>`)}</div>
</div>`;

export default function budgets(view, { params }) {
  const t = today();
  let year = Number(t.slice(0, 4));
  let month = Number(t.slice(5, 7));
  let list = [];

  function render(data) {
    list = data.budgets;
    const s = data.summary;
    const overall = s.percent >= 100 ? "over" : s.percent >= 80 ? "warning" : "ok";
    const isCurrent = year === Number(t.slice(0, 4)) && month === Number(t.slice(5, 7));
    const head = html`<div class="between wrap">
      <div class="row-flex">
        <button class="btn btn--icon" data-month="-1" aria-label="Bulan sebelumnya">${icon("left")}</button>
        <h2 style="min-width:11ch;text-align:center">${monthLabel(year, month)}</h2>
        <button class="btn btn--icon" data-month="1" aria-label="Bulan berikutnya">${icon("chevron")}</button>
        ${isCurrent ? "" : html`<button class="btn btn--sm btn--ghost" data-month="0">Bulan ini</button>`}
      </div>
      <button class="btn btn--primary" data-new>${icon("plus", "icon--sm")}Budget</button>
    </div>`;
    if (!list.length) {
      mount(view, html`<div class="stack">${head}<div class="card">${emptyState({ art: emptyArt.budgets, title: "Belum ada budget", text: `Tetapkan batas pengeluaran per kategori untuk ${monthLabel(year, month)}. Bisa juga khusus satu dompet.`, action: html`<button class="btn btn--primary" data-new>${icon("plus", "icon--sm")}Buat budget</button>` })}</div></div>`);
      return;
    }
    mount(
      view,
      html`<div class="stack stagger">
        ${head}
        <section class="card" aria-label="Ringkasan budget">
          <div class="bento">
            <div class="col-3 col-half-sm"><div class="eyebrow">Total budget</div><div class="kpi__value num">${money(s.totalLimit)}</div></div>
            <div class="col-3 col-half-sm"><div class="eyebrow">Terpakai</div><div class="kpi__value num">${money(s.totalSpent)}</div></div>
            <div class="col-3 col-half-sm"><div class="eyebrow">${s.remaining < 0 ? "Kelebihan" : "Sisa"}</div><div class="kpi__value num ${s.remaining < 0 ? "neg" : "pos"}">${money(Math.abs(s.remaining))}</div></div>
            <div class="col-3 col-half-sm"><div class="eyebrow">Persentase</div><div class="kpi__value num">${percent(s.percent)}</div></div>
          </div>
          <div class="progress progress--lg ${STATUS[overall].cls}" style="--p:${Math.min(s.percent, 100)}%;margin-top:var(--s-4)" role="progressbar" aria-valuenow="${Math.round(s.percent)}" aria-valuemin="0" aria-valuemax="100" aria-label="Pemakaian seluruh budget"><i></i></div>
          ${s.overCount || s.warningCount
            ? html`<div class="row-flex" style="margin-top:var(--s-4)">${buddy(s.overCount ? "over" : "warning")}<p class="small">${s.overCount ? html`<strong>${s.overCount} budget lewat batas.</strong> ` : ""}${s.warningCount ? html`${s.warningCount} budget sudah terpakai lebih dari 80%. ` : ""}<span class="muted">Coba tahan dulu pengeluaran di kategori itu sampai periode berganti.</span></p></div>`
            : html`<div class="row-flex" style="margin-top:var(--s-4)">${buddy("ok")}<p class="small muted">Semua budget masih di jalur yang aman. Pertahankan!</p></div>`}
        </section>
        <div class="grid-cards">
          ${list.map((b) => {
            const st = STATUS[b.status];
            return html`<button class="card card--hover" data-budget="${b.id}">
              <div class="row-flex">${tile({ glyph: b.icon, color: b.color })}
                <div class="grow"><div class="row__title truncate">${b.name}</div><div class="row__meta truncate">${b.walletName ? b.walletName : "Semua dompet"}${b.isMonthly ? "" : ` · ${fmtDate(b.from, { year: false })} – ${fmtDate(b.to, { year: false })}`}</div></div>
                ${st.badge ? html`<span class="badge ${st.badge}">${st.label}</span>` : ""}
              </div>
              <div class="between" style="margin-top:var(--s-4)"><span class="num" style="font-weight:620">${money(b.spent)}</span><span class="num muted small">dari ${money(b.limit)}</span></div>
              <div class="progress ${st.cls}" style="--p:${Math.min(b.percent, 100)}%;margin:8px 0" role="progressbar" aria-valuenow="${Math.round(b.percent)}" aria-valuemin="0" aria-valuemax="100" aria-label="Pemakaian budget ${b.name}"><i></i></div>
              <div class="between small"><span class="${b.remaining < 0 ? "neg" : "muted"}">${b.remaining < 0 ? `Lebih ${money(-b.remaining)}` : `Sisa ${money(b.remaining)}`}</span>
                <span class="muted">${b.daysLeft > 0 ? (b.suggestedDaily > 0 ? `${money(b.suggestedDaily)}/hari · ${b.daysLeft} hari lagi` : `${b.daysLeft} hari lagi`) : "Periode selesai"}</span></div>
            </button>`;
          })}
        </div>
      </div>`
    );
  }

  const part = live(view, () => `/api/budgets?year=${year}&month=${month}&today=${t}`, { skeleton, render });
  view.onclick = (e) => {
    const m = e.target.closest("[data-month]");
    if (m) {
      const step = Number(m.dataset.month);
      if (step === 0) {
        year = Number(t.slice(0, 4));
        month = Number(t.slice(5, 7));
      } else {
        const idx = year * 12 + (month - 1) + step;
        year = Math.floor(idx / 12);
        month = (idx % 12) + 1;
      }
      return part.refresh();
    }
    if (e.target.closest("[data-new]")) {
      if (!boot.categories.some((c) => c.type === "expense" && !c.archived)) return go("/settings?tab=categories");
      return budgetForm(year, month);
    }
    const card = e.target.closest("[data-budget]");
    if (card) budgetForm(year, month, list.find((b) => b.id === card.dataset.budget));
  };
  if (params.get("new")) {
    history.replaceState({}, "", "/budgets");
    budgetForm(year, month);
  }
  return {
    refresh: part.refresh,
    destroy() {
      part.destroy();
      view.onclick = null;
    },
  };
}
