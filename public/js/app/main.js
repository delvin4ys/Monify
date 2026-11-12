/**
 * Shell aplikasi + router sisi klien.
 *
 * Navigasi antar halaman tidak memuat ulang dokumen: shell (sidebar, topbar)
 * tetap, hanya <main> yang diganti. Kode tiap halaman dimuat malas lewat
 * import() dinamis (route-level code splitting bawaan browser) dan dimuat lebih
 * awal saat tautannya disentuh/di-hover.
 */
import { html, mount, icon, toast, errorState, confirmDialog, dialog, $ } from "./ui.js";
import { api } from "./api.js";
import { boot, loadBoot, onInvalidate, prefetch, clearAll } from "./store.js";
import { openTransaction } from "./forms.js";
import { today, monthRange } from "./format.js";

const ROUTES = [
  { path: "/dashboard", key: "dashboard", label: "Dashboard", icon: "home", load: () => import("./pages/dashboard.js"), warm: () => "/api/dashboard?today=" + today() },
  { path: "/transactions", key: "transactions", label: "Transaksi", icon: "list", load: () => import("./pages/transactions.js"), warm: () => { const r = monthRange(); return `/api/transactions?from=${r.from}&to=${r.to}&sort=date_desc&limit=50`; } },
  { path: "/wallets", key: "wallets", label: "Dompet", icon: "wallet", load: () => import("./pages/wallets.js"), warm: () => "/api/wallets" },
  { path: "/budgets", key: "budgets", label: "Budget", icon: "pie", load: () => import("./pages/budgets.js"), warm: () => `/api/budgets?year=${today().slice(0, 4)}&month=${Number(today().slice(5, 7))}&today=${today()}` },
  { path: "/savings", key: "savings", label: "Tabungan", icon: "target", load: () => import("./pages/savings.js"), warm: () => "/api/savings" },
  { path: "/debts", key: "debts", label: "Hutang & Piutang", icon: "handshake", load: () => import("./pages/debts.js"), warm: () => "/api/debts" },
  { path: "/reports", key: "reports", label: "Laporan", icon: "chart", load: () => import("./pages/reports.js") },
  { path: "/settings", key: "settings", label: "Pengaturan", icon: "gear", load: () => import("./pages/settings.js"), foot: true },
  { path: "/admin", key: "admin", label: "Admin", icon: "users", load: () => import("./pages/admin.js"), admin: true },
];
const TABS = ["dashboard", "transactions", "budgets", "reports"];

const view = $("#view");
const titleEl = $("#page-title");
let current = null; // { route, page, off }
let navToken = 0;

const match = (pathname) => ROUTES.find((r) => pathname === r.path || pathname.startsWith(r.path + "/")) || ROUTES[0];
const allowed = (r) => !r.admin || (boot.user && boot.user.isAdmin);

export function renderShell(activeKey) {
  const u = boot.user;
  const link = (r) => html`<a class="nav__link" href="${r.path}" data-link data-key="${r.key}" title="${r.label}">${icon(r.icon)}<span>${r.label}</span></a>`;
  mount(
    $("#nav"),
    html`<div class="eyebrow nav__label">Menu</div>
      ${ROUTES.filter((r) => !r.foot && !r.admin).map(link)}
      <div class="eyebrow nav__label">Lainnya</div>
      ${ROUTES.filter((r) => (r.foot || r.admin) && allowed(r)).map(link)}`
  );
  mount(
    $("#sidebar-foot"),
    html`<div class="usercard" title="${u.email}">
        <span class="avatar" aria-hidden="true">${(u.name || u.email).slice(0, 1).toUpperCase()}</span>
        <span class="grow"><span class="truncate" style="display:block;font-weight:580">${u.name || "Pengguna"}</span><span class="truncate tiny muted" style="display:block">${u.email}</span></span>
      </div>
      <button class="btn btn--ghost" id="logout" title="Keluar">${icon("logout")}<span>Keluar</span></button>`
  );
  mount(
    $("#tabbar"),
    html`${ROUTES.filter((r) => TABS.includes(r.key)).map((r) => html`<a href="${r.path}" data-link data-key="${r.key}">${icon(r.icon)}<span>${r.key === "dashboard" ? "Beranda" : r.label}</span></a>`)}
      <button type="button" id="more-btn" aria-haspopup="dialog">${icon("more")}<span>Lainnya</span></button>`
  );
  mount($("#topbar-actions"), html`<button class="btn btn--primary hide-sm" id="add-tx">${icon("plus", "icon--sm")}Transaksi</button>`);
  $("#add-tx").onclick = () => openTransaction();
  $("#fab").onclick = () => openTransaction();
  $("#logout").onclick = logout;
  $("#more-btn").onclick = openMore;
  if (activeKey) setActive(ROUTES.find((r) => r.key === activeKey));
}

async function logout() {
  if (!(await confirmDialog({ title: "Keluar dari Monify?", message: "Kamu perlu masuk lagi untuk melihat data keuanganmu.", confirmLabel: "Keluar" }))) return;
  try {
    await api.post("/api/auth/logout", {}, { quiet: true });
  } finally {
    clearAll();
    window.location.assign("/login");
  }
}

function openMore() {
  const items = ROUTES.filter((r) => !TABS.includes(r.key) && allowed(r));
  const d = dialog({
    title: "Lainnya",
    body: html`<div class="list" style="margin:0 calc(var(--s-5) * -1)">
      ${items.map((r) => html`<a class="row" href="${r.path}" data-link>${html`<span class="tile">${icon(r.icon)}</span>`}<span class="grow row__title">${r.label}</span>${icon("chevron", "icon--sm")}</a>`)}
      <button class="row" data-logout><span class="tile">${icon("logout")}</span><span class="grow row__title">Keluar</span></button>
    </div>`,
  });
  d.el.addEventListener("click", (e) => {
    if (e.target.closest("[data-link]")) d.close();
    if (e.target.closest("[data-logout]")) {
      d.close();
      logout();
    }
  });
}

function setActive(route) {
  document.querySelectorAll("[data-key]").forEach((a) => {
    if (a.dataset.key === route.key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  titleEl.textContent = route.label;
  document.title = route.label + " — Monify";
}

async function render(url, { replace = false, push = true } = {}) {
  const token = ++navToken;
  const target = new URL(url, window.location.origin);
  let route = match(target.pathname);
  if (!allowed(route)) route = ROUTES[0];
  const href = (route === match(target.pathname) ? target.pathname : route.path) + target.search;
  if (push) history[replace ? "replaceState" : "pushState"]({}, "", href);

  if (current) {
    if (current.off) current.off();
    if (current.page && current.page.destroy) current.page.destroy();
    current = null;
  }
  setActive(route);

  let mod;
  try {
    mod = await route.load();
  } catch (err) {
    if (token !== navToken) return;
    mount(view, errorState({ message: "Halaman gagal dimuat. Periksa koneksi lalu coba lagi." }));
    view.querySelector("[data-retry]").onclick = () => render(href, { push: false });
    return;
  }
  if (token !== navToken) return;

  let swapped = false;
  const swap = () => {
    if (swapped || token !== navToken) return; // sudah dijalankan, atau navigasi lain menyusul
    swapped = true;
    view.classList.remove("view-enter");
    view.textContent = "";
    window.scrollTo(0, 0);
    const page = mod.default(view, { params: new URLSearchParams(target.search), path: target.pathname, navigate });
    current = { route, page, off: onInvalidate(() => page && page.refresh && page.refresh()) };
    void view.offsetWidth; // mulai ulang animasi masuk
    view.classList.add("view-enter");
  };
  // Transisi halus hanyalah hiasan: pergantian konten tidak boleh bergantung padanya.
  // Browser menunda callback View Transition saat tab tidak dirender (tab latar belakang),
  // jadi swap dijamin tetap berjalan lewat timer.
  const animate = document.startViewTransition && document.visibilityState === "visible" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!animate) return swap();
  try {
    const vt = document.startViewTransition(swap);
    vt.ready.catch(() => {});
    vt.finished.catch(() => {});
  } catch {
    swap();
  }
  setTimeout(swap, 120);
}

export function navigate(url, opts) {
  return render(url, opts);
}

/* Tautan internal: tangani di klien, dan pemanasan saat disentuh/di-hover. */
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(a.getAttribute("href"));
});
const warm = (e) => {
  const a = e.target.closest && e.target.closest("a[data-link]");
  if (!a) return;
  const route = match(new URL(a.href).pathname);
  route.load().catch(() => {});
  if (route.warm) prefetch(route.warm());
};
document.addEventListener("pointerenter", warm, true);
document.addEventListener("touchstart", warm, { passive: true, capture: true });
document.addEventListener("focusin", warm);

window.addEventListener("popstate", () => render(location.pathname + location.search, { push: false }));
window.addEventListener("monify:navigate", (e) => navigate(e.detail));

const topbar = $("#topbar");
const onScroll = () => topbar.classList.toggle("is-stuck", window.scrollY > 4);
window.addEventListener("scroll", onScroll, { passive: true });

/* Tema: mengikuti preferensi tersimpan; "system" ikut berubah bersama OS. */
export function applyTheme(pref) {
  try {
    localStorage.setItem("monify-theme", pref);
  } catch {
    /* penyimpanan tidak tersedia */
  }
  const light = pref === "light" || (pref === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#f6f5f2" : "#09090a");
}
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => applyTheme((boot.user && boot.user.theme) || "system"));

/* Mulai: data referensi dan kode halaman pertama dimuat bersamaan. */
(async function start() {
  const first = match(location.pathname);
  first.load().catch(() => {});
  if (first.warm) prefetch(first.warm());
  try {
    await loadBoot();
  } catch (err) {
    mount(view, errorState(err));
    view.querySelector("[data-retry]").onclick = () => location.reload();
    return;
  }
  applyTheme(boot.user.theme || "system");
  renderShell();
  await render(location.pathname + location.search, { replace: true });
  // Setelah halaman pertama tampil, muat halaman lain saat browser senggang.
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  idle(() => ROUTES.filter(allowed).forEach((r) => r.load().catch(() => {})));
})();

window.addEventListener("unhandledrejection", (e) => {
  if (e.reason && e.reason.code === "UNAUTHORIZED") return;
  console.error(e.reason);
});
export { toast };
