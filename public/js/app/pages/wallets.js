import { html, mount, icon, raw, sk, emptyState, dialog, confirmDialog, toast, field, showErrors, busy, $ } from "../ui.js";
import { live } from "../page.js";
import { api } from "../api.js";
import { boot, loadBoot } from "../store.js";
import { money, parseMoney, bindMoneyInput, moneyInputValue, today, symbol } from "../format.js";
import { donut, foldSlices } from "../charts.js";
import { emptyArt } from "../art.js";
import { walletTile, WALLET_TYPES, openTransaction, go } from "../forms.js";
import { colorPicker, logoPicker, picked } from "../pickers.js";

function walletForm(w) {
  const editing = Boolean(w);
  const d = dialog({
    title: editing ? "Ubah dompet" : "Dompet baru",
    body: html`<form class="stack" novalidate>
      ${field({ label: "Nama dompet", name: "name", control: html`<input class="input" id="f-name" name="name" maxlength="60" placeholder="mis. BCA, GoPay, Tunai" value="${w ? w.name : ""}" autofocus />` })}
      ${field({
        label: "Tipe",
        name: "type",
        control: html`<select class="select" id="f-type" name="type">${Object.entries(WALLET_TYPES).map(([k, [label]]) => html`<option value="${k}" ${(w ? w.type : "bank") === k ? raw("selected") : ""}>${label}</option>`)}</select>`,
      })}
      ${field({
        label: "Saldo awal",
        name: "initialBalance",
        hint: editing
          ? "Saldo saat dompet mulai dicatat. Mengubahnya menggeser saldo berjalan sebesar selisihnya."
          : "Saldo dompet saat ini. Bukan pemasukan — tidak masuk laporan.",
        control: html`<div class="amount-input" style="padding:10px 14px"><span>${symbol()}</span><input id="f-initialBalance" name="initialBalance" placeholder="0" style="font-size:var(--fs-lg)" value="${w ? moneyInputValue(w.initialBalance) : ""}" /></div>`,
      })}
      <div class="field"><span class="label">Warna</span>${colorPicker(w ? w.color : "#2563eb")}</div>
      <div class="field"><span class="label">Logo (opsional)</span>${logoPicker(w ? w.logo : "")}</div>
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`<button class="btn" data-close>Batal</button><button class="btn btn--primary" data-save>${editing ? "Simpan perubahan" : "Tambah dompet"}</button>`,
  });
  const form = d.el.querySelector("form");
  bindMoneyInput(form.elements.initialBalance);
  form.onsubmit = (e) => {
    e.preventDefault();
    d.el.querySelector("[data-save]").click();
  };
  d.el.querySelector("[data-save]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      const initial = parseMoney(form.elements.initialBalance.value) || 0;
      const body = {
        name: form.elements.name.value.trim(),
        type: form.elements.type.value,
        color: picked(form, "color") || null,
        logo: picked(form, "logo") || null,
        // Saat mengubah, saldo awal hanya dikirim bila memang diganti.
        ...(!editing || initial !== Math.abs(w.initialBalance) ? { initialBalance: initial } : {}),
      };
      try {
        if (editing) await api.patch("/api/wallets/" + w.id, body);
        else await api.post("/api/wallets", body);
        await loadBoot(true);
        d.close(true);
        toast(editing ? "Dompet diperbarui." : "Dompet ditambahkan.");
      } catch (err) {
        showErrors(form, err);
      }
    });
  return d;
}

function adjustForm(w) {
  const d = dialog({
    title: "Sesuaikan saldo",
    body: html`<form class="stack" novalidate>
      <p class="muted">Saldo ${w.name} di Monify <strong class="num">${money(w.balance, { ccy: w.currency })}</strong>. Masukkan saldo sebenarnya; selisihnya dicatat sebagai penyesuaian (bukan pemasukan atau pengeluaran).</p>
      <div class="field" data-field="targetBalance"><label for="f-target">Saldo sebenarnya</label>
        <div class="amount-input"><span>${symbol(w.currency)}</span><input id="f-target" name="targetBalance" value="${moneyInputValue(w.balance, w.currency)}" autofocus /></div>
        <span class="field__error" role="alert"></span></div>
      <div class="form-grid">
        ${field({ label: "Tanggal", name: "date", control: html`<input class="input" id="f-date" type="date" name="date" value="${today()}" />` })}
        ${field({ label: "Catatan (opsional)", name: "note", control: html`<input class="input" id="f-note" name="note" maxlength="120" placeholder="mis. Selisih kembalian" />` })}
      </div>
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`<button class="btn" data-close>Batal</button><button class="btn btn--primary" data-save>Sesuaikan</button>`,
  });
  const form = d.el.querySelector("form");
  bindMoneyInput(form.elements.targetBalance, w.currency);
  d.el.querySelector("[data-save]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      try {
        await api.post(`/api/wallets/${w.id}/adjust`, { targetBalance: parseMoney(form.elements.targetBalance.value, w.currency) ?? 0, date: form.elements.date.value, note: form.elements.note.value.trim() || null });
        await loadBoot(true);
        d.close(true);
        toast("Saldo disesuaikan.");
      } catch (err) {
        showErrors(form, err);
      }
    });
}

function walletDetail(w) {
  const moved = w.balance - w.initialBalance;
  const d = dialog({
    title: w.name,
    body: html`<div class="stack">
      <div class="row-flex">${walletTile(w, "lg")}<div><div class="num" style="font-size:var(--fs-2xl);font-weight:640;letter-spacing:-0.03em">${money(w.balance, { ccy: w.currency })}</div><div class="muted small">${WALLET_TYPES[w.type] ? WALLET_TYPES[w.type][0] : "Dompet"} · ${w.currency}${w.active ? "" : " · Diarsipkan"}</div></div></div>
      <div class="card" style="padding:var(--s-4);border-radius:var(--r-lg)">
        <div class="between small"><span class="muted">Saldo awal</span><span class="num">${money(w.initialBalance, { ccy: w.currency })}</span></div>
        <div class="between small" style="margin-top:6px"><span class="muted">Total mutasi tercatat</span><span class="num">${money(moved, { ccy: w.currency, sign: true })}</span></div>
      </div>
      <div class="form-grid">
        <button class="btn" data-act="history">${icon("list", "icon--sm")}Lihat transaksi</button>
        <button class="btn" data-act="add" ${w.active ? "" : raw("disabled")}>${icon("plus", "icon--sm")}Transaksi baru</button>
        <button class="btn" data-act="adjust">${icon("gear", "icon--sm")}Sesuaikan saldo</button>
        <button class="btn" data-act="edit">${icon("edit", "icon--sm")}Ubah</button>
        <button class="btn" data-act="archive">${icon("archive", "icon--sm")}${w.active ? "Arsipkan" : "Aktifkan lagi"}</button>
        <button class="btn btn--danger" data-act="delete">${icon("trash", "icon--sm")}Hapus</button>
      </div>
    </div>`,
  });
  d.el.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const a = act.dataset.act;
    if (a === "history") {
      d.close();
      go(`/transactions?walletId=${w.id}&range=all`);
    } else if (a === "add") {
      d.close();
      openTransaction({ preset: { walletId: w.id, fromWalletId: w.id } });
    } else if (a === "adjust") {
      d.close();
      adjustForm(w);
    } else if (a === "edit") {
      d.close();
      walletForm(w);
    } else if (a === "archive") {
      try {
        await api.patch("/api/wallets/" + w.id, { active: !w.active });
        await loadBoot(true);
        d.close();
        toast(w.active ? "Dompet diarsipkan. Riwayatnya tetap tersimpan." : "Dompet diaktifkan kembali.");
      } catch (err) {
        toast(err.message, "error");
      }
    } else if (a === "delete") {
      if (!(await confirmDialog({ title: `Hapus dompet ${w.name}?`, message: "Hanya dompet tanpa transaksi yang bisa dihapus. Dompet yang punya riwayat sebaiknya diarsipkan.", confirmLabel: "Hapus", danger: true }))) return;
      try {
        await api.del("/api/wallets/" + w.id);
        await loadBoot(true);
        d.close();
        toast("Dompet dihapus.");
      } catch (err) {
        toast(err.message, "error", err.code === "WALLET_IN_USE" ? "Tidak bisa dihapus" : "");
      }
    }
  });
}

const skeleton = () => html`<div class="stack" aria-busy="true" aria-label="Memuat dompet">
  <div class="hero">${sk("120px", "0.8em")}<div style="margin-top:12px">${sk("50%", "2.6rem")}</div></div>
  <div class="grid-cards">${[1, 2, 3, 4].map(() => html`<div class="card"><div class="row-flex">${sk("40px", "40px")}<div class="grow">${sk("50%", "0.9em")}<br />${sk("30%", "0.7em")}</div></div><div style="margin-top:22px">${sk("65%", "1.5em")}</div></div>`)}</div>
</div>`;

export default function wallets(view, { params }) {
  let list = [];
  function render(data) {
    list = data.wallets;
    const active = list.filter((w) => w.active);
    const archived = list.filter((w) => !w.active);
    const ccy = boot.user.displayCurrency;
    const total = active.filter((w) => w.currency === ccy).reduce((n, w) => n + w.balance, 0);
    if (!list.length) {
      mount(view, html`<div class="card">${emptyState({ art: emptyArt.wallets, title: "Belum ada dompet", text: "Tambahkan rekening bank, e-wallet, atau uang tunai untuk mulai mencatat.", action: html`<button class="btn btn--primary" data-new>${icon("plus", "icon--sm")}Tambah dompet</button>` })}</div>`);
      return;
    }
    const card = (w) => html`<button class="card card--hover" data-wallet="${w.id}" style="${w.active ? "" : "opacity:.6"}">
      <div class="row-flex">${walletTile(w)}<div class="grow"><div class="row__title truncate">${w.name}</div><div class="row__meta">${WALLET_TYPES[w.type] ? WALLET_TYPES[w.type][0] : "Dompet"}</div></div>${icon("chevron", "icon--sm")}</div>
      <div class="kpi__value num" style="margin-top:var(--s-5)">${money(w.balance, { ccy: w.currency })}</div>
    </button>`;
    const positive = active.filter((w) => w.currency === ccy && w.balance > 0);
    mount(
      view,
      html`<div class="stack stagger">
        <section class="hero">
          <div class="between wrap">
            <div><span class="eyebrow">Total saldo · ${active.length} dompet aktif</span><div class="hero__value num" style="margin-bottom:0">${money(total)}</div></div>
            <div class="row-flex">
              <button class="btn" data-transfer>${icon("swap", "icon--sm")}Transfer</button>
              <button class="btn btn--primary" data-new>${icon("plus", "icon--sm")}Dompet</button>
            </div>
          </div>
        </section>
        <div class="grid-cards">${active.map(card)}</div>
        ${positive.length > 1 ? html`<section class="card"><div class="card__head"><h3>Distribusi saldo</h3></div><div data-donut></div></section>` : ""}
        ${archived.length ? html`<details><summary class="muted" style="cursor:pointer;padding:8px 0">Diarsipkan (${archived.length})</summary><div class="grid-cards" style="margin-top:12px">${archived.map(card)}</div></details>` : ""}
      </div>`
    );
    const el = $("[data-donut]", view);
    if (el) donut(el, foldSlices(positive.map((w) => ({ name: w.name, value: w.balance }))), { centerLabel: "Total saldo" });
  }

  view.onclick = (e) => {
    if (e.target.closest("[data-new]")) return walletForm();
    if (e.target.closest("[data-transfer]")) return openTransaction({ mode: "transfer" });
    const c = e.target.closest("[data-wallet]");
    if (c) walletDetail(list.find((w) => w.id === c.dataset.wallet));
  };
  const part = live(view, () => "/api/wallets", { skeleton, render });
  if (params.get("new")) {
    history.replaceState({}, "", "/wallets");
    walletForm();
  }
  return {
    refresh: part.refresh,
    destroy() {
      part.destroy();
      view.onclick = null;
    },
  };
}
