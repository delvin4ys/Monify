/**
 * Grafik SVG tanpa library. Aturan yang diikuti:
 * - satu sumbu y per grafik; grid dan sumbu samar; teks memakai token teks, bukan warna seri
 * - batang ≤ 22px dengan ujung membulat 4px yang menempel ke garis dasar; garis 2px
 * - legenda selalu ada untuk ≥ 2 seri; tooltip saat hover/fokus
 * - warna seri berasal dari palet tervalidasi (--series-*, --chart-*) di app.css
 * - setiap grafik punya padanan tabel (dirender halaman pemanggil)
 */
import { html, mount, raw, esc } from "./ui.js";
import { money, compact } from "./format.js";

const NS = "http://www.w3.org/2000/svg";
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Render ulang saat lebar kontainer berubah. Mengembalikan fungsi pembersih. */
function responsive(el, draw) {
  let width = 0;
  const run = () => {
    const w = Math.round(el.clientWidth);
    if (!w || w === width) return;
    width = w;
    draw(w);
  };
  run();
  if (!("ResizeObserver" in window)) return () => {};
  const ro = new ResizeObserver(() => requestAnimationFrame(run));
  ro.observe(el);
  return () => ro.disconnect();
}

/** Skala "bagus": batas atas dibulatkan ke 1/2/2.5/5 × 10ⁿ, 4 garis. */
function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 1.2 ? 1.2 : f <= 1.6 ? 1.6 : f <= 2 ? 2 : f <= 2.4 ? 2.4 : f <= 3.2 ? 3.2 : f <= 4 ? 4 : f <= 6 ? 6 : f <= 8 ? 8 : 10;
  return nice * exp;
}

function tooltip(el) {
  let tip = el.querySelector(".chart-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.setAttribute("role", "tooltip");
    el.appendChild(tip);
  }
  return {
    show(x, y, content) {
      mount(tip, content);
      const half = tip.offsetWidth / 2;
      const clamped = Math.max(half + 4, Math.min(el.clientWidth - half - 4, x));
      tip.style.left = clamped + "px";
      tip.style.top = Math.max(y, tip.offsetHeight + 12) + "px";
      tip.classList.add("is-open");
    },
    hide() {
      tip.classList.remove("is-open");
    },
  };
}

/** Jarangkan label sumbu x agar tidak bertabrakan. */
function labelStep(count, width, per = 54) {
  return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(width / per))));
}

/**
 * Batang berkelompok: pemasukan vs pengeluaran per periode.
 * @param {{ label: string, income: number, expense: number, net?: number }[]} data
 */
export function incomeExpenseBars(el, data, { height = 240 } = {}) {
  el.classList.add("chart");
  const tip = tooltip(el);
  return responsive(el, (W) => {
    const m = { top: 12, right: 8, bottom: 26, left: 46 };
    const iw = W - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.income, d.expense))));
    const band = iw / data.length;
    const bw = Math.max(3, Math.min(22, (band - 10) / 2));
    const y = (v) => m.top + ih - (v / max) * ih;
    const step = labelStep(data.length, iw);
    const bar = (x, v, color, cls) => {
      const h = Math.max(v > 0 ? 2 : 0, (v / max) * ih);
      if (!h) return "";
      const r = Math.min(4, bw / 2, h);
      const top = m.top + ih - h;
      // ujung atas membulat, dasar rata menempel ke baseline
      return `<path class="bar ${cls}" fill="${color}" d="M${x},${top + h}V${top + r}a${r},${r} 0 0 1 ${r},-${r}h${bw - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${top + h}z"/>`;
    };
    let grid = "";
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      grid += `<line class="${i ? "grid" : "baseline"}" x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end">${esc(compact(v))}</text>`;
    }
    let bars = "";
    let hits = "";
    data.forEach((d, i) => {
      const cx = m.left + band * i + band / 2;
      bars += `<g data-i="${i}">${bar(cx - bw - 1, d.income, "var(--chart-income)", "bar--in")}${bar(cx + 1, d.expense, "var(--chart-expense)", "bar--out")}</g>`;
      if (i % step === 0) bars += `<text x="${cx}" y="${height - 8}" text-anchor="middle">${esc(d.label)}</text>`;
      hits += `<rect class="hit" data-i="${i}" x="${m.left + band * i}" y="${m.top}" width="${band}" height="${ih}" tabindex="0" role="img" aria-label="${esc(`${d.label}: pemasukan ${money(d.income)}, pengeluaran ${money(d.expense)}`)}"/>`;
    });
    const svg = `<svg viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="group" aria-label="Pemasukan dan pengeluaran per periode">${grid}${bars}${hits}</svg>`;
    const old = el.querySelector("svg");
    if (old) old.remove();
    el.insertAdjacentHTML("afterbegin", svg);
    const root = el.querySelector("svg");
    const on = (target) => {
      const i = Number(target.dataset.i);
      const d = data[i];
      el.classList.add("is-hovering");
      root.querySelectorAll("g[data-i] .bar").forEach((b) => b.classList.toggle("is-active", b.parentNode.dataset.i === String(i)));
      const net = d.income - d.expense;
      tip.show(
        m.left + band * i + band / 2,
        y(Math.max(d.income, d.expense)),
        html`<strong>${d.tip || d.label}</strong>
          <dl>
            <dt><i class="swatch" style="--sw:var(--chart-income)"></i>Pemasukan</dt>
            <dd class="num">${money(d.income)}</dd>
            <dt><i class="swatch" style="--sw:var(--chart-expense)"></i>Pengeluaran</dt>
            <dd class="num">${money(d.expense)}</dd>
            <dt>Arus bersih</dt>
            <dd class="num ${net < 0 ? "neg" : net > 0 ? "pos" : ""}">${money(net, { sign: true })}</dd>
          </dl>`
      );
    };
    const off = () => {
      el.classList.remove("is-hovering");
      root.querySelectorAll(".bar.is-active").forEach((b) => b.classList.remove("is-active"));
      tip.hide();
    };
    root.querySelectorAll(".hit").forEach((h) => {
      h.addEventListener("pointerenter", () => on(h));
      h.addEventListener("focus", () => on(h));
      h.addEventListener("pointerleave", off);
      h.addEventListener("blur", off);
    });
  });
}

/**
 * Garis + area satu seri (mis. arus kas kumulatif). Mendukung nilai negatif.
 * @param {{ label: string, value: number }[]} data
 */
export function trendLine(el, data, { height = 220, name = "Arus kas kumulatif" } = {}) {
  el.classList.add("chart");
  const tip = tooltip(el);
  return responsive(el, (W) => {
    const m = { top: 14, right: 12, bottom: 26, left: 50 };
    const iw = W - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const hi = Math.max(0, ...data.map((d) => d.value));
    const lo = Math.min(0, ...data.map((d) => d.value));
    const span = niceMax(Math.max(hi, -lo));
    const top = hi > 0 ? span : 0;
    const bottom = lo < 0 ? -span : 0;
    const range = top - bottom || 1;
    const x = (i) => m.left + (data.length === 1 ? iw / 2 : (iw * i) / (data.length - 1));
    const y = (v) => m.top + ((top - v) / range) * ih;
    const step = labelStep(data.length, iw);
    let grid = "";
    const lines = 4;
    for (let i = 0; i <= lines; i++) {
      const v = bottom + (range / lines) * i;
      const zero = Math.abs(v) < range / 1000;
      grid += `<line class="${zero ? "baseline" : "grid"}" x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end">${esc(compact(v))}</text>`;
    }
    const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`);
    const line = "M" + pts.join("L");
    const area = `${line}L${x(data.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
    let labels = "";
    data.forEach((d, i) => {
      if (i % step === 0) labels += `<text x="${x(i)}" y="${height - 8}" text-anchor="middle">${esc(d.label)}</text>`;
    });
    const id = "g" + Math.random().toString(36).slice(2, 8);
    const last = data[data.length - 1];
    const svg = `<svg viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${esc(`${name}: ${money(last.value, { sign: true })} pada ${last.label}`)}">
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--chart-accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--chart-accent)" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#${id})"/><path d="${line}" fill="none" stroke="var(--chart-accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${reduceMotion() ? "" : 'pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" from="1" to="0" dur="0.7s" fill="freeze" calcMode="spline" keySplines="0.22 1 0.36 1" keyTimes="0;1"/'}></path>
      <circle cx="${x(data.length - 1)}" cy="${y(last.value)}" r="4" fill="var(--chart-accent)" stroke="var(--surface-1)" stroke-width="2"/>
      ${labels}
      <line class="cross" y1="${m.top}" y2="${m.top + ih}" hidden></line><circle class="dot" r="5" fill="var(--chart-accent)" stroke="var(--surface-1)" stroke-width="2" hidden></circle>
      <rect class="hit" x="${m.left}" y="${m.top}" width="${iw}" height="${ih}"/></svg>`;
    const old = el.querySelector("svg");
    if (old) old.remove();
    el.insertAdjacentHTML("afterbegin", svg);
    const root = el.querySelector("svg");
    const cross = root.querySelector(".cross");
    const dot = root.querySelector(".dot");
    const hit = root.querySelector(".hit");
    const move = (e) => {
      const rect = root.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(data.length - 1, Math.round(((px - m.left) / iw) * (data.length - 1))));
      const d = data[i];
      cross.removeAttribute("hidden");
      dot.removeAttribute("hidden");
      cross.setAttribute("x1", x(i));
      cross.setAttribute("x2", x(i));
      dot.setAttribute("cx", x(i));
      dot.setAttribute("cy", y(d.value));
      tip.show(x(i), y(d.value), html`<strong>${d.tip || d.label}</strong>
        <dl><dt><i class="swatch swatch--line" style="--sw:var(--chart-accent)"></i>${name}</dt><dd class="num">${money(d.value, { sign: true })}</dd></dl>`);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => {
      cross.setAttribute("hidden", "");
      dot.setAttribute("hidden", "");
      tip.hide();
    });
  });
}

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

/**
 * Lipat daftar menjadi paling banyak 6 irisan: 5 teratas + "Lainnya".
 * Warna mengikuti urutan slot tetap (tidak pernah digilir).
 */
export function foldSlices(items, max = 6) {
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max) return sorted.map((s, i) => ({ ...s, color: SERIES[i] }));
  const head = sorted.slice(0, max - 1).map((s, i) => ({ ...s, color: SERIES[i] }));
  const rest = sorted.slice(max - 1);
  return [...head, { name: `Lainnya (${rest.length})`, value: rest.reduce((n, r) => n + r.value, 0), color: "var(--series-other)" }];
}

/** Donat komposisi + legenda bernilai (identitas tidak hanya lewat warna). */
export function donut(el, slices, { centerLabel = "Total", size = 180 } = {}) {
  el.classList.add("donut-host");
  const total = slices.reduce((n, s) => n + s.value, 0);
  const R = 70;
  const r = 46;
  const cx = 90;
  const cy = 90;
  const gap = slices.length > 1 ? 0.035 : 0; // celah antar irisan (radian)
  let a = -Math.PI / 2;
  const arcs = slices
    .map((s, i) => {
      const frac = total ? s.value / total : 0;
      const a0 = a + gap / 2;
      const a1 = a + frac * Math.PI * 2 - gap / 2;
      a += frac * Math.PI * 2;
      if (a1 <= a0) return "";
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
      const full = slices.length === 1;
      const d = full
        ? `M${cx},${cy - R}a${R},${R} 0 1 1 -0.01,0zM${cx},${cy - r}a${r},${r} 0 1 0 0.01,0z`
        : `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
      return `<path class="bar" data-i="${i}" d="${d}" fill="${s.color}" fill-rule="evenodd" tabindex="0" role="img" aria-label="${esc(`${s.name}: ${money(s.value)}`)}"/>`;
    })
    .join("");
  mount(
    el,
    html`<div class="donut-wrap">
      <div class="chart" style="max-width:${size}px">
        ${raw(`<svg viewBox="0 0 180 180" role="group" aria-label="${esc(centerLabel)}">${arcs}<text x="90" y="84" text-anchor="middle">${esc(centerLabel)}</text><text x="90" y="104" text-anchor="middle" style="font-size:15px;font-weight:650;fill:var(--text)">${esc(compact(total))}</text></svg>`)}
      </div>
      <div class="donut-legend">
        ${slices.map(
          (s) => html`<div><i class="swatch" style="--sw:${raw(s.color)}"></i><span class="truncate">${s.name}</span><span class="num muted">${total ? Math.round((s.value / total) * 1000) / 10 : 0}%</span><span class="num">${money(s.value)}</span></div>`
        )}
      </div>
    </div>`
  );
  const chart = el.querySelector(".chart");
  const tip = tooltip(chart);
  chart.querySelectorAll("path.bar").forEach((p) => {
    const s = slices[Number(p.dataset.i)];
    const on = () => {
      chart.classList.add("is-hovering");
      p.classList.add("is-active");
      tip.show(chart.clientWidth / 2, chart.clientHeight / 2 - 6, html`<strong>${s.name}</strong>
        <dl><dt>Jumlah</dt><dd class="num">${money(s.value)}</dd><dt>Porsi</dt><dd class="num">${total ? Math.round((s.value / total) * 1000) / 10 : 0}%</dd></dl>`);
    };
    const off = () => {
      chart.classList.remove("is-hovering");
      p.classList.remove("is-active");
      tip.hide();
    };
    p.addEventListener("pointerenter", on);
    p.addEventListener("focus", on);
    p.addEventListener("pointerleave", off);
    p.addEventListener("blur", off);
  });
  return () => {};
}

/** Daftar batang horizontal berlabel langsung (peringkat kategori). Satu rona = besaran. */
export function barList(items, { color = "var(--chart-accent)", max } = {}) {
  const top = max || Math.max(1, ...items.map((i) => i.value));
  return html`<div class="bar-list">
    ${items.map(
      (i) => html`<div class="bar-list__row">
        <div class="between small"><span class="row-flex truncate" style="gap:8px">${i.lead || ""}<span class="truncate">${i.name}</span></span><span class="num"><span class="muted">${i.note || ""}</span> ${money(i.value)}</span></div>
        <div class="progress" style="--p:${Math.max(1.5, (i.value / top) * 100).toFixed(1)}%;--pc:${raw(color)}"><i></i></div>
      </div>`
    )}
  </div>`;
}

export const legend = (items) => html`<div class="legend">${items.map((i) => html`<span><i class="swatch ${i.line ? "swatch--line" : ""}" style="--sw:${raw(i.color)}"></i>${i.name}</span>`)}</div>`;
export { NS };
