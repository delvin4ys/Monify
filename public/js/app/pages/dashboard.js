import { html, mount, icon, sk, emptyState, countUp, $ } from "../ui.js";
import { live } from "../page.js";
import { boot } from "../store.js";
import { money, percent, today, bucketLabel, monthLabel } from "../format.js";
import { incomeExpenseBars, barList, legend } from "../charts.js";
import { heroArcs, buddy, emptyArt } from "../art.js";
import { txRow, openTransactionRow, openTransaction, walletTile } from "../forms.js";
import { tile } from "../ui.js";

const HIDE_KEY = "monify-hide-balance";

function delta(change, { goodWhenUp = true } = {}) {
  if (change == null) return html`<span class="delta muted">— vs bulan lalu</span>`;
  const up = change > 0;
  const good = change === 0 ? null : up === goodWhenUp;
  return html`<span class="delta ${good == null ? "muted" : good ? "pos" : "neg"}">${icon(up ? "up" : "down", "icon--sm")}${percent(Math.abs(change), 1)} <span class="muted" style="font-weight:450">vs bulan lalu</span></span>`;
}

const skeleton = () => html`<div class="bento" aria-busy="true" aria-label="Memuat dashboard">
  <div class="hero col-8">${sk("110px", "0.8em")}<div style="margin:14px 0 22px">${sk("62%", "3rem")}</div><div class="row-flex" style="gap:32px">${sk("120px", "2.4em")}${sk("120px", "2.4em")}${sk("120px", "2.4em")}</div></div>
  <div class="card col-4">${sk("46%", "0.9em")}<div style="margin:18px 0">${sk("70%", "1.8em")}</div>${sk("100%", "12px")}<div style="margin-top:20px">${sk("100%", "44px")}</div></div>
  ${[1, 2, 3, 4].map(() => html`<div class="card col-3 col-half-sm">${sk("55%", "0.8em")}<div style="margin-top:12px">${sk("80%", "1.5em")}</div></div>`)}
  <div class="card col-8">${sk("38%", "0.9em")}<div style="margin-top:18px">${sk("100%", "220px")}</div></div>
  <div class="card col-4">${sk("46%", "0.9em")}${[1, 2, 3].map(() => html`<div style="margin-top:18px">${sk("60%", "0.8em")}<div style="margin-top:8px">${sk("100%", "8px")}</div></div>`)}</div>
  <div class="card col-7">${sk("40%", "0.9em")}${[1, 2, 3, 4, 5].map(() => html`<div class="row-flex" style="margin-top:16px">${sk("40px", "40px")}<div class="grow">${sk("55%", "0.85em")}<br />${sk("32%", "0.7em")}</div>${sk("84px", "0.9em")}</div>`)}</div>
  <div class="card col-5">${sk("40%", "0.9em")}${[1, 2, 3, 4].map(() => html`<div style="margin-top:18px">${sk("100%", "0.8em")}<div style="margin-top:8px">${sk("100%", "8px")}</div></div>`)}</div>
</div>`;

export default function dashboard(view) {
  let cleanupChart = null;
  let hidden = false;
  try {
    hidden = localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    /* abaikan */
  }
  const mask = (text) => (hidden ? "••••••" : text);

  function render(d) {
    if (cleanupChart) cleanupChart();
    const name = (boot.user.name || "").split(" ")[0];
    const y = Number(d.today.slice(0, 4));
    const m = Number(d.today.slice(5, 7));

    // Pengguna baru: belum ada dompet — arahkan ke langkah pertama, bukan dashboard kosong.
    if (!d.wallets.length) {
      mount(
        view,
        html`<div class="card">${emptyState({
          art: emptyArt.wallets,
          title: `Selamat datang${name ? ", " + name : ""}!`,
          text: "Mulai dengan menambahkan dompet pertamamu — rekening bank, e-wallet, atau uang tunai. Setelah itu kamu bisa mencatat transaksi.",
          action: html`<a class="btn btn--primary" href="/wallets?new=1" data-link>${icon("plus", "icon--sm")}Tambah dompet</a>`,
        })}</div>`
      );
      return;
    }

    const net = d.totals.net;
    const b = d.budget.summary;
    const bStatus = b.percent >= 100 ? "over" : b.percent >= 80 ? "warning" : "ok";
    const hasTrend = d.trend.some((p) => p.income || p.expense);

    mount(
      view,
      html`<div class="bento stagger">
        <section class="hero col-8" aria-label="Ringkasan saldo">
          ${heroArcs}
          <div class="between">
            <span class="eyebrow">Total saldo · ${d.wallets.filter((w) => w.active).length} dompet</span>
            <button class="btn btn--ghost btn--icon btn--sm" data-toggle-hide aria-pressed="${hidden}" aria-label="${hidden ? "Tampilkan saldo" : "Sembunyikan saldo"}">${icon(hidden ? "eyeoff" : "eye", "icon--sm")}</button>
          </div>
          <div class="hero__value num" data-balance>${mask(money(d.balance))}</div>
          <div class="row-flex wrap" style="gap:var(--s-5) var(--s-6)">
            <div><div class="tiny muted">Pemasukan ${monthLabel(y, m).split(" ")[0]}</div><div class="num pos" style="font-weight:620;font-size:var(--fs-lg)">${mask(money(d.totals.income))}</div></div>
            <div><div class="tiny muted">Pengeluaran</div><div class="num" style="font-weight:620;font-size:var(--fs-lg)">${mask(money(d.totals.expense))}</div></div>
            <div><div class="tiny muted">Arus kas bersih</div><div class="num ${net < 0 ? "neg" : net > 0 ? "pos" : ""}" style="font-weight:620;font-size:var(--fs-lg)">${mask(money(net, { sign: true }))} <span class="badge ${net < 0 ? "badge--neg" : net > 0 ? "badge--pos" : ""}">${net > 0 ? "Surplus" : net < 0 ? "Defisit" : "Seimbang"}</span></div></div>
          </div>
        </section>

        <section class="card col-4" aria-label="Budget bulan ini">
          <div class="card__head"><h3>Budget ${monthLabel(y, m).split(" ")[0]}</h3><a href="/budgets" data-link class="small">Kelola</a></div>
          ${d.budget.count === 0
            ? html`<p class="muted small">Belum ada budget bulan ini. Tetapkan batas belanja per kategori supaya pengeluaran terkendali.</p><a class="btn btn--sm" style="margin-top:12px" href="/budgets?new=1" data-link>${icon("plus", "icon--sm")}Buat budget</a>`
            : html`<div class="between"><span class="num" style="font-size:var(--fs-xl);font-weight:630">${percent(b.percent)}</span><span class="small muted num">${money(b.totalSpent)} / ${money(b.totalLimit)}</span></div>
                <div class="progress progress--lg ${bStatus === "over" ? "progress--neg" : bStatus === "warning" ? "progress--warn" : "progress--lava"}" style="--p:${Math.min(b.percent, 100)}%;margin:10px 0 14px" role="progressbar" aria-valuenow="${Math.round(b.percent)}" aria-valuemin="0" aria-valuemax="100"><i></i></div>
                ${d.budget.attention.length
                  ? html`<div class="row-flex" style="align-items:flex-start">${buddy(d.budget.attention[0].status)}<div class="small"><strong>${d.budget.attention[0].status === "over" ? "Lewat batas" : "Hampir habis"}:</strong> ${d.budget.attention
                      .slice(0, 3)
                      .map((x) => `${x.name} ${percent(x.percent)}`)
                      .join(", ")}.</div></div>`
                  : html`<div class="row-flex">${buddy("ok")}<span class="small muted">Semua budget masih aman. Sisa <span class="num">${money(Math.max(b.remaining, 0))}</span>.</span></div>`}`}
        </section>

        <div class="card col-3 col-half-sm"><div class="eyebrow">Pemasukan</div><div class="kpi__value num" data-count="${d.totals.income}">${money(d.totals.income)}</div>${delta(d.change.income)}</div>
        <div class="card col-3 col-half-sm"><div class="eyebrow">Pengeluaran</div><div class="kpi__value num" data-count="${d.totals.expense}">${money(d.totals.expense)}</div>${delta(d.change.expense, { goodWhenUp: false })}</div>
        <a class="card card--hover col-3 col-half-sm" href="/debts" data-link><div class="eyebrow">Hutang saya</div><div class="kpi__value num">${money(d.debts.payable)}</div><span class="delta muted">${d.debts.payableCount} catatan berjalan</span></a>
        <a class="card card--hover col-3 col-half-sm" href="/debts?tab=RECEIVABLE" data-link><div class="eyebrow">Piutang</div><div class="kpi__value num">${money(d.debts.receivable)}</div><span class="delta muted">${d.debts.receivableCount} catatan berjalan</span></a>

        <section class="card col-8" aria-label="Arus kas enam bulan">
          <div class="card__head"><h3>Pemasukan vs pengeluaran</h3>${legend([{ name: "Pemasukan", color: "var(--chart-income)" }, { name: "Pengeluaran", color: "var(--chart-expense)" }])}</div>
          ${hasTrend ? html`<div data-trend></div>` : emptyState({ art: emptyArt.reports, title: "Belum ada data grafik", text: "Grafik muncul setelah kamu mencatat pemasukan atau pengeluaran." })}
        </section>

        <section class="card col-4" aria-label="Tabungan">
          <div class="card__head"><h3>Tujuan tabungan</h3><a href="/savings" data-link class="small">Lihat</a></div>
          ${d.savings.goals.length
            ? html`<div class="stack">${d.savings.goals.map(
                (g) => html`<div><div class="between small"><span class="truncate">${g.icon} ${g.name}</span><span class="num muted">${percent(g.percent)}</span></div>
                  <div class="progress progress--pos" style="--p:${g.percent}%;margin-top:6px"><i></i></div>
                  <div class="tiny muted num" style="margin-top:4px">${money(g.savedAmount)} dari ${money(g.targetAmount)}</div></div>`
              )}</div>`
            : html`<p class="muted small">Punya target? Dana darurat, laptop baru, liburan — pantau progresnya di sini.</p><a class="btn btn--sm" style="margin-top:12px" href="/savings?new=1" data-link>${icon("plus", "icon--sm")}Buat tujuan</a>`}
        </section>

        <section class="card card--flush col-7" aria-label="Transaksi terbaru">
          <div class="card__head card__head--pad"><h3>Transaksi terbaru</h3><a href="/transactions" data-link class="small">Semua</a></div>
          ${d.recent.length
            ? html`<div class="list" data-recent>${d.recent.map(txRow)}</div>`
            : emptyState({ art: emptyArt.transactions, title: "Belum ada transaksi", text: "Catat pengeluaran atau pemasukan pertamamu.", action: html`<button class="btn btn--primary" data-new>${icon("plus", "icon--sm")}Transaksi baru</button>` })}
        </section>

        <div class="col-5 stack">
          <section class="card" aria-label="Pengeluaran terbesar">
            <div class="card__head"><h3>Pengeluaran terbesar bulan ini</h3></div>
            ${d.topExpenses.length
              ? barList(d.topExpenses.map((t) => ({ name: t.name, value: t.amount, note: percent(t.percent), lead: html`<span>${t.icon}</span>` })))
              : html`<p class="muted small">Belum ada pengeluaran bulan ini.</p>`}
          </section>
          <section class="card card--flush" aria-label="Dompet">
            <div class="card__head card__head--pad"><h3>Dompet</h3><a href="/wallets" data-link class="small">Kelola</a></div>
            <div class="list">${d.wallets
              .filter((w) => w.active)
              .slice(0, 5)
              .map((w) => html`<a class="row" href="/transactions?walletId=${w.id}&range=all" data-link>${walletTile(w, "sm")}<span class="grow row__title truncate">${w.name}</span><span class="num row__amount">${mask(money(w.balance, { ccy: w.currency }))}</span></a>`)}</div>
          </section>
        </div>
      </div>`
    );

    const trendEl = $("[data-trend]", view);
    if (trendEl) cleanupChart = incomeExpenseBars(trendEl, d.trend.map((p) => ({ label: bucketLabel(p.bucket, "month"), income: p.income, expense: p.expense })));
    if (!hidden) view.querySelectorAll("[data-count]").forEach((el) => countUp(el, Number(el.dataset.count), (n) => money(n)));

    const byId = new Map(d.recent.map((t) => [t.id, t]));
    view.onclick = (e) => {
      const row = e.target.closest("[data-tx]");
      if (row) return openTransactionRow(byId.get(row.dataset.tx));
      if (e.target.closest("[data-new]")) return openTransaction();
      if (e.target.closest("[data-toggle-hide]")) {
        hidden = !hidden;
        try {
          localStorage.setItem(HIDE_KEY, hidden ? "1" : "0");
        } catch {
          /* abaikan */
        }
        render(d);
      }
    };
  }

  const part = live(view, () => "/api/dashboard?today=" + today(), { skeleton, render });
  return {
    refresh: part.refresh,
    destroy() {
      part.destroy();
      if (cleanupChart) cleanupChart();
      view.onclick = null;
    },
  };
}
