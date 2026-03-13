require("dotenv").config();
const { Client } = require("pg");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const res = await c.query(`
    select id, email, "startTime", "endTime", "tableId"
    from "Booking"
    where "partySize" = 8
    order by id desc
    limit 5;
  `);

  console.log(res.rows);
  await c.end();
}

main().catch((e) => {
  console.error("QUERY_FAILED:", e.message);
  process.exit(1);
});
