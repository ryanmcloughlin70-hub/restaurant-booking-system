"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { staffFetch } from "@/app/lib/staffFetch";

type Booking = {
  id: number;
  reference: string;

  email: string | null;
  firstName: string | null;
  surname: string | null;
  customerName: string | null;

  partySize: number;
  startTime: string;
  endTime: string;

  status: "CONFIRMED" | "CANCELLED";
  table: { id: number; number: number; capacity: number; active: boolean };
};

type TableRow = {
  id: number;
  number: number;
  capacity: number;
  active: boolean;
};

function isValidYyyyMmDd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function hourLabel(h: number) {
  const suffix = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${suffix}`;
}

function displayName(b: Pick<Booking, "customerName" | "firstName" | "surname">) {
  return b.customerName?.trim() || [b.firstName, b.surname].filter(Boolean).join(" ") || "—";
}

function addMinutes(d: Date, mins: number) {
  return new Date(d.getTime() + mins * 60_000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && aEnd > bStart;
}

export default function StaffPrintPage() {
  const sp = useSearchParams();

  const date =
    sp.get("date") && isValidYyyyMmDd(sp.get("date")!)
      ? sp.get("date")!
      : new Date().toISOString().slice(0, 10);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [tablesError, setTablesError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      setTablesError(null);

      try {
        // 1) Bookings
        const bookingsRes = await staffFetch(`/api/staff/bookings?date=${encodeURIComponent(date)}`, {
          cache: "no-store",
        });

        if (bookingsRes.status === 401) {
          window.location.href = "/staff";
          return;
        }

        const bookingsData = await bookingsRes.json().catch(() => null);
        if (!bookingsRes.ok || !bookingsData?.ok) {
          setError(bookingsData?.error ?? `Failed to load bookings (status ${bookingsRes.status})`);
          return;
        }

        const confirmed: Booking[] = (bookingsData.bookings ?? []).filter(
          (b: Booking) => b.status === "CONFIRMED"
        );
        setBookings(confirmed);

        // 2) Tables (optional endpoint, but needed for "free tables")
        try {
          const tablesRes = await staffFetch("/api/staff/tables", { cache: "no-store" });

          if (tablesRes.status === 401) {
            window.location.href = "/staff";
            return;
          }

          const tablesData = await tablesRes.json().catch(() => null);

          if (!tablesRes.ok || !tablesData?.ok) {
            setTablesError(tablesData?.error ?? `Failed to load tables (status ${tablesRes.status})`);
          } else {
            setTables((tablesData.tables ?? []).filter((t: TableRow) => t.active));
          }
        } catch (e: any) {
          setTablesError(e?.message ?? "Failed to load tables");
        }
      } catch (e: any) {
        setError(e?.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  // Group bookings by local hour for the hour blocks
  const groupedByHour = useMemo(() => {
    const byHour = new Map<number, Booking[]>();
    for (const b of bookings) {
      const h = new Date(b.startTime).getHours();
      if (!byHour.has(h)) byHour.set(h, []);
      byHour.get(h)!.push(b);
    }
    return byHour;
  }, [bookings]);

  // ✅ Fixed print range: 12pm → 8pm
  const OPEN_HOUR = 12;
  const CLOSE_HOUR = 20;

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) list.push(h);
    return list;
  }, [OPEN_HOUR, CLOSE_HOUR]);

  // ✅ Page reducers
  const BLANK_ROWS_PER_HOUR = 4;

  // ✅ Free tables blocks: 2-hour arrivals with 90min booking + 15min buffer
  const BLOCK_HOURS = 2;
  const BOOKING_MINS = 90;
  const BUFFER_MINS = 15;

  // Use the selected day as the anchor (important!)
  const dayAnchor = useMemo(() => new Date(`${date}T00:00:00`), [date]);
  const dayY = dayAnchor.getFullYear();
  const dayM = dayAnchor.getMonth();
  const dayD = dayAnchor.getDate();

  const blocks = useMemo(() => {
    const out: Array<{
      startHour: number;
      endHour: number; // exclusive
      freeUntilHour: number;
      freeUntilMinute: number;
    }> = [];

    for (let startHour = OPEN_HOUR; startHour <= CLOSE_HOUR; startHour += BLOCK_HOURS) {
      const endHour = startHour + BLOCK_HOURS;

      const endBase = new Date(dayY, dayM, dayD, endHour, 0, 0, 0);
      const freeUntil = addMinutes(endBase, BOOKING_MINS + BUFFER_MINS);

      out.push({
        startHour,
        endHour,
        freeUntilHour: freeUntil.getHours(),
        freeUntilMinute: freeUntil.getMinutes(),
      });
    }

    return out;
  }, [OPEN_HOUR, CLOSE_HOUR, BLOCK_HOURS, BOOKING_MINS, BUFFER_MINS, dayY, dayM, dayD]);

  const freeTablesByBlock = useMemo(() => {
    const result = new Map<number, Map<number, number[]>>(); // startHour -> capacity -> tableNumbers[]

    if (!tables.length) return result;

    const bookingRanges = bookings.map((b) => ({
      start: new Date(b.startTime),
      end: new Date(b.endTime),
      tableNumber: b.table.number,
    }));

    for (const blk of blocks) {
      const windowStart = new Date(dayY, dayM, dayD, blk.startHour, 0, 0, 0);
      const endBase = new Date(dayY, dayM, dayD, blk.endHour, 0, 0, 0);
      const windowEnd = addMinutes(endBase, BOOKING_MINS + BUFFER_MINS); // block end + 105 mins

      const freeTables = tables.filter((t) => {
        const hasOverlap = bookingRanges.some((r) => {
          if (r.tableNumber !== t.number) return false;
          return overlaps(r.start, r.end, windowStart, windowEnd);
        });
        return !hasOverlap;
      });

      const byCap = new Map<number, number[]>();
      for (const t of freeTables) {
        if (!byCap.has(t.capacity)) byCap.set(t.capacity, []);
        byCap.get(t.capacity)!.push(t.number);
      }

      for (const [cap, nums] of byCap) {
        nums.sort((a, b) => a - b);
        byCap.set(cap, nums);
      }

      result.set(blk.startHour, byCap);
    }

    return result;
  }, [tables, bookings, blocks, dayY, dayM, dayD, BOOKING_MINS, BUFFER_MINS]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white text-black flex items-center justify-center p-8">
        <div className="text-sm text-black/70">Loading print sheet…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-white text-black p-8">
        <h1 className="text-lg font-semibold">Print sheet</h1>
        <p className="mt-2 text-sm text-red-700">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded border border-black/20 px-3 py-2 text-sm"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <html>
      <head>
        <title>Bookings – {date}</title>
        <style>{`
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, sans-serif; color: #111; }
          h1 { margin: 0 0 6px 0; font-size: 16px; }
          .meta { font-size: 11px; margin-bottom: 10px; }

          .hourBlock { margin: 10px 0 14px; }
          .hourTitle { font-weight: 700; font-size: 13px; margin: 0 0 6px; }

          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #222; padding: 4px 6px; font-size: 11px; }
          th { background: #f2f2f2; text-align: left; }

          .colName { width: 52%; }
          .colPax { width: 10%; text-align: center; }
          .colTable { width: 12%; text-align: center; }
          .colTime { width: 16%; text-align: center; }

          .blank td { height: 16px; }

          .freeBlock {
            margin: 8px 0 14px;
            border: 1px solid #222;
            padding: 6px 8px;
          }
          .freeTitle { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
          .freeRow { font-size: 11px; margin: 2px 0; }
          .pill { display: inline-block; border: 1px solid #222; padding: 1px 6px; border-radius: 999px; margin-right: 6px; }

          .noPrint { margin-top: 10px; }
          @media print { .noPrint { display: none; } }
        `}</style>
      </head>

      <body>
        <h1>Today’s Bookings</h1>
        <div className="meta">
          Date: <strong>{date}</strong> • Printed: <strong>{new Date().toLocaleString()}</strong>
          {tablesError ? (
            <>
              {" "}• <strong style={{ color: "#b00020" }}>Tables:</strong>{" "}
              <span style={{ color: "#b00020" }}>{tablesError}</span>
            </>
          ) : null}
        </div>

        {hours.map((h) => {
          const list = groupedByHour.get(h) ?? [];

          // Show free tables block AFTER each 2-hour chunk (after 1pm, 3pm, 5pm, 7pm)
          const isBlockEnd = ((h - OPEN_HOUR + 1) % BLOCK_HOURS === 0);
          const blockStart = Math.max(OPEN_HOUR, h - (BLOCK_HOURS - 1));

          const blk = blocks.find((b) => b.startHour === blockStart);
          const freeByCap = freeTablesByBlock.get(blockStart);

          const freeUntilLabel =
            blk ? `${blk.freeUntilHour}:${String(blk.freeUntilMinute).padStart(2, "0")}` : "";

          return (
            <div key={h}>
              <div className="hourBlock">
                <div className="hourTitle">{hourLabel(h)}</div>

                <table>
                  <thead>
                    <tr>
                      <th className="colName">Name</th>
                      <th className="colPax">Pax</th>
                      <th className="colTable">Table</th>
                      <th className="colTime">Time</th>
                    </tr>
                  </thead>

                  <tbody>
                    {list.map((b) => {
                      const st = new Date(b.startTime);
                      const timeStr = st.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

                      return (
                        <tr key={b.reference}>
                          <td className="colName">{displayName(b)}</td>
                          <td className="colPax">{b.partySize}</td>
                          <td className="colTable">#{b.table.number}</td>
                          <td className="colTime">{timeStr}</td>
                        </tr>
                      );
                    })}

                    {Array.from({ length: BLANK_ROWS_PER_HOUR }).map((_, i) => (
                      <tr className="blank" key={`blank-${h}-${i}`}>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isBlockEnd && blk ? (
                <div className="freeBlock">
                  <div className="freeTitle">
                    Arrivals {hourLabel(blk.startHour)}–{hourLabel(blk.endHour)} → tables free until {freeUntilLabel}
                  </div>

                  {!tables.length ? (
                    <div className="freeRow">
                      (No tables list available yet — add <code>/api/staff/tables</code> to show this.)
                    </div>
                  ) : freeByCap && Array.from(freeByCap.keys()).length ? (
                    Array.from(freeByCap.entries())
                      .sort((a, b) => a[0] - b[0])
                      .map(([cap, nums]) => (
                        <div className="freeRow" key={`cap-${blk.startHour}-${cap}`}>
                          <span className="pill">{cap}p</span>
                          {nums.map((n) => `#${n}`).join("  ")}
                        </div>
                      ))
                  ) : (
                    <div className="freeRow">No free tables for that arrival window.</div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="noPrint">
          <button onClick={() => window.print()}>Print</button>
        </div>
      </body>
    </html>
  );
}
