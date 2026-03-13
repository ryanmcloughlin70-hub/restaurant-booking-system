import { NextResponse } from "next/server";
import { getPrisma } from "@/app/lib/prisma";
import { sendBookingConfirmationEmail } from "@/app/lib/email";
import type { Prisma } from "@prisma/client";
import { rlBookings } from "@/app/lib/rateLimit";

function makeRef(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function generateUniqueRef(tx: Prisma.TransactionClient) {
  for (let i = 0; i < 10; i++) {
    const reference = makeRef();
    const existing = await tx.booking.findUnique({ where: { reference } });
    if (!existing) return reference;
  }
  throw new Error("Could not generate unique booking reference");
}

function isValidEmail(email: string) {
  // pragmatic (not perfect) email check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidName(name: string) {
  // Allows letters + spaces + hyphen + apostrophe (O'Neill, Mc-Loughlin)
  // Blocks numbers and weird symbols.
  return name.length >= 1 && name.length <= 50 && /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(name);
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

export async function GET() {
  return NextResponse.json({ ok: true, message: "bookings route working" });
}

export async function POST(req: Request) {
  try {
    const prisma = getPrisma();

    // -------------------------------
    // ✅ Rate limit (10 req/min per IP)
    // -------------------------------
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
    const limit = await rlBookings.limit(ip);

    if (!limit.success) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Please wait a minute." },
        { status: 429 }
      );
    }

    // ✅ Idempotency (Stripe-style)
    const idemKey = req.headers.get("Idempotency-Key")?.trim();
    const route = "POST:/api/bookings";

    if (!idemKey) {
      return NextResponse.json(
        { ok: false, error: "Missing Idempotency-Key header" },
        { status: 400 }
      );
    }

    const existing = await prisma.idempotencyKey.findUnique({
      where: { key_route: { key: idemKey, route } },
    });

    if (existing) {
      return NextResponse.json(existing.responseBody, { status: existing.responseCode });
    }

    const body = await req.json();

    const email = String(body.email ?? "").trim().toLowerCase();
    const firstName = String(body.firstName ?? "").trim();
    const surname = String(body.surname ?? "").trim();

    // partySize: enforce integer
    const partySizeRaw = body.partySize;
    const partySize = Number(partySizeRaw);

    const startTime = new Date(body.startTime);

    // -------------------------------
    // ✅ Field validation (practical)
    // -------------------------------
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Please enter a valid email address" }, { status: 400 });
    }

    if (!isValidName(firstName)) {
      return NextResponse.json({ ok: false, error: "Please enter a valid first name" }, { status: 400 });
    }

    if (!isValidName(surname)) {
      return NextResponse.json({ ok: false, error: "Please enter a valid surname" }, { status: 400 });
    }

    if (!Number.isFinite(partySize) || !Number.isInteger(partySize) || partySize < 1 || partySize > 10) {
      return NextResponse.json(
        { ok: false, error: "Party size must be a whole number between 1 and 10" },
        { status: 400 }
      );
    }

    if (isNaN(startTime.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid booking time" }, { status: 400 });
    }

    // Prevent bookings in the past (1 minute grace)
    if (startTime.getTime() < Date.now() - 60_000) {
      return NextResponse.json({ ok: false, error: "Booking time must be in the future" }, { status: 400 });
    }

    // -------------------------------
    // ✅ Block same-day bookings (must book at least 1 day ahead) in Europe/London
    // -------------------------------
    const todayYMD = ymdInTZ(new Date(), "Europe/London");
    const bookingYMD = ymdInTZ(startTime, "Europe/London");

    if (bookingYMD <= todayYMD) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Bookings online must be made at least 1 day in advance. Please call us on 028 6862 1656 to make a booking for today.",
        },
        { status: 400 }
      );
    }

    // 90 minutes
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);

    // -------------------------------
    // ✅ Time validation rules
    // -------------------------------
    const OPEN_HOUR = 12;
    const CLOSE_HOUR = 21;

    // must be 15-minute increments
    const minutes = startTime.getMinutes();
    if (minutes % 15 !== 0) {
      return NextResponse.json({ ok: false, error: "Time must be in 15-minute intervals" }, { status: 400 });
    }

    // start must be >= 12:00
    if (startTime.getHours() < OPEN_HOUR) {
      return NextResponse.json({ ok: false, error: "Restaurant opens at 12:00" }, { status: 400 });
    }

    // booking must finish before close
    const closesAt = new Date(startTime);
    closesAt.setHours(CLOSE_HOUR, 0, 0, 0);

    if (endTime > closesAt) {
      return NextResponse.json({ ok: false, error: "Booking would run past closing time" }, { status: 400 });
    }

    // -------------------------------
    // ✅ Race-safe table selection + booking create (transaction + row locks)
    // -------------------------------
    const booking = await prisma.$transaction(async (tx) => {
      // 1) Get candidates (smallest table first, then lowest number)
      const candidates = await tx.table.findMany({
        where: {
          active: true,
          capacity: { gte: partySize },
        },
        orderBy: [{ capacity: "asc" }, { number: "asc" }],
        select: { id: true },
      });

      for (const t of candidates) {
        // 2) Lock the table row so only one transaction can attempt this table at a time
        await tx.$queryRaw`SELECT id FROM "Table" WHERE id = ${t.id} FOR UPDATE`;

        // 3) After lock, re-check overlap
        const overlap = await tx.booking.findFirst({
          where: {
            tableId: t.id,
            status: "CONFIRMED",
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
          select: { id: true },
        });

        if (overlap) continue;

        // 4) Create booking on locked table
        const reference = await generateUniqueRef(tx);

        return await tx.booking.create({
          data: {
            reference,
            email,
            firstName,
            surname,
            partySize,
            startTime,
            endTime,
            tableId: t.id,
            status: "CONFIRMED",
          },
          include: { table: true },
        });
      }

      return null;
    });

    if (!booking) {
      const responseBody = { ok: false, error: "No tables available for that time" };

      // ✅ Save the response so retries return the same result
      // ✅ Race-safe: if another request stored the same key first, return that saved response
      try {
        await prisma.idempotencyKey.create({
          data: { key: idemKey, route, responseCode: 409, responseBody },
        });
      } catch (e: any) {
        const again = await prisma.idempotencyKey.findUnique({
          where: { key_route: { key: idemKey, route } },
        });
        if (again) {
          return NextResponse.json(again.responseBody, { status: again.responseCode });
        }
        throw e;
      }

      return NextResponse.json(responseBody, { status: 409 });
    }

    // Email sending (won't work to non-account addresses until domain verified)
    try {
      await sendBookingConfirmationEmail({
        to: booking.email,
        firstName: booking.firstName,
        reference: booking.reference,
        partySize: booking.partySize,
        startTime: booking.startTime,
        endTime: booking.endTime,
        tableNumber: booking.table.number,
        restaurantName: "Mahon's Hotel",
        phone: "028 6862 1656",
        addressLine: "Irvinestown, Co. Fermanagh",
      });
    } catch (emailErr) {
      console.error("Booking email failed:", emailErr);
    }

    const responseBody = { ok: true, booking };

    // ✅ Save successful response for idempotency
    // ✅ Race-safe: if another request stored the same key first, return that saved response
    try {
      await prisma.idempotencyKey.create({
        data: { key: idemKey, route, responseCode: 200, responseBody },
      });
    } catch (e: any) {
      const again = await prisma.idempotencyKey.findUnique({
        where: { key_route: { key: idemKey, route } },
      });
      if (again) {
        return NextResponse.json(again.responseBody, { status: again.responseCode });
      }
      throw e;
    }

    return NextResponse.json(responseBody);
  } catch (err) {
    console.error("POST /api/bookings error:", err);
    return NextResponse.json({ ok: false, error: "Server error creating booking" }, { status: 500 });
  }
}
