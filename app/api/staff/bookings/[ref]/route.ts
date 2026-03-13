import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/app/lib/prisma";
import { requireStaff } from "@/app/lib/staffAuth";
import { assignTableForSlot } from "@/app/lib/assignTableForSlot";

function isValidReference(ref: string) {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(ref);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidName(name: string) {
  return (
    name.length >= 1 &&
    name.length <= 50 &&
    /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(name)
  );
}

const OPEN_HOUR = 12;
const CLOSE_HOUR = 21;
const SLOT_MIN = 15;
const DURATION_MIN = 90;

// suggestion windows (same day)
const MAX_BACK_MIN = 240; // 4h back
const MAX_FORWARD_MIN = 480; // 8h forward

function addMinutes(d: Date, mins: number) {
  return new Date(d.getTime() + mins * 60_000);
}

function validateTimeRules(startTime: Date) {
  if (isNaN(startTime.getTime())) return "Invalid booking time";

  // Optional: prevent moving into the past
  if (startTime.getTime() < Date.now() - 60_000) {
    return "Booking time must be in the future";
  }

  // 15-minute increments
  const minutes = startTime.getMinutes();
  if (minutes % SLOT_MIN !== 0) return "Time must be in 15-minute intervals";

  // opens at 12:00
  if (startTime.getHours() < OPEN_HOUR) return "Restaurant opens at 12:00";

  // 90 minutes
  const endTime = addMinutes(startTime, DURATION_MIN);

  // must finish before close
  const closesAt = new Date(startTime);
  closesAt.setHours(CLOSE_HOUR, 0, 0, 0);

  if (endTime > closesAt) return "Booking would run past closing time";

  return null;
}

function dayBoundsLocal(d: Date) {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

  const opensAt = new Date(base);
  opensAt.setHours(OPEN_HOUR, 0, 0, 0);

  const closesAt = new Date(base);
  closesAt.setHours(CLOSE_HOUR, 0, 0, 0);

  return { opensAt, closesAt };
}

function withinServiceHours(start: Date, end: Date, opensAt: Date, closesAt: Date) {
  return start >= opensAt && end <= closesAt;
}

function roundUpToStep(d: Date, stepMin: number) {
  const ms = d.getTime();
  const stepMs = stepMin * 60_000;
  return new Date(Math.ceil(ms / stepMs) * stepMs);
}

function roundDownToStep(d: Date, stepMin: number) {
  const ms = d.getTime();
  const stepMs = stepMin * 60_000;
  return new Date(Math.floor(ms / stepMs) * stepMs);
}

async function isSpecificTableFree(
  prisma: any,
  params: {
    tableId: number;
    partySize: number;
    startTime: Date;
    endTime: Date;
    ignoreBookingId: number;
  }
) {
  const { tableId, partySize, startTime, endTime, ignoreBookingId } = params;

  const ok = await prisma.table.findFirst({
    where: {
      id: tableId,
      active: true,
      capacity: { gte: partySize },
      bookings: {
        none: {
          status: "CONFIRMED",
          id: { not: ignoreBookingId },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      },
    },
    select: { id: true },
  });

  return !!ok;
}

async function findNextEarliestSuggestion(
  prisma: any,
  params: { partySize: number; requested: Date; ignoreBookingId: number }
) {
  const { partySize, requested, ignoreBookingId } = params;
  const { opensAt, closesAt } = dayBoundsLocal(requested);

  let cursor = roundUpToStep(requested, SLOT_MIN);

  for (let offset = 0; offset <= MAX_FORWARD_MIN; offset += SLOT_MIN) {
    const startTime = addMinutes(cursor, offset);
    const endTime = addMinutes(startTime, DURATION_MIN);

    if (!withinServiceHours(startTime, endTime, opensAt, closesAt)) continue;

    const table = await assignTableForSlot(prisma, {
      partySize,
      startTime,
      endTime,
      ignoreBookingId,
    });

    if (table) return { startTime, endTime, table };
  }

  return null;
}

async function findNearestSuggestion(
  prisma: any,
  params: { partySize: number; requested: Date; ignoreBookingId: number }
) {
  const { partySize, requested, ignoreBookingId } = params;
  const { opensAt, closesAt } = dayBoundsLocal(requested);

  const base = roundDownToStep(requested, SLOT_MIN);

  for (let offset = SLOT_MIN; offset <= MAX_BACK_MIN; offset += SLOT_MIN) {
    // earlier
    const earlierStart = addMinutes(base, -offset);
    const earlierEnd = addMinutes(earlierStart, DURATION_MIN);

    if (withinServiceHours(earlierStart, earlierEnd, opensAt, closesAt)) {
      const table = await assignTableForSlot(prisma, {
        partySize,
        startTime: earlierStart,
        endTime: earlierEnd,
        ignoreBookingId,
      });
      if (table) return { startTime: earlierStart, endTime: earlierEnd, table };
    }

    // later (same distance)
    const laterStart = addMinutes(base, offset);
    const laterEnd = addMinutes(laterStart, DURATION_MIN);

    if (withinServiceHours(laterStart, laterEnd, opensAt, closesAt)) {
      const table = await assignTableForSlot(prisma, {
        partySize,
        startTime: laterStart,
        endTime: laterEnd,
        ignoreBookingId,
      });
      if (table) return { startTime: laterStart, endTime: laterEnd, table };
    }
  }

  return null;
}

export async function PATCH(
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
  const prisma = getPrisma();

  const existing = await prisma.booking.findUnique({
    where: { reference: upper },
    include: { table: true },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
  }

  // Build proposed updates (keep old values if not provided)
  const nextEmail =
    body.email === undefined ? existing.email : String(body.email ?? "").trim().toLowerCase();
  const nextFirstName =
    body.firstName === undefined ? existing.firstName : String(body.firstName ?? "").trim();
  const nextSurname =
    body.surname === undefined ? existing.surname : String(body.surname ?? "").trim();

  const nextPartySize =
    body.partySize === undefined ? existing.partySize : Number(body.partySize);

  const nextStartTime =
    body.startTime === undefined ? new Date(existing.startTime) : new Date(body.startTime);

  // Field validation
  if (!isValidEmail(nextEmail)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email address" }, { status: 400 });
  }
  if (!isValidName(nextFirstName)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid first name" }, { status: 400 });
  }
  if (!isValidName(nextSurname)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid surname" }, { status: 400 });
  }
  if (
    !Number.isFinite(nextPartySize) ||
    !Number.isInteger(nextPartySize) ||
    nextPartySize < 1 ||
    nextPartySize > 10
  ) {
    return NextResponse.json(
      { ok: false, error: "Party size must be a whole number between 1 and 10" },
      { status: 400 }
    );
  }

  const timeErr = validateTimeRules(nextStartTime);
  if (timeErr) {
    return NextResponse.json({ ok: false, error: timeErr }, { status: 400 });
  }

  const nextEndTime = addMinutes(nextStartTime, DURATION_MIN);

  // ----------------------------
  // AUTO TABLE REASSIGN
  // ----------------------------
  let chosenTableId: number | null = existing.tableId;

  // try keep current table if it still fits and is free
  if (existing.table?.capacity >= nextPartySize) {
    const currentOk = await isSpecificTableFree(prisma, {
      tableId: existing.tableId,
      partySize: nextPartySize,
      startTime: nextStartTime,
      endTime: nextEndTime,
      ignoreBookingId: existing.id,
    });

    if (!currentOk) chosenTableId = null;
  } else {
    chosenTableId = null;
  }

  // otherwise pick the best available table using your shared rules
  if (!chosenTableId) {
    const best = await assignTableForSlot(prisma, {
      partySize: nextPartySize,
      startTime: nextStartTime,
      endTime: nextEndTime,
      ignoreBookingId: existing.id,
    });

    if (!best) {
      const nearest = await findNearestSuggestion(prisma, {
        partySize: nextPartySize,
        requested: nextStartTime,
        ignoreBookingId: existing.id,
      });

      const nextEarliest = await findNextEarliestSuggestion(prisma, {
        partySize: nextPartySize,
        requested: nextStartTime,
        ignoreBookingId: existing.id,
      });

      return NextResponse.json(
        {
          ok: false,
          error: "NO_TABLE",
          requested: {
            startTime: nextStartTime.toISOString(),
            endTime: nextEndTime.toISOString(),
          },
          suggestions: {
            nearest: nearest
              ? {
                  startTime: nearest.startTime.toISOString(),
                  endTime: nearest.endTime.toISOString(),
                  tableId: nearest.table.id,
                  tableNumber: nearest.table.number,
                  tableCapacity: nearest.table.capacity,
                }
              : null,
            nextEarliest: nextEarliest
              ? {
                  startTime: nextEarliest.startTime.toISOString(),
                  endTime: nextEarliest.endTime.toISOString(),
                  tableId: nextEarliest.table.id,
                  tableNumber: nextEarliest.table.number,
                  tableCapacity: nextEarliest.table.capacity,
                }
              : null,
          },
        },
        { status: 409 }
      );
    }

    chosenTableId = best.id;
  }

  // ✅ Transaction + lock chosen table row + overlap re-check excluding this booking
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Table" WHERE id = ${chosenTableId} FOR UPDATE`;

    const overlap = await tx.booking.findFirst({
      where: {
        id: { not: existing.id },
        tableId: chosenTableId!,
        status: "CONFIRMED",
        startTime: { lt: nextEndTime },
        endTime: { gt: nextStartTime },
      },
      select: { id: true },
    });

    if (overlap) return null;

    return await tx.booking.update({
      where: { id: existing.id },
      data: {
        email: nextEmail,
        firstName: nextFirstName,
        surname: nextSurname,
        partySize: nextPartySize,
        startTime: nextStartTime,
        endTime: nextEndTime,
        tableId: chosenTableId!,
      },
      include: { table: true },
    });
  });

  if (!updated) {
    // rare race condition: someone booked in between suggestion/assign and update
    return NextResponse.json(
      { ok: false, error: "NO_TABLE" },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, booking: updated });
}
