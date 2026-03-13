import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black">
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">
        Ryan Mahons Hotel Test Website
        </h1>
        <p className="mt-3 text-black/70">
          Serving great food for the past 140 years.
        </p>

        <div className="mt-8">
          <Link
            href="/book"
            className="inline-flex items-center justify-center rounded-md bg-[#6b0f13] px-6 py-3 font-medium text-white shadow-sm hover:opacity-95"
          >
            Book a Table
          </Link>
        </div>
      </section>
    </main>
  );
}
