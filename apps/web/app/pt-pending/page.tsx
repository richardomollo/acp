import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { redirect } from "next/navigation";
import { isLanaProEnabled, LANA_PRO_HOME } from "@/lib/lana-pro-flags";

export default async function PTPendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/partner-login");

  const { data: pt } = await supabase
    .from("personal_trainers")
    .select("full_name, professional_name, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pt) redirect("/partner-login");
  if (pt.status !== "pending") redirect(isLanaProEnabled() ? LANA_PRO_HOME : "/pt-dashboard");

  const name = pt.professional_name || pt.full_name || "Trainer";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-8 h-8 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Application Under Review</h1>
          <p className="text-gray-600 text-sm mb-6">
            Hi {name}, your personal trainer application is currently being reviewed by our team.
            You'll receive an email once it has been approved.
          </p>
          <p className="text-gray-400 text-xs mb-8">
            This usually takes 1–3 business days. If you have questions, contact us at{" "}
            <a href="mailto:support@activecitypass.com" className="text-blue-500 hover:underline">
              support@activecitypass.com
            </a>
            .
          </p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full bg-black text-white py-3 rounded-full text-sm font-medium hover:bg-gray-900 transition"
            >
              Sign Out
            </button>
          </form>
        </div>
        <Link href="/" className="mt-6 inline-block text-xs text-gray-400 hover:text-gray-600">
          ← Back to Lana
        </Link>
      </div>
    </div>
  );
}
