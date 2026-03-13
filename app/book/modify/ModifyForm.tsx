"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type BookingDto = {
  reference: string;
  email: string | null;
  firstName: string | null;
  surname: string | null;
  customerName: string | null;
  partySize: number;
  startTime: string; // ISO
  endTime: string; // ISO
  status: "CONFIRMED" | "CANCELLED";
  phone: string | null;
  notes: string | null;
};

const PHONE = "028 6862 1656";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function toTimeInputValue(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ✅ 12:00 → 19:30 every 15 minutes (latest START time)
function buildTimeOptions(): string[] {
  const out: string[] = [];
  const start = 12 * 60; // 12:00
  const end = 19 * 60 + 30; // 19:30

  for (let m = start; m <= end; m += 15) {
    const hh = pad2(Math.floor(m / 60));
    const mm = pad2(m % 60);
    out.push(`${hh}:${mm}`);
  }
  return out;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-black/80">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-[15px] outline-none " +
        "focus:border-black/30 focus:ring-2 focus:ring-black/10"
      }
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={
        "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-[15px] outline-none " +
        "focus:border-black/30 focus:ring-2 focus:ring-black/10"
      }
    />
  );
}

export default function ModifyForm({ reference }: { reference: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [callUs, setCallUs] = useState<string | null>(null);

  const [booking, setBooking] = useState<BookingDto | null>(null);

  // fields
  const [partySize, setPartySize] = useState<number>(2);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");

  // optional editable fields
  const [firstName, setFirstName] = useState<string>("");
  const [surname, setSurname] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // ✅ build once (prevents re-creating array every render)
  const timeOptions = useMemo(() => buildTimeOptions(), []);

  useEffect(() => {
    async function load() {
      if (!reference) {
        setError("Missing booking reference.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setCallUs(null);

        const res = await fetch(`/api/bookings/${reference}`);
        const data = await res.json();

        if (!res.ok || !data?.ok) {
          setError(data?.error ?? "Could not load booking.");
          return;
        }

        const b: BookingDto = data.booking;
        setBooking(b);

        setPartySize(b.partySize);

        const start = new Date(b.startTime);
        setDate(toDateInputValue(start));

        // Ensure time matches an option (your system should already be 15-min)
        const loadedTime = toTimeInputValue(start);
        setTime(timeOptions.includes(loadedTime) ? loadedTime : timeOptions[0]);

        setFirstName(b.firstName ?? "");
        setSurname(b.surname ?? "");
        setEmail(b.email ?? "");
        setPhone(b.phone ?? "");
        setNotes(b.notes ?? "");
      } catch {
        setError("Could not load booking.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [reference, timeOptions]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setSubmitting(true);
    setError(null);
    setCallUs(null);

    try {
      if (!date || !time) {
        setError("Please choose a date and time.");
        return;
      }

      const startLocal = new Date(`${date}T${time}:00`);
      if (Number.isNaN(startLocal.getTime())) {
        setError("Invalid date/time.");
        return;
      }

      const res = await fetch(`/api/bookings/${reference}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: startLocal.toISOString(),
          partySize,
          firstName: firstName || undefined,
          surname: surname || undefined,
          email: email || undefined,
          phone: phone || undefined,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        setCallUs(
          `We’re sorry — you can’t modify or cancel a booking on the day of it online. ` +
          `Please call us on ${PHONE} and we’ll sort it for you.`
        );
        return;
      }

      if (!res.ok) {
        setError(data?.error ?? "Could not modify booking.");
        return;
      }

      const newRef = String(data?.booking?.reference ?? "").toUpperCase();
      router.push(`/book/confirmed?ref=${newRef}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-md border border-black/10 bg-white p-4 text-sm text-black/70">
        Loading…
      </div>
    );
  }

  if (callUs) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <div className="font-semibold">Changes aren’t available today</div>
        <p className="mt-2">{callUs}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        {error}
      </div>
    );
  }

  if (!booking) return null;

  return (
    <form onSubmit={onSubmit}>
      {/* Reference row */}
      <div className="rounded-md border border-black/10 bg-[#fff7ed] px-4 py-3 text-sm">
        <div className="text-[11px] font-extrabold tracking-widest text-black/50">
          BOOKING REFERENCE
        </div>
        <div className="mt-1 font-mono text-xl font-extrabold tracking-[0.35em] text-black">
          {booking.reference}
        </div>
        <div className="mt-2 text-xs text-black/55">
          Current: {new Date(booking.startTime).toLocaleString()}
        </div>
      </div>

      {/* Main fields */}
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Field label="Party size">
            <Input
              type="number"
              min={1}
              max={10}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Date">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <Field label="Time">
          <select
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={
              "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-[15px] outline-none " +
              "focus:border-black/30 focus:ring-2 focus:ring-black/10"
            }
          >
            {timeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-black/50">
            Times are in 15-minute blocks (12:00–19:30).
          </p>
        </Field>
      </div>

      {/* Optional fields */}
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Field label="First name">
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </Field>

        <Field label="Surname">
          <Input value={surname} onChange={(e) => setSurname(e.target.value)} />
        </Field>

        <div className="col-span-2">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>

      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-[#6b0f13] px-4 py-3 font-semibold text-white hover:opacity-95 disabled:opacity-60"
      >
        {submitting ? "Updating..." : "Update booking"}
      </button>

      <p className="mt-3 text-xs text-black/50">
        You’ll receive an email confirmation after your booking is updated.
      </p>
    </form>
  );
}
