/** Halaman masuk, daftar, lupa password, dan reset password. */
import { html, mount, field, showErrors, clearErrors, busy, $ } from "./ui.js";
import { api } from "./api.js";

const card = $("#auth-card");
const mode = { "/register": "register", "/forgot-password": "forgot", "/reset-password": "reset" }[location.pathname] || "login";
const token = new URLSearchParams(location.search).get("token") || "";

const COPY = {
  login: { title: "Selamat datang kembali", sub: "Masuk untuk melanjutkan pencatatan keuanganmu.", cta: "Masuk" },
  register: { title: "Buat akun", sub: "Gratis. Datamu hanya bisa dilihat olehmu.", cta: "Daftar" },
  forgot: { title: "Lupa password?", sub: "Masukkan emailmu; kami kirimkan tautan untuk mengatur ulang password.", cta: "Kirim tautan" },
  reset: { title: "Atur password baru", sub: "Pilih password baru untuk akunmu.", cta: "Simpan password" },
};
const c = COPY[mode];
document.title = c.title + " — Monify";

const email = field({ label: "Email", name: "email", control: html`<input class="input" id="f-email" name="email" type="email" autocomplete="email" inputmode="email" required autofocus />` });
const password = (label, auto) => field({ label, name: "password", hint: mode === "login" ? "" : "Minimal 8 karakter.", control: html`<input class="input" id="f-password" name="password" type="password" autocomplete="${auto}" required minlength="8" />` });

mount(
  card,
  html`<div><h1>${c.title}</h1><p class="muted" style="margin-top:6px">${c.sub}</p></div>
    <form class="stack" novalidate>
      ${mode === "register" ? field({ label: "Nama", name: "name", control: html`<input class="input" id="f-name" name="name" maxlength="80" autocomplete="name" autofocus />` }) : ""}
      ${mode === "reset" ? "" : email}
      ${mode === "login" ? password("Password", "current-password") : mode === "register" || mode === "reset" ? password(mode === "reset" ? "Password baru" : "Password", "new-password") : ""}
      ${mode === "reset" ? field({ label: "Ulangi password baru", name: "confirm", control: html`<input class="input" id="f-confirm" name="confirm" type="password" autocomplete="new-password" required />` }) : ""}
      <div class="alert alert--neg" data-form-error hidden role="alert"></div>
      <div class="alert alert--accent" data-notice hidden role="status"></div>
      <button class="btn btn--primary btn--lg btn--block" data-submit>${c.cta}</button>
    </form>
    <p class="muted small" style="text-align:center">
      ${mode === "login"
        ? html`<a href="/forgot-password">Lupa password?</a> · Belum punya akun? <a href="/register">Daftar</a>`
        : mode === "register"
          ? html`Sudah punya akun? <a href="/login">Masuk</a>`
          : html`<a href="/login">Kembali ke halaman masuk</a>`}
    </p>`
);

const form = card.querySelector("form");
const notice = form.querySelector("[data-notice]");
if (mode === "reset" && !token) {
  showErrors(form, { message: "Tautan reset tidak lengkap. Minta tautan baru lewat “Lupa password”." });
  form.querySelector("[data-submit]").disabled = true;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  busy(form.querySelector("[data-submit]"), async () => {
    clearErrors(form);
    notice.hidden = true;
    const el = form.elements;
    try {
      if (mode === "login") {
        await api.post("/api/auth/login", { email: el.email.value.trim(), password: el.password.value }, { quiet: true });
        location.assign("/dashboard");
      } else if (mode === "register") {
        await api.post("/api/auth/register", { name: el.name.value.trim(), email: el.email.value.trim(), password: el.password.value }, { quiet: true });
        location.assign("/dashboard");
      } else if (mode === "forgot") {
        const r = await api.post("/api/auth/forgot", { email: el.email.value.trim() }, { quiet: true });
        // devLink hanya dikirim server non-produksi yang belum punya penyedia email.
        mount(notice, r.devLink ? html`${r.message}<br /><span class="small muted">Mode pengembangan (tanpa penyedia email): <a href="${new URL(r.devLink).pathname + new URL(r.devLink).search}">buka tautan reset</a>.</span>` : html`${r.message}`);
        notice.hidden = false;
        form.reset();
      } else {
        if (el.password.value !== el.confirm.value) return showErrors(form, { fields: { confirm: "Password tidak sama." } });
        await api.post("/api/auth/reset", { token, password: el.password.value }, { quiet: true });
        mount(notice, html`Password berhasil diubah. <a href="/login">Masuk sekarang</a>.`);
        notice.hidden = false;
        form.reset();
        form.querySelector("[data-submit]").disabled = true;
      }
    } catch (err) {
      showErrors(form, err);
    }
  });
});
