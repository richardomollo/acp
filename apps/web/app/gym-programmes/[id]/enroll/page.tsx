import { createClient } from "../../../lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import GymProgrammeEnrollClient from "./GymProgrammeEnrollClient";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ enrollment_id?: string }>;
};

export default async function GymProgrammeEnrollPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { enrollment_id } = await searchParams;

  if (!enrollment_id) redirect(`/gym-programmes/${id}`);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=/gym-programmes/${id}/enroll?enrollment_id=${enrollment_id}`);

  const [{ data: programme, error: progErr }, { data: enrollment, error: enrollErr }] = await Promise.all([
    supabase
      .from("gym_programmes")
      .select(`*, gyms!gym_id (id, name)`)
      .eq("id", id)
      .eq("is_active", true)
      .single(),
    supabase
      .from("gym_programme_enrollments")
      .select("id, status, trainer_intro_confirmed, user_id")
      .eq("id", enrollment_id)
      .eq("programme_id", id)
      .single(),
  ]);

  if (progErr || !programme || enrollErr || !enrollment) return notFound();

  if (enrollment.user_id !== user.id) return notFound();
  if (!enrollment.trainer_intro_confirmed && enrollment.status !== "intro_complete") {
    redirect(`/gym-programmes/${id}`);
  }
  if (enrollment.status === "programme_active" || enrollment.status === "completed") {
    redirect(`/gym-programmes/${id}`);
  }

  const gym = Array.isArray(programme.gyms) ? programme.gyms[0] : (programme.gyms as any);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href={`/gym-programmes/${id}`} className="text-sm text-gray-500 hover:underline mb-8 inline-block">
          ← Back to programme
        </Link>
        <GymProgrammeEnrollClient
          programme={programme}
          gym={gym}
          enrollmentId={enrollment_id}
          programmeId={id}
        />
      </div>
    </div>
  );
}
