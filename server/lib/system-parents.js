const { prisma } = require("./prisma");

/** Induk kategori bawaan (Bahasa Indonesia). kind: expense | income | debt */
const PRESET_PARENTS = [
  // Hutang / pinjaman
  { name: "Hutang", kind: "debt", sortOrder: 10 },
  { name: "Penagihan Piutang", kind: "debt", sortOrder: 20 },
  { name: "Pinjaman", kind: "debt", sortOrder: 30 },
  { name: "Pelunasan", kind: "debt", sortOrder: 40 },
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
