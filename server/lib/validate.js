/**
 * Validasi input sisi server. Frontend juga memvalidasi untuk kenyamanan,
 * tetapi hanya lapisan ini yang dipercaya.
 */
const { badRequest } = require("./errors");
const { isDay } = require("./dates");

/** Batas atas nominal: jauh di bawah Number.MAX_SAFE_INTEGER agar penjumlahan tetap aman. */
const MAX_AMOUNT = 1_000_000_000_000_000;

const fail = (field, message) => badRequest(message, { [field]: message });

function str(src, field, { min = 1, max = 200, required = true, label = field } = {}) {
  const raw = src == null ? undefined : src[field];
  if (raw == null || raw === "") {
    if (required && min > 0) throw fail(field, `${label} wajib diisi.`);
    return null;
  }
  if (typeof raw !== "string") throw fail(field, `${label} tidak valid.`);
  // Buang karakter kontrol; teks tetap disimpan apa adanya dan di-escape saat dirender.
  const val = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (val.length < min) {
    if (!required && val.length === 0) return null;
    throw fail(field, `${label} minimal ${min} karakter.`);
  }
  if (val.length > max) throw fail(field, `${label} maksimal ${max} karakter.`);
  return val;
}

/** Nominal uang: bilangan bulat positif dalam satuan terkecil. */
function amount(src, field, { required = true, allowZero = false, label = "Jumlah" } = {}) {
  const raw = src == null ? undefined : src[field];
  if (raw == null || raw === "") {
    if (required) throw fail(field, `${label} wajib diisi.`);
    return null;
  }
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n)) throw fail(field, `${label} harus berupa bilangan bulat.`);
  if (n < 0 || (!allowZero && n === 0)) throw fail(field, `${label} harus lebih besar dari nol.`);
  if (n > MAX_AMOUNT) throw fail(field, `${label} terlalu besar.`);
  return n;
}

function day(src, field, { required = true, label = "Tanggal" } = {}) {
  const raw = src == null ? undefined : src[field];
  if (raw == null || raw === "") {
    if (required) throw fail(field, `${label} wajib diisi.`);
    return null;
  }
  if (!isDay(raw)) throw fail(field, `${label} tidak valid.`);
  return raw;
}

function oneOf(src, field, allowed, { required = true, fallback = null, label = field } = {}) {
  const raw = src == null ? undefined : src[field];
  if (raw == null || raw === "") {
    if (required && fallback == null) throw fail(field, `${label} wajib dipilih.`);
    return fallback;
  }
  if (!allowed.includes(raw)) throw fail(field, `${label} tidak valid.`);
  return raw;
}

function id(src, field, { required = true, label = field } = {}) {
  const raw = src == null ? undefined : src[field];
  if (raw == null || raw === "") {
    if (required) throw fail(field, `${label} wajib dipilih.`);
    return null;
  }
  if (typeof raw !== "string" || raw.length > 64 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw fail(field, `${label} tidak valid.`);
  return raw;
}

function bool(src, field) {
  const raw = src == null ? undefined : src[field];
  return typeof raw === "boolean" ? raw : undefined;
}

function int(src, field, { min, max, required = true, label = field } = {}) {
  const raw = src == null ? undefined : src[field];
  if (raw == null || raw === "") {
    if (required) throw fail(field, `${label} wajib diisi.`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || (min != null && n < min) || (max != null && n > max)) throw fail(field, `${label} tidak valid.`);
  return n;
}

function email(src, field = "email") {
  const raw = str(src, field, { max: 254, label: "Email" }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) throw fail(field, "Format email tidak valid.");
  return raw;
}

function password(src, field = "password", label = "Password") {
  const raw = src == null ? undefined : src[field];
  if (typeof raw !== "string" || raw.length < 8) throw fail(field, `${label} minimal 8 karakter.`);
  if (raw.length > 200) throw fail(field, `${label} terlalu panjang.`);
  return raw;
}

/** Warna aksen: hex 6 digit. */
function color(src, field = "color") {
  const raw = src == null ? undefined : src[field];
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || !/^#[0-9a-fA-F]{6}$/.test(raw)) throw fail(field, "Warna tidak valid.");
  return raw.toLowerCase();
}

/** Kunci idempotency dari klien (opsional). */
function idempotencyKey(req) {
  const raw = req.get("Idempotency-Key") || (req.body && req.body.idempotencyKey);
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || raw.length < 8 || raw.length > 80 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw badRequest("Idempotency-Key tidak valid.");
  }
  return raw;
}

const has = (src, field) => src != null && Object.prototype.hasOwnProperty.call(src, field) && src[field] !== undefined;

module.exports = { str, amount, day, oneOf, id, bool, int, email, password, color, idempotencyKey, has, MAX_AMOUNT };
