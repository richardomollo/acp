import type { Metadata } from "next";
import { supabase } from "../lib/supabase";
import TrainersClient from "./TrainersClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Personal Trainers | Lana",
  description:
    "Find certified personal trainers in Nairobi — weight loss, strength training, HIIT, yoga, boxing and more. Book 1-on-1 or group sessions with Lana.",
  openGraph: {
    title: "Personal Trainers | Lana",
    description:
      "Find certified personal trainers in Nairobi. Book sessions with Lana.",
    url: "https://activecitypass.com/trainers",
  },
};

export default async function TrainersPage() {
  const { data: pts, error } = await supabase
    .from("personal_trainers")
    .select(
      "id, slug, full_name, professional_name, photo_url, specialisations, training_locations, service_areas, years_of_experience, is_certified_verified"
    )
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    return <p className="p-8 text-red-500">Error loading trainers</p>;
  }

  const trainers = pts ?? [];

  let enriched: typeof trainers & {
    min_price?: number | null;
    avg_rating?: number | null;
    review_count?: number;
  }[] = trainers as any[];

  if (trainers.length > 0) {
    const ptIds = trainers.map((pt) => pt.id);

    const { data: offerings } = await supabase
      .from("pt_offerings")
      .select("pt_id, price_kes")
      .in("pt_id", ptIds)
      .eq("is_active", true)
      .eq("is_draft", false);

    const { data: reviews } = await supabase
      .from("pt_reviews")
      .select("pt_id, rating")
      .in("pt_id", ptIds);

    const offeringsMap = new Map<string, { min_price: number | null }>();
    for (const offering of offerings ?? []) {
      const existing = offeringsMap.get(offering.pt_id);
      const price = offering.price_kes ?? null;
      if (!existing) {
        offeringsMap.set(offering.pt_id, { min_price: price });
      } else {
        offeringsMap.set(offering.pt_id, {
          min_price:
            price !== null && (existing.min_price === null || price < existing.min_price)
              ? price
              : existing.min_price,
        });
      }
    }

    const reviewsMap = new Map<string, { total: number; count: number }>();
    for (const review of reviews ?? []) {
      const existing = reviewsMap.get(review.pt_id);
      if (!existing) {
        reviewsMap.set(review.pt_id, { total: review.rating, count: 1 });
      } else {
        existing.total += review.rating;
        existing.count += 1;
      }
    }

    enriched = trainers.map((pt) => {
      const offeringData = offeringsMap.get(pt.id);
      const reviewData = reviewsMap.get(pt.id);
      return {
        ...pt,
        min_price: offeringData?.min_price ?? null,
        avg_rating: reviewData
          ? Math.round((reviewData.total / reviewData.count) * 10) / 10
          : null,
        review_count: reviewData?.count ?? 0,
      };
    });
  }

  return (
    <div>
      {/* Page header */}
      <div className="border-b border-gray-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
          <div>
              <p className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
                Certified professionals · Nairobi
              </p>
              <h1 className="text-3xl lg:text-5xl font-black text-gray-900 leading-tight mb-3">
                Train with Nairobi's<br className="hidden sm:block" /> best personal trainers.
              </h1>
              <p className="text-gray-500 text-sm leading-relaxed max-w-lg">
                One-on-one sessions, small groups, or remote coaching — find a certified trainer who fits
                your goals and schedule.
              </p>
            </div>
        </div>
      </div>

      <TrainersClient trainers={enriched as any} />
    </div>
  );
}
