"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function tomorrowYMD() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return toYMD(d);
}

export default function BookPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [partySize, setPartySize] = useState(2);

  // ✅ Default date = tomorrow (since same-day online bookings are blocked)
  const [date, setDate] = useState(() => tomorrowYMD());

  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // ✅ Track whether availability has been checked for the CURRENT inputs
  const [hasChecked, setHasChecked] = useState(false);

  // ✅ Idempotency: store the key for the current booking attempt (one per click)
  const [bookingIdemKey, setBookingIdemKey] = useState<string | null>(null);

  const minDate = useMemo(() => tomorrowYMD(), []);
  const canCheck = partySize > 0 && !!date;

  // ✅ If ANY top input changes AFTER checking availability, invalidate old slots
  useEffect(() => {
    if (slots.length === 0) return;

    setSlots([]);
    setSelected(null);
    setHasChecked(false);
    setMsg("Details changed — please click “Check availability” again.");
  }, [email, firstName, surname, partySize, date]);


  async function loadAvailability() {
    if (!canCheck) return;

    // ✅ Frontend guard (still enforced server-side too)
    if (date < minDate) {
      setSlots([]);
      setSelected(null);
      setHasChecked(false);
      setMsg("Online bookings must be made at least 1 day in advance. Please call to book for today.");
      return;
    }

    setLoading(true);
    setMsg(null);
    setSelected(null);
    setHasChecked(false);

    try {
      const res = await fetch(`/api/availability?date=${date}&partySize=${partySize}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to load availability");

      setSlots(data.slots ?? []);
      setHasChecked(true);

      if ((data.slots ?? []).length === 0) setMsg("No times available for that day.");
    } catch (e: any) {
      setMsg(e.message ?? "Something went wrong");
      setSlots([]);
      setHasChecked(false);
    } finally {
      setLoading(false);
    }
  }

  async function makeBooking(slotIso: string, idemKey: string) {
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idemKey,
        },
        body: JSON.stringify({
          email,
          firstName,
          surname,
          partySize,
          startTime: slotIso,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Booking failed");

      router.push(`/book/confirmed?ref=${data.booking.reference}`);
    } catch (e: any) {
      setMsg(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
      setBookingIdemKey(null);
    }
  }

  const prettySlots = useMemo(() => {
    return slots.map((iso) => {
      const d = new Date(iso);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return { iso, label: `${hh}:${mm}` };
    });
  }, [slots]);

  return (
    <main className="min-h-screen bg-[#0b0b0c] text-white">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-2">
        <div className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md rounded-xl bg-white text-black shadow-lg">
            <div className="border-b border-black/10 px-6 py-5">
              <div className="inline-block rounded bg-[#6b0f13] px-4 py-2 text-lg font-semibold tracking-wide text-white">
                BOOK A TABLE
              </div>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div>
                <label className="text-sm font-medium">Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none focus:border-[#b08d57]"
                  placeholder="you@example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">First name</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none focus:border-[#b08d57]"
                    placeholder="Tom"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Surname</label>
                  <input
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none focus:border-[#b08d57]"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Party size</label>
                  <select
                    value={partySize}
                    onChange={(e) => setPartySize(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-black/20 bg-white px-3 py-2 outline-none focus:border-[#b08d57]"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Date</label>
                  <input
                    type="date"
                    min={minDate}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none focus:border-[#b08d57]"
                  />
                  <p className="mt-1 text-xs text-black/60">
                    Online bookings must be made at least 1 day in advance.
                  </p>
                </div>
              </div>

              <button
                onClick={loadAvailability}
                disabled={!canCheck || loading}
                className="w-full rounded-md bg-[#6b0f13] px-4 py-3 font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Loading..." : "Check availability"}
              </button>

              {msg && (
                <div className="rounded-md border border-black/10 bg-[#fff7ed] px-3 py-2 text-sm">
                  <span className="font-medium text-[#6b0f13]">Info:</span>{" "}
                  <span className="text-black/80">{msg}</span>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Available times</h3>
                  <span className="text-xs text-black/60">{slots.length} slots</span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {prettySlots.map((s) => (
                    <button
                      key={s.iso}
                      onClick={() => setSelected(s.iso)}
                      disabled={loading || !email || !firstName || !surname || !hasChecked}
                      className={`rounded-md border px-2 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50
                        ${selected === s.iso
                          ? "border-[#b08d57] bg-[#fff7ed]"
                          : "border-black/10 bg-white hover:border-[#b08d57] hover:bg-[#fff7ed]"
                        }
                      `}
                      title={
                        !hasChecked
                          ? "Click “Check availability” first"
                          : !email || !firstName || !surname
                            ? "Enter email + first name + surname first"
                            : "Select this time"
                      }
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    if (!selected) return;

                    const key = bookingIdemKey ?? crypto.randomUUID();
                    setBookingIdemKey(key);

                    makeBooking(selected, key);
                  }}
                  disabled={loading || !hasChecked || !selected || !email || !firstName || !surname}
                  className="mt-3 w-full rounded-md bg-black px-4 py-3 font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Booking..." : "Confirm booking"}
                </button>

                {slots.length === 0 && (
                  <p className="mt-3 text-sm text-black/60">
                    Pick a date + party size, then press “Check availability”.
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-black/10 px-6 py-4 text-xs text-black/60">
              Gold accent: <span className="font-semibold text-[#b08d57]">#b08d57</span> • Deep red:{" "}
              <span className="font-semibold text-[#6b0f13]">#6b0f13</span>
            </div>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=1600&q=80')",
            }}
          />
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute bottom-10 left-10 right-10 rounded-xl border border-white/10 bg-black/40 p-6 text-white backdrop-blur">
            <p className="text-sm uppercase tracking-widest text-white/80">Reservations</p>
            <h2 className="mt-2 text-3xl font-semibold">A table awaits.</h2>
            <p className="mt-2 text-white/80">Choose a time, confirm instantly, and we’ll hold it for 90 minutes.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
