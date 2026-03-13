import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendBookingCancelledEmail } from "@/lib/email";

const TZ = process.env.RESTAURANT_TZ ?? "Europe/Dublin";
const PHONE = process.env.RESTAURANT_PHONE ?? "YOUR_PHONE_NUMBER";

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

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ ref: string }> }
) {
  const { ref } = await ctx.params;
  const reference = String(ref).trim().toUpperCase();

  if (!reference) {
    return NextResponse.json({ error: "Missing booking reference." }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { reference },
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
          `Please call us on ${PHONE} to cancel or modify and quote your reference (${reference}).`,
      },
      { status: 409 }
    );
  }

  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "Booking already cancelled." }, { status: 400 });
  }

  const updated = await prisma.booking.update({
    where: { reference },
    data: { status: "CANCELLED" },
    include: { table: true },
  });

  // Send cancellation email (only if email exists)
  if (updated.email) {
    await sendBookingCancelledEmail({
      to: updated.email,
      firstName: updated.firstName ?? updated.customerName ?? "Customer",
      reference: updated.reference,
      partySize: updated.partySize,
      startTime: updated.startTime,
      endTime: updated.endTime,
      phone: PHONE,
    });
  }

  return NextResponse.json({ ok: true, booking: updated }, { status: 200 });
}
