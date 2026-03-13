require("dotenv").config();
const { Client } = require("pg");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const res = await c.query(`
    select capacity, count(*)::int as count
    from "Table"
    group by capacity
    order by capacity;
  `);

  console.log(res.rows);
  await c.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
