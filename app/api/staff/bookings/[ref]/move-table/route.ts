import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/app/lib/prisma";
import { requireStaff } from "@/app/lib/staffAuth";

function isValidReference(ref: string) {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(ref);
}

export async function POST(
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

  const body = await req.json().catch(() => ({}));
  const tableNumber = Number(body.tableNumber);

  if (!Number.isFinite(tableNumber) || !Number.isInteger(tableNumber) || tableNumber < 1) {
    return NextResponse.json(
      { ok: false, error: "tableNumber must be a positive whole number" },
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

  const target = await prisma.table.findUnique({
    where: { number: tableNumber },
    select: { id: true, number: true, capacity: true, active: true },
  });

  if (!target || !target.active) {
    return NextResponse.json(
      { ok: false, error: "Target table not found or not active" },
      { status: 404 }
    );
  }

  if (target.capacity < booking.partySize) {
    return NextResponse.json(
      { ok: false, error: `Table #${target.number} only seats ${target.capacity}` },
      { status: 409 }
    );
  }

  // ✅ Transaction + lock target table + overlap check excluding this booking
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Table" WHERE id = ${target.id} FOR UPDATE`;

    const overlap = await tx.booking.findFirst({
      where: {
        id: { not: booking.id },
        tableId: target.id,
        status: "CONFIRMED",
        startTime: { lt: booking.endTime },
        endTime: { gt: booking.startTime },
      },
      select: { id: true },
    });

    if (overlap) return null;

    return await tx.booking.update({
      where: { id: booking.id },
      data: { tableId: target.id },
      include: { table: true },
    });
  });

  if (!updated) {
    return NextResponse.json(
      { ok: false, error: `Table #${tableNumber} is not available at that time` },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, booking: updated });
}
