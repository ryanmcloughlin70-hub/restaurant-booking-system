"use client";

import { useEffect, useMemo, useState } from "react";
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
  createdAt: string;

  status: "CONFIRMED" | "CANCELLED";
  table: { id: number; number: number; capacity: number; active: boolean };
};

type Suggestion = {
  startTime: string;
  endTime: string;
  tableId: number;
  tableNumber: number;
  tableCapacity: number;
};

function toYmdLocal(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toHmLocal(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mi}`;
}

// ✅ 12:00 → 19:30 every 15 minutes (latest START time)
function buildStaffTimeOptions(): string[] {
  const out: string[] = [];
  const start = 12 * 60; // 12:00
  const end = 19 * 60 + 30; // 19:30
  for (let m = start; m <= end; m += 15) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    out.push(`${hh}:${mm}`);
  }
  return out;
}

function ceilTo15Min(d: Date) {
  const copy = new Date(d);
  const mins = copy.getMinutes();
  const snapped = Math.ceil(mins / 15) * 15;
  copy.setMinutes(snapped, 0, 0);
  return copy;
}

async function readApiError(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const j = await res.json();
      return j?.error ?? JSON.stringify(j);
    }

    const t = await res.text();
    return t.slice(0, 200);
  } catch {
    return `Request failed (status ${res.status})`;
  }
}

function displayName(b: Pick<Booking, "customerName" | "firstName" | "surname">) {
  return b.customerName?.trim() || [b.firstName, b.surname].filter(Boolean).join(" ") || "—";
}

export default function StaffPageClient() {
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [showCancelled, setShowCancelled] = useState(false);

  // ✅ UX filters
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [filterName, setFilterName] = useState("");
  const [filterPax, setFilterPax] = useState("");
  const [filterTable, setFilterTable] = useState("");

  const [debouncedName, setDebouncedName] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Booking | null>(null);

  // Shared time options / today
  const staffTimeOptions = useMemo(() => buildStaffTimeOptions(), []);
  const todayYmd = useMemo(() => toYmdLocal(new Date()), []);

  // ✅ Admin actions UI state
  const [editOpen, setEditOpen] = useState(false);
  const [editRef, setEditRef] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editSurname, setEditSurname] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPartySize, setEditPartySize] = useState<string>("");

  // ✅ replaced datetime-local with date + time
  const [editDate, setEditDate] = useState<string>(""); // YYYY-MM-DD
  const [editTime, setEditTime] = useState<string>(""); // HH:MM

  const [editError, setEditError] = useState<string | null>(null);

  const [editSuggestions, setEditSuggestions] = useState<{
    nearest: Suggestion | null;
    nextEarliest: Suggestion | null;
  } | null>(null);

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveRef, setMoveRef] = useState<string | null>(null);
  const [moveTableNumber, setMoveTableNumber] = useState<string>("");
  const [moveError, setMoveError] = useState<string | null>(null);

  // ✅ move options state
  const [movePartySize, setMovePartySize] = useState<number | null>(null);
  const [moveCurrentTable, setMoveCurrentTable] = useState<{ number: number; capacity: number } | null>(null);
  const [moveOptions, setMoveOptions] = useState<Array<{ id: number; number: number; capacity: number }>>([]);
  const [moveOptionsLoading, setMoveOptionsLoading] = useState(false);

  // ✅ Add booking modal state
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPartySize, setAddPartySize] = useState<string>("");

  // ✅ replaced datetime-local with date + time
  const [addDate, setAddDate] = useState<string>(""); // YYYY-MM-DD
  const [addTime, setAddTime] = useState<string>(""); // HH:MM

  const [addPhone, setAddPhone] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Time option filtering (block past times when date is today)
  const editTimeOptions = useMemo(() => {
    if (!editDate) return staffTimeOptions;
    if (editDate !== todayYmd) return staffTimeOptions;

    const nowHm = toHmLocal(ceilTo15Min(new Date()));
    return staffTimeOptions.filter((t) => t >= nowHm);
  }, [editDate, staffTimeOptions, todayYmd]);

  const addTimeOptions = useMemo(() => {
    if (!addDate) return staffTimeOptions;
    if (addDate !== todayYmd) return staffTimeOptions;

    const nowHm = toHmLocal(ceilTo15Min(new Date()));
    return staffTimeOptions.filter((t) => t >= nowHm);
  }, [addDate, staffTimeOptions, todayYmd]);

  // Keep selected times valid when date changes
  useEffect(() => {
    if (!editDate) return;
    const opts = editDate === todayYmd ? editTimeOptions : staffTimeOptions;

    if (editTime && !opts.includes(editTime)) setEditTime(opts[0] ?? "");
    if (!editTime) setEditTime(opts[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDate, editTimeOptions, staffTimeOptions, todayYmd]);

  useEffect(() => {
    if (!addDate) return;
    const opts = addDate === todayYmd ? addTimeOptions : staffTimeOptions;

    if (addTime && !opts.includes(addTime)) setAddTime(opts[0] ?? "");
    if (!addTime) setAddTime(opts[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addDate, addTimeOptions, staffTimeOptions, todayYmd]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedName(filterName);
    }, 300);

    return () => clearTimeout(t);
  }, [filterName]);

  useEffect(() => {
    (async () => {
      try {
        const res = await staffFetch("/api/staff/me", { cache: "no-store" });

        if (!res.ok) {
          setAuthed(false);
          return;
        }

        const data = await res.json();
        setAuthed(!!data.ok);
      } catch {
        setAuthed(false);
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, []);

  async function login() {
    setAuthLoading(true);
    setAuthMsg(null);

    try {
      const res = await fetch("/api/staff/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) throw new Error(await readApiError(res));

      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Invalid credentials");

      setAuthed(true);
      setUsername("");
      setPassword("");
    } catch (e: any) {
      setAuthMsg(e.message ?? "Login failed");
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    await staffFetch("/api/staff/logout", { method: "POST" });

    setAuthed(false);
    setBookings([]);
    setFound(null);
    setMsg(null);
  }

  async function loadDay() {
    setLoading(true);
    setMsg(null);
    setFound(null);

    try {
      const params = new URLSearchParams();
      params.set("date", date);

      if (upcomingOnly) params.set("upcoming", "true");
      if (debouncedName.trim()) params.set("name", debouncedName.trim());
      if (filterPax.trim()) params.set("pax", filterPax.trim());
      if (filterTable.trim()) params.set("table", filterTable.trim());

      const res = await staffFetch(`/api/staff/bookings?${params.toString()}`, {
        cache: "no-store",
      });

      if (!res.ok) throw new Error(await readApiError(res));

      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to load bookings");

      setBookings(data.bookings ?? []);
    } catch (e: any) {
      setMsg(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function searchRef() {
    const ref = q.trim().toUpperCase();
    if (!ref) return;

    setLoading(true);
    setMsg(null);

    try {
      const res = await staffFetch(`/api/staff/bookings?q=${encodeURIComponent(ref)}`, {
        cache: "no-store",
      });

      if (!res.ok) throw new Error(await readApiError(res));

      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Search failed");

      setFound(data.booking ?? null);
      if (!data.booking) setMsg("No booking found for that reference.");
    } catch (e: any) {
      setMsg(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function cancel(ref: string) {
    const upper = ref.trim().toUpperCase();
    if (!confirm(`Cancel booking ${upper}?`)) return;

    setLoading(true);
    setMsg(null);

    try {
      const res = await staffFetch(`/api/staff/bookings/${upper}/cancel`, { method: "POST" });

      if (!res.ok) throw new Error(await readApiError(res));

      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Cancel failed");

      setMsg(`Cancelled ${upper}`);
      setFound(null);
      setQ("");
      await loadDay();
    } catch (e: any) {
      setMsg(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function setToday() {
    setDate(new Date().toISOString().slice(0, 10));
  }

  // -------- Admin actions handlers --------

  function openEdit(b: Booking) {
    setEditError(null);
    setEditSuggestions(null);
    setEditRef(b.reference);
    setEditFirstName(b.firstName ?? "");
    setEditSurname(b.surname ?? "");
    setEditEmail(b.email ?? "");
    setEditPartySize(String(b.partySize));

    const start = new Date(b.startTime);
    setEditDate(toYmdLocal(start));
    setEditTime(toHmLocal(start));

    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditRef(null);
    setEditError(null);
    setEditSuggestions(null);

    setEditDate("");
    setEditTime("");
  }

  async function saveEdit(overrideStartIso?: string) {
    if (!editRef) return;

    if (!overrideStartIso && (!editDate || !editTime)) {
      setEditError("Please choose a date and time.");
      return;
    }

    setLoading(true);
    setMsg(null);
    setEditError(null);
    setEditSuggestions(null);

    try {
      const startIso =
        overrideStartIso ?? new Date(`${editDate}T${editTime}:00`).toISOString();

      const payload: any = {
        firstName: editFirstName,
        surname: editSurname,
        email: editEmail,
        partySize: Number(editPartySize),
        startTime: startIso,
      };

      const res = await staffFetch(`/api/staff/bookings/${editRef}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => null);

        if (data?.error === "NO_TABLE") {
          setEditError("No table available at that time.");
          setEditSuggestions(data.suggestions ?? null);
          return;
        }

        throw new Error((data?.error as string) ?? "No availability");
      }

      if (!res.ok) throw new Error(await readApiError(res));

      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Edit failed");

      setMsg(`Updated ${editRef}`);
      setEditOpen(false);
      setEditRef(null);
      await loadDay();
    } catch (e: any) {
      setEditError(e.message ?? "Edit failed");
    } finally {
      setLoading(false);
    }
  }

  async function applySuggestion(s: Suggestion) {
    const start = new Date(s.startTime);
    setEditDate(toYmdLocal(start));
    setEditTime(toHmLocal(start));
    setEditError(null);
    await saveEdit(s.startTime);
  }

  async function openMove(b: Booking) {
    setMoveError(null);
    setMoveRef(b.reference);
    setMoveTableNumber(String(b.table.number));

    setMovePartySize(null);
    setMoveCurrentTable(null);
    setMoveOptions([]);
    setMoveOpen(true);

    setMoveOptionsLoading(true);
    try {
      const res = await staffFetch(`/api/staff/bookings/${b.reference}/move-table-options`, {
        cache: "no-store",
      });

      if (!res.ok) throw new Error(await readApiError(res));

      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to load move options");

      setMovePartySize(data.booking?.partySize ?? null);
      setMoveCurrentTable(
        data.booking?.currentTable
          ? { number: data.booking.currentTable.number, capacity: data.booking.currentTable.capacity }
          : null
      );

      setMoveOptions(data.tables ?? []);
    } catch (e: any) {
      setMoveError(e.message ?? "Failed to load move options");
    } finally {
      setMoveOptionsLoading(false);
    }
  }

  function closeMove() {
    setMoveOpen(false);
    setMoveRef(null);
    setMoveError(null);

    setMovePartySize(null);
    setMoveCurrentTable(null);
    setMoveOptions([]);
    setMoveOptionsLoading(false);
  }

  async function saveMove() {
    if (!moveRef) return;

    setLoading(true);
    setMsg(null);
    setMoveError(null);

    try {
      const tableNum = Number(moveTableNumber);

      const res = await staffFetch(`/api/staff/bookings/${moveRef}/move-table`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber: tableNum }),
      });

      if (!res.ok) throw new Error(await readApiError(res));

      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Move table failed");

      setMsg(`Moved ${moveRef} to table #${data.booking?.table?.number ?? tableNum}`);
      setMoveOpen(false);
      setMoveRef(null);
      await loadDay();
    } catch (e: any) {
      setMoveError(e.message ?? "Move table failed");
    } finally {
      setLoading(false);
    }
  }

  // -------- Add booking handlers --------

  function openAdd() {
    setAddError(null);
    setAddName("");
    setAddPartySize("");
    setAddDate("");
    setAddTime("");
    setAddPhone("");
    setAddNotes("");

    // Pre-fill date/time to next valid slot (12:00–19:30, 15-min, not in the past)
    const now = ceilTo15Min(new Date());

    let d = new Date(now);
    let ymd = toYmdLocal(d);
    let hm = toHmLocal(d);

    if (hm < "12:00") hm = "12:00";

    if (hm > "19:30") {
      d = new Date(d);
      d.setDate(d.getDate() + 1);
      ymd = toYmdLocal(d);
      hm = "12:00";
    }

    setAddDate(ymd);
    setAddTime(hm);

    setAddOpen(true);
  }

  function closeAdd() {
    setAddOpen(false);
    setAddError(null);
  }

  async function saveAdd() {
    setLoading(true);
    setMsg(null);
    setAddError(null);

    try {
      if (!addDate || !addTime) {
        setAddError("Please choose a date and time.");
        return;
      }

      const startIso = new Date(`${addDate}T${addTime}:00`).toISOString();

      const payload: any = {
        customerName: addName.trim(),
        partySize: Number(addPartySize),
        startTime: startIso,
      };

      if (addPhone.trim()) payload.phone = addPhone.trim();
      if (addNotes.trim()) payload.notes = addNotes.trim();

      const res = await staffFetch("/api/staff/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        throw new Error((data?.error as string) ?? "No tables available at that time");
      }

      if (!res.ok) throw new Error(await readApiError(res));

      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to create booking");

      setMsg(`Booked ${addName.trim()} (${addPartySize})`);
      setAddOpen(false);
      await loadDay();
    } catch (e: any) {
      setAddError(e.message ?? "Failed to create booking");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authed) loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, date]);

  useEffect(() => {
    if (authed) loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingOnly, debouncedName, filterPax, filterTable]);

  const filtered = useMemo(() => {
    const list = showCancelled ? bookings : bookings.filter((b) => b.status === "CONFIRMED");

    return list.map((b) => {
      const st = new Date(b.startTime);
      const et = new Date(b.endTime);
      const t1 = st.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      const t2 = et.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      return { ...b, timeLabel: `${t1}–${t2}` };
    });
  }, [bookings, showCancelled]);

  // --------- LOADING AUTH ----------
  if (checkingAuth) {
    return (
      <main className="staff-dashboard min-h-screen bg-[#0b0b0c] text-white flex items-center justify-center p-6">
        <div className="text-white/70 text-sm">Checking session...</div>
      </main>
    );
  }

  // --------- AUTH SCREEN ----------
  if (!authed) {
    return (
      <main className="staff-dashboard min-h-screen bg-[#0b0b0c] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-white text-black shadow-xl overflow-hidden">
          <div className="border-b border-black/10 px-6 py-5">
            <div className="inline-block rounded bg-[#6b0f13] px-4 py-2 text-lg font-semibold tracking-wide text-white">
              STAFF LOGIN
            </div>
          </div>

          <div className="px-6 py-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none focus:border-[#b08d57]"
                placeholder="Enter username"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none focus:border-[#b08d57]"
                placeholder="Enter password"
                type="password"
                autoComplete="current-password"
              />
            </div>

            {authMsg && (
              <div className="rounded-md border border-black/10 bg-[#fff7ed] px-3 py-2 text-sm">
                <span className="font-medium text-[#6b0f13]">Info:</span>{" "}
                <span className="text-black/80">{authMsg}</span>
              </div>
            )}

            <button
              onClick={login}
              disabled={authLoading || !username.trim() || !password.trim()}
              className="w-full rounded-md bg-black px-4 py-3 font-semibold text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authLoading ? "Checking..." : "Enter dashboard"}
            </button>

            <p className="text-xs text-black/60">This area is restricted to staff only.</p>
          </div>
        </div>
      </main>
    );
  }

  // --------- DASHBOARD ----------
  return (
    <main className="staff-dashboard min-h-screen bg-[#0b0b0c] text-white p-6">
      {/* Add Booking Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white text-black shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div>
                <div className="text-xs text-black/60">Add booking (phone / walk-in)</div>
                <div className="text-lg font-bold">New booking</div>
              </div>
              <button
                onClick={closeAdd}
                className="rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                  placeholder="e.g. John Murphy"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Party size</label>
                  <input
                    value={addPartySize}
                    onChange={(e) => setAddPartySize(e.target.value)}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                    placeholder="e.g. 4"
                  />
                  <div className="mt-1 text-xs text-black/60">1–10 guests</div>
                </div>

                {/* ✅ Date + Time (restricted) */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:col-span-2">
                  <div>
                    <label className="text-sm font-medium">Date</label>
                    <input
                      type="date"
                      min={todayYmd}
                      value={addDate}
                      onChange={(e) => setAddDate(e.target.value)}
                      className="date-icon-black mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                    />

                  </div>

                  <div>
                    <label className="text-sm font-medium">Time</label>
                    <select
                      value={addTime}
                      onChange={(e) => setAddTime(e.target.value)}
                      className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                    >
                      <option value="" disabled>
                        Select a time…
                      </option>
                      {addTimeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-black/60">15-minute intervals • 90 mins</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Phone (optional)</label>
                  <input
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                    placeholder="e.g. 0871234567"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Notes (optional)</label>
                  <input
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                    className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                    placeholder="e.g. window seat"
                  />
                </div>
              </div>

              {addError && (
                <div className="rounded-md border border-black/10 bg-[#fff7ed] px-3 py-2 text-sm">
                  <span className="font-medium text-[#6b0f13]">Error:</span>{" "}
                  <span className="text-black/80">{addError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={closeAdd}
                  className="rounded-md bg-black/10 px-4 py-2 font-semibold hover:bg-black/15"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={saveAdd}
                  className="rounded-md bg-[#6b0f13] px-4 py-2 font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  disabled={loading || !addName.trim() || !addPartySize.trim() || !addDate.trim() || !addTime.trim()}
                >
                  {loading ? "Saving..." : "Add booking"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white text-black shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div>
                <div className="text-xs text-black/60">Edit booking</div>
                <div className="font-mono text-lg font-bold tracking-widest">{editRef}</div>
              </div>
              <button
                onClick={closeEdit}
                className="rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">First name</label>
                  <input
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Surname</label>
                  <input
                    value={editSurname}
                    onChange={(e) => setEditSurname(e.target.value)}
                    className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Email</label>
                <input
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Party size</label>
                  <input
                    value={editPartySize}
                    onChange={(e) => setEditPartySize(e.target.value)}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                  />
                  <div className="mt-1 text-xs text-black/60">1–10 guests</div>
                </div>

                {/* ✅ Date + Time (restricted) */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:col-span-2">
                  <div>
                    <label className="text-sm font-medium">Date</label>
                    <input
                      type="date"
                      min={todayYmd}
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="date-icon-black mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                    />

                  </div>

                  <div>
                    <label className="text-sm font-medium">Time</label>
                    <select
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                    >
                      <option value="" disabled>
                        Select a time…
                      </option>
                      {editTimeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-black/60">15-minute intervals • 90 mins</div>
                  </div>
                </div>
              </div>

              {editError && (
                <div className="rounded-md border border-black/10 bg-[#fff7ed] px-3 py-2 text-sm">
                  <span className="font-medium text-[#6b0f13]">Error:</span>{" "}
                  <span className="text-black/80">{editError}</span>
                </div>
              )}

              {editSuggestions && (editSuggestions.nearest || editSuggestions.nextEarliest) && (
                <div className="rounded-md border border-black/10 bg-[#f8fafc] px-3 py-3 text-sm">
                  <div className="font-semibold text-black">Suggested times</div>
                  <div className="mt-1 text-xs text-black/60">
                    Click one to apply it and auto-save (table will be auto-assigned).
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {editSuggestions.nearest && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => applySuggestion(editSuggestions.nearest!)}
                        className="rounded-md bg-black px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      >
                        Nearest:{" "}
                        {new Date(editSuggestions.nearest.startTime).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        (Table #{editSuggestions.nearest.tableNumber})
                      </button>
                    )}

                    {editSuggestions.nextEarliest && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => applySuggestion(editSuggestions.nextEarliest!)}
                        className="rounded-md bg-[#6b0f13] px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      >
                        Next earliest:{" "}
                        {new Date(editSuggestions.nextEarliest.startTime).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        (Table #{editSuggestions.nextEarliest.tableNumber})
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={closeEdit}
                  className="rounded-md bg-black/10 px-4 py-2 font-semibold hover:bg-black/15"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveEdit()}
                  className="rounded-md bg-[#6b0f13] px-4 py-2 font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  disabled={
                    loading ||
                    !editRef ||
                    !editFirstName.trim() ||
                    !editSurname.trim() ||
                    !editEmail.trim() ||
                    !editPartySize.trim() ||
                    !editDate.trim() ||
                    !editTime.trim()
                  }
                >
                  {loading ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {moveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white text-black shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <div>
                <div className="text-xs text-black/60">Move booking to another table</div>
                <div className="font-mono text-lg font-bold tracking-widest">{moveRef}</div>
              </div>
              <button
                onClick={closeMove}
                className="rounded-md bg-black px-3 py-1.5 text-sm font-semibold text-white hover:opacity-95"
              >
                Close
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="space-y-3">
                <div className="rounded-md border border-black/10 bg-[#f8fafc] px-3 py-2 text-sm">
                  <div className="font-semibold text-black">Current booking</div>
                  <div className="mt-1 text-black/70 text-xs">
                    Party size: <span className="font-semibold">{movePartySize ?? "…"}</span> • Current table:{" "}
                    <span className="font-semibold">
                      {moveCurrentTable ? `#${moveCurrentTable.number} (${moveCurrentTable.capacity})` : "…"}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Choose a free table</label>
                  <div className="mt-2 text-xs text-black/60">
                    Showing tables that fit this party size (capacity ≥ party size).
                  </div>

                  {moveOptionsLoading ? (
                    <div className="mt-3 text-sm text-black/60">Loading available tables…</div>
                  ) : moveOptions.length === 0 ? (
                    <div className="mt-3 text-sm text-black/60">No suitable tables free at that time.</div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {moveOptions.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          disabled={loading}
                          onClick={() => setMoveTableNumber(String(t.number))}
                          className={`rounded-md px-3 py-2 text-sm font-semibold border ${String(t.number) === moveTableNumber
                            ? "bg-black text-white border-black"
                            : "bg-white text-black border-black/15 hover:bg-black/5"
                            }`}
                          title={`Table #${t.number} seats ${t.capacity}`}
                        >
                          #{t.number} <span className="text-xs opacity-80">({t.capacity})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">Or enter table number</label>
                  <input
                    value={moveTableNumber}
                    onChange={(e) => setMoveTableNumber(e.target.value)}
                    inputMode="numeric"
                    placeholder="e.g. 12"
                    className="mt-1 w-full rounded-md border border-black/20 px-3 py-2 outline-none"
                  />
                  <div className="mt-1 text-xs text-black/60">Useful if you know exactly what you want.</div>
                </div>
              </div>

              {moveError && (
                <div className="rounded-md border border-black/10 bg-[#fff7ed] px-3 py-2 text-sm">
                  <span className="font-medium text-[#6b0f13]">Error:</span>{" "}
                  <span className="text-black/80">{moveError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={closeMove}
                  className="rounded-md bg-black/10 px-4 py-2 font-semibold hover:bg-black/15"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={saveMove}
                  className="rounded-md bg-[#6b0f13] px-4 py-2 font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  disabled={loading || !moveRef || !moveTableNumber.trim()}
                >
                  {loading ? "Moving..." : "Move table"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-white/70 uppercase tracking-widest text-xs">Mahon’s Hotel</p>
            <h1 className="text-3xl font-semibold">Staff Dashboard</h1>
            <p className="mt-1 text-white/70">Bookings, search, and cancellations.</p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-white/70">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
              />
            </div>

            <button onClick={setToday} className="h-10 rounded-md bg-white/10 px-4 font-semibold hover:bg-white/15">
              Today
            </button>

            {/* ✅ NEW: Add booking button */}
            <button
              onClick={openAdd}
              disabled={loading}
              className="h-10 rounded-md bg-[#6b0f13] px-4 font-semibold hover:opacity-95 disabled:opacity-60"
            >
              Add booking
            </button>

            <button
              onClick={() => window.open(`/staff/print?date=${date}`, "_blank")}
              className="h-10 rounded-md bg-white/10 px-4 font-semibold hover:bg-white/15"
            >
              Print today
            </button>

            <button
              onClick={loadDay}
              disabled={loading}
              className="h-10 rounded-md bg-[#6b0f13] px-4 font-semibold hover:opacity-95 disabled:opacity-60"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>

            <button onClick={logout} className="h-10 rounded-md bg-black px-4 font-semibold hover:opacity-95">
              Log out
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="flex-1">
                <label className="block text-xs text-white/70">Search by reference</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="e.g. HNUV3S"
                    className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                  />
                  <button
                    onClick={searchRef}
                    disabled={loading || !q.trim()}
                    className="rounded-md bg-black px-4 py-2 font-semibold hover:opacity-95 disabled:opacity-60"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-white/80 select-none">
                  <input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} />
                  Upcoming only
                </label>

                <label className="flex items-center gap-2 text-sm text-white/80 select-none">
                  <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
                  Show cancelled
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="block text-xs text-white/70">Filter by name</label>
                <input
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                  placeholder="e.g. John"
                  className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-white/70">Filter by party size</label>
                <input
                  value={filterPax}
                  onChange={(e) => setFilterPax(e.target.value)}
                  placeholder="e.g. 4"
                  className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="block text-xs text-white/70">Filter by table</label>
                <input
                  value={filterTable}
                  onChange={(e) => setFilterTable(e.target.value)}
                  placeholder="e.g. 12"
                  className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
                  inputMode="numeric"
                />
              </div>
            </div>
          </div>

          {found && (
            <div className="mt-4 rounded-xl bg-white text-black p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs text-black/60">Booking reference</div>
                  <div className="font-mono text-2xl font-bold tracking-widest">{found.reference}</div>

                  <div className="mt-2 font-semibold">
                    {displayName(found)} • {found.partySize} guests
                  </div>
                  {found.email ? <div className="text-sm text-black/70">{found.email}</div> : null}

                  <div className="mt-2 text-sm text-black/80">
                    Table <strong>#{found.table.number}</strong> • {new Date(found.startTime).toLocaleString()}
                  </div>

                  <div className="mt-1 text-xs">
                    Status:{" "}
                    <span className={`font-semibold ${found.status === "CANCELLED" ? "text-[#6b0f13]" : "text-black"}`}>
                      {found.status}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openEdit(found)}
                    disabled={loading}
                    className="rounded-md bg-black px-4 py-2 font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => openMove(found)}
                    disabled={loading}
                    className="rounded-md bg-white/10 px-4 py-2 font-semibold text-black hover:opacity-95 disabled:opacity-60"
                    style={{ background: "#eee" }}
                  >
                    Move table
                  </button>
                  <button
                    onClick={() => cancel(found.reference)}
                    disabled={loading || found.status === "CANCELLED"}
                    className="rounded-md bg-[#6b0f13] px-4 py-2 font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {msg && <div className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85">{msg}</div>}

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="font-semibold">Bookings for {date}</div>
            <div className="text-sm text-white/70">{filtered.length} shown</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-white/70">
                <tr className="text-left">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Guests</th>
                  <th className="px-4 py-3">Table</th>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b: any) => (
                  <tr
                    key={b.reference}
                    className={`border-t border-white/10 ${b.status === "CANCELLED" ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium">{b.timeLabel}</td>
                    <td className="px-4 py-3">
                      {displayName(b)}
                      {b.email ? <div className="text-xs text-white/60">{b.email}</div> : null}
                    </td>
                    <td className="px-4 py-3">{b.partySize}</td>
                    <td className="px-4 py-3">#{b.table.number}</td>
                    <td className="px-4 py-3 font-mono tracking-wider">{b.reference}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${b.status === "CANCELLED"
                          ? "bg-[#6b0f13]/20 text-[#ffd7da]"
                          : "bg-white/10 text-white"
                          }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(b)}
                          disabled={loading}
                          className="rounded-md bg-black px-3 py-1.5 font-semibold hover:opacity-95 disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openMove(b)}
                          disabled={loading}
                          className="rounded-md bg-white/10 px-3 py-1.5 font-semibold hover:opacity-95 disabled:opacity-60"
                        >
                          Move
                        </button>
                        <button
                          onClick={() => cancel(b.reference)}
                          disabled={loading || b.status === "CANCELLED"}
                          className="rounded-md bg-[#6b0f13] px-3 py-1.5 font-semibold hover:opacity-95 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-white/70" colSpan={7}>
                      No bookings to show.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-white/10 text-xs text-white/60">
            Gold accent: <span className="font-semibold text-[#b08d57]">#b08d57</span> • Deep red:{" "}
            <span className="font-semibold text-[#6b0f13]">#6b0f13</span>
          </div>
        </div>
      </div>
    </main>
  );
}
