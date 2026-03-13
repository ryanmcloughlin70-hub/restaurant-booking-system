import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/app/lib/prisma";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ ref: string }> }
) {
  try {
    const prisma = getPrisma();
    const { ref } = await ctx.params; // ✅ unwrap

    const booking = await prisma.booking.findUnique({
      where: { reference: String(ref).trim().toUpperCase() },
      include: { table: true },
    });

    if (!booking) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, booking });
  } catch (err) {
    console.error("GET /api/bookings/[ref] error:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
