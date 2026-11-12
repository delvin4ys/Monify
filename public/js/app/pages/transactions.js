import { html, mount, icon, raw, skRows, sk, emptyState, debounce, toast, $ } from "../ui.js";
import { live } from "../page.js";
import { api, qs } from "../api.js";
import { boot } from "../store.js";
import { money, today, monthRange, yearRange, addDays, dayLabel } from "../format.js";
import { emptyArt } from "../art.js";
import { txRow, openTransactionRow, openTransaction } from "../forms.js";

const RANGES = [
  ["month", "Bulan ini"],
  ["last", "Bulan lalu"],
  ["90d", "90 hari"],
  ["year", "Tahun ini"],
  ["all", "Semua"],
  ["custom", "Kustom"],
];
const KINDS = [
  ["", "Semua jenis"],
  ["expense", "Pengeluaran"],
  ["income", "Pemasukan"],
  ["transfer", "Transfer"],
  ["debt", "Hutang/piutang"],
  ["adjustment", "Penyesuaian"],
];
const PAGE = 50;

export default function transactions(view, { params }) {
  const s = {
    range: params.get("range") || (params.get("from") ? "custom" : "month"),
    from: params.get("from") || "",
    to: params.get("to") || "",
    walletId: params.get("walletId") || "",
    categoryId: params.get("categoryId") || "",
    kind: params.get("kind") || "",
    q: params.get("q") || "",
    sort: params.get("sort") || "date_desc",
  };
  let items = [];
  let nextCursor = null;
  let loadingMore = false;
  let observer = null;

  function bounds() {
    const t = today();
    if (s.range === "month") return monthRange(t);
    if (s.range === "last") return monthRange(t, -1);
    if (s.range === "90d") return { from: addDays(t, -89), to: t };
    if (s.range === "year") return yearRange(t);
    if (s.range === "custom" && s.from && s.to) return { from: s.from, to: s.to };
    return {};
  }
  const url = (cursor) => "/api/transactions" + qs({ ...bounds(), walletId: s.walletId, categoryId: s.categoryId, kind: s.kind, q: s.q, sort: s.sort, limit: PAGE, cursor });

  function syncUrl() {
    const b = s.range === "custom" ? { from: s.from, to: s.to } : {};
    history.replaceState({}, "", "/transactions" + qs({ range: s.range === "month" ? "" : s.range, ...b, walletId: s.walletId, categoryId: s.categoryId, kind: s.kind, q: s.q, sort: s.sort === "date_desc" ? "" : s.sort }));
  }

  mount(
    view,
    html`<div class="stack">
      <section class="card stack" aria-label="Filter">
        <div class="row-flex wrap">
          <div class="grow" style="position:relative;min-width:200px">
            <span style="position:absolute;left:12px;top:12px;color:var(--text-3)">${icon("search")}</span>
            <input class="input" type="search" data-q placeholder="Cari deskripsi, kategori, dompet…" aria-label="Cari transaksi" value="${s.q}" style="padding-left:40px" />
          </div>
          <select class="select" data-f="walletId" aria-label="Dompet" style="width:auto;min-width:150px">
            <option value="">Semua dompet</option>${boot.wallets.map((w) => html`<option value="${w.id}" ${w.id === s.walletId ? raw("selected") : ""}>${w.name}</option>`)}
          </select>
          <select class="select" data-f="categoryId" aria-label="Kategori" style="width:auto;min-width:160px">
            <option value="">Semua kategori</option>
            <optgroup label="Pengeluaran">${boot.categories.filter((c) => c.type === "expense").map((c) => html`<option value="${c.id}" ${c.id === s.categoryId ? raw("selected") : ""}>${c.icon} ${c.name}</option>`)}</optgroup>
            <optgroup label="Pemasukan">${boot.categories.filter((c) => c.type === "income").map((c) => html`<option value="${c.id}" ${c.id === s.categoryId ? raw("selected") : ""}>${c.icon} ${c.name}</option>`)}</optgroup>
          </select>
          <select class="select" data-f="kind" aria-label="Jenis" style="width:auto;min-width:150px">${KINDS.map(([k, l]) => html`<option value="${k}" ${k === s.kind ? raw("selected") : ""}>${l}</option>`)}</select>
          <select class="select" data-f="sort" aria-label="Urutkan" style="width:auto;min-width:150px">
            ${[["date_desc", "Terbaru"], ["date_asc", "Terlama"], ["amount_desc", "Nominal terbesar"], ["amount_asc", "Nominal terkecil"]].map(([k, l]) => html`<option value="${k}" ${k === s.sort ? raw("selected") : ""}>${l}</option>`)}
          </select>
        </div>
        <div class="chips" role="group" aria-label="Rentang waktu">${RANGES.map(([k, l]) => html`<button class="chip" data-range="${k}" aria-pressed="${k === s.range}">${l}</button>`)}</div>
        <div class="row-flex wrap" data-custom ${s.range === "custom" ? "" : raw("hidden")}>
          <label class="row-flex small muted">Dari <input class="input" type="date" data-from value="${s.from}" style="width:auto" /></label>
          <label class="row-flex small muted">Sampai <input class="input" type="date" data-to value="${s.to}" style="width:auto" /></label>
        </div>
      </section>
      <div data-result></div>
    </div>`
  );
  const result = $("[data-result]", view);

  const skeleton = () => html`<div class="stack" aria-busy="true" aria-label="Memuat transaksi">
    <div class="bento">${[1, 2, 3].map(() => html`<div class="card col-4">${sk("50%", "0.8em")}<div style="margin-top:10px">${sk("70%", "1.5em")}</div></div>`)}</div>
    <div class="card card--flush">${skRows(8)}</div>
  </div>`;

  function listHtml() {
    const sortedByDate = s.sort.startsWith("date");
    if (!sortedByDate) return html`<div class="list">${items.map(txRow)}</div>`;
    const out = [];
    let day = null;
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const net = group.reduce((n, t) => n + (t.status === "success" && (t.kind === "income" || t.kind === "expense") ? (t.kind === "income" ? t.amount : -t.amount) : 0), 0);
      out.push(html`<div class="group-head"><span>${dayLabel(day)}</span><span class="num ${net > 0 ? "pos" : ""}">${net ? money(net, { sign: true }) : ""}</span></div>${group.map(txRow)}`);
      group = [];
    };
    for (const t of items) {
      if (t.date !== day) {
        flush();
        day = t.date;
      }
      group.push(t);
    }
    flush();
    return html`<div class="list">${out}</div>`;
  }

  function render(data) {
    items = data.items.slice();
    nextCursor = data.nextCursor;
    const t = data.totals;
    const filtered = Boolean(s.q || s.walletId || s.categoryId || s.kind || s.range !== "month");
    mount(
      result,
      html`<div class="stack">
        <div class="bento">
          <div class="card col-4 col-half-sm"><div class="eyebrow">Pemasukan</div><div class="kpi__value num pos">${money(t.income)}</div></div>
          <div class="card col-4 col-half-sm"><div class="eyebrow">Pengeluaran</div><div class="kpi__value num">${money(t.expense)}</div></div>
          <div class="card col-4"><div class="eyebrow">Selisih · ${t.count} transaksi</div><div class="kpi__value num ${t.net < 0 ? "neg" : t.net > 0 ? "pos" : ""}">${money(t.net, { sign: true })}</div></div>
        </div>
        <section class="card card--flush" aria-label="Daftar transaksi">
          ${items.length
            ? html`<div data-list>${listHtml()}</div>
                <div data-more style="padding:var(--s-4);text-align:center" ${nextCursor ? "" : raw("hidden")}><button class="btn btn--sm" data-load-more>Muat lebih banyak</button></div>`
            : filtered
              ? emptyState({ art: emptyArt.search, title: "Tidak ada yang cocok", text: "Coba ubah kata kunci, rentang waktu, atau filter.", action: html`<button class="btn" data-reset>Hapus filter</button>` })
              : emptyState({ art: emptyArt.transactions, title: "Belum ada transaksi bulan ini", text: "Catat pengeluaran atau pemasukan pertamamu.", action: html`<button class="btn btn--primary" data-new>${icon("plus", "icon--sm")}Transaksi baru</button>` })}
        </section>
      </div>`
    );
    watchMore();
  }

  async function loadMore() {
    if (loadingMore || !nextCursor) return;
    loadingMore = true;
    const btn = $("[data-load-more]", result);
    if (btn) btn.setAttribute("aria-busy", "true");
    try {
      const data = await api.get(url(nextCursor));
      items = items.concat(data.items);
      nextCursor = data.nextCursor;
      mount($("[data-list]", result), listHtml());
      const more = $("[data-more]", result);
      if (more) more.hidden = !nextCursor;
    } catch (err) {
      toast(err.message, "error");
    } finally {
      loadingMore = false;
      if (btn) btn.removeAttribute("aria-busy");
    }
  }
  function watchMore() {
    if (observer) observer.disconnect();
    const more = $("[data-more]", result);
    if (!more || !("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "400px" });
    observer.observe(more);
  }

  const part = live(result, () => url(), { skeleton, render });
  const apply = () => {
    syncUrl();
    part.refresh();
  };

  // onchange/onclick (bukan addEventListener): elemen view dipakai ulang antar halaman.
  view.onchange = (e) => {
    const f = e.target.dataset.f;
    if (f) {
      s[f] = e.target.value;
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
  $("[data-q]", view).addEventListener(
    "input",
    debounce((e) => {
      s.q = e.target.value.trim();
      apply();
    }, 320)
  );
  view.onclick = (e) => {
    const chip = e.target.closest("[data-range]");
    if (chip) {
      s.range = chip.dataset.range;
      view.querySelectorAll("[data-range]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      $("[data-custom]", view).hidden = s.range !== "custom";
      if (s.range !== "custom" || (s.from && s.to)) apply();
      return;
    }
    const row = e.target.closest("[data-tx]");
    if (row) return openTransactionRow(items.find((t) => t.id === row.dataset.tx));
    if (e.target.closest("[data-load-more]")) return loadMore();
    if (e.target.closest("[data-new]")) return openTransaction();
    if (e.target.closest("[data-reset]")) {
      Object.assign(s, { range: "month", from: "", to: "", walletId: "", categoryId: "", kind: "", q: "" });
      window.dispatchEvent(new CustomEvent("monify:navigate", { detail: "/transactions" }));
    }
  };

  if (params.get("new")) {
    history.replaceState({}, "", "/transactions");
    openTransaction();
  }

  return {
    refresh: part.refresh,
    destroy() {
      part.destroy();
      if (observer) observer.disconnect();
      view.onclick = null;
      view.onchange = null;
    },
  };
}
