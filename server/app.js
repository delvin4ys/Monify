/**
 * Perakitan aplikasi Express. Urutan middleware:
 *   header keamanan → asset statis (tanpa database) → sesi → halaman & API → error.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const { PrismaSessionStore } = require("@quixo3/prisma-session-store");
const { config } = require("./config");
const { prisma } = require("./lib/prisma");
const security = require("./middleware/security");
const { notFound, errorHandler } = require("./middleware/error");

const publicDir = path.join(__dirname, "..", "public");
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_EVERY = 24 * 60 * 60 * 1000;

/** Hash isi folder public/: menjadi bagian URL asset sehingga boleh di-cache selamanya. */
function assetVersion() {
  const hash = crypto.createHash("sha256");
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        hash.update(path.relative(publicDir, full));
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(publicDir);
  return hash.digest("hex").slice(0, 12);
}

function createApp() {
  const app = express();
  // Production: hash dihitung sekali. Development: dihitung ulang tiap halaman diminta,
  // supaya perubahan CSS/JS langsung terpakai (URL asset di-cache "immutable").
  let cachedVersion = assetVersion();
  const currentVersion = () => (config.isProd ? cachedVersion : (cachedVersion = assetVersion()));
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(security.headers);

  // ——— 1. Asset statis: tidak menyentuh database maupun sesi ———
  // File .html tidak pernah dilayani langsung: halaman dikirim lewat route di bawah
  // (yang memeriksa sesi untuk halaman aplikasi).
  const noHtml = (handler) => (req, res, next) => (req.path.endsWith(".html") ? next() : handler(req, res, next));
  app.use("/assets/:version", noHtml(express.static(publicDir, { index: false, immutable: true, maxAge: "365d" })));
  app.use(noHtml(express.static(publicDir, { index: false, maxAge: "1h" })));

  app.get("/api/health", (req, res) => res.json({ ok: true, data: { uptime: Math.round(process.uptime()), version: currentVersion() } }));

  // ——— 2. Sesi ———
  // Store memanggil $connect() saat dibuat tanpa menangani kegagalannya. Bila database
  // sedang tidak terjangkau, itu menjadi unhandled rejection yang mematikan proses
  // (terjadi di Vercel saat cold start). Kegagalan dicatat saja: Prisma menyambung
  // ulang sendiri pada query berikutnya.
  const storeClient = new Proxy(prisma, {
    get(target, prop) {
      if (prop === "$connect") {
        return () => target.$connect().catch((e) => console.error("[session] koneksi awal database gagal:", e && e.message));
      }
      return target[prop];
    },
  });
  const store = new PrismaSessionStore(storeClient, {
    checkPeriod: config.isTest ? undefined : 10 * 60 * 1000,
    dbRecordIdIsSessionId: true,
    dbRecordIdFunction: undefined,
  });
  // express-session memanggil touch() di SETIAP request (satu UPDATE per request).
  // Dimatikan; masa berlaku diperpanjang paling sering sekali sehari di bawah.
  store.touch = (sid, sess, cb) => cb && cb();

  app.use(
    session({
      name: "monify.sid",
      secret: config.authSecret,
      resave: false,
      saveUninitialized: false,
      store,
      cookie: { httpOnly: true, maxAge: SESSION_MAX_AGE, sameSite: "lax", secure: config.isProd },
    })
  );
  app.use((req, res, next) => {
    const s = req.session;
    if (s && s.userId && Date.now() - (s.touchedAt || 0) > SESSION_REFRESH_EVERY) s.touchedAt = Date.now();
    next();
  });

  // ——— 3. Halaman ———
  const pageCache = new Map();
  function page(name) {
    if (!pageCache.has(name) || !config.isProd) {
      const html = fs.readFileSync(path.join(publicDir, name), "utf8").replaceAll("{{V}}", currentVersion());
      pageCache.set(name, html);
    }
    return pageCache.get(name);
  }
  const sendPage = (name) => (req, res) => res.set("Cache-Control", "no-cache").type("html").send(page(name));
  const authed = (req) => Boolean(req.session && req.session.userId);

  const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];
  const APP_PAGES = ["/dashboard", "/transactions", "/wallets", "/budgets", "/savings", "/debts", "/reports", "/settings", "/admin"];

  app.get("/", (req, res) => res.redirect(authed(req) ? "/dashboard" : "/login"));
  for (const p of AUTH_PAGES) {
    app.get(p, (req, res, next) => (authed(req) && p !== "/reset-password" ? res.redirect("/dashboard") : sendPage("auth.html")(req, res, next)));
  }
  // Halaman aplikasi diproteksi di server: tanpa sesi, HTML aplikasi tidak pernah dikirim.
  for (const p of APP_PAGES) {
    app.get([p, p + "/*"], (req, res, next) => (authed(req) ? sendPage("app.html")(req, res, next) : res.redirect("/login")));
  }
  // URL lama tetap berfungsi.
  const LEGACY = { "/liabilities": "/debts", "/transactions/new": "/transactions?new=1", "/wallets/assets": "/wallets", "/demo": "/login", "/admin/users": "/admin" };
  for (const [from, to] of Object.entries(LEGACY)) app.get(from, (req, res) => res.redirect(301, to));

  // ——— 4. API ———
  app.use("/api", express.json({ limit: "100kb" }), security.sameOrigin);
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store"); // data finansial tidak boleh disimpan cache perantara
    next();
  });
  app.use("/api", require("./routes/auth"));
  app.use("/api", require("./routes/finance"));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
