/**
 * Ledger — satu-satunya tempat saldo dompet boleh berubah.
 *
 * Aturan:
 * 1. Selalu dipanggil di dalam prisma.$transaction, bersama penulisan baris
 *    Transaction yang menjelaskan perubahan itu.
 * 2. Perubahan memakai increment/decrement di database (bukan baca-hitung-tulis),
 *    sehingga request bersamaan tidak saling menimpa.
 * 3. Pengurangan dijaga dengan syarat `balance >= jumlah` pada pernyataan UPDATE
 *    yang sama, sehingga saldo tidak bisa menjadi negatif akibat race.
 */
const { conflict, notFound } = require("../lib/errors");

const num = (v) => (v == null ? 0 : Number(v));

/** Dampak sebuah mutasi terhadap saldo: positif = uang masuk. */
function signed(direction, amount) {
  return direction === "in" ? num(amount) : -num(amount);
}

/**
 * Terapkan beberapa perubahan saldo sekaligus. Dompet diproses berurutan
 * menurut id agar dua transaksi bersamaan tidak saling mengunci (deadlock).
 * @param tx Prisma transaction client
 * @param {string} userId
 * @param {Array<{ walletId: string, delta: number }>} changes
 */
async function applyDeltas(tx, userId, changes) {
  const net = new Map();
  for (const c of changes) {
    if (!c.walletId || !c.delta) continue;
    net.set(c.walletId, (net.get(c.walletId) || 0) + c.delta);
  }
  const ordered = [...net.entries()].filter(([, d]) => d !== 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (const [walletId, delta] of ordered) {
    if (delta > 0) {
      const r = await tx.wallet.updateMany({ where: { id: walletId, userId }, data: { balance: { increment: delta } } });
      if (r.count === 0) throw notFound("Dompet tidak ditemukan.");
    } else {
      const need = -delta;
      const r = await tx.wallet.updateMany({
        where: { id: walletId, userId, balance: { gte: need } },
        data: { balance: { decrement: need } },
      });
      if (r.count === 0) {
        const w = await tx.wallet.findFirst({ where: { id: walletId, userId }, select: { name: true } });
        if (!w) throw notFound("Dompet tidak ditemukan.");
        throw conflict(`Saldo dompet ${w.name} tidak mencukupi.`, "INSUFFICIENT_BALANCE");
      }
    }
  }
}

const applyDelta = (tx, userId, walletId, delta) => applyDeltas(tx, userId, [{ walletId, delta }]);

/**
 * Rekonsiliasi: bandingkan saldo tersimpan dengan saldo awal + Σ mutasi.
 * Dipakai test dan endpoint diagnostik; selisih ≠ 0 berarti ada bug integritas.
 */
async function reconcile(db, userId) {
  const [wallets, sums] = await Promise.all([
    db.wallet.findMany({ where: { userId }, select: { id: true, name: true, balance: true, initialBalance: true } }),
    db.transaction.groupBy({
      by: ["walletId", "direction"],
      where: { userId, status: "success" },
      _sum: { amount: true },
    }),
  ]);
  const moved = new Map();
  for (const s of sums) {
    moved.set(s.walletId, (moved.get(s.walletId) || 0) + signed(s.direction, s._sum.amount));
  }
  return wallets.map((w) => {
    const expected = num(w.initialBalance) + (moved.get(w.id) || 0);
    return { walletId: w.id, name: w.name, balance: num(w.balance), expected, difference: num(w.balance) - expected };
  });
}

module.exports = { num, signed, applyDelta, applyDeltas, reconcile };
