import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/app/lib/staffAuth";

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
