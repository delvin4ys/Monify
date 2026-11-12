/**
 * Tanggal transaksi diperlakukan sebagai tanggal kalender ("YYYY-MM-DD"),
 * bukan titik waktu. Disimpan pada 12:00 UTC hari tersebut, dan semua batas
 * periode dihitung dari string tanggal — hasilnya tidak bergantung pada zona
 * waktu server maupun browser.
 */
const { badRequest } = require("./errors");
const { config } = require("../config");

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDay(s) {
  if (typeof s !== "string" || !DAY_RE.test(s)) return false;
  const d = new Date(s + "T12:00:00.000Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "YYYY-MM-DD" -> Date pada 12:00 UTC. */
function toDate(day) {
  if (!isDay(day)) throw badRequest("Tanggal tidak valid.", { date: "Gunakan format YYYY-MM-DD." });
  return new Date(day + "T12:00:00.000Z");
}

/** Date -> "YYYY-MM-DD" (komponen UTC, konsisten dengan toDate). */
function toDay(date) {
  return date == null ? null : new Date(date).toISOString().slice(0, 10);
}

/** Tanggal hari ini menurut zona waktu aplikasi. */
function today(timeZone = config.timezone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Filter Prisma untuk rentang hari inklusif. */
function dayRange(from, to) {
  if (!isDay(from) || !isDay(to) || to < from) {
    throw badRequest("Rentang tanggal tidak valid.", { from: "Periksa tanggal awal dan akhir." });
  }
  return { gte: new Date(from + "T00:00:00.000Z"), lte: new Date(to + "T23:59:59.999Z") };
}

function addDays(day, n) {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

function diffDays(from, to) {
  return Math.round((toDate(to) - toDate(from)) / 86400000);
}

function monthBounds(year, month1to12) {
  const mm = String(month1to12).padStart(2, "0");
  const last = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

function monthOf(day) {
  return monthBounds(Number(day.slice(0, 4)), Number(day.slice(5, 7)));
}

function addMonths(year, month1to12, delta) {
  const idx = year * 12 + (month1to12 - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

module.exports = { isDay, toDate, toDay, today, dayRange, addDays, diffDays, monthBounds, monthOf, addMonths };
