const { prisma } = require("../lib/prisma");
const { badRequest, notFound, conflict } = require("../lib/errors");
const S = require("../lib/serializers");

/** Induk kategori bawaan. kind: expense | income */
const PRESET_PARENTS = [
  { name: "Makan & Minuman", kind: "expense", sortOrder: 10 },
  { name: "Transportasi", kind: "expense", sortOrder: 20 },
  { name: "Belanja", kind: "expense", sortOrder: 30 },
  { name: "Tagihan & Utilitas", kind: "expense", sortOrder: 40 },
  { name: "Hiburan", kind: "expense", sortOrder: 50 },
  { name: "Kesehatan & Kebugaran", kind: "expense", sortOrder: 60 },
  { name: "Pendidikan", kind: "expense", sortOrder: 70 },
  { name: "Keluarga", kind: "expense", sortOrder: 80 },
  { name: "Perawatan Diri", kind: "expense", sortOrder: 90 },
  { name: "Perawatan Pria", kind: "expense", sortOrder: 100 },
  { name: "Penghargaan Diri", kind: "expense", sortOrder: 110 },
  { name: "Hadiah & Donasi", kind: "expense", sortOrder: 120 },
  { name: "Asuransi", kind: "expense", sortOrder: 130 },
  { name: "Investasi", kind: "expense", sortOrder: 140 },
  { name: "Dana Darurat", kind: "expense", sortOrder: 150 },
  { name: "Kewajiban Finansial", kind: "expense", sortOrder: 160 },
  { name: "Denda & Sanksi", kind: "expense", sortOrder: 170 },
  { name: "Gaji & Upah", kind: "income", sortOrder: 10 },
  { name: "Freelance & Usaha", kind: "income", sortOrder: 20 },
  { name: "Bonus", kind: "income", sortOrder: 30 },
  { name: "Cashback", kind: "income", sortOrder: 40 },
  { name: "Uang Tunai Hadiah", kind: "income", sortOrder: 50 },
  { name: "Lainnya (Pemasukan)", kind: "income", sortOrder: 60 },
];

/**
 * Kategori awal untuk pengguna baru. Tidak ada kategori transfer maupun
 * hutang: keduanya adalah fitur tersendiri, bukan kategori.
 */
const CATEGORY_TEMPLATE = [
  { name: "Makan di Luar", type: "expense", icon: "🍜", color: "#f97316", parent: "Makan & Minuman" },
  { name: "Kopi & Camilan", type: "expense", icon: "☕", color: "#b45309", parent: "Makan & Minuman" },
  { name: "Belanja Dapur", type: "expense", icon: "🥬", color: "#16a34a", parent: "Makan & Minuman" },
  { name: "Bensin", type: "expense", icon: "⛽", color: "#0ea5e9", parent: "Transportasi" },
  { name: "Ojek / Taksi Online", type: "expense", icon: "🚗", color: "#0284c7", parent: "Transportasi" },
  { name: "Parkir & Tol", type: "expense", icon: "🅿️", color: "#0369a1", parent: "Transportasi" },
  { name: "Belanja Bulanan", type: "expense", icon: "🛒", color: "#db2777", parent: "Belanja" },
  { name: "Pakaian", type: "expense", icon: "👕", color: "#c026d3", parent: "Belanja" },
  { name: "Listrik & Air", type: "expense", icon: "⚡", color: "#eab308", parent: "Tagihan & Utilitas" },
  { name: "Internet & Pulsa", type: "expense", icon: "🌐", color: "#6366f1", parent: "Tagihan & Utilitas" },
  { name: "Langganan", type: "expense", icon: "🔁", color: "#8b5cf6", parent: "Tagihan & Utilitas" },
  { name: "Sewa / Kos", type: "expense", icon: "🏠", color: "#78716c", parent: "Tagihan & Utilitas" },
  { name: "Nonton / Film", type: "expense", icon: "🎬", color: "#e11d48", parent: "Hiburan" },
  { name: "Obat & Vitamin", type: "expense", icon: "💊", color: "#14b8a6", parent: "Kesehatan & Kebugaran" },
  { name: "Uang Sekolah / Kuliah", type: "expense", icon: "🎓", color: "#2563eb", parent: "Pendidikan" },
  { name: "Kebutuhan Keluarga", type: "expense", icon: "👪", color: "#f59e0b", parent: "Keluarga" },
  { name: "Skincare / Salon", type: "expense", icon: "💅", color: "#ec4899", parent: "Perawatan Diri" },
  { name: "Cukur / Grooming", type: "expense", icon: "✂️", color: "#64748b", parent: "Perawatan Pria" },
  { name: "Self Reward", type: "expense", icon: "🍦", color: "#fb7185", parent: "Penghargaan Diri" },
  { name: "Donasi / Amal", type: "expense", icon: "🎁", color: "#10b981", parent: "Hadiah & Donasi" },
  { name: "Zakat / Persepuluhan", type: "expense", icon: "🕌", color: "#059669", parent: "Hadiah & Donasi" },
  { name: "Asuransi Kesehatan", type: "expense", icon: "📑", color: "#475569", parent: "Asuransi" },
  { name: "Bunga & Biaya Admin", type: "expense", icon: "🏦", color: "#94a3b8", parent: "Kewajiban Finansial" },
  { name: "Parkir & Tilang", type: "expense", icon: "🚦", color: "#dc2626", parent: "Denda & Sanksi" },
  { name: "Pengeluaran Lain", type: "expense", icon: "📦", color: "#737373", parent: null },
  { name: "Gaji Pokok", type: "income", icon: "💰", color: "#22c55e", parent: "Gaji & Upah" },
  { name: "Hasil Proyek", type: "income", icon: "💻", color: "#06b6d4", parent: "Freelance & Usaha" },
  { name: "Hasil Usaha", type: "income", icon: "🏪", color: "#0d9488", parent: "Freelance & Usaha" },
  { name: "Bonus / Komisi", type: "income", icon: "💵", color: "#84cc16", parent: "Bonus" },
  { name: "Cashback Belanja", type: "income", icon: "🧧", color: "#f43f5e", parent: "Cashback" },
  { name: "Hadiah Uang", type: "income", icon: "✉️", color: "#a855f7", parent: "Uang Tunai Hadiah" },
  { name: "Hasil Investasi", type: "income", icon: "📈", color: "#3b82f6", parent: "Lainnya (Pemasukan)" },
  { name: "Pendapatan Lain", type: "income", icon: "➕", color: "#737373", parent: "Lainnya (Pemasukan)" },
];

let systemParentsReady = null;

/** Pastikan preset induk ada. Dua query, hasilnya di-cache per proses. */
function ensureSystemParents() {
  if (!systemParentsReady) {
    systemParentsReady = (async () => {
      const existing = await prisma.categoryParent.findMany({ where: { userId: null }, select: { name: true, kind: true } });
      const have = new Set(existing.map((p) => p.kind + "|" + p.name));
      const missing = PRESET_PARENTS.filter((p) => !have.has(p.kind + "|" + p.name));
      if (missing.length) {
        await prisma.categoryParent.createMany({ data: missing.map((p) => ({ userId: null, ...p })) });
      }
    })().catch((e) => {
      systemParentsReady = null;
      throw e;
    });
  }
  return systemParentsReady;
}

/** Buat kategori awal pengguna baru dalam satu createMany (sebelumnya ±90 query berurutan). */
async function createDefaults(db, userId) {
  await ensureSystemParents();
  const parents = await db.categoryParent.findMany({ where: { userId: null }, select: { id: true, name: true, kind: true } });
  const byKey = new Map(parents.map((p) => [p.kind + "|" + p.name, p.id]));
  await db.category.createMany({
    data: CATEGORY_TEMPLATE.map((c) => ({
      userId,
      name: c.name,
      type: c.type,
      icon: c.icon,
      color: c.color,
      parentId: c.parent ? byKey.get(c.type + "|" + c.parent) || null : null,
    })),
  });
}

async function list(userId) {
  const [cats, parents] = await Promise.all([
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.categoryParent.findMany({
      where: { OR: [{ userId: null }, { userId }], kind: { in: ["expense", "income"] } },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return { categories: cats.map(S.category), parents: parents.map(S.categoryParent) };
}

async function owned(db, userId, id) {
  const c = await db.category.findFirst({ where: { id, userId } });
  if (!c) throw notFound("Kategori tidak ditemukan.");
  return c;
}

async function checkParent(userId, parentId, type) {
  if (!parentId) return null;
  const p = await prisma.categoryParent.findFirst({ where: { id: parentId, OR: [{ userId: null }, { userId }] } });
  if (!p || p.kind !== type) throw badRequest("Induk kategori tidak cocok dengan jenis kategori.", { parentId: "Pilih induk yang sesuai." });
  return p.id;
}

async function create(userId, input) {
  const parentId = await checkParent(userId, input.parentId, input.type);
  const c = await prisma.category.create({
    data: { userId, name: input.name, type: input.type, icon: input.icon || "🏷️", color: input.color || null, parentId },
  });
  return S.category(c);
}

async function update(userId, id, input) {
  const c0 = await owned(prisma, userId, id);
  if (c0.type === "debt") throw badRequest("Kategori warisan ini tidak bisa diubah.");
  const data = {};
  if (input.name != null) data.name = input.name;
  if (input.icon != null) data.icon = input.icon;
  if (input.color !== undefined) data.color = input.color;
  if (input.archived !== undefined) data.archived = input.archived;
  if (input.parentId !== undefined) data.parentId = await checkParent(userId, input.parentId, c0.type);
  const c = await prisma.category.update({ where: { id }, data });
  return S.category(c);
}

/** Kategori yang masih dipakai tidak bisa dihapus; arsipkan sebagai gantinya. */
async function remove(userId, id) {
  await owned(prisma, userId, id);
  const [txCount, budgetCount] = await Promise.all([
    prisma.transaction.count({ where: { categoryId: id } }),
    prisma.budget.count({ where: { userId, targetKind: "CATEGORY", targetId: id } }),
  ]);
  if (txCount > 0) {
    throw conflict(`Kategori ini dipakai ${txCount} transaksi. Arsipkan kategori agar tidak muncul lagi di pilihan.`, "CATEGORY_IN_USE");
  }
  if (budgetCount > 0) throw conflict("Kategori ini masih dipakai budget. Hapus budgetnya terlebih dahulu.", "CATEGORY_IN_USE");
  await prisma.category.delete({ where: { id } });
}

async function createParent(userId, { name, kind }) {
  const max = await prisma.categoryParent.aggregate({ where: { userId, kind }, _max: { sortOrder: true } });
  const p = await prisma.categoryParent.create({ data: { userId, name, kind, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  return S.categoryParent(p);
}

async function removeParent(userId, id) {
  const p = await prisma.categoryParent.findFirst({ where: { id, userId } });
  if (!p) throw notFound("Induk kategori tidak ditemukan atau merupakan preset sistem.");
  const [children, budgets] = await Promise.all([
    prisma.category.count({ where: { parentId: id } }),
    prisma.budget.count({ where: { userId, targetKind: "PARENT", targetId: id } }),
  ]);
  if (children > 0) throw conflict("Pindahkan atau hapus kategori di dalam induk ini terlebih dahulu.", "PARENT_IN_USE");
  if (budgets > 0) throw conflict("Induk ini masih dipakai budget.", "PARENT_IN_USE");
  await prisma.categoryParent.delete({ where: { id } });
}

module.exports = { PRESET_PARENTS, CATEGORY_TEMPLATE, ensureSystemParents, createDefaults, list, owned, create, update, remove, createParent, removeParent };
