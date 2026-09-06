import { supabase } from "../../lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import TrainerTabs from "./TrainerTabs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ slug: string }>;
};

async function fetchTrainer(slug: string) {
  const col = UUID_RE.test(slug) ? "id" : "slug";
  const { data } = await supabase
    .from("personal_trainers")
    .select("*")
    .eq(col, slug)
    .eq("status", "approved")
    .single();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<import("next").Metadata> {
  const { slug } = await params;
  const pt = await fetchTrainer(slug);

  if (!pt) return { title: "Personal Trainer | Lana" };

  const name = pt.professional_name ?? pt.full_name;
  const description =
    pt.bio ??
    `Book sessions with ${name}, a certified personal trainer on Lana in Nairobi.`;
  const canonicalSlug = pt.slug ?? pt.id;

  return {
    title: `${name} | Personal Trainer | Lana`,
    description,
    openGraph: {
      title: `${name} | Lana`,
      description,
      url: `https://activecitypass.com/trainers/${canonicalSlug}`,
      ...(pt.photo_url
        ? { images: [{ url: pt.photo_url, width: 1200, height: 630, alt: name }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} | Lana`,
      description,
      ...(pt.photo_url ? { images: [pt.photo_url] } : {}),
    },
  };
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

export default async function TrainerDetailPage({ params }: Props) {
  const { slug } = await params;

  const pt = await fetchTrainer(slug);
  if (!pt) notFound();

  const { data: offeringsRaw } = await supabase
    .from("pt_offerings")
    .select("*")
    .eq("pt_id", pt.id)
    .eq("is_active", true)
    .eq("is_draft", false)
    .order("price_kes");

  const { data: reviewsRaw } = await supabase
    .from("pt_reviews")
    .select("rating, comment, created_at, users(full_name)")
    .eq("pt_id", pt.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const offerings = offeringsRaw ?? [];
  const reviews = reviewsRaw ?? [];
  const reviewCount = reviews.length;
  const avgRating =
    reviewCount > 0
      ? Math.round((reviews.reduce((acc, r) => acc + r.rating, 0) / reviewCount) * 10) / 10
      : null;

  const displayName = pt.professional_name ?? pt.full_name;
  const subName =
    pt.professional_name && pt.professional_name !== pt.full_name ? pt.full_name : null;

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Back link */}
      <Link
        href="/trainers"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-8 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        All Trainers
      </Link>

      {/* Cover + Avatar */}
      <div className="relative mb-14">
        {pt.cover_url ? (
          <img src={pt.cover_url} alt={`${displayName} cover`} className="w-full h-64 object-cover rounded-2xl" />
        ) : (
          <div className="w-full h-64 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-200" />
        )}
        <div className="absolute -bottom-10 left-6">
          {pt.photo_url ? (
            <img src={pt.photo_url} alt={displayName} className="w-20 h-20 rounded-full object-cover ring-4 ring-white" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-blue-600 ring-4 ring-white flex items-center justify-center text-white font-bold text-xl">
              {getInitials(pt.full_name)}
            </div>
          )}
        </div>
      </div>

      {/* Name + rating */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
          {pt.is_certified_verified && (
            <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Certified & Verified
            </span>
          )}
        </div>
        {subName && <p className="text-gray-600 mt-0.5">{subName}</p>}
        {avgRating !== null ? (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <svg key={i} className="w-4 h-4" viewBox="0 0 20 20" fill={i <= Math.round(avgRating) ? "#f59e0b" : "#e5e7eb"}>
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-sm font-semibold text-gray-900">{avgRating.toFixed(1)}</span>
            <span className="text-sm text-gray-500">({reviewCount} review{reviewCount !== 1 ? "s" : ""})</span>
          </div>
        ) : (
          <p className="text-sm text-gray-400 mt-2">No reviews yet</p>
        )}
      </div>

      {/* Tabs */}
      <TrainerTabs
        pt={pt}
        offerings={offerings}
        reviews={reviews}
        avgRating={avgRating}
        reviewCount={reviewCount}
      />
    </div>
  );
}
