const { prisma } = require("./prisma");
const { ensureSystemParents, findSystemParentByName } = require("./system-parents");

/** Kategori awal: hanya Debt-related categories */
const CATEGORY_TEMPLATE = [
  { name: "Hutang", type: "debt", debtSubtype: "DEBT", icon: "⚠️", parentName: "Hutang" },
  { name: "Penagihan Piutang", type: "debt", debtSubtype: "DEBT_COLLECTION", icon: "✅", parentName: "Penagihan Piutang" },
  { name: "Pinjaman", type: "debt", debtSubtype: "LOAN", icon: "🤝", parentName: "Pinjaman" },
  { name: "Pelunasan", type: "debt", debtSubtype: "REPAYMENT", icon: "💳", parentName: "Pelunasan" },
];

async function createDefaultWalletsAndCategories(userId) {
  await ensureSystemParents();

  await prisma.$transaction(async (tx) => {

    for (const c of CATEGORY_TEMPLATE) {
      const parent = await findSystemParentByName(c.parentName, c.type === "debt" ? "debt" : c.type === "income" ? "income" : "expense");
      await tx.category.create({
        data: {
          userId,
          name: c.name,
          type: c.type,
          icon: c.icon,
          debtSubtype: c.debtSubtype || null,
          parentId: parent ? parent.id : null,
        },
      });
    }
  });
}

module.exports = { createDefaultWalletsAndCategories };
