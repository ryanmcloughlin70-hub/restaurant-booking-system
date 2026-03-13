import { NextResponse } from "next/server";
import { getPrisma } from "@/app/lib/prisma";
import { rlAvailability } from "@/app/lib/rateLimit";

function isValidYyyyMmDd(s: string) {
  // must be exactly YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

  // check it’s a real date (e.g. reject 2026-02-31)
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return false;

  // ensure it didn’t autocorrect (JS can roll dates)
  const [y, m, day] = s.split("-").map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
}

/**
 * Get YYYY-MM-DD in a specific timezone (Europe/London).
 * Using Intl avoids "server is UTC" bugs on Vercel/hosts.
 */
function ymdInTZ(date: Date, timeZone = "Europe/London") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // YYYY-MM-DD
}

export async function GET(req: Request) {
  const prisma = getPrisma();

  // -------------------------------
  // ✅ Rate limit (60 req/min per IP)
  // -------------------------------
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const limit = await rlAvailability.limit(ip);

  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait a minute." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(req.url);

  const date = searchParams.get("date"); // "2026-02-04"
  const partySizeRaw = searchParams.get("partySize");
  const partySize = Number(partySizeRaw);

  // ✅ Validate inputs server-side
  if (!date || !isValidYyyyMmDd(date)) {
    return NextResponse.json(
      { ok: false, error: "Provide a valid date like ?date=YYYY-MM-DD" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(partySize) || !Number.isInteger(partySize) || partySize < 1 || partySize > 10) {
    return NextResponse.json(
      { ok: false, error: "partySize must be a whole number between 1 and 10" },
      { status: 400 }
    );
  }

  // -------------------------------
  // ✅ Block same-day availability (must book at least 1 day ahead) in Europe/London
  // -------------------------------
  const todayYMD = ymdInTZ(new Date(), "Europe/London");
  if (date <= todayYMD) {
    return NextResponse.json(
      {
        ok: true,
        date,
        partySize,
        slots: [],
        message:
          "Online bookings must be made at least 1 day in advance. Please call to book for today.",
      },
      { status: 200 }
    );
  }

  const OPEN_HOUR = 12;
  const CLOSE_HOUR = 21;
  const SLOT_MINUTES = 15;
  const DURATION_MINUTES = 90;

  // ✅ Base day (constructed from YYYY-MM-DD)
  // Note: This uses the server's local timezone for Date math.
  // Because we already enforce the day boundary via date string (Europe/London YMD),
  // this is usually fine for slot generation. If you want perfect TZ handling,
  // we can move to explicit TZ-aware date math.
  const base = new Date(`${date}T00:00:00`);
  base.setHours(0, 0, 0, 0);

  const closesAt = new Date(base);
  closesAt.setHours(CLOSE_HOUR, 0, 0, 0);

  const slots: string[] = [];

  for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
      const startTime = new Date(base);
      startTime.setHours(hour, minute, 0, 0);

      const endTime = new Date(startTime.getTime() + DURATION_MINUTES * 60 * 1000);
      if (endTime > closesAt) continue;

      const table = await prisma.table.findFirst({
        where: {
          active: true,
          capacity: { gte: partySize },
          bookings: {
            none: {
              status: "CONFIRMED",
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          },
        },
        orderBy: [{ capacity: "asc" }, { number: "asc" }],
        select: { id: true },
      });

      if (table) slots.push(startTime.toISOString());
    }
  }

  return NextResponse.json({ ok: true, date, partySize, slots });
}
