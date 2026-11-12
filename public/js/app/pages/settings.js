import { html, mount, icon, raw, dialog, confirmDialog, toast, field, showErrors, clearErrors, busy, tile, $ } from "../ui.js";
import { api } from "../api.js";
import { boot, loadBoot, clearAll, fetchUrl } from "../store.js";
import { applyTheme, renderShell } from "../main.js";
import { colorPicker, emojiPicker, picked } from "../pickers.js";

const THEMES = [
  ["dark", "Gelap", "moon"],
  ["light", "Terang", "sun"],
  ["system", "Ikuti sistem", "monitor"],
];

async function savePrefs(patch, message = "Preferensi disimpan.") {
  try {
    const r = await api.patch("/api/user", patch);
    boot.user = r.user;
    toast(message);
    return true;
  } catch (err) {
    toast(err.message, "error");
    return false;
  }
}

function categoryForm(type, c, done) {
  const editing = Boolean(c);
  const parents = boot.categoryParents.filter((p) => p.kind === type);
  const d = dialog({
    title: editing ? "Ubah kategori" : type === "income" ? "Kategori pemasukan baru" : "Kategori pengeluaran baru",
    body: html`<form class="stack" novalidate>
      ${field({ label: "Nama", name: "name", control: html`<input class="input" id="f-name" name="name" maxlength="60" value="${c ? c.name : ""}" autofocus />` })}
      ${field({
        label: "Grup",
        name: "parentId",
        control: html`<select class="select" id="f-parentId" name="parentId"><option value="">Tanpa grup</option>${parents.map((p) => html`<option value="${p.id}" ${c && c.parentId === p.id ? raw("selected") : ""}>${p.name}</option>`)}</select>`,
      })}
      <div class="field"><span class="label">Ikon</span>${emojiPicker(c ? c.icon : "🏷️")}</div>
      <div class="field"><span class="label">Warna</span>${colorPicker(c ? c.color : "#ff4d2e")}</div>
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`${editing
        ? html`<button class="btn btn--danger btn--icon" data-delete aria-label="Hapus kategori" style="margin-right:auto">${icon("trash", "icon--sm")}</button>
            <button class="btn" data-archive>${c.archived ? "Aktifkan" : "Arsipkan"}</button>`
        : html`<button class="btn" data-close>Batal</button>`}
      <button class="btn btn--primary" data-save>${editing ? "Simpan" : "Tambah"}</button>`,
  });
  const form = d.el.querySelector("form");
  const finish = async (msg) => {
    await loadBoot(true);
    d.close(true);
    toast(msg);
    done();
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    d.el.querySelector("[data-save]").click();
  };
  d.el.querySelector("[data-save]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      const body = { name: form.elements.name.value.trim(), parentId: form.elements.parentId.value || null, icon: picked(form, "icon") || "🏷️", color: picked(form, "color") || null };
      try {
        if (editing) await api.patch("/api/categories/" + c.id, body);
        else await api.post("/api/categories", { ...body, type });
        await finish(editing ? "Kategori diperbarui." : "Kategori ditambahkan.");
      } catch (err) {
        showErrors(form, err);
      }
    });
  const arch = d.el.querySelector("[data-archive]");
  if (arch)
    arch.onclick = async () => {
      try {
        await api.patch("/api/categories/" + c.id, { archived: !c.archived });
        await finish(c.archived ? "Kategori diaktifkan." : "Kategori diarsipkan — tidak muncul lagi di pilihan.");
      } catch (err) {
        toast(err.message, "error");
      }
    };
  const del = d.el.querySelector("[data-delete]");
  if (del)
    del.onclick = async () => {
      if (!(await confirmDialog({ title: `Hapus kategori ${c.name}?`, message: "Kategori yang sudah dipakai transaksi tidak bisa dihapus — arsipkan sebagai gantinya.", confirmLabel: "Hapus", danger: true }))) return;
      try {
        await api.del("/api/categories/" + c.id);
        await finish("Kategori dihapus.");
      } catch (err) {
        toast(err.message, "error", err.code === "CATEGORY_IN_USE" ? "Tidak bisa dihapus" : "");
      }
    };
}

function groupDialog(type, done) {
  const d = dialog({
    title: "Grup kategori",
    body: html`<div class="stack">
      <form class="row-flex" novalidate data-field="name"><input class="input" name="name" maxlength="60" placeholder="Nama grup baru" aria-label="Nama grup baru" /><button class="btn btn--primary" data-add>Tambah</button></form>
      <div data-list></div>
    </div>`,
  });
  const listEl = d.el.querySelector("[data-list]");
  const paint = () => {
    const mine = boot.categoryParents.filter((p) => p.kind === type && !p.isSystem);
    mount(
      listEl,
      mine.length
        ? html`<div class="list" style="margin:0 calc(var(--s-5) * -1)">${mine.map((p) => html`<div class="row"><span class="grow row__title">${p.name}</span><button class="btn btn--ghost btn--icon btn--sm" data-del="${p.id}" aria-label="Hapus grup ${p.name}">${icon("trash", "icon--sm")}</button></div>`)}</div>`
        : html`<p class="muted small">Belum ada grup buatanmu. Grup bawaan selalu tersedia.</p>`
    );
  };
  paint();
  const form = d.el.querySelector("form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/category-parents", { name: form.elements.name.value.trim(), kind: type });
      form.reset();
      await loadBoot(true);
      paint();
      done();
    } catch (err) {
      toast(err.message, "error");
    }
  };
  listEl.onclick = async (e) => {
    const b = e.target.closest("[data-del]");
    if (!b) return;
    try {
      await api.del("/api/category-parents/" + b.dataset.del);
      await loadBoot(true);
      paint();
      done();
    } catch (err) {
      toast(err.message, "error");
    }
  };
}

function deleteAccount() {
  const d = dialog({
    title: "Hapus akun",
    body: html`<form class="stack" novalidate>
      <p class="alert alert--neg">${icon("alert", "icon--sm")}<span>Seluruh data — dompet, transaksi, budget, tabungan, hutang, dan lampiran — dihapus <strong>permanen</strong> dan tidak bisa dipulihkan.</span></p>
      ${field({ label: "Masukkan password untuk konfirmasi", name: "password", control: html`<input class="input" id="f-password" name="password" type="password" autocomplete="current-password" autofocus />` })}
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
    </form>`,
    footer: html`<button class="btn" data-close>Batal</button><button class="btn btn--danger" data-ok>Hapus akun saya</button>`,
  });
  const form = d.el.querySelector("form");
  d.el.querySelector("[data-ok]").onclick = (e) =>
    busy(e.currentTarget, async () => {
      try {
        await api.del("/api/account", { password: form.elements.password.value }, { quiet: true });
        clearAll();
        window.location.assign("/login");
      } catch (err) {
        showErrors(form, err);
      }
    });
}

export default function settings(view, { params }) {
  let catType = "expense";
  let sessions = null;

  function categoriesHtml() {
    const cats = boot.categories.filter((c) => c.type === catType);
    const active = cats.filter((c) => !c.archived);
    const archived = cats.filter((c) => c.archived);
    const groups = new Map();
    for (const c of active) {
      const p = boot.categoryParents.find((x) => x.id === c.parentId);
      const key = p ? p.name : "Tanpa grup";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    const row = (c) => html`<button class="row" data-cat="${c.id}" style="${c.archived ? "opacity:.6" : ""}">${tile({ glyph: c.icon, color: c.color, size: "sm" })}<span class="grow row__title truncate">${c.name}</span>${c.archived ? html`<span class="badge">Diarsipkan</span>` : ""}${icon("chevron", "icon--sm")}</button>`;
    return html`${[...groups.entries()].map(([name, list]) => html`<div class="group-head" style="position:static">${name}</div>${list.map(row)}`)}
      ${archived.length ? html`<div class="group-head" style="position:static">Diarsipkan</div>${archived.map(row)}` : ""}
      ${cats.length ? "" : html`<p class="muted small" style="padding:var(--s-5)">Belum ada kategori.</p>`}`;
  }

  function render() {
    const u = boot.user;
    mount(
      view,
      html`<div class="stack stagger" style="max-width:820px">
        <section class="card stack" aria-label="Profil">
          <h2>${icon("user")} Profil</h2>
          <form class="form-grid" data-profile novalidate>
            ${field({ label: "Nama", name: "name", control: html`<input class="input" id="f-name" name="name" maxlength="80" value="${u.name}" autocomplete="name" />` })}
            ${field({ label: "Email", name: "email", error: false, hint: "Email dipakai untuk masuk dan tidak bisa diubah di sini.", control: html`<input class="input" id="f-email" value="${u.email}" disabled />` })}
            <div class="span-2"><button class="btn btn--primary">Simpan profil</button></div>
          </form>
        </section>

        <section class="card stack" aria-label="Tampilan">
          <h2>${icon("sun")} Tampilan</h2>
          <div class="segmented segmented--block" role="group" aria-label="Tema">${THEMES.map(([k, l, ic]) => html`<button data-theme-opt="${k}" aria-pressed="${(u.theme || "system") === k}">${l}</button>`)}</div>
          <p class="muted small">Pilihan tema tersimpan di akunmu dan langsung berlaku di semua halaman.</p>
        </section>

        <section class="card stack" aria-label="Preferensi">
          <h2>${icon("gear")} Preferensi</h2>
          <div class="form-grid">
            ${field({ label: "Format tanggal", name: "dateFormat", error: false, control: html`<select class="select" id="f-dateFormat" data-pref="dateFormat">${[["DMY", "12 Nov 2026"], ["MDY", "Nov 12, 2026"], ["YMD", "2026-11-12"]].map(([k, l]) => html`<option value="${k}" ${u.dateFormat === k ? raw("selected") : ""}>${l}</option>`)}</select>` })}
            ${field({ label: "Format angka", name: "numberFormat", error: false, control: html`<select class="select" id="f-numberFormat" data-pref="numberFormat">${[["id-ID", "1.250.000 (Indonesia)"], ["en-US", "1,250,000 (Internasional)"]].map(([k, l]) => html`<option value="${k}" ${u.numberFormat === k ? raw("selected") : ""}>${l}</option>`)}</select>` })}
            ${field({ label: "Dompet default", name: "defaultWalletId", error: false, hint: "Terpilih otomatis saat mencatat transaksi baru.", control: html`<select class="select" id="f-defaultWalletId" data-pref="defaultWalletId"><option value="">Tidak ada</option>${boot.wallets.filter((w) => w.active).map((w) => html`<option value="${w.id}" ${u.defaultWalletId === w.id ? raw("selected") : ""}>${w.name}</option>`)}</select>` })}
            ${field({ label: "Mata uang utama", name: "displayCurrency", error: false, hint: "Ringkasan hanya menjumlahkan dompet bermata uang ini; tidak ada konversi kurs. Dompet baru dibuat dalam mata uang ini.", control: html`<select class="select" id="f-displayCurrency" data-pref="displayCurrency">${[["IDR", "Rupiah (IDR)"], ["USD", "Dolar AS (USD)"]].map(([k, l]) => html`<option value="${k}" ${u.displayCurrency === k ? raw("selected") : ""}>${l}</option>`)}</select>` })}
          </div>
        </section>

        <section class="card card--flush" aria-label="Kategori" id="categories">
          <div class="card__head card__head--pad wrap"><h2>${icon("tag")} Kategori</h2>
            <div class="row-flex"><button class="btn btn--sm" data-groups>Grup</button><button class="btn btn--sm btn--primary" data-new-cat>${icon("plus", "icon--sm")}Kategori</button></div></div>
          <div style="padding:0 var(--s-5) var(--s-4)"><div class="segmented" role="group" aria-label="Jenis kategori">
            <button data-cat-type="expense" aria-pressed="${catType === "expense"}">Pengeluaran</button><button data-cat-type="income" aria-pressed="${catType === "income"}">Pemasukan</button></div></div>
          <div class="list" data-cats>${categoriesHtml()}</div>
        </section>

        <section class="card stack" aria-label="Keamanan">
          <h2>${icon("shield")} Keamanan</h2>
          <form class="form-grid" data-password novalidate>
            ${field({ cls: "span-2", label: "Password saat ini", name: "currentPassword", control: html`<input class="input" id="f-currentPassword" name="currentPassword" type="password" autocomplete="current-password" />` })}
            ${field({ label: "Password baru", name: "newPassword", hint: "Minimal 8 karakter.", control: html`<input class="input" id="f-newPassword" name="newPassword" type="password" autocomplete="new-password" />` })}
            ${field({ label: "Ulangi password baru", name: "confirm", control: html`<input class="input" id="f-confirm" name="confirm" type="password" autocomplete="new-password" />` })}
            <div class="alert alert--neg span-2" data-form-error hidden role="alert"></div>
            <div class="span-2"><button class="btn btn--primary">Ganti password</button></div>
          </form>
          <div class="between wrap" style="border-top:1px solid var(--border);padding-top:var(--s-4)">
            <div><div class="row__title">Sesi aktif</div><div class="small muted" data-sessions>${sessions == null ? "Memeriksa…" : `${sessions} perangkat sedang masuk ke akun ini.`}</div></div>
            <button class="btn" data-end-sessions>Keluar dari perangkat lain</button>
          </div>
        </section>

        <section class="card stack" aria-label="AI dan privasi">
          <h2>${icon("camera")} Pindai struk dengan AI</h2>
          <label class="check"><input type="checkbox" data-ai ${u.aiConsent ? raw("checked") : ""} />
            <span><span class="row__title">Izinkan foto struk diproses AI</span><br /><span class="small muted">Yang dikirim: gambar struk, nama kategori, dan nama dompet. Hasilnya hanya mengisi form — tidak pernah menyimpan transaksi tanpa konfirmasimu. Gambar struk yang tidak jadi dipakai langsung dihapus.</span></span></label>
          ${boot.features.receiptScan ? "" : html`<p class="alert alert--warn">${icon("info", "icon--sm")}<span>Pemindai struk belum dikonfigurasi di server ini (ANTHROPIC_API_KEY). Input manual tetap tersedia.</span></p>`}
        </section>

        <section class="card stack" aria-label="Hapus akun" style="border-color:color-mix(in srgb, var(--neg) 30%, var(--border))">
          <h2 class="neg">${icon("alert")} Zona berbahaya</h2>
          <div class="between wrap"><p class="muted small" style="max-width:52ch">Menghapus akun menghapus semua datamu secara permanen. Tindakan ini tidak bisa dibatalkan.</p><button class="btn btn--danger" data-delete-account>Hapus akun</button></div>
        </section>
      </div>`
    );
    if (sessions == null) {
      fetchUrl("/api/auth/sessions")
        .then((r) => {
          sessions = r.active;
          const el = $("[data-sessions]", view);
          if (el) el.textContent = `${sessions} perangkat sedang masuk ke akun ini.`;
        })
        .catch(() => {});
    }
  }

  const repaintCats = () => {
    const el = $("[data-cats]", view);
    if (el) mount(el, categoriesHtml());
  };

  view.onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.matches("[data-profile]")) {
      if (await savePrefs({ name: form.elements.name.value.trim() }, "Profil disimpan.")) renderShell("settings");
    } else if (form.matches("[data-password]")) {
      clearErrors(form);
      const el = form.elements;
      if (el.newPassword.value !== el.confirm.value) return showErrors(form, { fields: { confirm: "Password tidak sama." } });
      try {
        const r = await api.post("/api/auth/password", { currentPassword: el.currentPassword.value, newPassword: el.newPassword.value }, { quiet: true });
        form.reset();
        sessions = 1;
        toast(r.endedSessions ? `Password diganti. ${r.endedSessions} sesi lain diakhiri.` : "Password diganti.");
        const s = $("[data-sessions]", view);
        if (s) s.textContent = "1 perangkat sedang masuk ke akun ini.";
      } catch (err) {
        showErrors(form, err);
      }
    }
  };
  view.onchange = async (e) => {
    const pref = e.target.dataset.pref;
    if (pref) {
      const ok = await savePrefs({ [pref]: e.target.value || null });
      if (ok && pref === "displayCurrency") await loadBoot(true);
      return;
    }
    if (e.target.matches("[data-ai]")) {
      const ok = await savePrefs({ aiConsent: e.target.checked }, e.target.checked ? "Pemrosesan struk oleh AI diizinkan." : "Izin pemrosesan AI dicabut.");
      if (!ok) e.target.checked = !e.target.checked;
    }
  };
  view.onclick = async (e) => {
    const th = e.target.closest("[data-theme-opt]");
    if (th) {
      const pref = th.dataset.themeOpt;
      applyTheme(pref); // langsung berlaku, lalu disimpan
      view.querySelectorAll("[data-theme-opt]").forEach((b) => b.setAttribute("aria-pressed", String(b === th)));
      return savePrefs({ theme: pref }, "Tema disimpan.");
    }
    const ct = e.target.closest("[data-cat-type]");
    if (ct) {
      catType = ct.dataset.catType;
      view.querySelectorAll("[data-cat-type]").forEach((b) => b.setAttribute("aria-pressed", String(b === ct)));
      return repaintCats();
    }
    if (e.target.closest("[data-new-cat]")) return categoryForm(catType, null, repaintCats);
    if (e.target.closest("[data-groups]")) return groupDialog(catType, repaintCats);
    const cat = e.target.closest("[data-cat]");
    if (cat) return categoryForm(catType, boot.categories.find((c) => c.id === cat.dataset.cat), repaintCats);
    if (e.target.closest("[data-end-sessions]")) {
      try {
        const r = await api.del("/api/auth/sessions", undefined, { quiet: true });
        sessions = 1;
        const s = $("[data-sessions]", view);
        if (s) s.textContent = "1 perangkat sedang masuk ke akun ini.";
        toast(r.ended ? `${r.ended} sesi lain diakhiri.` : "Tidak ada sesi lain.", "info");
      } catch (err) {
        toast(err.message, "error");
      }
      return;
    }
    if (e.target.closest("[data-delete-account]")) deleteAccount();
  };

  render();
  if (params.get("tab") === "categories") setTimeout(() => $("#categories", view) && $("#categories", view).scrollIntoView({ block: "start" }), 50);

  return {
    refresh() {},
    destroy() {
      view.onclick = null;
      view.onchange = null;
      view.onsubmit = null;
    },
  };
}
