/**
 * Konfigurasi terpusat. Semua nilai sensitif berasal dari environment variable;
 * tidak ada secret yang di-hardcode.
 */
require("dotenv").config();
const crypto = require("crypto");

const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const isTest = process.env.NODE_ENV === "test";

function authSecret() {
  const s = process.env.AUTH_SECRET || "";
  if (s.length >= 32) return s;
  if (isProd) {
    throw new Error("AUTH_SECRET wajib diisi (minimal 32 karakter) di production.");
  }
  if (!isTest) {
    console.warn("[config] AUTH_SECRET belum diisi — memakai secret acak sementara; sesi hilang saat server restart.");
  }
  return crypto.randomBytes(48).toString("hex");
}

const config = {
  isProd,
  isTest,
  port: Number(process.env.PORT) || 3000,
  authSecret: authSecret(),
  /** Zona waktu untuk menentukan "hari ini" bila klien tidak mengirim tanggalnya. */
  timezone: process.env.APP_TIMEZONE || "Asia/Jakarta",
  /** URL publik aplikasi, dipakai untuk tautan reset password. */
  appUrl: (process.env.APP_URL || "").replace(/\/+$/, ""),
  adminEmails: (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  supabase: {
    url: process.env.SUPABASE_URL || "",
    // Service-role key hanya boleh ada di server. Anon key dipakai sebagai cadangan
    // agar deployment lama tetap berjalan.
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "",
    bucket: process.env.SUPABASE_BUCKET || "attachments",
  },
  mail: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    from: process.env.MAIL_FROM || "",
  },
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    receiptModel: process.env.RECEIPT_MODEL || "claude-opus-5-5",
  },
  upload: {
    maxBytes: 5 * 1024 * 1024,
  },
};

module.exports = { config };
