const { prisma } = require("../lib/prisma");
const { ensureSystemParents, findSystemParentByName } = require("../lib/system-parents");

const CATEGORY_TEMPLATE = [
  // Pengeluaran
  { name: "Listrik & Air", type: "expense", icon: "⚡", parentName: "Tagihan & Utilitas" },
  { name: "Internet & Pulsa", type: "expense", icon: "🌐", parentName: "Tagihan & Utilitas" },
  { name: "Uang Sekolah / Kuliah", type: "expense", icon: "🎓", parentName: "Pendidikan" },
  { name: "Tabungan Darurat", type: "expense", icon: "🛡️", parentName: "Dana Darurat" },
  { name: "Kebutuhan Keluarga", type: "expense", icon: "👨‍👩‍👧‍👦", parentName: "Keluarga" },
  { name: "Zakat / Persepuluhan", type: "expense", icon: "🕌", parentName: "Kewajiban Finansial" },
  { name: "Cicilan Pinjaman", type: "expense", icon: "💸", parentName: "Kewajiban Finansial" },
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

async function migrate() {
  console.log("Starting category migration (FULL)...");
  
  await ensureSystemParents();
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} users.`);

  for (const user of users) {
    console.log(`Migrating for user: ${user.email}`);
    const existing = await prisma.category.findMany({ where: { userId: user.id } });
    const existingNames = new Set(existing.map(c => c.name.toLowerCase()));

    for (const t of CATEGORY_TEMPLATE) {
      if (!existingNames.has(t.name.toLowerCase())) {
        const parent = await findSystemParentByName(t.parentName, t.type === "debt" ? "debt" : t.type === "income" ? "income" : "expense");
        if (parent) {
          await prisma.category.create({
            data: {
              userId: user.id,
              name: t.name,
              type: t.type,
              icon: t.icon,
              debtSubtype: t.debtSubtype || null,
              parentId: parent.id,
            }
          });
          console.log(`  + Created: ${t.name}`);
        }
      }
    }
  }
  console.log("Migration finished.");
}

migrate().catch(console.error).finally(() => prisma.$disconnect());
