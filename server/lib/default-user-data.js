const { prisma } = require("./prisma");
const { ensureSystemParents, findSystemParentByName } = require("./system-parents");

const WALLET_TEMPLATE = [
  { name: "BCA", currency: "IDR", balance: 0, active: true, flag: "🇮🇩", logo: "🏦" },
  { name: "BRI", currency: "IDR", balance: 0, active: true, flag: "🇮🇩", logo: "🏦" },
  { name: "ShopeePay", currency: "IDR", balance: 0, active: true, flag: "🇮🇩", logo: "🛒" },
  { name: "USD Cash", currency: "USD", balance: 0, active: true, flag: "🇺🇸", logo: "💵" },
];

/** Kategori awal: [nama, type, icon, nama induk preset] */
const CATEGORY_TEMPLATE = [
  { name: "Makan & Minum", type: "expense", icon: "utensils", parentName: "Makan & Minuman" },
  { name: "Transport", type: "expense", icon: "car", parentName: "Transportasi" },
  { name: "Belanja", type: "expense", icon: "shopping", parentName: "Belanja" },
  { name: "Tagihan", type: "expense", icon: "receipt", parentName: "Tagihan & Utilitas" },
  { name: "Gaji", type: "income", icon: "wallet", parentName: "Gaji & Upah" },
  { name: "Freelance", type: "income", icon: "laptop", parentName: "Freelance & Usaha" },
  { name: "Cicilan pinjaman", type: "debt", debtSubtype: "REPAYMENT", icon: "card", parentName: "Pelunasan" },
  { name: "Terima pinjaman", type: "debt", debtSubtype: "LOAN", icon: "hand", parentName: "Pinjaman" },
];

async function createDefaultWalletsAndCategories(userId) {
  await ensureSystemParents();

  await prisma.$transaction(async (tx) => {
    for (const w of WALLET_TEMPLATE) {
      await tx.wallet.create({
        data: {
          userId,
          name: w.name,
          currency: w.currency,
          balance: w.balance,
          active: w.active,
          flag: w.flag,
          logo: w.logo,
        },
      });
    }

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
