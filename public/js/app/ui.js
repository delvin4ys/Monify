/**
 * Primitif UI: templating yang aman dari XSS, ikon, toast, dialog, state.
 *
 * ATURAN RENDER: semua HTML dibangun dengan tagged template `html`. Setiap nilai
 * yang disisipkan di-escape otomatis; hanya hasil `html` lain (atau `raw` untuk
 * markup statis milik kode ini sendiri) yang disisipkan apa adanya. Data dari
 * server atau pengguna tidak pernah dilewatkan ke `raw`.
 */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

class Safe {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}
export const raw = (s) => new Safe(String(s));
// null/undefined -> kosong. Boolean ditulis "true"/"false" (untuk atribut aria-*);
// rendering bersyarat selalu memakai ternary: `cond ? html`…` : ""`.
const toHtml = (v) => (v == null ? "" : v instanceof Safe ? v.s : Array.isArray(v) ? v.map(toHtml).join("") : esc(v));
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + strings[i + 1];
  return new Safe(out);
}
export function mount(el, content) {
  el.innerHTML = toHtml(content);
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ─── Ikon (stroke, 24×24) ─────────────────────────────────────────────────── */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><path d="M16.5 14.5h.01"/>',
  pie: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15.5 3.7A9 9 0 0 1 20.3 8.5H15.5z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  handshake: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 16 2.5 2.5a1.4 1.4 0 0 0 2-2L15 13"/><path d="m3 9 4-4 4 2 3-2 7 6-3 3"/><path d="m3 9 5 6 2.5-2.5"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 12 4 4-4 4"/><path d="M21 16H7"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  clip: '<path d="m21 11-9.2 9.2a5.5 5.5 0 0 1-7.8-7.8L13 3.4a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><path d="M7.5 7.5h.01"/>',
  bank: '<path d="m3 9 9-5 9 5M5 9v9M9 9v9M15 9v9M19 9v9M3 20h18"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  piggy: '<path d="M5 11a7 6 0 0 1 12.8-3.4L21 7v4l-1.5 1a7 6 0 0 1-2.5 4v3h-3v-2h-3v2H8v-3.2A6 6 0 0 1 5 11z"/><path d="M5 11H3M15.5 10h.01"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  box: '<path d="M3 8 12 3l9 5v8l-9 5-9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="m3 3 18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-3.2 4.2M6.1 6.1C3.4 8 2 12 2 12s3.6 7 10 7c1.2 0 2.3-.2 3.3-.6"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
};
export function icon(name, cls = "") {
  return raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.box}</svg>`);
}

/** Ubin ikon berwarna untuk kategori/dompet. `glyph` bisa emoji atau URL logo milik aplikasi. */
export function tile({ glyph, color, size = "", fallback = "tag" }) {
  const style = color && /^#[0-9a-f]{6}$/i.test(color) ? `--c:${color}` : "";
  const isImg = typeof glyph === "string" && (/^\/assets\/logo\/[\w.-]+$/.test(glyph) || /^https:\/\//.test(glyph));
  const inner = isImg ? html`<img src="${glyph}" alt="" loading="lazy" decoding="async" />` : glyph ? html`<span>${glyph}</span>` : icon(fallback);
  return html`<span class="tile ${size ? "tile--" + size : ""}" style="${style}">${inner}</span>`;
}

/* ─── Toast ────────────────────────────────────────────────────────────────── */
let toastRoot;
export function toast(message, type = "success", title = "") {
  if (!toastRoot) {
    toastRoot = document.createElement("div");
    toastRoot.className = "toasts";
    toastRoot.setAttribute("role", "status");
    toastRoot.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRoot);
  }
  const el = document.createElement("div");
  el.className = "toast toast--" + type;
  mount(
    el,
    html`<span class="toast__icon">${icon(type === "error" ? "alert" : type === "info" ? "info" : "check")}</span>
      <div class="grow">${title ? html`<strong>${title}</strong><br />` : ""}<span class="${title ? "muted small" : ""}">${message}</span></div>
      <button class="btn btn--ghost btn--icon btn--sm" aria-label="Tutup">${icon("x", "icon--sm")}</button>`
  );
  const close = () => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 160);
  };
  el.querySelector("button").onclick = close;
  toastRoot.appendChild(el);
  setTimeout(close, type === "error" ? 6500 : 3800);
}

/* ─── Dialog ───────────────────────────────────────────────────────────────── */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let openDialogs = 0;

/**
 * @param {{ title: string, body: any, footer?: any, wide?: boolean, onClose?: () => void }} opts
 * @returns {{ el: HTMLElement, close: (result?: any) => void, closed: Promise<any> }}
 */
export function dialog({ title, body, footer, wide = false, onClose }) {
  const previous = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  mount(
    overlay,
    html`<div class="dialog ${wide ? "dialog--wide" : ""}" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="dialog__head">
        <h2>${title}</h2>
        <button class="btn btn--ghost btn--icon btn--sm" data-close aria-label="Tutup">${icon("x")}</button>
      </div>
      <div class="dialog__body">${body}</div>
      ${footer ? html`<div class="dialog__foot">${footer}</div>` : ""}
    </div>`
  );
  let resolve;
  const closed = new Promise((r) => (resolve = r));
  let done = false;
  const close = (result) => {
    if (done) return;
    done = true;
    document.removeEventListener("keydown", onKey, true);
    overlay.classList.add("is-closing");
    setTimeout(() => {
      overlay.remove();
      if (--openDialogs === 0) document.documentElement.style.overflow = "";
      if (previous && previous.focus) previous.focus({ preventScroll: true });
      if (onClose) onClose();
      resolve(result);
    }, 150);
  };
  const onKey = (e) => {
    if (overlay !== document.body.lastElementChild && !overlay.contains(document.activeElement)) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if (e.key === "Enter" && !e.isComposing && e.target instanceof HTMLInputElement && overlay.contains(e.target) && !["file", "checkbox", "radio", "button", "submit"].includes(e.target.type)) {
      // Enter di kolom isian = menekan tombol utama dialog (Simpan). Tombol itu berada
      // di luar <form>, sehingga browser tidak melakukannya sendiri.
      const primary = $(".dialog__foot .btn--primary", overlay);
      if (primary && !primary.disabled) {
        e.preventDefault();
        primary.click();
      }
    } else if (e.key === "Tab") {
      const items = $$(FOCUSABLE, overlay).filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
  if (openDialogs++ === 0) document.documentElement.style.overflow = "hidden";
  const auto = overlay.querySelector("[autofocus]") || $$(FOCUSABLE, overlay.querySelector(".dialog__body"))[0] || overlay.querySelector("[data-close]");
  if (auto) setTimeout(() => auto.focus({ preventScroll: true }), 30);
  return { el: overlay, close, closed };
}

export function confirmDialog({ title, message, confirmLabel = "Ya, lanjutkan", danger = false }) {
  const d = dialog({
    title,
    body: html`<p class="muted">${message}</p>`,
    footer: html`<button class="btn" data-close>Batal</button><button class="btn ${danger ? "btn--danger" : "btn--primary"}" data-ok>${confirmLabel}</button>`,
  });
  d.el.querySelector("[data-ok]").onclick = () => d.close(true);
  return d.closed.then((r) => r === true);
}

/* ─── Form ─────────────────────────────────────────────────────────────────── */
export function field({ label, name, error = true, hint, control, cls = "" }) {
  return html`<div class="field ${cls}" data-field="${name}">
    ${label ? html`<label for="f-${name}">${label}</label>` : ""}${control}
    ${hint ? html`<span class="field__hint">${hint}</span>` : ""}${error ? html`<span class="field__error" role="alert"></span>` : ""}
  </div>`;
}
export function clearErrors(root) {
  $$(".field.is-invalid", root).forEach((f) => {
    f.classList.remove("is-invalid");
    const e = f.querySelector(".field__error");
    if (e) e.textContent = "";
  });
  const g = root.querySelector("[data-form-error]");
  if (g) g.hidden = true;
}
/** Tampilkan error dari server: per kolom bila ada, selain itu sebagai pesan umum form. */
export function showErrors(root, err) {
  clearErrors(root);
  let placed = false;
  for (const [name, msg] of Object.entries((err && err.fields) || {})) {
    const f = root.querySelector(`[data-field="${CSS.escape(name)}"]`);
    if (!f) continue;
    f.classList.add("is-invalid");
    const e = f.querySelector(".field__error");
    if (e) e.textContent = msg;
    if (!placed) {
      const input = f.querySelector("input,select,textarea");
      if (input) input.focus();
    }
    placed = true;
  }
  const g = root.querySelector("[data-form-error]");
  if (g && (!placed || !(err && err.fields))) {
    g.textContent = (err && err.message) || "Terjadi kesalahan.";
    g.hidden = false;
  } else if (!g && !placed) {
    toast((err && err.message) || "Terjadi kesalahan.", "error");
  }
}
/** Jalankan aksi async pada tombol: cegah klik ganda dan tampilkan status sibuk. */
export async function busy(button, fn) {
  if (!button || button.getAttribute("aria-busy") === "true") return;
  const label = button.innerHTML;
  button.setAttribute("aria-busy", "true");
  button.innerHTML = '<span class="spinner"></span>';
  try {
    return await fn();
  } finally {
    button.removeAttribute("aria-busy");
    button.innerHTML = label;
  }
}

/* ─── State: skeleton / kosong / error ─────────────────────────────────────── */
export const sk = (w = "100%", h = "1em", cls = "") => html`<span class="sk ${cls}" style="width:${w};height:${h}"></span>`;
export const skRows = (n = 5) =>
  html`<div class="list" aria-hidden="true">${Array.from({ length: n }, (_, i) => html`<div class="row">${sk("40px", "40px")}<div class="grow">${sk(60 - (i % 3) * 12 + "%", "0.9em")}<br />${sk("34%", "0.7em")}</div>${sk("84px", "0.9em")}</div>`)}</div>`;
export const skCards = (n = 3, h = "150px") => html`<div class="grid-cards" aria-hidden="true">${Array.from({ length: n }, () => html`<div class="card">${sk("40%", "0.8em")}<br />${sk("70%", "1.6em")}<br />${sk("100%", h)}</div>`)}</div>`;

export function emptyState({ art, title, text, action }) {
  return html`<div class="empty">${art ? html`<div class="empty__art">${art}</div>` : ""}
    <h3>${title}</h3>
    ${text ? html`<p>${text}</p>` : ""}${action || ""}
  </div>`;
}
export function errorState(err, retryLabel = "Coba lagi") {
  return html`<div class="empty" role="alert">
    <span class="tile tile--lg" style="--c:var(--neg)">${icon("alert", "icon--lg")}</span>
    <h3>Data tidak dapat dimuat</h3>
    <p>${(err && err.message) || "Periksa koneksi lalu coba lagi."}</p>
    <button class="btn" data-retry>${retryLabel}</button>
  </div>`;
}

/** Hitung naik angka (dimatikan otomatis untuk prefers-reduced-motion). */
export function countUp(el, to, fmt, ms = 650) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const from = Number(el.dataset.v || 0);
  el.dataset.v = String(to);
  if (reduce || from === to || document.hidden) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min((t - t0) / ms, 1);
    const eased = 1 - Math.pow(1 - p, 4);
    el.textContent = fmt(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
