import { html, mount, icon, raw, sk, emptyState, toast, tile, $ } from "../ui.js";
import { live } from "../page.js";
import { qs } from "../api.js";
import { boot } from "../store.js";
import { money, percent, today, monthRange, yearRange, addDays, date as fmtDate, bucketLabel } from "../format.js";
import { incomeExpenseBars, trendLine, donut, foldSlices, barList, legend } from "../charts.js";
import { emptyArt } from "../art.js";

const RANGES = [
  ["month", "Bulan ini"],
  ["last", "Bulan lalu"],
  ["90d", "90 hari"],
  ["year", "Tahun ini"],
  ["custom", "Kustom"],
];
const GRAN = [
  ["", "Otomatis"],
  ["day", "Harian"],
  ["week", "Mingguan"],
  ["month", "Bulanan"],
  ["quarter", "Kuartalan"],
  ["year", "Tahunan"],
];
const TONE = { positive: ["pos", "trend"], negative: ["neg", "alert"], warning: ["warn", "alert"], neutral: ["text-3", "info"] };

function change(v, { goodWhenUp = true } = {}) {
  if (v == null) return html`<span class="delta muted">tanpa pembanding</span>`;
  const up = v > 0;
  const good = v === 0 ? null : up === goodWhenUp;
  return html`<span class="delta ${good == null ? "muted" : good ? "pos" : "neg"}">${icon(up ? "up" : "down", "icon--sm")}${percent(Math.abs(v), 1)} <span class="muted" style="font-weight:450">vs periode sebelumnya</span></span>`;
}

const skeleton = () => html`<div class="stack" aria-busy="true" aria-label="Memuat laporan">
  <div class="bento">${[1, 2, 3].map(() => html`<div class="card col-4">${sk("45%", "0.8em")}<div style="margin:12px 0 8px">${sk("70%", "1.8em")}</div>${sk("55%", "0.7em")}</div>`)}</div>
  <div class="card">${sk("30%", "0.9em")}<div style="margin-top:16px">${sk("100%", "240px")}</div></div>
  <div class="bento">${[1, 2].map(() => html`<div class="card col-6">${sk("40%", "0.9em")}<div style="margin-top:16px">${sk("100%", "180px")}</div></div>`)}</div>
</div>`;

export default function reports(view, { params }) {
  const s = {
    range: params.get("range") || (params.get("from") ? "custom" : "month"),
    from: params.get("from") || "",
    to: params.get("to") || "",
    granularity: params.get("granularity") || "",
    walletId: params.get("walletId") || "",
    table: false,
  };
  let cleanups = [];
  let last = null;

  function bounds() {
    const t = today();
    if (s.range === "last") return monthRange(t, -1);
    if (s.range === "90d") return { from: addDays(t, -89), to: t };
    if (s.range === "year") return yearRange(t);
    if (s.range === "custom" && s.from && s.to) return { from: s.from, to: s.to };
    return monthRange(t);
  }
  const url = () => "/api/reports" + qs({ ...bounds(), granularity: s.granularity, walletId: s.walletId });

  mount(
    view,
    html`<div class="stack">
      <section class="card stack" aria-label="Filter laporan">
        <div class="between wrap">
          <div class="chips" role="group" aria-label="Rentang waktu">${RANGES.map(([k, l]) => html`<button class="chip" data-range="${k}" aria-pressed="${k === s.range}">${l}</button>`)}</div>
          <div class="row-flex wrap">
            <select class="select" data-f="granularity" aria-label="Granularitas" style="width:auto">${GRAN.map(([k, l]) => html`<option value="${k}" ${k === s.granularity ? raw("selected") : ""}>${l}</option>`)}</select>
            <select class="select" data-f="walletId" aria-label="Dompet" style="width:auto"><option value="">Semua dompet</option>${boot.wallets.map((w) => html`<option value="${w.id}" ${w.id === s.walletId ? raw("selected") : ""}>${w.name}</option>`)}</select>
          </div>
        </div>
        <div class="row-flex wrap" data-custom ${s.range === "custom" ? "" : raw("hidden")}>
          <label class="row-flex small muted">Dari <input class="input" type="date" data-from value="${s.from}" style="width:auto" /></label>
          <label class="row-flex small muted">Sampai <input class="input" type="date" data-to value="${s.to}" style="width:auto" /></label>
        </div>
      </section>
      <div data-result></div>
    </div>`
  );
  const result = $("[data-result]", view);

  function render(r) {
    last = r;
    cleanups.forEach((fn) => fn && fn());
    cleanups = [];
    const empty = r.totals.income === 0 && r.totals.expense === 0;
    const net = r.totals.net;
    const statusLabel = { surplus: "Surplus", deficit: "Defisit", balanced: "Seimbang" }[r.totals.status];
    const series = r.series.map((p) => ({ label: bucketLabel(p.bucket, r.granularity), tip: r.granularity === "day" ? fmtDate(p.bucket) : bucketLabel(p.bucket, r.granularity), income: p.income, expense: p.expense, net: p.net, cumulative: p.cumulative }));
    const excluded = [
      r.excluded.transfer.count ? `${r.excluded.transfer.count} mutasi transfer` : "",
      r.excluded.debt.count ? `${r.excluded.debt.count} mutasi hutang/piutang` : "",
      r.excluded.adjustment.count ? `${r.excluded.adjustment.count} penyesuaian saldo` : "",
    ].filter(Boolean);

    mount(
      result,
      html`<div class="stack stagger">
        <div class="between wrap"><p class="muted small">${fmtDate(r.from)} – ${fmtDate(r.to)} · ${r.days} hari · ${r.transactionCount} transaksi${s.walletId ? " · satu dompet" : ""}</p></div>
        <div class="bento">
          <div class="card col-4 col-half-sm"><div class="eyebrow">Pemasukan</div><div class="kpi__value num pos">${money(r.totals.income)}</div>${change(r.change.income)}</div>
          <div class="card col-4 col-half-sm"><div class="eyebrow">Pengeluaran</div><div class="kpi__value num">${money(r.totals.expense)}</div>${change(r.change.expense, { goodWhenUp: false })}</div>
          <div class="card col-4"><div class="between"><div class="eyebrow">Arus kas bersih</div><span class="badge ${net > 0 ? "badge--pos" : net < 0 ? "badge--neg" : ""}">${statusLabel}</span></div>
            <div class="kpi__value num ${net > 0 ? "pos" : net < 0 ? "neg" : ""}">${money(net, { sign: true })}</div>${change(r.change.net)}</div>
        </div>
        ${excluded.length ? html`<p class="alert">${icon("info", "icon--sm")}<span>Tidak dihitung sebagai pemasukan/pengeluaran: ${excluded.join(", ")}. Uang yang hanya berpindah atau dipinjam bukan pendapatan maupun konsumsi.</span></p>` : ""}

        ${empty
          ? html`<div class="card">${emptyState({ art: emptyArt.reports, title: "Belum ada data pada rentang ini", text: "Pilih rentang waktu lain, atau catat transaksi untuk melihat analisisnya." })}</div>`
          : html`<section class="card" aria-label="Pemasukan dan pengeluaran">
                <div class="card__head wrap"><h3>Pemasukan vs pengeluaran</h3>
                  <div class="row-flex">${legend([{ name: "Pemasukan", color: "var(--chart-income)" }, { name: "Pengeluaran", color: "var(--chart-expense)" }])}
                    <button class="btn btn--sm" data-table aria-pressed="${s.table}">${icon("list", "icon--sm")}${s.table ? "Grafik" : "Tabel"}</button></div></div>
                ${s.table
                  ? html`<div class="table-wrap"><table class="data"><thead><tr><th>Periode</th><th>Pemasukan</th><th>Pengeluaran</th><th>Bersih</th><th>Kumulatif</th></tr></thead>
                      <tbody>${series.map((p) => html`<tr><td>${p.tip}</td><td class="num">${money(p.income)}</td><td class="num">${money(p.expense)}</td><td class="num ${p.net < 0 ? "neg" : ""}">${money(p.net, { sign: true })}</td><td class="num">${money(p.cumulative, { sign: true })}</td></tr>`)}</tbody></table></div>`
                  : html`<div data-bars></div>`}
              </section>

              <section class="card" aria-label="Tren arus kas">
                <div class="card__head"><h3>Tren arus kas kumulatif</h3><span class="small muted">selisih pemasukan − pengeluaran, berjalan</span></div>
                <div data-line></div>
              </section>

              <div class="bento">
                <section class="card col-6" aria-label="Pengeluaran per kategori">
                  <div class="card__head"><h3>Pengeluaran per kategori</h3></div>
                  ${r.expenseByCategory.length ? html`<div data-donut-exp></div>` : html`<p class="muted small">Tidak ada pengeluaran pada rentang ini.</p>`}
                </section>
                <section class="card col-6" aria-label="Pemasukan per kategori">
                  <div class="card__head"><h3>Pemasukan per kategori</h3></div>
                  ${r.incomeByCategory.length
                    ? barList(r.incomeByCategory.slice(0, 8).map((c) => ({ name: c.name, value: c.amount, note: percent(c.percent, 1), lead: html`<span>${c.icon}</span>` })), { color: "var(--chart-income)" })
                    : html`<p class="muted small">Tidak ada pemasukan pada rentang ini.</p>`}
                </section>
              </div>

              ${r.insights.length
                ? html`<section class="card" aria-label="Insight"><div class="card__head"><h3>Insight</h3></div>
                    <div class="grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">${r.insights.map(
                      (i) => html`<div class="row-flex" style="align-items:flex-start"><span class="tile tile--sm" style="--c:var(--${TONE[i.tone][0]})">${icon(TONE[i.tone][1], "icon--sm")}</span>
                        <div><div class="row__title">${i.title}${i.amount ? html` · <span class="num">${money(i.amount, { sign: i.tone !== "neutral" })}</span>` : ""}</div><div class="small muted">${i.text}</div></div></div>`
                    )}</div></section>`
                : ""}`}

        <div class="bento">
          <section class="card col-6" aria-label="Pemakaian budget">
            <div class="card__head"><h3>Pemakaian budget</h3><a href="/budgets" data-link class="small">Kelola</a></div>
            ${r.budgetUtilization.budgets.length
              ? html`<div class="stack">${r.budgetUtilization.budgets.slice(0, 6).map(
                  (b) => html`<div><div class="between small"><span class="truncate">${b.icon} ${b.name}${b.walletName ? html` <span class="muted">· ${b.walletName}</span>` : ""}</span><span class="num ${b.status === "over" ? "neg" : b.status === "warning" ? "warn" : "muted"}">${percent(b.percent)}</span></div>
                    <div class="progress ${b.status === "over" ? "progress--neg" : b.status === "warning" ? "progress--warn" : "progress--lava"}" style="--p:${Math.min(b.percent, 100)}%;margin-top:6px"><i></i></div>
                    <div class="tiny muted num" style="margin-top:4px">${money(b.spent)} dari ${money(b.limit)}</div></div>`
                )}</div>`
              : html`<p class="muted small">Belum ada budget pada bulan akhir rentang ini.</p>`}
          </section>
          <section class="card col-6" aria-label="Distribusi saldo dompet">
            <div class="card__head"><h3>Distribusi saldo dompet</h3><span class="small muted">saat ini</span></div>
            ${r.walletDistribution.some((w) => w.balance > 0) ? html`<div data-donut-wallet></div>` : html`<p class="muted small">Belum ada saldo.</p>`}
          </section>
        </div>
      </div>`
    );

    const bars = $("[data-bars]", result);
    if (bars) cleanups.push(incomeExpenseBars(bars, series, { height: 260 }));
    const line = $("[data-line]", result);
    if (line) cleanups.push(trendLine(line, series.map((p) => ({ label: p.label, tip: p.tip, value: p.cumulative }))));
    const de = $("[data-donut-exp]", result);
    if (de) donut(de, foldSlices(r.expenseByCategory.map((c) => ({ name: `${c.icon} ${c.name}`, value: c.amount }))), { centerLabel: "Pengeluaran" });
    const dw = $("[data-donut-wallet]", result);
    if (dw) donut(dw, foldSlices(r.walletDistribution.filter((w) => w.balance > 0).map((w) => ({ name: w.name, value: w.balance }))), { centerLabel: "Total saldo" });
  }

  const part = live(result, url, { skeleton, render });
  const apply = () => {
    const b = s.range === "custom" ? { from: s.from, to: s.to } : {};
    history.replaceState({}, "", "/reports" + qs({ range: s.range === "month" ? "" : s.range, ...b, granularity: s.granularity, walletId: s.walletId }));
    part.refresh();
  };
  view.onchange = (e) => {
    if (e.target.dataset.f) {
      s[e.target.dataset.f] = e.target.value;
      return apply();
    }
    if (e.target.matches("[data-from],[data-to]")) {
      s.from = $("[data-from]", view).value;
      s.to = $("[data-to]", view).value;
      if (s.from && s.to) {
        if (s.to < s.from) return toast("Tanggal akhir harus setelah tanggal awal.", "error");
        apply();
      }
    }
  };
  view.onclick = (e) => {
    const chip = e.target.closest("[data-range]");
    if (chip) {
      s.range = chip.dataset.range;
      view.querySelectorAll("[data-range]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      $("[data-custom]", view).hidden = s.range !== "custom";
      if (s.range !== "custom" || (s.from && s.to)) apply();
      return;
    }
    if (e.target.closest("[data-table]") && last) {
      s.table = !s.table;
      render(last);
    }
  };

  return {
    refresh: part.refresh,
    destroy() {
      part.destroy();
      cleanups.forEach((fn) => fn && fn());
      view.onclick = null;
      view.onchange = null;
    },
  };
}
