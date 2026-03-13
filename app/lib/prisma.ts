import { Prisma, PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

//prevent creating many clients during hot-reload in dev
const globalForPrisma = globalThis as unknown as {
    prisma?: PrismaClient;
    pool?: Pool;
};

export function getPrisma(){
    if (globalForPrisma.prisma) return globalForPrisma.prisma;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    globalForPrisma.pool = pool;
    globalForPrisma.prisma = prisma;

    return prisma;
}

export const prisma = getPrisma();