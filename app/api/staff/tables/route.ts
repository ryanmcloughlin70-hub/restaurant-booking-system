import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/app/lib/prisma";
import { requireStaff } from "@/app/lib/staffAuth";

export async function GET(req: NextRequest) {
  const auth = await requireStaff(req);

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const prisma = getPrisma();

  const tables = await prisma.table.findMany({
    where: { active: true },
    select: { id: true, number: true, capacity: true, active: true },
    orderBy: [{ capacity: "asc" }, { number: "asc" }],
  });

  return NextResponse.json({ ok: true, tables });
}
