const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  console.log("Connecting to database...");
  const users = await prisma.user.findMany();
  console.log("Connection successful! User count:", users.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
