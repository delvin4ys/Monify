const { prisma } = require("./prisma");
const { ensureSystemParents, findSystemParentByName } = require("./system-parents");

/** Kategori awal: hanya Debt-related categories */
const CATEGORY_TEMPLATE = [
  // Pengeluaran
  { name: "Listrik & Air", type: "expense", icon: "⚡", parentName: "Tagihan & Utilitas" },
  { name: "Internet & Pulsa", type: "expense", icon: "🌐", parentName: "Tagihan & Utilitas" },
  { name: "Uang Sekolah / Kuliah", type: "expense", icon: "🎓", parentName: "Pendidikan" },
  { name: "Tabungan Darurat", type: "expense", icon: "🛡️", parentName: "Dana Darurat" },
  { name: "Kebutuhan Keluarga", type: "expense", icon: "👨‍👩‍👧‍👦", parentName: "Keluarga" },
  { name: "Zakat / Persepuluhan", type: "expense", icon: "🕌", parentName: "Kewajiban Finansial" },
  { name: "Cicilan Pinjaman", type: "debt", debtSubtype: "REPAYMENT", icon: "💸", parentName: "Kewajiban Finansial" },
  { name: "Parkir & Tilang", type: "expense", icon: "🚦", parentName: "Denda & Sanksi" },
  { name: "Makan di Luar", type: "expense", icon: "🍜", parentName: "Makan & Minuman" },
  { name: "Kopi & Camilan", type: "expense", icon: "☕", parentName: "Makan & Minuman" },
  { name: "Donasi / Amal", type: "expense", icon: "🎁", parentName: "Hadiah & Donasi" },
  { name: "Obat & Vitamin", type: "expense", icon: "💊", parentName: "Kesehatan & Kebugaran" },
  { name: "Asuransi Kesehatan", type: "expense", icon: "📑", parentName: "Asuransi" },
  { name: "Saham / Reksa Dana", type: "expense", icon: "📈", parentName: "Investasi" },
  { name: "Cukur / Grooming", type: "expense", icon: "✂️", parentName: "Perawatan Pria" },
  { name: "Skincare / Salon", type: "expense", icon: "💅", parentName: "Perawatan Diri" },
  { name: "Belanja Bulanan", type: "expense", icon: "🛒", parentName: "Belanja" },
  { name: "Pakaian", type: "expense", icon: "👕", parentName: "Belanja" },
  { name: "Self Reward", type: "expense", icon: "🍦", parentName: "Penghargaan Diri" },
  { name: "Bensin", type: "expense", icon: "⛽", parentName: "Transportasi" },
  { name: "Ojek / Taksi Online", type: "expense", icon: "🚗", parentName: "Transportasi" },
  { name: "Nonton / Film", type: "expense", icon: "🎬", parentName: "Hiburan" },
  
  // Pendapatan
  { name: "Gaji Pokok", type: "income", icon: "💰", parentName: "Gaji & Upah" },
  { name: "Bonus / Komisi", type: "income", icon: "💵", parentName: "Bonus" },
  { name: "Cashback Belanja", type: "income", icon: "🧧", parentName: "Cashback" },
  { name: "Hadiah Uang", type: "income", icon: "✉️", parentName: "Uang Tunai Hadiah" },
  { name: "Hasil Proyek", type: "income", icon: "💻", parentName: "Freelance & Usaha" },
  { name: "Pendapatan Lain", type: "income", icon: "➕", parentName: "Lainnya (Pemasukan)" },

  // Debt-related categories
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
  }, {
    timeout: 30000 // Meningkatkan timeout menjadi 30 detik
  });
}

module.exports = { createDefaultWalletsAndCategories };
