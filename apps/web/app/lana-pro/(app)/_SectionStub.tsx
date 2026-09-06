import Link from "next/link";

// Phase 4.1 ships the shell + Home. The other sections get honest placeholders
// here — a one-line description of what will live here, plus (for accounts that
// can already use them) a link to the equivalent classic tool. No fake UI.

export function SectionStub({
  title,
  description,
  classic,
}: {
  title: string;
  description: string;
  classic?: { label: string; href: string } | null;
}) {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
      <p className="text-gray-500 text-[15px] mt-2 max-w-xl">{description}</p>

      <div className="mt-8 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
        <p className="text-sm font-semibold text-gray-900">Coming to Lana Pro soon</p>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          This section is being rebuilt for Lana Pro. Your workspace, clients and Home already work.
        </p>
        {classic && (
          <Link
            href={classic.href}
            className="inline-block mt-4 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 hover:border-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
          >
            {classic.label}
          </Link>
        )}
      </div>
    </div>
  );
}
