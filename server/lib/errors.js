/**
 * Error aplikasi yang aman ditampilkan ke pengguna. Error lain (Prisma, bug)
 * tidak pernah diteruskan ke klien — lihat middleware/error.js.
 */
class AppError extends Error {
  /**
   * @param {number} status  HTTP status
   * @param {string} code    kode stabil untuk klien, mis. INSUFFICIENT_BALANCE
   * @param {string} message pesan untuk pengguna
   * @param {Record<string,string>} [fields] pesan per kolom form
   */
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.expose = true;
  }
}

const badRequest = (message, fields, code = "VALIDATION_ERROR") => new AppError(400, code, message, fields);
const unauthorized = (message = "Sesi berakhir. Silakan masuk kembali.") => new AppError(401, "UNAUTHORIZED", message);
const forbidden = (message = "Akses ditolak.", code = "FORBIDDEN") => new AppError(403, code, message);
const notFound = (message = "Data tidak ditemukan.") => new AppError(404, "NOT_FOUND", message);
const conflict = (message, code = "CONFLICT") => new AppError(409, code, message);

/** Membungkus handler async agar error masuk ke error middleware. */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Format respons sukses yang konsisten: { ok: true, data } */
const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, h, ok };
