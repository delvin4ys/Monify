const { Prisma } = require("@prisma/client");
const { config } = require("../config");
const { AppError } = require("../lib/errors");

function notFound(req, res) {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Endpoint tidak ditemukan." } });
  }
  res.status(404).sendFile(require("path").join(__dirname, "..", "..", "public", "404.html"));
}

/**
 * Penanganan error terpusat. Hanya AppError yang pesannya diteruskan ke klien;
 * error lain (Prisma, bug) dicatat di server dan dibalas dengan pesan umum,
 * sehingga nama tabel, kolom, atau query tidak pernah bocor.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Hanya AppError milik aplikasi — error pustaka (mis. body-parser) juga punya `expose`.
  if (err instanceof AppError) {
    return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ ok: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Data yang dikirim terlalu besar." } });
  }
  if (err && (err.type === "entity.parse.failed" || err instanceof SyntaxError)) {
    return res.status(400).json({ ok: false, error: { code: "BAD_JSON", message: "Format data tidak valid." } });
  }
  if (err && err.name === "MulterError") {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    return res.status(tooBig ? 413 : 400).json({ ok: false, error: { code: tooBig ? "FILE_TOO_LARGE" : "BAD_UPLOAD", message: tooBig ? "Ukuran file maksimal 5 MB." : "Unggahan tidak valid." } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Pelanggaran aturan integritas database (CHECK / FK / unique) = konflik, bukan error server.
    if (["P2002", "P2003", "P2004", "P2014", "P2034"].includes(err.code)) {
      if (!config.isTest) console.warn("[db]", err.code, req.method, req.path);
      return res.status(409).json({ ok: false, error: { code: "CONFLICT", message: "Perubahan bentrok dengan data lain. Muat ulang lalu coba lagi." } });
    }
  }

  const id = Math.random().toString(36).slice(2, 10);
  console.error(`[error ${id}]`, req.method, req.path, err);
  res.status(500).json({ ok: false, error: { code: "INTERNAL", message: "Terjadi kesalahan di server. Coba lagi sebentar.", ref: id } });
}

module.exports = { notFound, errorHandler };
