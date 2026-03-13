import type { PrismaClient } from "@prisma/client";

export async function assignTableForSlot(
  prisma: PrismaClient,
  params: {
    partySize: number;
    startTime: Date;
    endTime: Date;
    ignoreBookingId?: number; // <-- key for EDIT flow
  }
) {
  const { partySize, startTime, endTime, ignoreBookingId } = params;

  const table = await prisma.table.findFirst({
    where: {
      active: true,
      capacity: { gte: partySize },
      bookings: {
        none: {
          status: "CONFIRMED",
          ...(ignoreBookingId ? { id: { not: ignoreBookingId } } : {}),
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      },
    },
    orderBy: [{ capacity: "asc" }, { number: "asc" }],
    select: { id: true, number: true, capacity: true },
  });

  return table; // either {id, number, capacity} or null
}
