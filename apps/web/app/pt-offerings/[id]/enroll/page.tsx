import { createClient } from "../../../lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import PtProgrammeEnrollClient from "./PtProgrammeEnrollClient";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ enrollment_id?: string }>;
};

export default async function PtProgrammeEnrollPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { enrollment_id } = await searchParams;

  if (!enrollment_id) redirect(`/pt-offerings/${id}`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/pt-offerings/${id}/enroll?enrollment_id=${enrollment_id}`);

  // Fetch offering + enrollment, verify ownership and eligibility
  const [{ data: offering, error: offErr }, { data: enrollment, error: enrollErr }] = await Promise.all([
    supabase
      .from("pt_offerings")
      .select(`*, personal_trainers!pt_id (id, full_name, professional_name, photo_url)`)
      .eq("id", id)
      .eq("is_programme", true)
      .eq("is_active", true)
      .single(),
    supabase
      .from("pt_programme_enrollments")
      .select("id, status, trainer_intro_confirmed, user_id")
      .eq("id", enrollment_id)
      .eq("programme_id", id)
      .single(),
  ]);

  if (offErr || !offering || enrollErr || !enrollment) return notFound();

  // Only the enrollment owner can proceed, and only when intro is complete
  if (enrollment.user_id !== user.id) return notFound();
  if (!enrollment.trainer_intro_confirmed && enrollment.status !== "intro_complete") {
    redirect(`/pt-offerings/${id}`);
  }
  if (enrollment.status === "programme_active" || enrollment.status === "completed") {
    redirect(`/pt-offerings/${id}`);
  }

  const pt = Array.isArray(offering.personal_trainers)
    ? offering.personal_trainers[0]
    : (offering.personal_trainers as any);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href={`/pt-offerings/${id}`} className="text-sm text-gray-500 hover:underline mb-8 inline-block">
          ← Back to programme
        </Link>
        <PtProgrammeEnrollClient
          offering={offering}
          pt={pt}
          enrollmentId={enrollment_id}
          offeringId={id}
        />
      </div>
    </div>
  );
}
