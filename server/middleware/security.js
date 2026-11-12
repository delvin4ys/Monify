const helmet = require("helmet");
const { config } = require("../config");
const { AppError, unauthorized, forbidden } = require("../lib/errors");

/** Header keamanan + Content Security Policy. Skrip hanya boleh dari origin sendiri. */
const headers = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      // Atribut style dipakai untuk nilai dinamis (lebar progress bar, warna kategori).
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "font-src": ["'self'"],
      "connect-src": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "form-action": ["'self'"],
      "base-uri": ["'self'"],
      "upgrade-insecure-requests": config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "same-origin" },
});

/**
 * Perlindungan CSRF untuk request yang mengubah data: selain cookie SameSite=Lax,
 * header Origin (bila dikirim browser) harus sama dengan host aplikasi.
 */
function sameOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("Origin");
  if (!origin) return next(); // klien non-browser; cookie SameSite tetap berlaku
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return next(forbidden("Origin tidak valid.", "BAD_ORIGIN"));
  }
  if (host !== req.get("Host")) return next(forbidden("Permintaan lintas situs ditolak.", "BAD_ORIGIN"));
  next();
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return next(unauthorized());
  req.userId = req.session.userId;
  next();
}

/**
 * Rate limiter jendela-tetap di memori.
 * Catatan: di serverless tiap instance punya hitungan sendiri, sehingga batas
 * efektif lebih longgar. Untuk skala besar ganti penyimpanannya (lihat SECURITY_GUIDELINES.md).
 */
function rateLimit({ windowMs, max, key = (req) => req.ip, message = "Terlalu banyak percobaan. Coba lagi nanti." }) {
  const hits = new Map();
  let lastSweep = Date.now();
  return function limiter(req, res, next) {
    if (config.isTest && !req.get("X-Test-Rate-Limit")) return next();
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      lastSweep = now;
    }
    const k = String(key(req));
    let e = hits.get(k);
    if (!e || e.reset <= now) {
      e = { count: 0, reset: now + windowMs };
      hits.set(k, e);
    }
    e.count += 1;
    if (e.count > max) {
      res.set("Retry-After", String(Math.ceil((e.reset - now) / 1000)));
      return next(new AppError(429, "RATE_LIMITED", message));
    }
    next();
  };
}

module.exports = { headers, sameOrigin, requireAuth, rateLimit };
