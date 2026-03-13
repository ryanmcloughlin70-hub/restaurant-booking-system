import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/app/lib/prisma";
import { requireStaff } from "@/app/lib/staffAuth";

function isValidReference(ref: string) {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(ref);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ ref: string }> }
) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const { ref } = await ctx.params;
  const upper = String(ref ?? "").trim().toUpperCase();

  if (!upper || !isValidReference(upper)) {
    return NextResponse.json(
      { ok: false, error: "Invalid reference format" },
      { status: 400 }
    );
  }

  const prisma = getPrisma();

  const booking = await prisma.booking.findUnique({
    where: { reference: upper },
    include: { table: true },
  });

  if (!booking) {
    return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
  }

  // Find all tables that:
  // - are active
  // - can fit the party
  // - have NO overlapping confirmed booking (excluding this booking)
  const tables = await prisma.table.findMany({
    where: {
      active: true,
      capacity: { gte: booking.partySize },
      bookings: {
        none: {
          status: "CONFIRMED",
          id: { not: booking.id },
          startTime: { lt: booking.endTime },
          endTime: { gt: booking.startTime },
        },
      },
    },
    orderBy: [{ capacity: "asc" }, { number: "asc" }],
    select: { id: true, number: true, capacity: true },
  });

  return NextResponse.json({
    ok: true,
    booking: {
      reference: booking.reference,
      partySize: booking.partySize,
      startTime: booking.startTime,
      endTime: booking.endTime,
      currentTable: {
        id: booking.table.id,
        number: booking.table.number,
        capacity: booking.table.capacity,
      },
    },
    tables,
  });
}
