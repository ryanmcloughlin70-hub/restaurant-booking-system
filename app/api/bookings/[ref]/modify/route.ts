import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assignTableForSlot } from "@/lib/assignTableForSlot";
import { sendBookingModifiedEmail } from "@/lib/email";

const TZ = process.env.RESTAURANT_TZ ?? "Europe/Dublin";
const PHONE = process.env.RESTAURANT_PHONE ?? "YOUR_PHONE_NUMBER";
const BOOKING_MINS = 90;

function dateKeyInTZ(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

function isSameDayInTZ(a: Date, b: Date, tz: string) {
  return dateKeyInTZ(a, tz) === dateKeyInTZ(b, tz);
}

function addMinutes(d: Date, mins: number) {
  return new Date(d.getTime() + mins * 60_000);
}

function makeReference(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ ref: string }> }
) {
  const { ref } = await ctx.params;
  const reference = String(ref).trim().toUpperCase();

  if (!reference) {
    return NextResponse.json({ error: "Missing booking reference." }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { reference },
    include: { table: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  // Same-day lock
  if (isSameDayInTZ(new Date(booking.startTime), new Date(), TZ)) {
    return NextResponse.json(
      {
        error:
          `Sorry, you can’t edit or cancel a booking on the day online. ` +
          `Please call us on ${PHONE} to cancel or modify and quote your reference.`,
      },
      { status: 409 }
    );
  }

  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "This booking is cancelled." }, { status: 400 });
  }

  const body = await req.json();
  const newStart = new Date(body.startTime);
  const newPartySize = Number(body.partySize);

  if (!body.startTime || Number.isNaN(newStart.getTime())) {
    return NextResponse.json({ error: "Invalid startTime." }, { status: 400 });
  }
  if (!Number.isInteger(newPartySize) || newPartySize < 1 || newPartySize > 10) {
    return NextResponse.json({ error: "Party size must be 1–10." }, { status: 400 });
  }

  // Not in the past
  if (newStart.getTime() < Date.now()) {
    return NextResponse.json({ error: "You cannot book a time in the past." }, { status: 400 });
  }

  const newEnd = addMinutes(newStart, BOOKING_MINS);

  // Find a table for the new slot (ignore current booking so it doesn't block itself)
  const table = await assignTableForSlot(prisma, {
    partySize: newPartySize,
    startTime: newStart,
    endTime: newEnd,
    ignoreBookingId: booking.id,
  });

  if (!table) {
    return NextResponse.json({ error: "No tables available for that time." }, { status: 409 });
  }

  // Generate unique reference for the new booking
  let newRef = makeReference();
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.booking.findUnique({ where: { reference: newRef } });
    if (!exists) break;
    newRef = makeReference();
  }

  // IMPORTANT: don't type tx as PrismaClient (causes overload mismatch with your adapter setup)
  const result = await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { reference },
      data: { status: "CANCELLED" },
    });

    const newBooking = await tx.booking.create({
      data: {
        reference: newRef,
        email: body.email ?? booking.email,
        firstName: body.firstName ?? booking.firstName,
        surname: body.surname ?? booking.surname,
        customerName: booking.customerName,
        partySize: newPartySize,
        startTime: newStart,
        endTime: newEnd,
        status: "CONFIRMED",
        source: "ONLINE",
        phone: body.phone ?? booking.phone,
        notes: body.notes ?? booking.notes,
        tableId: table.id,
      },
      include: { table: true },
    });

    return { newBooking };
  });

  if (result.newBooking.email) {
    await sendBookingModifiedEmail({
      to: result.newBooking.email,
      firstName: result.newBooking.firstName ?? result.newBooking.customerName ?? "Customer",
      oldReference: reference,
      newReference: result.newBooking.reference,
      partySize: result.newBooking.partySize,
      startTime: result.newBooking.startTime,
      endTime: result.newBooking.endTime,
      tableNumber: result.newBooking.table.number,
      phone: PHONE,
    });
  }

  return NextResponse.json(
    { ok: true, booking: result.newBooking, oldReference: reference },
    { status: 200 }
  );
}
