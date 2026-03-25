require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function fixIcons() {
  console.log("Updating category icons...");
  
  const updates = [
    { name: "Hutang", icon: "⚠️" },
    { name: "Penagihan Piutang", icon: "✅" },
    { name: "Pinjaman", icon: "🤝" },
    { name: "Pelunasan", icon: "💳" }
  ];

  for (const up of updates) {
    const res = await prisma.category.updateMany({
      where: { name: up.name },
      data: { icon: up.icon }
    });
    console.log(`Updated ${res.count} categories for ${up.name}`);
  }

  // Also ensuring they have no parent just in case
  const resParent = await prisma.category.updateMany({
    where: { name: { in: ["Hutang", "Penagihan Piutang", "Pinjaman", "Pelunasan"] } },
    data: { parentId: null }
  });
  console.log(`Ensured ${resParent.count} categories have no parent.`);

  await prisma.$disconnect();
}

fixIcons().catch(e => {
  console.error(e);
  process.exit(1);
});
