/**
 * Ilustrasi & animasi finansial — digambar sendiri sebagai SVG inline, memakai
 * token warna sehingga mengikuti tema. Animasi diatur di app.css dan otomatis
 * mati untuk prefers-reduced-motion.
 */
import { raw, html } from "./ui.js";

/** Celengan. Tambahkan kelas `is-dropping` untuk memutar animasi koin masuk. */
export const piggy = raw(`<svg class="piggy" viewBox="0 0 200 180" role="img" aria-label="Celengan">
  <defs>
    <linearGradient id="pg-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a5c"/><stop offset=".55" stop-color="#f4472b"/><stop offset="1" stop-color="#b3122b"/></linearGradient>
    <linearGradient id="pg-coin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#f0a81c"/></linearGradient>
  </defs>
  <ellipse cx="100" cy="162" rx="62" ry="7" fill="var(--text)" opacity=".1"/>
  <g class="body">
    <path d="M40 112c0-30 27-52 61-52 14 0 27 4 37 10l18-8-3 20c6 7 10 15 11 24h8v20h-12c-4 7-10 13-17 17v15h-18v-9a80 80 0 0 1-30 0v9H77v-15c-22-9-37-23-37-31z" fill="url(#pg-body)"/>
    <path d="M52 74c-6-10-2-20 8-22l8 14z" fill="#d93a25"/>
    <rect x="84" y="62" width="34" height="6" rx="3" fill="#7a0d1e"/>
    <circle cx="140" cy="96" r="4.5" fill="#2a0a0d"/>
    <circle cx="141.5" cy="94.5" r="1.4" fill="#fff"/>
    <ellipse cx="163" cy="113" rx="7" ry="9" fill="#ff9d78"/>
    <circle cx="161" cy="111" r="1.4" fill="#7a0d1e"/><circle cx="165.5" cy="111" r="1.4" fill="#7a0d1e"/>
    <path d="M38 108c-9-2-12 6-8 10 3 3 8 1 7-3" fill="none" stroke="#d93a25" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="118" cy="118" rx="12" ry="7" fill="#fff" opacity=".12"/>
  </g>
  <g class="coin"><circle cx="101" cy="50" r="13" fill="url(#pg-coin)" stroke="#c9860e" stroke-width="2"/><path d="M96 50h10M101 45v10" stroke="#c9860e" stroke-width="2" stroke-linecap="round"/></g>
  <g class="hand"><path d="M112 34c8-9 22-16 40-18l8 14c-14 2-24 8-30 16-4 5-12 5-16 1s-6-9-2-13z" fill="#f2c7a5"/><path d="M148 14l22-6 8 16-20 8z" fill="var(--surface-3)"/></g>
  <g class="spark" style="transform-origin:101px 60px" stroke="#ffd166" stroke-width="2.5" stroke-linecap="round"><path d="M76 52l-8-6M126 52l8-6M101 38v-10M84 42l-5-9M118 42l5-9"/></g>
</svg>`);

export const successCheck = raw(`<svg class="success-check" viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="var(--pos)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="32" cy="32" r="25"/><path d="m21 33 8 8 15-17"/></svg>`);

/** Maskot kecil ("tetes lava") untuk peringatan budget yang ramah. mood: ok | warning | over */
export function buddy(mood = "ok") {
  const mouth = mood === "over" ? "M22 39q6-6 12 0" : mood === "warning" ? "M22 38h12" : "M22 36q6 6 12 0";
  const brow = mood === "over" ? '<path d="M18 22l7 3M38 22l-7 3" stroke="#3a0b10" stroke-width="2" stroke-linecap="round"/>' : "";
  const sweat = mood === "warning" ? '<path d="M44 16c2 3 3 5 0 6-3-1-2-3 0-6z" fill="#8fd3ff"/>' : "";
  return raw(`<svg class="buddy" viewBox="0 0 56 56" aria-hidden="true">
    <defs><linearGradient id="bd-${mood}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a5c"/><stop offset="1" stop-color="#c2182b"/></linearGradient></defs>
    <path d="M28 4c9 10 18 19 18 30a18 18 0 1 1-36 0C10 23 19 14 28 4z" fill="url(#bd-${mood})"/>
    ${brow}<ellipse class="eye" cx="21.5" cy="29" rx="2.6" ry="3.4" fill="#2a0a0d"/><ellipse class="eye" cx="34.5" cy="29" rx="2.6" ry="3.4" fill="#2a0a0d"/>
    <path d="${mouth}" fill="none" stroke="#2a0a0d" stroke-width="2.2" stroke-linecap="round"/>${sweat}
  </svg>`);
}

const line = (inner) => raw(`<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`);
export const emptyArt = {
  transactions: line('<rect x="28" y="18" width="64" height="84" rx="8"/><path d="M42 38h36M42 54h36M42 70h20"/><circle cx="84" cy="88" r="16" fill="var(--bg)" stroke="var(--accent)"/><path d="M84 81v14M77 88h14" stroke="var(--accent)"/>'),
  wallets: line('<rect x="18" y="34" width="84" height="56" rx="10"/><path d="M18 50h84"/><rect x="72" y="60" width="30" height="16" rx="6" stroke="var(--accent)"/><circle cx="82" cy="68" r="2" fill="var(--accent)" stroke="none"/><path d="M34 34l40-14 8 14"/>'),
  budgets: line('<circle cx="60" cy="60" r="38"/><path d="M60 22a38 38 0 0 1 33 57L60 60z" stroke="var(--accent)"/><circle cx="60" cy="60" r="5" fill="currentColor" stroke="none"/>'),
  savings: line('<circle cx="60" cy="62" r="36"/><circle cx="60" cy="62" r="22"/><circle cx="60" cy="62" r="7" stroke="var(--accent)"/><path d="M60 62l34-34M86 22l8 6 6-8" stroke="var(--accent)"/>'),
  debts: line('<circle cx="36" cy="44" r="12"/><circle cx="84" cy="44" r="12"/><path d="M18 92c0-12 8-20 18-20s18 8 18 20M66 92c0-12 8-20 18-20s18 8 18 20"/><path d="M50 30l20 0M64 24l6 6-6 6" stroke="var(--accent)"/>'),
  reports: line('<path d="M20 98V22M20 98h80"/><path d="M36 82V62M54 82V46M72 82V56M90 82V34" stroke="var(--accent)"/>'),
  search: line('<circle cx="52" cy="52" r="26"/><path d="M72 72l26 26"/><path d="M42 52h20" stroke="var(--accent)"/>'),
};

/** Motif busur bercahaya pada kartu hero (terinspirasi referensi desain). */
export const heroArcs = raw(`<svg class="hero__arcs" viewBox="0 0 800 320" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
  <defs><linearGradient id="arc-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347" stop-opacity=".9"/><stop offset=".6" stop-color="#ff5a3c" stop-opacity=".5"/><stop offset="1" stop-color="#ff5a3c" stop-opacity="0"/></linearGradient></defs>
  <path d="M420 330C420 120 470 30 520 30s100 90 100 300"/><path d="M560 330C560 160 600 80 640 80s80 80 80 250"/><path d="M660 330C660 200 700 130 740 130s70 70 70 200"/><path d="M300 330C300 210 340 150 380 150s70 60 70 180"/>
</svg>`);

/** Blok perayaan singkat setelah aksi berhasil. */
export const celebrate = (title, text) => html`<div class="celebrate">${successCheck}<h3>${title}</h3>${text ? html`<p class="muted">${text}</p>` : ""}</div>`;
