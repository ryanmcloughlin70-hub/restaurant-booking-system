import Link from "next/link";

export default async function CancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const sp = await searchParams;
  const ref = (sp.ref ?? "").trim().toUpperCase();

  return (
    <main className="min-h-screen bg-black px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl bg-white shadow-2xl overflow-hidden">
          <div className="border-b border-black/10 px-6 py-5">
            <div className="inline-flex items-center rounded-md bg-[#6b0f13] px-4 py-2 text-xs font-extrabold tracking-widest text-white">
              BOOKING CANCELLED
            </div>
            <p className="mt-3 text-sm text-black/60">
              Your booking has been cancelled successfully. We hope to see you again soon.
            </p>
          </div>

          <div className="px-6 py-6">
            {ref ? (
              <div className="rounded-md border border-black/10 bg-[#fff7ed] px-4 py-3 text-sm">
                <div className="text-[11px] font-extrabold tracking-widest text-black/50">
                  BOOKING REFERENCE
                </div>
                <div className="mt-1 font-mono text-xl font-extrabold tracking-[0.35em] text-black">
                  {ref}
                </div>
              </div>
            ) : null}

            <Link
              href="/book"
              className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-3 font-semibold text-white hover:opacity-95"
            >
              Make another booking
            </Link>

            <p className="mt-3 text-xs text-black/50">
              If you cancelled by mistake, please call us on <span className="font-semibold">028 6862 1656</span>.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
