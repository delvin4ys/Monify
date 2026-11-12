import { html, mount, icon, raw, sk, emptyState, dialog, confirmDialog, toast, field, showErrors, busy, tile, $ } from "../ui.js";
import { live } from "../page.js";
import { api, newKey } from "../api.js";
import { boot, loadBoot } from "../store.js";
import { money, percent, parseMoney, bindMoneyInput, moneyInputValue, today, date as fmtDate, symbol } from "../format.js";
import { emptyArt, piggy } from "../art.js";
import { walletOptions } from "../forms.js";
import { colorPicker, emojiPicker, picked } from "../pickers.js";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function goalForm(g) {
  const editing = Boolean(g);
  const d = dialog({
    title: editing ? "Ubah tujuan" : "Tujuan tabungan baru",
    body: html`<form class="stack" novalidate>
      ${field({ label: "Nama tujuan", name: "name", control: html`<input class="input" id="f-name" name="name" maxlength="60" placeholder="mis. Dana darurat, Laptop baru" value="${g ? g.name : ""}" autofocus />` })}
      <div class="field" data-field="targetAmount"><label for="f-target">Target</label>
        <div class="amount-input"><span>${symbol()}</span><input id="f-target" name="targetAmount" placeholder="0" value="${g ? moneyInputValue(g.targetAmount) : ""}" /></div>
        <span class="field__error" role="alert"></span></div>
      ${field({ label: "Tanggal target (opsional)", name: "targetDate", control: html`<input class="input" id="f-targetDate" type="date" name="targetDate" min="${today()}" value="${(g && g.targetDate) || ""}" />` })}
      ${field({
        label: "Dompet tabungan (opsional)",
        name: "walletId",
        hint: "Bila uang tabungan ini benar-benar disimpan di dompet tertentu, pilih di sini agar setoran bisa memindahkan uang ke sana.",
        control: html`<select class="select" id="f-walletId" name="walletId">${walletOptions(g ? g.walletId : "", { placeholder: "Tanpa dompet khusus (alokasi saja)" })}</select>`,
      })}
      <div class="field"><span class="label">Ikon</span>${emojiPicker(g ? g.icon : "🎯")}</div>
      <div class="field"><span class="label">Warna</span>${colorPicker(g ? g.color : "#22c55e")}</div>
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`<button class="btn" data-close>Batal</button><button class="btn btn--primary" data-save>${editing ? "Simpan" : "Buat tujuan"}</button>`,
  });
  const form = d.el.querySelector("form");
  bindMoneyInput(form.elements.targetAmount);
  d.el.querySelector("[data-save]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      const body = {
        name: form.elements.name.value.trim(),
        targetAmount: parseMoney(form.elements.targetAmount.value) || 0,
        targetDate: form.elements.targetDate.value || null,
        walletId: form.elements.walletId.value || null,
        icon: picked(form, "icon") || null,
        color: picked(form, "color") || null,
      };
      try {
        if (editing) await api.patch("/api/savings/" + g.id, body);
        else await api.post("/api/savings", body);
        d.close(true);
        toast(editing ? "Tujuan diperbarui." : "Tujuan dibuat. Saatnya mulai menabung!");
      } catch (err) {
        showErrors(form, err);
      }
    });
}

/** Setor atau tarik. Menjelaskan beda "alokasi" dan "pemindahan nyata". */
function entryForm(g, type) {
  const deposit = type === "deposit";
  // Satu kunci per form: bila request terkirim ulang, server tidak mencatat dua kali.
  const entryKey = newKey();
  const canMove = Boolean(g.walletId);
  const d = dialog({
    title: deposit ? `Menabung ke ${g.name}` : `Tarik dari ${g.name}`,
    body: html`<form class="stack" novalidate>
      ${deposit ? html`<div data-piggy>${piggy}</div>` : ""}
      <div class="field" data-field="amount"><label for="f-amount" class="sr-only">Jumlah</label>
        <div class="amount-input"><span>${symbol()}</span><input id="f-amount" name="amount" placeholder="0" autofocus /></div>
        <span class="field__hint">${deposit ? `Kurang ${money(g.remaining)} lagi menuju target.` : `Terkumpul ${money(g.savedAmount)}.`}</span>
        <span class="field__error" role="alert"></span></div>
      <div class="form-grid">
        ${field({ label: "Tanggal", name: "date", control: html`<input class="input" id="f-date" type="date" name="date" value="${today()}" />` })}
        ${field({ label: "Catatan (opsional)", name: "note", control: html`<input class="input" id="f-note" name="note" maxlength="140" />` })}
      </div>
      ${canMove
        ? html`${field({
              label: deposit ? "Ambil uang dari dompet" : "Kembalikan uang ke dompet",
              name: "walletId",
              control: html`<select class="select" id="f-walletId" name="walletId">
                <option value="">Tidak memindahkan uang (alokasi saja)</option>
                ${boot.wallets.filter((w) => w.active && w.id !== g.walletId).map((w) => html`<option value="${w.id}">${w.name} — ${money(w.balance, { ccy: w.currency })}</option>`)}
              </select>`,
            })}
            <p class="alert">${icon("info", "icon--sm")}<span><strong>Alokasi saja</strong> hanya menandai uang untuk tujuan ini; saldo dompet tidak berubah. <strong>Memilih dompet</strong> benar-benar memindahkan uang ${deposit ? "ke" : "dari"} ${g.walletName} sebagai transfer — total saldomu tetap sama.</span></p>`
        : html`<p class="alert">${icon("info", "icon--sm")}<span>Tujuan ini berupa <strong>alokasi</strong>: mencatat berapa yang kamu sisihkan tanpa mengubah saldo dompet. Ingin setoran benar-benar memindahkan uang? Atur <em>dompet tabungan</em> lewat Ubah tujuan.</span></p>`}
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`<button class="btn" data-close>Batal</button><button class="btn btn--primary" data-save>${deposit ? "Tabung" : "Tarik"}</button>`,
  });
  const form = d.el.querySelector("form");
  bindMoneyInput(form.elements.amount);
  form.onsubmit = (e) => {
    e.preventDefault();
    d.el.querySelector("[data-save]").click();
  };
  d.el.querySelector("[data-save]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      const amount = parseMoney(form.elements.amount.value) || 0;
      try {
        const r = await api.post(`/api/savings/${g.id}/entries`, { type, amount, date: form.elements.date.value, note: form.elements.note.value.trim() || null, walletId: form.elements.walletId ? form.elements.walletId.value || null : null }, { key: entryKey });
        if (r.movedMoney) await loadBoot(true).catch(() => {});
        const msg = r.justAchieved ? `Target ${g.name} tercapai! 🎉` : deposit ? `${money(amount)} masuk ke ${g.name}.` : `${money(amount)} ditarik dari ${g.name}.`;
        const pig = d.el.querySelector(".piggy");
        if (deposit && pig && !reduceMotion()) {
          // Koin masuk celengan, lalu progres bertambah di halaman.
          d.el.querySelector(".dialog__foot").hidden = true;
          pig.classList.add("is-dropping");
          setTimeout(() => {
            d.close(true);
            toast(msg);
          }, 1350);
        } else {
          d.close(true);
          toast(msg);
        }
      } catch (err) {
        showErrors(form, err);
      }
    });
}

async function goalDetail(id) {
  let g;
  try {
    g = (await api.get("/api/savings/" + id)).goal;
  } catch (err) {
    return toast(err.message, "error");
  }
  const d = dialog({
    title: `${g.icon} ${g.name}`,
    wide: true,
    body: html`<div class="stack">
      <div class="between wrap"><div><div class="num" style="font-size:var(--fs-2xl);font-weight:640;letter-spacing:-0.03em">${money(g.savedAmount)}</div><div class="muted small">dari ${money(g.targetAmount)} · ${percent(g.percent, 1)}</div></div>
        ${g.status === "ACHIEVED" ? html`<span class="badge badge--pos">Tercapai 🎉</span>` : g.status === "ARCHIVED" ? html`<span class="badge">Diarsipkan</span>` : ""}</div>
      <div class="progress progress--lg progress--pos" style="--p:${g.percent}%" role="progressbar" aria-valuenow="${Math.round(g.percent)}" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      <div class="bento">
        <div class="col-4 col-half-sm"><div class="eyebrow">Kurang</div><div class="num" style="font-weight:620">${money(g.remaining)}</div></div>
        <div class="col-4 col-half-sm"><div class="eyebrow">Tanggal target</div><div style="font-weight:620">${g.targetDate ? fmtDate(g.targetDate) : "—"}</div>${g.monthlyNeeded ? html`<div class="tiny muted">perlu ${money(g.monthlyNeeded)}/bulan</div>` : ""}</div>
        <div class="col-4"><div class="eyebrow">Perkiraan selesai</div><div style="font-weight:620">${g.estimatedCompletion ? fmtDate(g.estimatedCompletion) : "—"}</div><div class="tiny muted">${g.estimatedCompletion ? "berdasarkan laju menabungmu" : "muncul setelah ada setoran"}</div></div>
      </div>
      <p class="alert">${icon(g.walletId ? "bank" : "info", "icon--sm")}<span>${g.walletId ? html`Uang tabungan ini disimpan di dompet <strong>${g.walletName}</strong>. Setoran dari dompet lain tercatat sebagai transfer.` : "Tujuan ini berupa alokasi: tidak mengubah saldo dompet mana pun."}</span></p>
      <div class="row-flex wrap">
        <button class="btn btn--primary" data-act="deposit" ${g.status === "ARCHIVED" ? raw("disabled") : ""}>${icon("plus", "icon--sm")}Tabung</button>
        <button class="btn" data-act="withdraw" ${g.savedAmount > 0 && g.status !== "ARCHIVED" ? "" : raw("disabled")}>${icon("down", "icon--sm")}Tarik</button>
        <button class="btn" data-act="edit">${icon("edit", "icon--sm")}Ubah</button>
        <button class="btn" data-act="archive">${icon("archive", "icon--sm")}${g.status === "ARCHIVED" ? "Aktifkan" : "Arsipkan"}</button>
        <button class="btn btn--danger" data-act="delete">${icon("trash", "icon--sm")}Hapus</button>
      </div>
      <div><h3 style="margin-bottom:8px">Riwayat</h3>
        ${g.entries.length
          ? html`<div class="list" style="margin:0 calc(var(--s-5) * -1)">${g.entries.map(
              (e) => html`<div class="row"><span class="tile tile--sm" style="--c:var(--${e.amount > 0 ? "pos" : "warn"})">${icon(e.amount > 0 ? "up" : "down", "icon--sm")}</span>
                <span class="grow"><span class="row__title" style="display:block">${e.amount > 0 ? "Setoran" : "Penarikan"}${e.note ? " · " + e.note : ""}</span><span class="row__meta" style="display:block">${fmtDate(e.date)} · ${e.movedMoney ? "memindahkan uang" : "alokasi"}</span></span>
                <span class="num row__amount ${e.amount > 0 ? "pos" : ""}">${money(e.amount, { sign: true })}</span>
                <button class="btn btn--ghost btn--icon btn--sm" data-del-entry="${e.id}" aria-label="Hapus catatan ini">${icon("trash", "icon--sm")}</button></div>`
            )}</div>`
          : html`<p class="muted small">Belum ada setoran.</p>`}
      </div>
    </div>`,
  });
  d.el.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del-entry]");
    if (del) {
      if (!(await confirmDialog({ title: "Hapus catatan ini?", message: "Bila catatan ini memindahkan uang, transfernya ikut dibatalkan.", confirmLabel: "Hapus", danger: true }))) return;
      try {
        await api.del(`/api/savings/${g.id}/entries/${del.dataset.delEntry}`);
        await loadBoot(true).catch(() => {});
        d.close();
        toast("Catatan dihapus.");
        goalDetail(id);
      } catch (err) {
        toast(err.message, "error");
      }
      return;
    }
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const a = act.dataset.act;
    if (a === "deposit" || a === "withdraw") {
      d.close();
      entryForm(g, a);
    } else if (a === "edit") {
      d.close();
      goalForm(g);
    } else if (a === "archive") {
      try {
        await api.patch("/api/savings/" + g.id, { archived: g.status !== "ARCHIVED" });
        d.close();
        toast(g.status === "ARCHIVED" ? "Tujuan diaktifkan." : "Tujuan diarsipkan.");
      } catch (err) {
        toast(err.message, "error");
      }
    } else if (a === "delete") {
      if (!(await confirmDialog({ title: `Hapus tujuan ${g.name}?`, message: "Riwayat setoran tujuan ini ikut terhapus. Uang yang sudah dipindahkan ke dompet tabungan tetap berada di sana.", confirmLabel: "Hapus", danger: true }))) return;
      try {
        await api.del("/api/savings/" + g.id);
        d.close();
        toast("Tujuan dihapus.");
      } catch (err) {
        toast(err.message, "error");
      }
    }
  });
}

const skeleton = () => html`<div class="stack" aria-busy="true" aria-label="Memuat tabungan">
  <div class="hero">${sk("130px", "0.8em")}<div style="margin:12px 0">${sk("46%", "2.6rem")}</div>${sk("100%", "12px")}</div>
  <div class="grid-cards">${[1, 2, 3].map(() => html`<div class="card"><div class="row-flex">${sk("52px", "52px")}<div class="grow">${sk("60%", "0.9em")}<br />${sk("40%", "0.7em")}</div></div><div style="margin:20px 0 8px">${sk("100%", "8px")}</div>${sk("50%", "0.8em")}</div>`)}</div>
</div>`;

export default function savings(view, { params }) {
  function render(data) {
    const goals = data.goals;
    if (!goals.length) {
      mount(
        view,
        html`<div class="card">${emptyState({
          art: html`<div style="width:160px;margin:-20px 0 0 -20px">${piggy}</div>`,
          title: "Mulai menabung untuk sesuatu",
          text: "Buat tujuan — dana darurat, laptop baru, liburan — lalu pantau progresnya setiap kali kamu menyisihkan uang.",
          action: html`<button class="btn btn--primary" data-new>${icon("plus", "icon--sm")}Buat tujuan</button>`,
        })}</div>`
      );
      return;
    }
    const pct = data.totals.target ? Math.min((data.totals.saved / data.totals.target) * 100, 100) : 0;
    mount(
      view,
      html`<div class="stack stagger">
        <section class="hero">
          <div class="between wrap">
            <div><span class="eyebrow">Total terkumpul</span><div class="hero__value num" style="margin-bottom:var(--s-2)">${money(data.totals.saved)}</div><div class="muted small num">dari target ${money(data.totals.target)} · ${percent(pct, 1)}</div></div>
            <button class="btn btn--primary" data-new>${icon("plus", "icon--sm")}Tujuan</button>
          </div>
          <div class="progress progress--lg progress--pos" style="--p:${pct}%;margin-top:var(--s-4)" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Progres seluruh tabungan"><i></i></div>
        </section>
        <div class="grid-cards">
          ${goals.map(
            (g) => html`<div class="card card--hover" style="${g.status === "ARCHIVED" ? "opacity:.6" : ""}">
              <button data-goal="${g.id}" style="all:unset;display:block;width:100%;cursor:pointer">
                <div class="row-flex">${tile({ glyph: g.icon, color: g.color, size: "lg" })}<div class="grow"><div class="row__title truncate">${g.name}</div><div class="row__meta truncate">${g.status === "ACHIEVED" ? "Tercapai 🎉" : g.targetDate ? "Target " + fmtDate(g.targetDate) : g.walletName || "Alokasi"}</div></div><span class="num" style="font-weight:630">${percent(g.percent)}</span></div>
                <div class="progress progress--pos" style="--p:${g.percent}%;margin:var(--s-4) 0 8px" role="progressbar" aria-valuenow="${Math.round(g.percent)}" aria-valuemin="0" aria-valuemax="100" aria-label="Progres ${g.name}"><i></i></div>
                <div class="between small"><span class="num">${money(g.savedAmount)}</span><span class="num muted">${money(g.targetAmount)}</span></div>
              </button>
              ${g.status === "ACTIVE" ? html`<button class="btn btn--sm btn--block" style="margin-top:var(--s-4)" data-deposit="${g.id}">${icon("piggy", "icon--sm")}Tabung</button>` : ""}
            </div>`
          )}
        </div>
      </div>`
    );
    view._goals = goals;
  }
  view.onclick = (e) => {
    if (e.target.closest("[data-new]")) return goalForm();
    const dep = e.target.closest("[data-deposit]");
    if (dep) return entryForm(view._goals.find((g) => g.id === dep.dataset.deposit), "deposit");
    const g = e.target.closest("[data-goal]");
    if (g) goalDetail(g.dataset.goal);
  };
  const part = live(view, () => "/api/savings", { skeleton, render });
  if (params.get("new")) {
    history.replaceState({}, "", "/savings");
    goalForm();
  }
  return {
    refresh: part.refresh,
    destroy() {
      part.destroy();
      view.onclick = null;
      view._goals = null;
    },
  };
}
