import { html, mount, icon, raw, sk, emptyState, dialog, confirmDialog, toast, field, showErrors, busy, $ } from "../ui.js";
import { live } from "../page.js";
import { api, newKey } from "../api.js";
import { boot, loadBoot } from "../store.js";
import { money, percent, parseMoney, bindMoneyInput, moneyInputValue, today, date as fmtDate, daysBetween, symbol } from "../format.js";
import { emptyArt, celebrate } from "../art.js";
import { walletOptions, categoryOptions } from "../forms.js";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const T = {
  PAYABLE: { tab: "Hutang saya", one: "hutang", verb: "Bayar", who: "Kepada", color: "var(--neg)", payTitle: (n) => `Bayar hutang ke ${n}` },
  RECEIVABLE: { tab: "Piutang", one: "piutang", verb: "Terima pembayaran", who: "Dari", color: "var(--pos)", payTitle: (n) => `Terima pembayaran dari ${n}` },
};

function dueBadge(d) {
  if (d.status === "PAID") return html`<span class="badge badge--pos">Lunas</span>`;
  if (!d.dueDate) return "";
  const left = daysBetween(today(), d.dueDate);
  if (left < 0) return html`<span class="badge badge--neg">Lewat ${-left} hari</span>`;
  if (left <= 7) return html`<span class="badge badge--warn">${left === 0 ? "Jatuh tempo hari ini" : left + " hari lagi"}</span>`;
  return html`<span class="badge">Tempo ${fmtDate(d.dueDate, { year: false })}</span>`;
}

function debtForm(type, d0) {
  const editing = Boolean(d0);
  let kind = d0 ? d0.type : type;
  const d = dialog({
    title: editing ? "Ubah catatan" : "Catat hutang / piutang",
    body: html`<form class="stack" novalidate>
      ${editing
        ? ""
        : html`<div class="segmented segmented--block" data-kinds>
            <button type="button" data-kind="PAYABLE" aria-pressed="${kind === "PAYABLE"}">Saya berhutang</button>
            <button type="button" data-kind="RECEIVABLE" aria-pressed="${kind === "RECEIVABLE"}">Saya meminjamkan</button>
          </div>`}
      <div class="field" data-field="amount"><label for="f-amount" class="sr-only">Jumlah</label>
        <div class="amount-input"><span>${symbol()}</span><input id="f-amount" name="amount" placeholder="0" value="${d0 ? moneyInputValue(d0.principal) : ""}" autofocus /></div>
        <span class="field__error" role="alert"></span></div>
      ${field({ label: "Nama orang / pihak", name: "personName", control: html`<input class="input" id="f-personName" name="personName" maxlength="80" value="${d0 ? d0.personName : ""}" />` })}
      <div class="form-grid">
        ${field({ label: "Tanggal", name: "date", control: html`<input class="input" id="f-date" type="date" name="date" value="${d0 ? d0.date : today()}" />` })}
        ${field({ label: "Jatuh tempo (opsional)", name: "dueDate", control: html`<input class="input" id="f-dueDate" type="date" name="dueDate" value="${(d0 && d0.dueDate) || ""}" />` })}
      </div>
      ${field({ label: "Deskripsi (opsional)", name: "description", control: html`<input class="input" id="f-description" name="description" maxlength="200" value="${(d0 && d0.description) || ""}" />` })}
      ${editing
        ? ""
        : html`${field({
              label: "Uang ini lewat dompet",
              name: "walletId",
              control: html`<select class="select" id="f-walletId" name="walletId">${walletOptions("", { placeholder: "Tidak lewat dompet" })}</select>`,
            })}
            <p class="alert" data-hint></p>`}
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`<button class="btn" data-close>Batal</button><button class="btn btn--primary" data-save>${editing ? "Simpan" : "Catat"}</button>`,
  });
  const form = d.el.querySelector("form");
  bindMoneyInput(form.elements.amount);
  const hint = () => {
    const el = form.querySelector("[data-hint]");
    if (!el) return;
    mount(
      el,
      html`${icon("info", "icon--sm")}<span>${kind === "PAYABLE"
        ? "Pilih dompet bila uang pinjaman masuk ke dompetmu — saldonya bertambah, tetapi tidak dihitung sebagai pemasukan."
        : "Pilih dompet bila uang yang kamu pinjamkan keluar dari dompetmu — saldonya berkurang, tetapi tidak dihitung sebagai pengeluaran."}</span>`
    );
  };
  hint();
  form.addEventListener("click", (e) => {
    const k = e.target.closest("[data-kind]");
    if (!k) return;
    kind = k.dataset.kind;
    form.querySelectorAll("[data-kind]").forEach((x) => x.setAttribute("aria-pressed", String(x === k)));
    hint();
  });
  d.el.querySelector("[data-save]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      const el = form.elements;
      const body = { personName: el.personName.value.trim(), amount: parseMoney(el.amount.value) || 0, date: el.date.value, dueDate: el.dueDate.value || null, description: el.description.value.trim() || null };
      try {
        if (editing) await api.patch("/api/debts/" + d0.id, body);
        else await api.post("/api/debts", { ...body, type: kind, walletId: el.walletId.value || null });
        await loadBoot(true).catch(() => {});
        d.close(true);
        toast(editing ? "Catatan diperbarui." : `Catatan ${T[kind].one} disimpan.`);
        if (editing) debtDetail(d0.id);
      } catch (err) {
        showErrors(form, err);
      }
    });
}

function paymentForm(debt, payment) {
  const editing = Boolean(payment);
  const t = T[debt.type];
  const max = debt.outstanding + (payment ? payment.amount : 0);
  const key = newKey();
  const d = dialog({
    title: editing ? "Ubah pembayaran" : t.payTitle(debt.personName),
    body: html`<form class="stack" novalidate>
      <div class="field" data-field="amount"><label for="f-amount" class="sr-only">Jumlah</label>
        <div class="amount-input"><span>${symbol()}</span><input id="f-amount" name="amount" placeholder="0" value="${payment ? moneyInputValue(payment.amount) : ""}" autofocus /></div>
        <span class="field__hint">Sisa ${money(max)}. <button type="button" class="chip" data-full style="min-height:26px;margin-left:6px">${debt.type === "PAYABLE" ? "Lunasi semua" : "Terima semua"}</button></span>
        <span class="field__error" role="alert"></span></div>
      <div class="form-grid">
        ${field({ label: debt.type === "PAYABLE" ? "Bayar dari dompet" : "Masuk ke dompet", name: "walletId", control: html`<select class="select" id="f-walletId" name="walletId">${walletOptions((payment && payment.walletId) || debt.walletId || boot.user.defaultWalletId || "", { placeholder: "Pilih dompet" })}</select>` })}
        ${field({ label: "Tanggal", name: "date", control: html`<input class="input" id="f-date" type="date" name="date" value="${payment ? payment.date : today()}" />` })}
        ${field({ cls: "span-2", label: "Catatan (opsional)", name: "note", control: html`<input class="input" id="f-note" name="note" maxlength="140" value="${(payment && payment.note) || ""}" />` })}
      </div>
      ${!editing && debt.type === "PAYABLE"
        ? html`<details><summary class="muted small" style="cursor:pointer;padding:4px 0">Ada bunga atau biaya?</summary>
            <div class="form-grid" style="margin-top:12px">
              ${field({ label: "Bunga / biaya", name: "feeAmount", hint: "Dicatat terpisah sebagai pengeluaran; tidak mengurangi pokok hutang.", control: html`<input class="input" id="f-feeAmount" name="feeAmount" placeholder="0" />` })}
              ${field({ label: "Kategori biaya", name: "feeCategoryId", control: html`<select class="select" id="f-feeCategoryId" name="feeCategoryId">${categoryOptions("expense", (boot.categories.find((c) => c.name === "Bunga & Biaya Admin") || {}).id)}</select>` })}
            </div></details>`
        : ""}
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`<button class="btn" data-close>Batal</button><button class="btn btn--primary" data-save>${editing ? "Simpan" : t.verb}</button>`,
  });
  const form = d.el.querySelector("form");
  bindMoneyInput(form.elements.amount);
  if (form.elements.feeAmount) bindMoneyInput(form.elements.feeAmount);
  form.querySelector("[data-full]").onclick = () => {
    form.elements.amount.value = moneyInputValue(max);
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    d.el.querySelector("[data-save]").click();
  };
  d.el.querySelector("[data-save]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      const el = form.elements;
      const amount = parseMoney(el.amount.value) || 0;
      try {
        let updated;
        if (editing) updated = (await api.patch(`/api/debts/${debt.id}/payments/${payment.id}`, { amount, date: el.date.value, walletId: el.walletId.value, note: el.note.value.trim() || null })).debt;
        else {
          const fee = el.feeAmount ? parseMoney(el.feeAmount.value) : null;
          updated = (await api.post(`/api/debts/${debt.id}/payments`, { amount, date: el.date.value, walletId: el.walletId.value, note: el.note.value.trim() || null, ...(fee ? { feeAmount: fee, feeCategoryId: el.feeCategoryId.value || null } : {}) }, { key })).debt;
        }
        await loadBoot(true).catch(() => {});
        const paidOff = updated.status === "PAID";
        if (editing || reduceMotion()) {
          d.close(true);
          toast(editing ? "Pembayaran diperbarui." : paidOff ? "Lunas! 🎉" : "Pembayaran dicatat.");
          debtDetail(debt.id);
          return;
        }
        // Animasi pembayaran: centang + progres pelunasan bergerak ke nilai baru.
        mount(
          d.el.querySelector(".dialog__body"),
          html`${celebrate(paidOff ? "Lunas! 🎉" : "Pembayaran dicatat", paidOff ? `${t.one === "hutang" ? "Hutang" : "Piutang"} ${debt.personName} selesai.` : `Sisa ${money(updated.outstanding)}`)}
            <div class="progress progress--lg progress--pos" style="--p:${updated.progress}%" role="progressbar" aria-valuenow="${Math.round(updated.progress)}" aria-valuemin="0" aria-valuemax="100"><i></i></div>
            <div class="between small muted" style="margin-top:8px"><span class="num">${money(updated.paid)} dibayar</span><span class="num">${percent(updated.progress, 1)}</span></div>`
        );
        d.el.querySelector(".dialog__foot").hidden = true;
        setTimeout(() => {
          d.close(true);
          debtDetail(debt.id);
        }, 1300);
      } catch (err) {
        showErrors(form, err);
      }
    });
}

async function debtDetail(id) {
  let debt;
  try {
    debt = (await api.get("/api/debts/" + id)).debt;
  } catch (err) {
    return toast(err.message, "error");
  }
  const t = T[debt.type];
  const d = dialog({
    title: `${t.who} ${debt.personName}`,
    wide: true,
    body: html`<div class="stack">
      <div class="between wrap"><div><div class="eyebrow">Sisa ${t.one}</div><div class="num" style="font-size:var(--fs-2xl);font-weight:640;letter-spacing:-0.03em">${money(debt.outstanding)}</div></div>${dueBadge(debt)}</div>
      <div class="progress progress--lg progress--pos" style="--p:${debt.progress}%" role="progressbar" aria-valuenow="${Math.round(debt.progress)}" aria-valuemin="0" aria-valuemax="100" aria-label="Progres pelunasan"><i></i></div>
      <div class="bento">
        <div class="col-4 col-half-sm"><div class="eyebrow">Jumlah awal</div><div class="num" style="font-weight:620">${money(debt.principal)}</div></div>
        <div class="col-4 col-half-sm"><div class="eyebrow">Sudah dibayar</div><div class="num pos" style="font-weight:620">${money(debt.paid)}</div></div>
        <div class="col-4"><div class="eyebrow">Progres</div><div class="num" style="font-weight:620">${percent(debt.progress, 1)}</div></div>
      </div>
      <div class="small muted">Dicatat ${fmtDate(debt.date)}${debt.dueDate ? ` · jatuh tempo ${fmtDate(debt.dueDate)}` : ""}${debt.walletName ? ` · lewat ${debt.walletName}` : ""}${debt.description ? html`<br />${debt.description}` : ""}</div>
      <div class="row-flex wrap">
        <button class="btn btn--primary" data-act="pay" ${debt.status === "PAID" ? raw("disabled") : ""}>${icon(debt.type === "PAYABLE" ? "up" : "down", "icon--sm")}${t.verb}</button>
        <button class="btn" data-act="edit">${icon("edit", "icon--sm")}Ubah</button>
        <button class="btn btn--danger" data-act="delete">${icon("trash", "icon--sm")}Hapus</button>
      </div>
      <div><h3 style="margin-bottom:8px">Riwayat pembayaran</h3>
        ${debt.payments.length
          ? html`<div class="list" style="margin:0 calc(var(--s-5) * -1)">${debt.payments.map(
              (p) => html`<div class="row"><span class="tile tile--sm" style="--c:var(--pos)">${icon("check", "icon--sm")}</span>
                <span class="grow"><span class="row__title" style="display:block">${fmtDate(p.date)}${p.note ? " · " + p.note : ""}</span><span class="row__meta" style="display:block">${p.walletName || "—"}</span></span>
                <span class="num row__amount">${money(p.amount)}</span>
                <button class="btn btn--ghost btn--icon btn--sm" data-edit-pay="${p.id}" aria-label="Ubah pembayaran">${icon("edit", "icon--sm")}</button>
                <button class="btn btn--ghost btn--icon btn--sm" data-del-pay="${p.id}" aria-label="Hapus pembayaran">${icon("trash", "icon--sm")}</button></div>`
            )}</div>`
          : html`<p class="muted small">Belum ada pembayaran.</p>`}
      </div>
    </div>`,
  });
  d.el.addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit-pay]");
    if (edit) {
      d.close();
      return paymentForm(debt, debt.payments.find((p) => p.id === edit.dataset.editPay));
    }
    const del = e.target.closest("[data-del-pay]");
    if (del) {
      const p = debt.payments.find((x) => x.id === del.dataset.delPay);
      if (!(await confirmDialog({ title: "Hapus pembayaran ini?", message: `Pembayaran ${money(p.amount)} dibatalkan: sisa ${t.one} bertambah kembali dan saldo dompet dikembalikan.`, confirmLabel: "Hapus", danger: true }))) return;
      try {
        await api.del(`/api/debts/${debt.id}/payments/${p.id}`);
        await loadBoot(true).catch(() => {});
        d.close();
        toast("Pembayaran dihapus.");
        debtDetail(id);
      } catch (err) {
        toast(err.message, "error");
      }
      return;
    }
    const act = e.target.closest("[data-act]");
    if (!act) return;
    if (act.dataset.act === "pay") {
      d.close();
      paymentForm(debt);
    } else if (act.dataset.act === "edit") {
      d.close();
      debtForm(debt.type, debt);
    } else if (act.dataset.act === "delete") {
      if (!(await confirmDialog({ title: "Hapus catatan ini?", message: `Catatan ${t.one} beserta ${debt.payments.length} pembayarannya dihapus, dan semua perubahan saldo yang terkait dikembalikan.`, confirmLabel: "Hapus", danger: true }))) return;
      try {
        await api.del("/api/debts/" + debt.id);
        await loadBoot(true).catch(() => {});
        d.close();
        toast("Catatan dihapus.");
      } catch (err) {
        toast(err.message, "error");
      }
    }
  });
}

const skeleton = () => html`<div class="stack" aria-busy="true" aria-label="Memuat hutang dan piutang">
  <div class="bento">${[1, 2].map(() => html`<div class="card col-6 col-half-sm">${sk("45%", "0.8em")}<div style="margin-top:12px">${sk("70%", "1.8em")}</div></div>`)}</div>
  <div class="grid-cards">${[1, 2, 3].map(() => html`<div class="card">${sk("55%", "0.9em")}<div style="margin:14px 0">${sk("60%", "1.5em")}</div>${sk("100%", "8px")}<div style="margin-top:10px">${sk("40%", "0.8em")}</div></div>`)}</div>
</div>`;

export default function debts(view, { params }) {
  let tab = params.get("tab") === "RECEIVABLE" ? "RECEIVABLE" : "PAYABLE";
  let last = null;

  function render(data) {
    last = data;
    const mine = data.debts.filter((d) => d.type === tab);
    const open = mine.filter((d) => d.status === "OPEN");
    const paid = mine.filter((d) => d.status === "PAID");
    const t = T[tab];
    const card = (d) => html`<button class="card card--hover" data-debt="${d.id}" style="${d.status === "PAID" ? "opacity:.65" : ""}">
      <div class="between"><div class="row__title truncate">${d.personName}</div>${dueBadge(d)}</div>
      <div class="kpi__value num" style="margin:var(--s-3) 0">${money(d.outstanding)}</div>
      <div class="progress progress--pos" style="--p:${d.progress}%" role="progressbar" aria-valuenow="${Math.round(d.progress)}" aria-valuemin="0" aria-valuemax="100" aria-label="Progres pelunasan ${d.personName}"><i></i></div>
      <div class="between small muted" style="margin-top:8px"><span class="num">${money(d.paid)} dari ${money(d.principal)}</span><span class="num">${percent(d.progress)}</span></div>
    </button>`;
    mount(
      view,
      html`<div class="stack stagger">
        <div class="bento">
          <button class="card card--hover col-6 col-half-sm" data-tab="PAYABLE" style="${tab === "PAYABLE" ? "border-color:var(--border-strong)" : ""}">
            <div class="eyebrow">Hutang saya · ${data.totals.payableCount}</div><div class="kpi__value num">${money(data.totals.payable)}</div><div class="tiny muted">yang harus saya bayar</div></button>
          <button class="card card--hover col-6 col-half-sm" data-tab="RECEIVABLE" style="${tab === "RECEIVABLE" ? "border-color:var(--border-strong)" : ""}">
            <div class="eyebrow">Piutang · ${data.totals.receivableCount}</div><div class="kpi__value num">${money(data.totals.receivable)}</div><div class="tiny muted">yang harus dibayar ke saya</div></button>
        </div>
        <div class="between wrap">
          <div class="segmented" role="tablist">${["PAYABLE", "RECEIVABLE"].map((k) => html`<button data-tab="${k}" role="tab" aria-pressed="${tab === k}" aria-selected="${tab === k}">${T[k].tab}</button>`)}</div>
          <button class="btn btn--primary" data-new>${icon("plus", "icon--sm")}Catat ${t.one}</button>
        </div>
        ${open.length
          ? html`<div class="grid-cards">${open.map(card)}</div>`
          : html`<div class="card">${emptyState({
              art: emptyArt.debts,
              title: tab === "PAYABLE" ? "Tidak ada hutang berjalan" : "Tidak ada piutang berjalan",
              text: tab === "PAYABLE" ? "Catat uang yang kamu pinjam supaya cicilan dan sisanya terpantau." : "Catat uang yang kamu pinjamkan supaya tidak lupa menagihnya.",
              action: html`<button class="btn btn--primary" data-new>${icon("plus", "icon--sm")}Catat ${t.one}</button>`,
            })}</div>`}
        ${paid.length ? html`<details><summary class="muted" style="cursor:pointer;padding:8px 0">Sudah lunas (${paid.length})</summary><div class="grid-cards" style="margin-top:12px">${paid.map(card)}</div></details>` : ""}
      </div>`
    );
  }

  const part = live(view, () => "/api/debts", { skeleton, render });
  view.onclick = (e) => {
    const tb = e.target.closest("[data-tab]");
    if (tb) {
      tab = tb.dataset.tab;
      history.replaceState({}, "", "/debts" + (tab === "RECEIVABLE" ? "?tab=RECEIVABLE" : ""));
      // Data kedua tab sudah ada: render ulang tanpa request baru.
      return last ? render(last) : part.refresh();
    }
    if (e.target.closest("[data-new]")) return debtForm(tab);
    const c = e.target.closest("[data-debt]");
    if (c) debtDetail(c.dataset.debt);
  };
  if (params.get("new")) {
    history.replaceState({}, "", "/debts");
    debtForm(tab);
  }
  if (params.get("open")) {
    const id = params.get("open");
    history.replaceState({}, "", "/debts");
    debtDetail(id);
  }
  return {
    refresh: part.refresh,
    destroy() {
      part.destroy();
      view.onclick = null;
    },
  };
}
