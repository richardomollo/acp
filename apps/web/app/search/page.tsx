import Link from "next/link";
import { supabase } from "../lib/supabase";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<import("next").Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Search: ${q} | Lana Health` : "Search | Lana Health" };
}

function ResultRow({
  href,
  imageUrl,
  eyebrow,
  title,
  subtitle,
  meta,
}: {
  href: string;
  imageUrl?: string | null;
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title}
          className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{eyebrow}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        {meta && <p className="text-xs text-gray-500 mt-0.5">{meta}</p>}
      </div>
    </Link>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10 first:mt-0">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden bg-white">
        {children}
      </div>
    </div>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (!query) {
    return (
      <div className="w-full px-6 py-16 max-w-4xl mx-auto text-center">
        <p className="text-gray-500">Enter a search term to find gyms, classes, experiences, and trainers.</p>
      </div>
    );
  }

  // PostgREST's .or() filter syntax breaks on commas/parentheses in the value,
  // so strip them before interpolating into the raw ilike pattern.
  const sanitized = query.replace(/[,()%*]/g, " ").trim();
  const like = `%${sanitized}%`;
  const todayStr = new Date().toISOString().split("T")[0];

  if (!sanitized) {
    return (
      <div className="w-full px-6 py-16 max-w-4xl mx-auto text-center">
        <p className="text-gray-500">No results for "{query}".</p>
      </div>
    );
  }

  const [gymsRes, sessionsRes, experiencesRes, trainersRes, communitiesRes] = await Promise.all([
    supabase
      .from("gyms")
      .select("id, slug, name, type, location, area, image_url")
      .eq("is_active", true)
      .or(`name.ilike.${like},area.ilike.${like},location.ilike.${like}`)
      .limit(10),
    supabase
      .from("sessions")
      .select("id, slug, name, category, date, time, image_url, instructor")
      .gte("date", todayStr)
      .or(`name.ilike.${like},category.ilike.${like},instructor.ilike.${like}`)
      .order("date", { ascending: true })
      .limit(10),
    supabase
      .from("experiences")
      .select("id, slug, name, tagline, category, date, start_time, image_url")
      .eq("is_active", true)
      .gte("date", todayStr)
      .or(`name.ilike.${like},tagline.ilike.${like},category.ilike.${like}`)
      .order("date", { ascending: true })
      .limit(10),
    supabase
      .from("personal_trainers")
      .select("id, slug, full_name, professional_name, photo_url, specialisations")
      .eq("status", "approved")
      .or(`full_name.ilike.${like},professional_name.ilike.${like}`)
      .limit(10),
    supabase
      .from("communities")
      .select("id, slug, name, category, location, logo_url, cover_url")
      .eq("review_status", "approved")
      .eq("is_active", true)
      .or(`name.ilike.${like},location.ilike.${like}`)
      .limit(10),
  ]);

  const gyms = gymsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const experiences = experiencesRes.data ?? [];
  const trainers = trainersRes.data ?? [];
  const communities = communitiesRes.data ?? [];

  const totalResults = gyms.length + sessions.length + experiences.length + trainers.length + communities.length;

  return (
    <div className="w-full px-6 py-12 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Search results</h1>
      <p className="text-sm text-gray-500 mb-8">
        {totalResults > 0
          ? `${totalResults} result${totalResults === 1 ? "" : "s"} for "${query}"`
          : `No results for "${query}"`}
      </p>

      {gyms.length > 0 && (
        <ResultSection title="Gyms and Studios">
          {gyms.map((g) => (
            <ResultRow
              key={g.id}
              href={`/venues/${g.slug ?? g.id}`}
              imageUrl={g.image_url}
              eyebrow={g.type ?? "Venue"}
              title={g.name}
              meta={g.area ?? g.location}
            />
          ))}
        </ResultSection>
      )}

      {sessions.length > 0 && (
        <ResultSection title="Classes and Sessions">
          {sessions.map((s) => (
            <ResultRow
              key={s.id}
              href={`/sessions/${s.slug ?? s.id}`}
              imageUrl={s.image_url}
              eyebrow={s.category ?? "Class"}
              title={s.name}
              meta={s.instructor ? `${s.instructor} · ${s.time?.slice(0, 5) ?? ""}` : s.time?.slice(0, 5)}
            />
          ))}
        </ResultSection>
      )}

      {experiences.length > 0 && (
        <ResultSection title="Wellness Experiences">
          {experiences.map((e) => (
            <ResultRow
              key={e.id}
              href={`/experiences/${e.slug ?? e.id}`}
              imageUrl={e.image_url}
              eyebrow={e.category ?? "Experience"}
              title={e.name}
              subtitle={e.tagline}
              meta={e.start_time?.slice(0, 5)}
            />
          ))}
        </ResultSection>
      )}

      {trainers.length > 0 && (
        <ResultSection title="Trainers, Coaches and Nutritionists">
          {trainers.map((t) => (
            <ResultRow
              key={t.id}
              href={`/trainers/${t.slug ?? t.id}`}
              imageUrl={t.photo_url}
              eyebrow="Trainer"
              title={t.professional_name ?? t.full_name}
              meta={Array.isArray(t.specialisations) ? t.specialisations.slice(0, 2).join(" · ") : null}
            />
          ))}
        </ResultSection>
      )}

      {communities.length > 0 && (
        <ResultSection title="Community & Clubs">
          {communities.map((c) => (
            <ResultRow
              key={c.id}
              href={`/community/${c.slug ?? c.id}`}
              imageUrl={c.logo_url ?? c.cover_url}
              eyebrow={c.category ?? "Community"}
              title={c.name}
              meta={c.location}
            />
          ))}
        </ResultSection>
      )}

      {totalResults === 0 && (
        <div className="py-16 text-center">
          <p className="text-gray-400 text-sm">Try a different search term.</p>
        </div>
      )}
    </div>
  );
}
