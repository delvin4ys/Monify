/**
 * Pemformatan uang dan tanggal mengikuti preferensi pengguna.
 * Nominal selalu integer dalam satuan terkecil (IDR: rupiah, USD: sen) — tidak
 * ada aritmetika floating-point pada uang di frontend.
 */
import { boot } from "./store.js";

const prefs = () => boot.user || { displayCurrency: "IDR", numberFormat: "id-ID", dateFormat: "DMY" };
const MINOR = { IDR: 1, USD: 100 };
const SYMBOL = { IDR: "Rp", USD: "$" };

export const currency = () => prefs().displayCurrency || "IDR";
export const symbol = (ccy = currency()) => SYMBOL[ccy] || ccy;

/** 1250000 -> "Rp 1.250.000" (atau "$12,500.00" untuk USD dalam sen). */
export function money(n, { ccy = currency(), sign = false } = {}) {
  const v = Number(n) || 0;
  const div = MINOR[ccy] || 1;
  const body = new Intl.NumberFormat(prefs().numberFormat, { minimumFractionDigits: div === 100 ? 2 : 0, maximumFractionDigits: div === 100 ? 2 : 0 }).format(Math.abs(v) / div);
  const prefix = v < 0 ? "−" : sign && v > 0 ? "+" : "";
  return `${prefix}${symbol(ccy)}${ccy === "IDR" ? " " : ""}${body}`;
}

/** Ringkas untuk sumbu grafik: 1.250.000 -> "1,3 jt". */
export function compact(n, ccy = currency()) {
  const v = (Number(n) || 0) / (MINOR[ccy] || 1);
  const a = Math.abs(v);
  const f = (x, d) => new Intl.NumberFormat(prefs().numberFormat, { maximumFractionDigits: d }).format(x);
  const idr = prefs().numberFormat === "id-ID";
  if (a >= 1e9) return f(v / 1e9, 1) + (idr ? " M" : "B");
  if (a >= 1e6) return f(v / 1e6, 1) + (idr ? " jt" : "M");
  if (a >= 1e3) return f(v / 1e3, 0) + (idr ? " rb" : "K");
  return f(v, 0);
}

export const percent = (p, digits = 0) => new Intl.NumberFormat(prefs().numberFormat, { maximumFractionDigits: digits }).format(p) + "%";

/** Teks input nominal -> integer satuan terkecil (null bila kosong/tidak valid). */
export function parseMoney(text, ccy = currency()) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  if ((MINOR[ccy] || 1) === 1) {
    const digits = raw.replace(/\D/g, "");
    return digits ? Number(digits) : null;
  }
  const idr = prefs().numberFormat === "id-ID";
  const norm = idr ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  const m = norm.replace(/[^\d.]/g, "").match(/^(\d*)(?:\.(\d{0,2}))?/);
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] || 0) * 100 + Number((m[2] || "").padEnd(2, "0"));
}

/** Format nominal saat diketik (pemisah ribuan), tanpa simbol mata uang. */
export function bindMoneyInput(input, ccy = currency()) {
  const fmt = () => {
    if ((MINOR[ccy] || 1) !== 1) return;
    const digits = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 15);
    input.value = digits ? new Intl.NumberFormat(prefs().numberFormat).format(Number(digits)) : "";
  };
  input.setAttribute("inputmode", (MINOR[ccy] || 1) === 1 ? "numeric" : "decimal");
  input.setAttribute("autocomplete", "off");
  input.addEventListener("input", fmt);
  fmt();
}
export const moneyInputValue = (n, ccy = currency()) => {
  if (n == null) return "";
  const div = MINOR[ccy] || 1;
  return new Intl.NumberFormat(prefs().numberFormat, { minimumFractionDigits: div === 100 ? 2 : 0, maximumFractionDigits: div === 100 ? 2 : 0 }).format(n / div);
};

/* ─── Tanggal: selalu tanggal kalender lokal pengguna, tidak pernah lewat UTC ─ */
const pad = (n) => String(n).padStart(2, "0");
const toDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (day) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));

export const today = () => toDay(new Date());
export function addDays(day, n) {
  const d = parse(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}
export function monthRange(day = today(), offset = 0) {
  const d = parse(day);
  const first = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  return { from: toDay(first), to: toDay(last) };
}
export const yearRange = (day = today()) => ({ from: day.slice(0, 4) + "-01-01", to: day.slice(0, 4) + "-12-31" });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function date(day, { long = false, year = true } = {}) {
  if (!day) return "—";
  const y = day.slice(0, 4);
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  const mon = (long ? MONTHS_LONG : MONTHS)[m - 1];
  const f = prefs().dateFormat;
  if (f === "YMD") return day;
  if (f === "MDY") return `${mon} ${d}${year ? ", " + y : ""}`;
  return `${d} ${mon}${year ? " " + y : ""}`;
}
/** "Hari ini", "Kemarin", atau "Senin, 12 Nov 2026". */
export function dayLabel(day) {
  const t = today();
  if (day === t) return "Hari ini";
  if (day === addDays(t, -1)) return "Kemarin";
  return `${DAYS[parse(day).getDay()]}, ${date(day, { year: day.slice(0, 4) !== t.slice(0, 4) })}`;
}
export const monthLabel = (year, month) => `${MONTHS_LONG[month - 1]} ${year}`;
/** Label bucket grafik sesuai granularitas. */
export function bucketLabel(day, g) {
  const m = Number(day.slice(5, 7));
  const y = day.slice(2, 4);
  if (g === "year") return day.slice(0, 4);
  if (g === "quarter") return `K${Math.floor((m - 1) / 3) + 1} '${y}`;
  if (g === "month") return `${MONTHS[m - 1]} '${y}`;
  return `${Number(day.slice(8, 10))} ${MONTHS[m - 1]}`;
}
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
