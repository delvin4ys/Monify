/**
 * Penyimpanan lampiran (struk, bukti transaksi) — selalu privat.
 *
 * - Kunci objek berbentuk `<userId>/<acak>.<ext>`; nama file asli tidak dipakai.
 * - Tipe file ditentukan dari isi (magic bytes), bukan dari ekstensi atau
 *   Content-Type kiriman klien. Hanya gambar raster dan PDF yang diterima,
 *   sehingga tidak ada HTML/SVG/skrip yang bisa diunggah.
 * - File hanya bisa diambil lewat API setelah kepemilikan diperiksa.
 *
 * Driver: Supabase Storage (bucket privat) bila dikonfigurasi; selain itu disk lokal.
 */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { config } = require("../config");
const { badRequest, notFound, forbidden, AppError } = require("../lib/errors");

const LOCAL_DIR = process.env.VERCEL ? path.join("/tmp", "monify-uploads") : path.join(__dirname, "..", "..", "storage", "uploads");

const TYPES = [
  { ext: "jpg", mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "webp", mime: "image/webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { ext: "pdf", mime: "application/pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
];

/** @returns {{ ext: string, mime: string } | null} */
function sniff(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  return TYPES.find((t) => t.test(buffer)) || null;
}

function validate(buffer, { imagesOnly = false } = {}) {
  if (!buffer || !buffer.length) throw badRequest("File kosong.", { file: "Pilih file." });
  if (buffer.length > config.upload.maxBytes) throw new AppError(413, "FILE_TOO_LARGE", "Ukuran file maksimal 5 MB.");
  const type = sniff(buffer);
  if (!type || (imagesOnly && type.ext === "pdf")) {
    throw badRequest(imagesOnly ? "Hanya gambar JPG, PNG, atau WebP yang didukung." : "Hanya JPG, PNG, WebP, atau PDF yang didukung.", { file: "Tipe file tidak didukung." }, "UNSUPPORTED_FILE");
  }
  return type;
}

const KEY_RE = /^[A-Za-z0-9_-]+\/[a-f0-9]{32}\.(jpg|png|webp|pdf)$/;

/** Kunci hanya sah bila berada di folder milik pengguna itu sendiri. */
function assertOwnKey(userId, key) {
  if (typeof key !== "string" || !KEY_RE.test(key)) throw notFound("Lampiran tidak ditemukan.");
  if (key.split("/")[0] !== userId) throw forbidden("Lampiran ini bukan milik Anda.");
  return key;
}

let supabase = null;
function client() {
  if (!config.supabase.url || !config.supabase.key) return null;
  if (!supabase) {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(config.supabase.url, config.supabase.key, { auth: { persistSession: false } });
  }
  return supabase;
}

const driver = () => (client() ? "supabase" : "local");

async function save(userId, buffer, opts) {
  const type = validate(buffer, opts);
  const key = `${userId}/${crypto.randomBytes(16).toString("hex")}.${type.ext}`;
  const sb = client();
  if (sb) {
    const { error } = await sb.storage.from(config.supabase.bucket).upload(key, buffer, { contentType: type.mime, upsert: false });
    if (error) {
      console.error("[storage] upload gagal:", error.message);
      throw new AppError(502, "STORAGE_ERROR", "Gagal menyimpan lampiran. Coba lagi.");
    }
  } else {
    const file = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
  }
  return { key, mime: type.mime, size: buffer.length };
}

async function read(userId, key) {
  assertOwnKey(userId, key);
  const mime = (TYPES.find((t) => key.endsWith("." + t.ext)) || {}).mime || "application/octet-stream";
  const sb = client();
  if (sb) {
    const { data, error } = await sb.storage.from(config.supabase.bucket).download(key);
    if (error || !data) throw notFound("Lampiran tidak ditemukan.");
    return { buffer: Buffer.from(await data.arrayBuffer()), mime };
  }
  try {
    return { buffer: await fs.readFile(path.join(LOCAL_DIR, key)), mime };
  } catch {
    throw notFound("Lampiran tidak ditemukan.");
  }
}

async function remove(userId, key) {
  if (!key) return;
  assertOwnKey(userId, key);
  const sb = client();
  try {
    if (sb) await sb.storage.from(config.supabase.bucket).remove([key]);
    else await fs.unlink(path.join(LOCAL_DIR, key));
  } catch (e) {
    if (e && e.code !== "ENOENT") console.error("[storage] hapus gagal:", e.message);
  }
}

async function removeMany(userId, keys) {
  await Promise.all((keys || []).map((k) => remove(userId, k).catch(() => {})));
}

module.exports = { sniff, validate, assertOwnKey, save, read, remove, removeMany, driver, LOCAL_DIR };
