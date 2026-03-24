const { prisma } = require("../lib/prisma");

async function fixDebtCategories() {
  console.log("Starting debt category fix...");

  // 1. Find all "Cicilan Pinjaman" categories that are still marked as "expense"
  const categories = await prisma.category.findMany({
    where: {
      name: "Cicilan Pinjaman",
      type: "expense"
    }
  });

  console.log(`Found ${categories.length} categories to fix.`);

  for (const cat of categories) {
    console.log(`Fixing category ID: ${cat.id} for user ${cat.userId}`);
    
    await prisma.$transaction(async (tx) => {
      // Update category type to debt
      await tx.category.update({
        where: { id: cat.id },
        data: {
          type: "debt",
          debtSubtype: "REPAYMENT"
        }
      });

      // Update all transactions for this category to type "debt"
      const res = await tx.transaction.updateMany({
        where: { categoryId: cat.id, type: "expense" },
        data: { type: "debt" }
      });
      
      console.log(`  + Updated ${res.count} transactions.`);
    });
  }

  console.log("Fix completed.");
}

fixDebtCategories()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
