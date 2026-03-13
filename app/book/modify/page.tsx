import ModifyForm from "./ModifyForm";

export default async function ModifyPage({
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
          {/* Header */}
          <div className="border-b border-black/10 px-6 py-5">
            <div className="inline-flex items-center rounded-md bg-[#6b0f13] px-4 py-2 text-xs font-extrabold tracking-widest text-white">
              MODIFY BOOKING
            </div>
            <p className="mt-3 text-sm text-black/60">
              Update your booking details below. You’ll get an email confirmation after changes.
            </p>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            <ModifyForm reference={ref} />
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-white/40">
          Need help? Call us on <span className="font-semibold text-white/70">028 6862 1656</span>
        </p>
      </div>
    </main>
  );
}
