/**
 * Idempotency untuk operasi yang tidak punya kolom kunci sendiri (setoran
 * tabungan, pencatatan hutang). Tanpa perubahan skema:
 *
 * 1. Kunci advisory tingkat-transaksi per (pengguna, aksi, kunci) membuat request
 *    kembar yang tiba bersamaan berjalan bergantian, bukan paralel.
 * 2. Kunci idempotency disimpan di meta AuditLog, yang ditulis dalam transaksi
 *    database yang sama dengan operasinya. Request kedua menemukannya dan
 *    mengembalikan hasil yang pertama alih-alih mengulang.
 *
 * Harus dipanggil paling awal di dalam prisma.$transaction.
 * @returns {Promise<null | { entityId: string|null, meta: any }>} catatan operasi pertama bila sudah pernah dijalankan
 */
async function findReplay(tx, userId, action, key) {
  if (!key) return null;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${action}:${key}`}, 0))`;
  return tx.auditLog.findFirst({
    where: { userId, action, meta: { path: ["idempotencyKey"], equals: key } },
    select: { entityId: true, meta: true },
  });
}

module.exports = { findReplay };
