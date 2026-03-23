const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  await p.wallet.deleteMany({});
  console.log('Deleted all DB wallets for clean slate.');
}

main().catch(console.error).finally(() => p.$disconnect());
