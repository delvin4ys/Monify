/**
 * Form transaksi terpadu: pengeluaran, pemasukan, transfer (antar dompet sendiri
 * atau ke/dari orang lain), dan pembayaran hutang/piutang — semuanya satu kali
 * input. Termasuk alur pindai struk dengan AI: hasil AI hanya mengisi form;
 * tidak ada yang tersimpan sebelum pengguna menekan Simpan.
 */
import { html, mount, raw, icon, tile, dialog, confirmDialog, toast, field, showErrors, clearErrors, busy, $, $$ } from "./ui.js";
import { api, newKey, ApiError } from "./api.js";
import { boot, loadBoot, activeWallets, fetchUrl } from "./store.js";
import { money, parseMoney, bindMoneyInput, moneyInputValue, today, date as fmtDate, symbol } from "./format.js";
import { celebrate } from "./art.js";

export const go = (path) => window.dispatchEvent(new CustomEvent("monify:navigate", { detail: path }));
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const WALLET_TYPES = { cash: ["Tunai", "cash"], bank: ["Bank", "bank"], ewallet: ["E-wallet", "phone"], savings: ["Tabungan", "piggy"], investment: ["Investasi", "trend"], other: ["Lainnya", "wallet"] };
export const walletTile = (w, size) => tile({ glyph: w && w.logo, color: w && w.color, size, fallback: (w && WALLET_TYPES[w.type] ? WALLET_TYPES[w.type][1] : "wallet") });

export function walletOptions(selected, { placeholder } = {}) {
  const list = boot.wallets.filter((w) => w.active || w.id === selected);
  return html`${placeholder ? html`<option value="">${placeholder}</option>` : ""}${list.map((w) => html`<option value="${w.id}" ${w.id === selected ? raw("selected") : ""}>${w.name} — ${money(w.balance, { ccy: w.currency })}</option>`)}`;
}

/** Kategori dikelompokkan per induk memakai <optgroup> (pemilih native: cepat & ramah mobile). */
export function categoryOptions(type, selected) {
  const cats = boot.categories.filter((c) => c.type === type && (!c.archived || c.id === selected));
  const groups = new Map();
  for (const c of cats) {
    const p = boot.categoryParents.find((x) => x.id === c.parentId);
    const key = p ? p.name : "Lainnya";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return html`<option value="">Pilih kategori</option>${[...groups.entries()].map(
      ([name, list]) => html`<optgroup label="${name}">${list.map((c) => html`<option value="${c.id}" ${c.id === selected ? raw("selected") : ""}>${c.icon} ${c.name}</option>`)}</optgroup>`
    )}`;
}

const MODES = [
  ["expense", "Pengeluaran"],
  ["income", "Pemasukan"],
  ["transfer", "Transfer"],
  ["debt", "Hutang"],
];

async function ensureAiConsent() {
  if (boot.user.aiConsent) return true;
  const d = dialog({
    title: "Pindai struk dengan AI",
    body: html`<div class="stack">
      <p class="muted">Foto struk akan dikirim ke layanan AI untuk dibaca. Yang dikirim hanya <strong>gambar struk</strong>, daftar <strong>nama kategori</strong>, dan <strong>nama dompet</strong> kamu — tanpa saldo, email, atau data lain.</p>
      <p class="muted">Hasilnya hanya mengisi form. Tidak ada transaksi yang disimpan sebelum kamu memeriksanya dan menekan Simpan. Persetujuan ini bisa dicabut di Pengaturan.</p>
    </div>`,
    footer: html`<button class="btn" data-close>Tidak sekarang</button><button class="btn btn--primary" data-ok>Setuju &amp; lanjutkan</button>`,
  });
  d.el.querySelector("[data-ok]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      try {
        const r = await api.patch("/api/user", { aiConsent: true }, { quiet: true });
        boot.user = r.user;
        d.close(true);
      } catch (err) {
        toast(err.message, "error");
      }
    });
  return (await d.closed) === true;
}

/**
 * @param {{ mode?: string, tx?: object, preset?: object }} opts
 *   tx: transaksi biasa (expense/income/transfer eksternal) yang diedit.
 */
export function openTransaction({ mode = "expense", tx = null, preset = {} } = {}) {
  const editing = Boolean(tx);
  const state = {
    mode: tx ? tx.kind : mode,
    transferScope: tx && tx.kind === "transfer" ? "external" : preset.transferScope || "internal",
    key: newKey(),
    scan: null, // { draft, attachmentKey, previewUrl }
    saved: false,
    debts: null,
  };
  const defWallet = preset.walletId || (tx && tx.walletId) || boot.user.defaultWalletId || (activeWallets()[0] || {}).id || "";

  const d = dialog({
    title: editing ? "Ubah transaksi" : "Transaksi baru",
    body: html`<form class="stack" novalidate>
      ${editing
        ? ""
        : html`<div class="segmented segmented--block" data-modes>${MODES.map(([k, l]) => html`<button type="button" data-mode="${k}" aria-pressed="${k === state.mode}">${l}</button>`)}</div>`}
      <div data-scan></div>
      <div class="field" data-field="amount">
        <label for="f-amount" class="sr-only">Jumlah</label>
        <div class="amount-input"><span>${symbol()}</span><input id="f-amount" name="amount" placeholder="0" aria-label="Jumlah" value="${tx ? moneyInputValue(tx.amount) : preset.amount ? moneyInputValue(preset.amount) : ""}" autofocus /></div>
        <span class="field__error" role="alert"></span>
      </div>
      <div class="stack" data-fields></div>
      <div class="form-grid">
        ${field({ label: "Tanggal", name: "date", control: html`<input class="input" id="f-date" name="date" type="date" max="2100-12-31" value="${(tx && tx.date) || preset.date || today()}" />` })}
        ${field({ label: "Deskripsi", name: "title", control: html`<input class="input" id="f-title" name="title" maxlength="140" placeholder="mis. Makan siang" value="${(tx && tx.title) || preset.title || ""}" />` })}
      </div>
      <div data-extra></div>
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`${editing ? html`<button class="btn btn--danger" data-delete style="margin-right:auto">${icon("trash", "icon--sm")}<span class="hide-sm">Hapus</span></button>` : ""}
      <button class="btn" data-close>Batal</button><button class="btn btn--primary" data-save>${editing ? "Simpan perubahan" : "Simpan"}</button>`,
    onClose: () => {
      // Struk yang dipindai tetapi tidak jadi disimpan: gambar dihapus dari server.
      if (state.scan && !state.saved) api.del("/api/attachments?key=" + encodeURIComponent(state.scan.attachmentKey), undefined, { quiet: true }).catch(() => {});
      if (state.scan && state.scan.previewUrl) URL.revokeObjectURL(state.scan.previewUrl);
    },
  });
  const form = d.el.querySelector("form");
  const fields = form.querySelector("[data-fields]");
  const extra = form.querySelector("[data-extra]");
  const scanBox = form.querySelector("[data-scan]");
  const amountEl = form.elements.amount;
  bindMoneyInput(amountEl);

  const setTitleLabel = (label, placeholder) => {
    const f = form.querySelector('[data-field="title"]');
    f.querySelector("label").textContent = label;
    f.querySelector("input").placeholder = placeholder;
  };

  function renderScan() {
    const can = !editing && state.mode === "expense" && boot.features.receiptScan;
    if (!can) return mount(scanBox, "");
    if (!state.scan) {
      return mount(
        scanBox,
        html`<button type="button" class="btn btn--block" data-scan-btn>${icon("camera")}Pindai struk dengan AI</button>
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden data-scan-file />`
      );
    }
    const dr = state.scan.draft;
    const badge = (k, label) => html`<span class="badge ${dr.confidence[k] === "high" ? "badge--pos" : "badge--warn"}">${label}: ${dr.confidence[k] === "high" ? "yakin" : dr.confidence[k] === "medium" ? "cukup yakin" : "tidak yakin"}</span>`;
    mount(
      scanBox,
      html`<div class="alert alert--accent" style="display:grid;gap:12px">
        <div class="row-flex" style="align-items:flex-start">
          <img src="${state.scan.previewUrl}" alt="Pratinjau struk" style="width:64px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border)" />
          <div class="grow stack-sm">
            <strong>Hasil pindai — periksa dulu sebelum menyimpan</strong>
            <span class="muted small">Belum ada yang tersimpan. Kolom bertanda oranye perlu kamu pastikan.</span>
            <div class="row-flex wrap" style="gap:6px">${badge("total", "Total")}${badge("date", "Tanggal")}${badge("merchant", "Toko")}${badge("category", "Kategori")}</div>
          </div>
          <button type="button" class="btn btn--ghost btn--icon btn--sm" data-scan-discard aria-label="Buang hasil pindai">${icon("x", "icon--sm")}</button>
        </div>
        ${dr.items.length || dr.tax || dr.serviceCharge || dr.paymentMethod
          ? html`<details class="small"><summary class="muted" style="cursor:pointer">Rincian terbaca (${dr.items.length} item)</summary>
              <div class="stack-sm" style="margin-top:8px">
                ${dr.items.map((i) => html`<div class="between"><span class="truncate">${i.quantity ? i.quantity + "× " : ""}${i.name}</span><span class="num">${i.price ? money(i.price) : "—"}</span></div>`)}
                ${dr.tax ? html`<div class="between muted"><span>Pajak</span><span class="num">${money(dr.tax)}</span></div>` : ""}
                ${dr.serviceCharge ? html`<div class="between muted"><span>Service</span><span class="num">${money(dr.serviceCharge)}</span></div>` : ""}
                ${dr.paymentMethod ? html`<div class="between muted"><span>Metode bayar</span><span>${dr.paymentMethod}</span></div>` : ""}
                ${dr.notes ? html`<p class="muted">${dr.notes}</p>` : ""}
              </div></details>`
          : ""}
      </div>`
    );
  }

  function renderFields() {
    const m = state.mode;
    if (m === "expense" || m === "income") {
      setTitleLabel("Deskripsi", m === "income" ? "mis. Gaji bulan ini" : "mis. Makan siang");
      mount(
        fields,
        html`<div class="form-grid">
          ${field({ label: "Dompet", name: "walletId", control: html`<select class="select" id="f-walletId" name="walletId">${walletOptions((tx && tx.walletId) || (state.scan && state.scan.draft.suggestedWalletId) || defWallet, { placeholder: "Pilih dompet" })}</select>` })}
          ${field({ label: "Kategori", name: "categoryId", control: html`<select class="select" id="f-categoryId" name="categoryId">${categoryOptions(m, (tx && tx.kind === m && tx.categoryId) || (state.scan && state.scan.draft.suggestedCategoryId) || preset.categoryId)}</select>` })}
        </div>`
      );
      mount(
        extra,
        html`<details ${tx && (tx.relatedParty || tx.status === "pending" || tx.hasAttachment) ? raw("open") : ""}>
          <summary class="muted small" style="cursor:pointer;padding:4px 0">Opsi lain</summary>
          <div class="form-grid" style="margin-top:12px">
            ${field({ label: m === "income" ? "Dari siapa (opsional)" : "Dibayar ke (opsional)", name: "relatedParty", control: html`<input class="input" id="f-relatedParty" name="relatedParty" maxlength="80" value="${(tx && tx.relatedParty) || ""}" />` })}
            ${field({ label: "Status", name: "status", control: html`<select class="select" id="f-status" name="status"><option value="success">Selesai</option><option value="pending" ${tx && tx.status === "pending" ? raw("selected") : ""}>Tertunda (belum mengubah saldo)</option></select>` })}
            ${state.scan
              ? ""
              : boot.features.storage === "none"
              ? ""
              : html`<div class="field span-2" data-field="file">
                  <label for="f-file">Lampiran (JPG, PNG, WebP, PDF — maks 5 MB)</label>
                  <input class="input" id="f-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="padding:9px 12px" />
                  ${tx && tx.hasAttachment
                    ? html`<span class="field__hint"><a href="${tx.legacyImageUrl || `/api/transactions/${tx.id}/attachment`}" target="_blank" rel="noopener">${icon("clip", "icon--sm")} Lihat lampiran saat ini</a></span>`
                    : ""}
                  <span class="field__error" role="alert"></span>
                </div>`}
          </div>
        </details>`
      );
    } else if (m === "transfer") {
      const internal = state.transferScope === "internal" && !editing;
      setTitleLabel(internal ? "Catatan (opsional)" : "Deskripsi", internal ? "mis. Isi saldo" : "mis. Titip uang ke Budi");
      mount(
        fields,
        html`${editing
            ? ""
            : html`<div class="segmented segmented--block" data-scopes>
                <button type="button" data-scope="internal" aria-pressed="${internal}">Antar dompet saya</button>
                <button type="button" data-scope="external" aria-pressed="${!internal}">Ke / dari orang lain</button>
              </div>`}
          ${internal
            ? html`<div class="form-grid">
                  ${field({ label: "Dari dompet", name: "fromWalletId", control: html`<select class="select" id="f-fromWalletId" name="fromWalletId">${walletOptions(preset.fromWalletId || defWallet, { placeholder: "Pilih dompet asal" })}</select>` })}
                  ${field({ label: "Ke dompet", name: "toWalletId", control: html`<select class="select" id="f-toWalletId" name="toWalletId">${walletOptions(preset.toWalletId || "", { placeholder: "Pilih dompet tujuan" })}</select>` })}
                </div>
                <p class="alert">${icon("swap", "icon--sm")}<span>Satu kali input: saldo dompet asal berkurang dan dompet tujuan bertambah bersamaan. Tidak dihitung sebagai pemasukan maupun pengeluaran.</span></p>`
            : html`<div class="form-grid">
                  ${field({ label: "Arah", name: "direction", control: html`<select class="select" id="f-direction" name="direction"><option value="out">Uang keluar</option><option value="in" ${tx && tx.direction === "in" ? raw("selected") : ""}>Uang masuk</option></select>` })}
                  ${field({ label: "Dompet", name: "walletId", control: html`<select class="select" id="f-walletId" name="walletId">${walletOptions((tx && tx.walletId) || defWallet, { placeholder: "Pilih dompet" })}</select>` })}
                  ${field({ cls: "span-2", label: "Nama penerima / pengirim", name: "counterparty", control: html`<input class="input" id="f-counterparty" name="counterparty" maxlength="80" value="${(tx && tx.counterparty) || ""}" />` })}
                </div>
                <p class="alert">${icon("info", "icon--sm")}<span>Untuk uang yang berpindah tetapi <strong>bukan pengeluaran</strong> (titipan, talangan). Tidak masuk laporan. Bila ini memang pengeluaran — mis. kirim uang bulanan ke keluarga — catat lewat tab Pengeluaran.</span></p>`}`
      );
      mount(extra, "");
    } else {
      setTitleLabel("Catatan (opsional)", "mis. Cicilan ke-2");
      const list = state.debts;
      mount(
        fields,
        list === null
          ? html`<div class="stack-sm" aria-hidden="true"><span class="sk" style="height:44px"></span><span class="sk" style="height:44px"></span></div>`
          : list.length === 0
            ? html`<p class="alert">${icon("info", "icon--sm")}<span>Belum ada hutang atau piutang yang berjalan. <a href="/debts?new=1" data-go>Catat yang baru</a>.</span></p>`
            : html`${field({
                  label: "Untuk catatan",
                  name: "debtId",
                  control: html`<select class="select" id="f-debtId" name="debtId">${list.map(
                    (x) => html`<option value="${x.id}" ${x.id === preset.debtId ? raw("selected") : ""}>${x.type === "PAYABLE" ? "Bayar hutang ke" : "Terima dari"} ${x.personName} — sisa ${money(x.outstanding)}</option>`
                  )}</select>`,
                })}
                ${field({ label: "Dompet", name: "walletId", control: html`<select class="select" id="f-walletId" name="walletId">${walletOptions(defWallet, { placeholder: "Pilih dompet" })}</select>` })}
                <p class="alert">${icon("handshake", "icon--sm")}<span>Sisa hutang, riwayat pembayaran, dan saldo dompet diperbarui sekaligus. Pembayaran pokok tidak dihitung sebagai pengeluaran. <a href="/debts?new=1" data-go>Catat hutang/piutang baru</a></span></p>`
      );
      mount(extra, "");
      if (list === null) {
        fetchUrl("/api/debts?status=OPEN")
          .then((r) => {
            state.debts = r.debts;
            if (state.mode === "debt") renderFields();
          })
          .catch(() => {
            state.debts = [];
            if (state.mode === "debt") renderFields();
          });
      }
    }
    renderScan();
    markReview();
  }

  function markReview() {
    $$(".needs-review", form).forEach((f) => f.classList.remove("needs-review"));
    if (!state.scan || state.mode !== "expense") return;
    const map = { total: "amount", date: "date", merchant: "title", category: "categoryId" };
    for (const k of state.scan.draft.needsReview) {
      const f = form.querySelector(`[data-field="${map[k]}"]`);
      if (f) f.classList.add("needs-review");
    }
  }

  async function scanFile(file) {
    if (!file) return;
    if (!(await ensureAiConsent())) return;
    mount(scanBox, html`<div class="alert" aria-live="polite"><span class="spinner"></span><span>Membaca struk… biasanya beberapa detik.</span></div>`);
    try {
      const r = await api.upload("/api/receipts/scan?today=" + today(), file, { quiet: true });
      state.scan = { draft: r.draft, attachmentKey: r.attachmentKey, previewUrl: URL.createObjectURL(file) };
      const dr = r.draft;
      if (dr.total) amountEl.value = moneyInputValue(dr.total);
      if (dr.date) form.elements.date.value = dr.date;
      if (dr.merchant) form.elements.title.value = dr.merchant;
      renderFields();
      toast("Struk terbaca. Periksa hasilnya lalu simpan.", "info");
    } catch (err) {
      state.scan = null;
      renderScan();
      // Fallback manual: form tetap bisa diisi seperti biasa.
      toast(err.message, "error", "Pindai struk gagal");
    }
  }

  form.addEventListener("click", (e) => {
    const modeBtn = e.target.closest("[data-mode]");
    if (modeBtn) {
      state.mode = modeBtn.dataset.mode;
      $$("[data-mode]", form).forEach((b) => b.setAttribute("aria-pressed", String(b === modeBtn)));
      clearErrors(form);
      renderFields();
      return;
    }
    const scope = e.target.closest("[data-scope]");
    if (scope) {
      state.transferScope = scope.dataset.scope;
      renderFields();
      return;
    }
    if (e.target.closest("[data-scan-btn]")) form.querySelector("[data-scan-file]").click();
    if (e.target.closest("[data-scan-discard]")) {
      api.del("/api/attachments?key=" + encodeURIComponent(state.scan.attachmentKey), undefined, { quiet: true }).catch(() => {});
      URL.revokeObjectURL(state.scan.previewUrl);
      state.scan = null;
      renderFields();
    }
    const link = e.target.closest("[data-go]");
    if (link) {
      e.preventDefault();
      d.close();
      go(link.getAttribute("href"));
    }
  });
  form.addEventListener("change", (e) => {
    if (e.target.matches("[data-scan-file]")) scanFile(e.target.files[0]);
  });
  form.addEventListener("input", (e) => {
    const f = e.target.closest(".field");
    if (f) f.classList.remove("needs-review", "is-invalid");
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    d.el.querySelector("[data-save]").click();
  });

  async function save() {
    clearErrors(form);
    const el = form.elements;
    const amount = parseMoney(amountEl.value);
    const val = (n) => (el[n] ? el[n].value.trim() : "");
    const fail = (fieldName, message) => {
      throw new ApiError(message, { code: "VALIDATION_ERROR", fields: { [fieldName]: message } });
    };
    if (!amount || amount <= 0) fail("amount", "Isi jumlah yang lebih besar dari nol.");
    if (!val("date")) fail("date", "Pilih tanggal.");
    const m = state.mode;
    let result;
    if (m === "expense" || m === "income") {
      if (!val("walletId")) fail("walletId", "Pilih dompet.");
      if (!val("categoryId")) fail("categoryId", "Pilih kategori.");
      if (!val("title")) fail("title", "Isi deskripsi.");
      let attachmentKey = state.scan ? state.scan.attachmentKey : undefined;
      const file = el.file && el.file.files[0];
      if (file) attachmentKey = (await api.upload("/api/attachments", file, { quiet: true })).attachmentKey;
      const body = {
        kind: m,
        amount,
        walletId: val("walletId"),
        categoryId: val("categoryId"),
        title: val("title"),
        date: val("date"),
        status: val("status") || "success",
        relatedParty: val("relatedParty") || null,
        ...(attachmentKey ? { attachmentKey } : {}),
      };
      result = editing ? await api.patch("/api/transactions/" + tx.id, body) : await api.post("/api/transactions", { ...body, source: state.scan ? "receipt_ai" : "manual" }, { key: state.key });
    } else if (m === "transfer" && state.transferScope === "internal" && !editing) {
      if (!val("fromWalletId")) fail("fromWalletId", "Pilih dompet asal.");
      if (!val("toWalletId")) fail("toWalletId", "Pilih dompet tujuan.");
      if (val("fromWalletId") === val("toWalletId")) fail("toWalletId", "Dompet tujuan harus berbeda.");
      result = await api.post("/api/transfers", { fromWalletId: val("fromWalletId"), toWalletId: val("toWalletId"), amount, date: val("date"), note: val("title") || null }, { key: state.key });
    } else if (m === "transfer") {
      if (!val("walletId")) fail("walletId", "Pilih dompet.");
      if (!val("counterparty")) fail("counterparty", "Isi nama penerima / pengirim.");
      if (!val("title")) fail("title", "Isi deskripsi.");
      const body = { kind: "transfer", direction: val("direction"), amount, walletId: val("walletId"), counterparty: val("counterparty"), title: val("title"), date: val("date") };
      result = editing ? await api.patch("/api/transactions/" + tx.id, body) : await api.post("/api/transactions", body, { key: state.key });
    } else {
      if (!val("debtId")) fail("debtId", "Pilih catatan hutang/piutang.");
      if (!val("walletId")) fail("walletId", "Pilih dompet.");
      result = await api.post(`/api/debts/${val("debtId")}/payments`, { amount, date: val("date"), walletId: val("walletId"), note: val("title") || null }, { key: state.key });
    }
    state.saved = true;
    await loadBoot(true).catch(() => {});
    return result;
  }

  d.el.querySelector("[data-save]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      try {
        const r = await save();
        const label = { expense: "Pengeluaran dicatat", income: "Pemasukan dicatat", transfer: "Transfer berhasil", debt: r && r.debt && r.debt.status === "PAID" ? "Lunas! 🎉" : "Pembayaran dicatat" }[state.mode];
        if (editing || reduceMotion()) {
          d.close(true);
          toast(editing ? "Perubahan disimpan." : label + ".");
          return;
        }
        // Umpan balik singkat di tempat, lalu tutup.
        mount(d.el.querySelector(".dialog__body"), celebrate(label, state.mode === "debt" && r.debt ? `Sisa ${money(r.debt.outstanding)}` : `${money(parseMoney(amountEl.value) || 0)}`));
        d.el.querySelector(".dialog__foot").hidden = true;
        setTimeout(() => d.close(true), 950);
      } catch (err) {
        showErrors(form, err);
      }
    });

  const del = d.el.querySelector("[data-delete]");
  if (del) {
    del.onclick = async () => {
      if (!(await confirmDialog({ title: "Hapus transaksi?", message: `"${tx.title}" sebesar ${money(tx.amount)} akan dihapus dan saldo dompet dikembalikan.`, confirmLabel: "Hapus", danger: true }))) return;
      try {
        await api.del("/api/transactions/" + tx.id);
        await loadBoot(true).catch(() => {});
        d.close(true);
        toast("Transaksi dihapus.");
      } catch (err) {
        toast(err.message, "error");
      }
    };
  }

  renderFields();
  return d;
}

/** Ubah transfer antar dompet yang sudah ada. */
export async function openTransferEdit(transferId) {
  let t;
  try {
    t = (await api.get("/api/transfers/" + transferId)).transfer;
  } catch (err) {
    return toast(err.message, "error");
  }
  const d = dialog({
    title: "Ubah transfer",
    body: html`<form class="stack" novalidate>
      <div class="field" data-field="amount"><div class="amount-input"><span>${symbol()}</span><input name="amount" aria-label="Jumlah" value="${moneyInputValue(t.amount)}" autofocus /></div><span class="field__error" role="alert"></span></div>
      <div class="form-grid">
        ${field({ label: "Dari dompet", name: "fromWalletId", control: html`<select class="select" id="f-fromWalletId" name="fromWalletId">${walletOptions(t.fromWalletId)}</select>` })}
        ${field({ label: "Ke dompet", name: "toWalletId", control: html`<select class="select" id="f-toWalletId" name="toWalletId">${walletOptions(t.toWalletId)}</select>` })}
        ${field({ label: "Tanggal", name: "date", control: html`<input class="input" id="f-date" type="date" name="date" value="${t.date}" />` })}
        ${field({ label: "Catatan", name: "note", control: html`<input class="input" id="f-note" name="note" maxlength="140" value="${t.note || ""}" />` })}
      </div>
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`<button class="btn btn--danger" data-delete style="margin-right:auto">${icon("trash", "icon--sm")}<span class="hide-sm">Hapus</span></button><button class="btn" data-close>Batal</button><button class="btn btn--primary" data-save>Simpan perubahan</button>`,
  });
  const form = d.el.querySelector("form");
  bindMoneyInput(form.elements.amount);
  d.el.querySelector("[data-save]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      try {
        const el = form.elements;
        await api.patch("/api/transfers/" + t.id, { amount: parseMoney(el.amount.value) || 0, fromWalletId: el.fromWalletId.value, toWalletId: el.toWalletId.value, date: el.date.value, note: el.note.value.trim() || null });
        await loadBoot(true).catch(() => {});
        d.close(true);
        toast("Transfer diperbarui.");
      } catch (err) {
        showErrors(form, err);
      }
    });
  d.el.querySelector("[data-delete]").onclick = async () => {
    if (!(await confirmDialog({ title: "Hapus transfer?", message: `Transfer ${money(t.amount)} dari ${t.fromWalletName} ke ${t.toWalletName} dibatalkan di kedua dompet.`, confirmLabel: "Hapus", danger: true }))) return;
    try {
      await api.del("/api/transfers/" + t.id);
      await loadBoot(true).catch(() => {});
      d.close(true);
      toast("Transfer dihapus.");
    } catch (err) {
      toast(err.message, "error");
    }
  };
  return d;
}

/** Buka baris transaksi mana pun dengan dialog yang sesuai jenisnya. */
export function openTransactionRow(tx) {
  if (tx.transferId) return openTransferEdit(tx.transferId);
  if (tx.debtId) return go("/debts?open=" + tx.debtId);
  if (tx.kind === "adjustment") {
    const d = dialog({
      title: "Penyesuaian saldo",
      body: html`<div class="stack">
        <div class="row-flex">${tile({ glyph: "⚖️", size: "lg" })}<div><div class="num" style="font-size:var(--fs-xl);font-weight:630">${money(tx.direction === "in" ? tx.amount : -tx.amount, { sign: true })}</div><div class="muted small">${tx.walletName} · ${fmtDate(tx.date)}</div></div></div>
        <p class="muted">${tx.title}. Penyesuaian mengoreksi saldo dompet tanpa dihitung sebagai pemasukan atau pengeluaran.</p>
      </div>`,
      footer: html`<button class="btn btn--danger" data-delete style="margin-right:auto">Hapus penyesuaian</button><button class="btn" data-close>Tutup</button>`,
    });
    d.el.querySelector("[data-delete]").onclick = async () => {
      try {
        await api.del("/api/transactions/" + tx.id);
        await loadBoot(true).catch(() => {});
        d.close(true);
        toast("Penyesuaian dihapus.");
      } catch (err) {
        toast(err.message, "error");
      }
    };
    return d;
  }
  return openTransaction({ tx });
}

/** Tampilan satu baris transaksi — dipakai Dashboard, Transaksi, dan detail dompet. */
export function txRow(t) {
  const KIND = { transfer: ["swap", "Transfer"], debt: ["handshake", "Hutang/piutang"], adjustment: ["gear", "Penyesuaian"] };
  const special = KIND[t.kind];
  const signed = t.direction === "in" ? t.amount : -t.amount;
  const cls = t.kind === "income" ? "pos" : t.kind === "expense" ? "" : "muted";
  const lead = special
    ? html`<span class="tile">${icon(special[0])}</span>`
    : tile({ glyph: t.categoryIcon, color: t.categoryColor });
  return html`<button class="row" data-tx="${t.id}">
    ${lead}
    <span class="grow">
      <span class="row__title truncate" style="display:block">${t.title}</span>
      <span class="row__meta truncate" style="display:block">${special ? special[1] : t.categoryName || "Tanpa kategori"} · ${t.walletName}${t.hasAttachment ? html` · ${icon("clip", "icon--sm")}` : ""}</span>
    </span>
    <span class="row__amount">
      <span class="num ${cls}">${money(signed, { ccy: t.currency, sign: true })}</span>
      ${t.status === "pending" ? html`<br /><span class="badge badge--warn">Tertunda</span>` : ""}
    </span>
  </button>`;
}
