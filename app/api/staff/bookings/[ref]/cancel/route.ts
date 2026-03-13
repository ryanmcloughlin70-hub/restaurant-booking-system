import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/app/lib/prisma";
import { requireStaff } from "@/app/lib/staffAuth";
import { BookingStatus } from "@prisma/client";

function isValidReference(ref: string) {
  // Your booking refs are generated using:
  // "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" and length 6
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(ref);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ ref: string }> }
) {
  // ✅ Staff auth check
  const auth = await requireStaff(req);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: 401 }
    );
  }

  const { ref } = await ctx.params;
  const upper = String(ref ?? "").trim().toUpperCase();

  if (!upper) {
    return NextResponse.json({ ok: false, error: "Missing reference" }, { status: 400 });
  }

  // ✅ Validate ref format (prevents random junk hitting DB)
  if (!isValidReference(upper)) {
    return NextResponse.json({ ok: false, error: "Invalid reference format" }, { status: 400 });
  }

  const prisma = getPrisma();

  const existing = await prisma.booking.findUnique({
    where: { reference: upper },
    include: { table: true },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
  }

  // ✅ Idempotency: cancelling twice returns success (doesn't error)
  if (existing.status === BookingStatus.CANCELLED) {
    return NextResponse.json({ ok: true, booking: existing });
  }

  const booking = await prisma.booking.update({
    where: { reference: upper },
    data: { status: BookingStatus.CANCELLED },
    include: { table: true },
  });

  return NextResponse.json({ ok: true, booking });
}
