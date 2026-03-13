import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // ✅ Always allow /staff because it contains the login screen
  if (pathname === "/staff") {
    return NextResponse.next();
  }

  // ✅ Protect other staff pages (if you add /staff/something later)
  if (pathname.startsWith("/staff/")) {
    const token = req.cookies.get("staff_session")?.value;

    if (!token) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/staff";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/staff/:path*"],
};
