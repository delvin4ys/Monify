const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Memulai pengecekan dan penambahan kategori sistem transfer...");
  const users = await prisma.user.findMany();
  
  let addedCount = 0;

  for (const user of users) {
    const existingCategories = await prisma.category.findMany({
      where: { userId: user.id }
    });
    
    const hasTransferMasuk = existingCategories.some(c => c.name === "Transfer Masuk");
    const hasTransferKeluar = existingCategories.some(c => c.name === "Transfer Keluar");
    
    if (!hasTransferMasuk) {
      await prisma.category.create({
        data: {
          userId: user.id,
          name: "Transfer Masuk",
          type: "income",
          icon: "📥",
          parentId: null,
        }
      });
      console.log(`>> Ditambahkan: Transfer Masuk (User: ${user.email})`);
      addedCount++;
    }
    
    if (!hasTransferKeluar) {
      await prisma.category.create({
        data: {
          userId: user.id,
          name: "Transfer Keluar",
          type: "expense",
          icon: "📤",
          parentId: null,
        }
      });
      console.log(`>> Ditambahkan: Transfer Keluar (User: ${user.email})`);
      addedCount++;
    }
  }
  
  console.log(`Selesai. Total kategori ditambahkan: ${addedCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
