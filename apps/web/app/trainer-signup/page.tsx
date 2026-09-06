"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { isLanaProEnabled, LANA_PRO_HOME } from "@/lib/lana-pro-flags";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const inputClass =
  "w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#050040]/30 focus:border-[#050040] transition";

type Invite = {
  full_name: string;
  email: string;
  gymName: string;
};

export default function TrainerSignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) { setNotFound(true); setLoading(false); return; }
    setToken(t);

    supabase
      .rpc("get_trainer_invite", { p_token: t })
      .then(({ data, error: fetchError }) => {
        const row = data?.[0];
        if (fetchError || !row) {
          setNotFound(true);
        } else {
          setInvite({ full_name: row.out_full_name, email: row.out_email, gymName: row.out_gym_name ?? "your gym" });
        }
        setLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    setSubmitting(true);
    setError("");

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: { data: { role: "gym_trainer" } },
      });

      let userId = authData?.user?.id ?? null;

      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("email")) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: invite.email,
            password,
          });
          if (signInError) {
            setError("Incorrect password for this email address.");
            setSubmitting(false);
            return;
          }
          userId = signInData.user?.id ?? null;
        } else {
          throw authError;
        }
      }

      if (!userId) throw new Error("Could not create your account. Please try again.");

      const { error: claimError } = await supabase.rpc("claim_trainer_invite", { p_token: token });
      if (claimError) throw claimError;

      router.push(isLanaProEnabled() ? LANA_PRO_HOME : "/trainer-dashboard");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <svg className="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  if (notFound || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-10 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invite not found</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            This invite link is invalid or has already been used. Ask your gym to send a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-white">
      <div className="max-w-md w-full">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{invite.gymName}</p>
        <h2 className="text-3xl font-bold text-gray-900 leading-tight mb-2">Welcome, {invite.full_name.split(" ")[0]}</h2>
        <p className="text-gray-500 mb-8">
          {invite.gymName} added you as a trainer. Set a password to finish setting up your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
            <input type="email" value={invite.email} disabled className={inputClass + " bg-gray-50 text-gray-500"} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Password</label>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              minLength={6}
              className={inputClass}
            />
          </div>

          {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}

          <button
            type="submit"
            disabled={submitting || password.length < 6}
            className="w-full bg-[#050040] text-white font-semibold py-3.5 rounded-full hover:bg-indigo-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Setting up…" : "Set Up Account →"}
          </button>
        </form>
      </div>
    </div>
  );
}
