import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const COOKIE_NAME = "staff_session";

function secretKey() {
  const s = process.env.STAFF_AUTH_SECRET ?? "";
  if (s.length < 32) throw new Error("STAFF_AUTH_SECRET must be set (>= 32 chars).");
  return new TextEncoder().encode(s);
}

export async function issueStaffToken() {
  return await new SignJWT({ role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey());
}

export function setStaffCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
}

export function clearStaffCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ✅ UPDATED: returns detailed status instead of just true/false
export async function requireStaff(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return { ok: false as const, error: "UNAUTHENTICATED" as const };
  }

  try {
    const { payload } = await jwtVerify(token, secretKey());

    if (payload?.role !== "staff") {
      return { ok: false as const, error: "UNAUTHENTICATED" as const };
    }

    return { ok: true as const };
  } catch (err: any) {
    // jose expired token code
    if (err?.code === "ERR_JWT_EXPIRED") {
      return { ok: false as const, error: "SESSION_EXPIRED" as const };
    }

    return { ok: false as const, error: "UNAUTHENTICATED" as const };
  }
}
