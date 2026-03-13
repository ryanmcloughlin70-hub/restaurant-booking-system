require("dotenv").config();
const { Client } = require("pg");

async function main() {
  console.log("DATABASE_URL =", process.env.DATABASE_URL);

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const r = await c.query('select count(*)::int as n from public."Table"');
  console.log("Table rows =", r.rows[0].n);

  await c.end();
}

main().catch((e) => {
  console.error("DB_CHECK_FAILED:", e.message);
  process.exit(1);
});
