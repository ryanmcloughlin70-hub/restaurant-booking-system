import { NextResponse, type NextRequest } from "next/server";
import { issueStaffToken, setStaffCookie } from "@/app/lib/staffAuth";
import { rlStaffAuth } from "@/app/lib/rateLimit";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  // -------------------------------
  // ✅ Rate limit (5 req/min per IP)
  // -------------------------------
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";

  const limit = await rlStaffAuth.limit(ip);

  if (!limit.success) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait a minute." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => ({}));

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password.trim() : "";

  // ✅ Basic input validation
  if (!username || !password) {
    return NextResponse.json(
      { ok: false, error: "Username and password are required" },
      { status: 400 }
    );
  }

  // Optional: prevent silly payloads
  if (username.length > 100 || password.length > 200) {
    return NextResponse.json(
      { ok: false, error: "Invalid credentials" },
      { status: 400 }
    );
  }

  const expectedUser = process.env.STAFF_USERNAME ?? "";
  const expectedPass = process.env.STAFF_PASSWORD ?? "";

  if (!expectedUser || !expectedPass) {
    return NextResponse.json(
      { ok: false, error: "STAFF_USERNAME or STAFF_PASSWORD not set on server" },
      { status: 500 }
    );
  }

  if (username !== expectedUser || password !== expectedPass) {
    await sleep(600); // ✅ slows brute force attempts
    return NextResponse.json(
      { ok: false, error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const token = await issueStaffToken();
  const res = NextResponse.json({ ok: true });

  // ✅ cookie expiry should be handled inside setStaffCookie()
  setStaffCookie(res, token);

  return res;
}
