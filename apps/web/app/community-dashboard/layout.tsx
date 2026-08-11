import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import CommunityDashboardLayout from "./CommunityDashboardLayout";

export default async function CommunityDashboardServerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/partner-login");
  }

  const { data: membership, error } = await supabase
    .from("community_members")
    .select("community_id, communities(id, name, review_status)")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const community = membership?.communities as any;

  if (error || !community) {
    redirect("/partner-login");
  }

  if (community.review_status !== "approved") {
    redirect("/community-onboarding/pending");
  }

  return (
    <CommunityDashboardLayout communityId={community.id} communityName={community.name}>
      {children}
    </CommunityDashboardLayout>
  );
}
