import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/app/lib/prisma";
import { requireStaff } from "@/app/lib/staffAuth";
import { assignTableForSlot } from "@/app/lib/assignTableForSlot";

function isValidYyyyMmDd(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

  const d = new Date(`${s}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return false;

  const [y, m, day] = s.split("-").map(Number);
  return (
    d.getUTCFullYear() === y &&
    d.getUTCMonth() + 1 === m &&
    d.getUTCDate() === day
  );
}

function isValidReference(ref: string) {
  // your generator uses: A-Z (no I/O) and digits 2-9, length 6
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(ref);
}

function parseIsoDateOrNull(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function generateReference() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const prisma = getPrisma();
  const url = new URL(req.url);

  const date = url.searchParams.get("date");
  const q = url.searchParams.get("q");

  const upcoming = url.searchParams.get("upcoming"); // "true" or null
  const name = url.searchParams.get("name");
  const pax = url.searchParams.get("pax");
  const table = url.searchParams.get("table");

  // ✅ Search by reference
  if (q) {
    const ref = q.trim().toUpperCase();

    if (!isValidReference(ref)) {
      return NextResponse.json(
        { ok: false, error: "Invalid reference format" },
        { status: 400 }
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { reference: ref },
      include: { table: true },
    });

    return NextResponse.json({ ok: true, booking: booking ?? null });
  }

  // ✅ Load bookings by date
  if (!date) {
    return NextResponse.json(
      { ok: false, error: "Missing date" },
      { status: 400 }
    );
  }

  if (!isValidYyyyMmDd(date)) {
    return NextResponse.json(
      { ok: false, error: "Invalid date format. Use YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);

  // base filter: date range
  const where: any = {
    startTime: { gte: start, lt: end },
  };

  // ✅ Upcoming only toggle
  if (upcoming === "true") {
    const now = new Date();
    where.startTime.gte = now;
  }

  // ✅ Filter by name (customerName OR firstName OR surname)
  if (name && name.trim().length > 0) {
    const term = name.trim();

    where.OR = [
      { customerName: { contains: term, mode: "insensitive" } },
      { firstName: { contains: term, mode: "insensitive" } },
      { surname: { contains: term, mode: "insensitive" } },
    ];
  }

  // ✅ Filter by party size
  if (pax && /^\d+$/.test(pax)) {
    where.partySize = Number(pax);
  }

  // ✅ Filter by table number
  if (table && /^\d+$/.test(table)) {
    where.table = { number: Number(table) };
    // If Prisma ever complains, use:
    // where.table = { is: { number: Number(table) } };
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: { table: true },
    orderBy: [{ startTime: "asc" }],
  });

  return NextResponse.json({ ok: true, bookings });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff(req);

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const prisma = getPrisma();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const customerName =
    typeof body.customerName === "string" ? body.customerName.trim() : "";
  const partySize = Number(body.partySize);
  const startTime = parseIsoDateOrNull(body.startTime);

  const phone = typeof body.phone === "string" ? body.phone.trim() : null;
  const notes = typeof body.notes === "string" ? body.notes.trim() : null;

  if (!customerName) {
    return NextResponse.json(
      { ok: false, error: "Missing customerName" },
      { status: 400 }
    );
  }

  if (!Number.isFinite(partySize) || partySize < 1 || partySize > 50) {
    return NextResponse.json(
      { ok: false, error: "Invalid partySize" },
      { status: 400 }
    );
  }

  if (!startTime) {
    return NextResponse.json(
      { ok: false, error: "Invalid startTime (must be ISO string)" },
      { status: 400 }
    );
  }

  // Booking duration = 90 minutes
  const endTime = addMinutes(startTime, 90);

  // ✅ Use your shared assignment logic
  const tableResult = await assignTableForSlot(prisma, {
    partySize,
    startTime,
    endTime,
  });

  if (!tableResult) {
    return NextResponse.json(
      { ok: false, error: "No tables available for that time" },
      { status: 409 }
    );
  }

  const tableId = tableResult.id;

  // Create booking (retry a few times if reference collides)
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = generateReference();

    try {
      const booking = await prisma.booking.create({
        data: {
          reference,

          source: "STAFF",
          customerName,

          partySize,
          startTime,
          endTime,

          phone,
          notes,

          tableId,
          status: "CONFIRMED",
        },
        include: { table: true },
      });

      return NextResponse.json({ ok: true, booking }, { status: 201 });
    } catch (e: any) {
      const isUniqueRef =
        e?.code === "P2002" &&
        Array.isArray(e?.meta?.target) &&
        e.meta.target.includes("reference");

      if (isUniqueRef) continue;

      return NextResponse.json(
        { ok: false, error: "Failed to create booking" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: "Failed to generate a unique reference" },
    { status: 500 }
  );
}
