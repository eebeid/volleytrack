import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient();
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? prismaClientSingleton();
export default prisma;
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
