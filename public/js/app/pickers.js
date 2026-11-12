/** Pemilih warna, ikon emoji, dan logo — dipakai form dompet, kategori, dan tabungan. */
import { html, raw } from "./ui.js";

export const COLORS = ["#ff4d2e", "#f97316", "#f59e0b", "#22c55e", "#10b981", "#0ea5e9", "#2563eb", "#8b5cf6", "#ec4899", "#64748b"];
export const EMOJI = ["🍜", "☕", "🥬", "🛒", "👕", "⛽", "🚗", "🏠", "⚡", "🌐", "🔁", "🎬", "🎮", "💊", "🎓", "👪", "💅", "🎁", "✈️", "📦", "💰", "💻", "🏪", "💵", "📈", "🧧", "🛡️", "🎯", "🏝️", "🏍️", "📱", "🐾"];
export const LOGOS = ["BCA", "BRI", "Jago", "Jenius", "OVO", "ShopeePay", "Stockbit", "Cash"].map((n) => ({ name: n, url: `/assets/logo/${n}.png` }));

export const colorPicker = (selected, name = "color") => html`<div class="swatches" role="radiogroup" aria-label="Warna">
  ${COLORS.map((c) => html`<label class="swatch-opt" style="--c:${c}" title="${c}"><input type="radio" name="${name}" value="${c}" ${c === selected ? raw("checked") : ""} /><span></span></label>`)}
</div>`;

export const emojiPicker = (selected, name = "icon") => html`<div class="swatches swatches--emoji" role="radiogroup" aria-label="Ikon">
  ${(selected && !EMOJI.includes(selected) ? [selected, ...EMOJI] : EMOJI).map((e) => html`<label class="emoji-opt"><input type="radio" name="${name}" value="${e}" ${e === selected ? raw("checked") : ""} /><span>${e}</span></label>`)}
</div>`;

export const logoPicker = (selected, name = "logo") => html`<div class="swatches swatches--emoji" role="radiogroup" aria-label="Logo">
  <label class="emoji-opt"><input type="radio" name="${name}" value="" ${!selected ? raw("checked") : ""} /><span class="tiny">Tanpa</span></label>
  ${LOGOS.map((l) => html`<label class="emoji-opt" title="${l.name}"><input type="radio" name="${name}" value="${l.url}" ${l.url === selected ? raw("checked") : ""} /><span><img src="${l.url}" alt="${l.name}" width="24" height="24" loading="lazy" /></span></label>`)}
  ${selected && !LOGOS.some((l) => l.url === selected) ? html`<label class="emoji-opt" title="Logo saat ini"><input type="radio" name="${name}" value="${selected}" checked /><span>${/^https:\/\//.test(selected) ? html`<img src="${selected}" alt="" width="24" height="24" />` : selected}</span></label>` : ""}
</div>`;

export const picked = (form, name) => {
  const el = form.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : "";
};
