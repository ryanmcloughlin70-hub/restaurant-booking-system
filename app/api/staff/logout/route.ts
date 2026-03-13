import { NextResponse, type NextRequest } from "next/server";
import { clearStaffCookie, requireStaff } from "@/app/lib/staffAuth";

export async function POST(req: NextRequest) {
  if (!(await requireStaff(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  clearStaffCookie(res);
  return res;
}
