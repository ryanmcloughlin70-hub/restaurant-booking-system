import CancelButton from "./CancelButton";
import Link from "next/link";
import { getPrisma } from "@/app/lib/prisma";

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: { ref?: string } | Promise<{ ref?: string }>;
}) {
  const sp = await Promise.resolve(searchParams);
  const ref = sp.ref?.trim().toUpperCase(); // ✅ 1) normalize reference

  if (!ref) {
    return (
      <main className="min-h-screen bg-[#0b0b0c] text-white flex items-center justify-center p-6">
        <div className="max-w-lg rounded-xl bg-white text-black p-6">
          <h1 className="text-2xl font-semibold">No reference provided</h1>
          <p className="mt-2 text-black/70">We couldn’t load your booking.</p>
          <Link className="mt-4 inline-block text-[#6b0f13] underline" href="/book">
            Back to booking
          </Link>
        </div>
      </main>
    );
  }

  const prisma = getPrisma();
  const booking = await prisma.booking.findUnique({
    where: { reference: ref },
    include: { table: true },
  });

  if (!booking) {
    return (
      <main className="min-h-screen bg-[#0b0b0c] text-white flex items-center justify-center p-6">
        <div className="max-w-lg rounded-xl bg-white text-black p-6">
          <h1 className="text-2xl font-semibold">Booking not found</h1>
          <p className="mt-2 text-black/70">
            Reference: <span className="font-mono">{ref}</span>
          </p>
          <Link className="mt-4 inline-block text-[#6b0f13] underline" href="/book">
            Back to booking
          </Link>
        </div>
      </main>
    );
  }

  const when = new Date(booking.startTime);
  const ends = new Date(booking.endTime);

  const dateStr = when.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const timeStr = when.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const endTimeStr = ends.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="min-h-screen bg-[#0b0b0c] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white text-black shadow-xl">
        {/* Header */}
        <div className="border-b border-black/10 px-6 py-5">
          <div className="inline-flex items-center gap-3">
            <div className="inline-block rounded bg-[#6b0f13] px-4 py-2 text-sm font-semibold tracking-wide text-white">
              BOOKING CONFIRMED
            </div>
            <span className="text-sm text-black/60">We look forward to seeing you.</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Thanks, {booking.firstName}!</h1>
            <p className="mt-2 text-black/75">
              Your table is booked for <span className="font-semibold">{dateStr}</span> at{" "}
              <span className="font-semibold">{timeStr}</span>{" "}
              <span className="text-black/60">(until {endTimeStr})</span> for{" "}
              <span className="font-semibold">{booking.partySize}</span>{" "}
              {booking.partySize === 1 ? "person" : "people"}.
            </p>
          </div>

          {/* Reference card */}
          <div className="rounded-lg border border-black/10 bg-[#fff7ed] p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-black/60">Booking reference</div>
                <div className="mt-1 font-mono text-3xl font-semibold tracking-widest">{booking.reference}</div>
              </div>

              <div className="text-right text-sm text-black/70">
                <div className="font-medium">Table #{booking.table.number}</div>
                <div className="text-black/50">{booking.table.capacity} seats</div>
              </div>
            </div>
          </div>

          <p className="text-sm text-black/70">
            You will receive an email confirmation shortly. If you need to change or cancel, please call us and quote
            your reference.
          </p>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-black/10 p-3">
              <div className="text-black/50">Name</div>
              <div className="font-medium">
                {booking.firstName} {booking.surname}
              </div>
            </div>
            <div className="rounded-md border border-black/10 p-3">
              <div className="text-black/50">Email</div>
              <div className="font-medium break-all">{booking.email}</div>
            </div>
            <div className="rounded-md border border-black/10 p-3">
              <div className="text-black/50">Guests</div>
              <div className="font-medium">{booking.partySize}</div>
            </div>
            <div className="rounded-md border border-black/10 p-3">
              <div className="text-black/50">Time</div>
              <div className="font-medium">
                {timeStr} <span className="text-black/50">→</span> {endTimeStr}
              </div>
            </div>
          </div>

          <Link
            href="/book"
            className="inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-3 font-semibold text-white hover:opacity-95"
          >
            Make another booking
          </Link>

          {/* ✅ Buttons (premium, no dark bar) */}
          <div className="mt-3 flex gap-3">
            {booking.status === "CANCELLED" ? (
              <div className="inline-flex w-1/2 items-center justify-center rounded-md bg-black/5 px-4 py-3 font-semibold text-black/40 cursor-not-allowed">
                Modify booking
              </div>
            ) : (
              <Link
                href={`/book/modify?ref=${ref}`}
                className="inline-flex w-1/2 items-center justify-center rounded-md bg-black/10 px-4 py-3 font-semibold text-black hover:bg-black/15"
              >
                Modify booking
              </Link>
            )}

            <CancelButton reference={ref} initialStatus={booking.status} />
          </div>

          <p className="text-xs text-black/50">
            Please arrive on time. We’ll hold your table for the duration of your booking.
          </p>
        </div>
      </div>
    </main>
  );
}
