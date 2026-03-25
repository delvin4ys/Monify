const { prisma } = require("./prisma");

/** Induk kategori bawaan (Bahasa Indonesia). kind: expense | income | debt */
const PRESET_PARENTS = [
  // Pengeluaran (Expense)
  { name: "Tagihan & Utilitas", kind: "expense", sortOrder: 10 },
  { name: "Pendidikan", kind: "expense", sortOrder: 20 },
  { name: "Dana Darurat", kind: "expense", sortOrder: 30 },
  { name: "Hiburan", kind: "expense", sortOrder: 40 },
  { name: "Keluarga", kind: "expense", sortOrder: 50 },
  { name: "Kewajiban Finansial", kind: "expense", sortOrder: 60 },
  { name: "Denda & Sanksi", kind: "expense", sortOrder: 70 },
  { name: "Makan & Minuman", kind: "expense", sortOrder: 80 },
  { name: "Hadiah & Donasi", kind: "expense", sortOrder: 90 },
  { name: "Kesehatan & Kebugaran", kind: "expense", sortOrder: 100 },
  { name: "Asuransi", kind: "expense", sortOrder: 110 },
  { name: "Investasi", kind: "expense", sortOrder: 120 },
  { name: "Perawatan Pria", kind: "expense", sortOrder: 130 },
  { name: "Perawatan Diri", kind: "expense", sortOrder: 140 },
  { name: "Belanja", kind: "expense", sortOrder: 150 },
  { name: "Penghargaan Diri", kind: "expense", sortOrder: 160 },
  { name: "Transportasi", kind: "expense", sortOrder: 170 },

  // Pendapatan (Income)
  { name: "Uang Tunai Hadiah", kind: "income", sortOrder: 10 },
  { name: "Cashback", kind: "income", sortOrder: 20 },
  { name: "Bonus", kind: "income", sortOrder: 30 },
  { name: "Gaji & Upah", kind: "income", sortOrder: 40 },
  { name: "Freelance & Usaha", kind: "income", sortOrder: 50 },
  { name: "Lainnya (Pemasukan)", kind: "income", sortOrder: 60 },

  // Hutang / pinjaman (Debt) - Now handled as top-level categories without parents
];

async function ensureSystemParents() {
  for (const p of PRESET_PARENTS) {
    const exists = await prisma.categoryParent.findFirst({
      where: { userId: null, name: p.name, kind: p.kind },
    });
    if (!exists) {
      await prisma.categoryParent.create({
        data: { userId: null, name: p.name, kind: p.kind, sortOrder: p.sortOrder },
      });
    }
  }
}

async function findSystemParentByName(name, kind) {
  return prisma.categoryParent.findFirst({ where: { userId: null, name, kind } });
}

module.exports = { PRESET_PARENTS, ensureSystemParents, findSystemParentByName };
