require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { Pool } = require("pg");

async function main() {
  // Prisma v7: use adapter for direct DB connection
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.table.deleteMany();

    const configs = [
      { capacity: 2, count: 7 },
      { capacity: 4, count: 12 },
      { capacity: 6, count: 7 },
      { capacity: 8, count: 1 },
      { capacity: 10, count: 3 },
    ];

    let number = 1;
    const data = [];

    for (const { capacity, count } of configs) {
      for (let i = 0; i < count; i++) {
        data.push({ number, capacity, active: true });
        number++;
      }
    }

    await prisma.table.createMany({ data });
    console.log(`Seeded ${data.length} tables`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
