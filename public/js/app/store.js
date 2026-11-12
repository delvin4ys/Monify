/**
 * Cache data di memori dengan pola stale-while-revalidate.
 *
 * Tujuan: pindah halaman terasa instan tanpa menampilkan angka finansial usang.
 * - Data yang pernah dimuat langsung ditampilkan dari cache (tanpa skeleton),
 *   lalu divalidasi ulang ke server di latar belakang bila umurnya > MAX_AGE.
 * - SETIAP mutasi (dari tab ini atau tab lain) menandai seluruh cache usang dan
 *   memicu muat ulang halaman aktif — setelah pengguna mengubah sesuatu, tidak
 *   ada tampilan yang bertahan dengan data lama.
 * - Cache hanya hidup di memori tab; tidak ada data finansial yang ditulis ke
 *   localStorage/sessionStorage.
 */
import { api } from "./api.js";

const MAX_AGE = 20_000;
const cache = new Map(); // url -> { data, json, at, stale }
const inflight = new Map();
const listeners = new Set();
const channel = "BroadcastChannel" in window ? new BroadcastChannel("monify") : null;

export function fetchUrl(url) {
  if (inflight.has(url)) return inflight.get(url);
  const p = api
    .get(url)
    .then((data) => {
      cache.set(url, { data, json: JSON.stringify(data), at: Date.now(), stale: false });
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

export const peek = (url) => (cache.has(url) ? cache.get(url).data : undefined);

/** Muat lebih awal (hover/sentuh pada tautan) supaya halaman berikutnya langsung siap. */
export function prefetch(url) {
  const c = cache.get(url);
  if (c && !c.stale && Date.now() - c.at < MAX_AGE) return;
  fetchUrl(url).catch(() => {});
}

/**
 * Berlangganan data sebuah URL.
 * onData dipanggil segera bila ada cache, lalu lagi bila data baru berbeda.
 * onError hanya dipanggil bila tidak ada data sama sekali untuk ditampilkan.
 * @returns {() => void} fungsi berhenti
 */
export function watch(url, onData, onError, { silent = false } = {}) {
  let alive = true;
  let shown;
  const c = cache.get(url);
  if (c) {
    shown = c.json;
    // silent: data ini sudah tampil di layar — jangan render ulang, cukup validasi.
    if (!silent) onData(c.data, { cached: true });
  }
  if (!c || c.stale || Date.now() - c.at > MAX_AGE) {
    fetchUrl(url)
      .then((data) => {
        const fresh = cache.get(url);
        if (alive && (!fresh || fresh.json !== shown)) onData(data, { cached: false });
      })
      .catch((err) => {
        if (alive && shown === undefined && onError) onError(err);
      });
  }
  return () => {
    alive = false;
  };
}

function markStale() {
  for (const entry of cache.values()) entry.stale = true;
  for (const fn of listeners) fn();
}

/** Dipanggil halaman aktif untuk memuat ulang saat data berubah. */
export function onInvalidate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearAll() {
  cache.clear();
}

window.addEventListener("monify:mutated", () => {
  markStale();
  if (channel) channel.postMessage("mutated");
});
if (channel) channel.onmessage = (e) => e.data === "mutated" && markStale();
// Kembali ke tab setelah lama ditinggal: validasi ulang.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    const oldest = Math.min(...[...cache.values()].map((c) => c.at), Date.now());
    if (Date.now() - oldest > 60_000) markStale();
  }
});

/* ─── Data referensi (pengguna, dompet, kategori) ──────────────────────────── */
export const boot = { user: null, wallets: [], categories: [], categoryParents: [], features: {} };
const BOOT_URL = "/api/bootstrap";

export async function loadBoot(force = false) {
  const data = force || !cache.has(BOOT_URL) || cache.get(BOOT_URL).stale ? await fetchUrl(BOOT_URL) : cache.get(BOOT_URL).data;
  Object.assign(boot, data);
  return boot;
}
export const wallet = (id) => boot.wallets.find((w) => w.id === id);
export const category = (id) => boot.categories.find((c) => c.id === id);
export const activeWallets = () => boot.wallets.filter((w) => w.active);
