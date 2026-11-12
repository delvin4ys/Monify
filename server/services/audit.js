/**
 * Jejak audit untuk aktivitas finansial dan keamanan penting.
 * Ditulis di dalam transaksi database yang sama dengan perubahannya,
 * sehingga tidak ada perubahan tanpa jejak maupun jejak tanpa perubahan.
 */
function record(db, userId, action, entity, entityId, meta) {
  return db.auditLog.create({
    data: { userId, action, entity, entityId: entityId || null, meta: meta || undefined },
  });
}

module.exports = { record };
