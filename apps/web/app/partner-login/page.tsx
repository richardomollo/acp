"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { isLanaProEnabled, LANA_PRO_HOME, partnerSignupEntry } from "@/lib/lana-pro-flags";
import { PrimaryButton, fieldClass, fieldErrorClass } from "../lana-pro/onboarding/OnboardingShell";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PartnerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      const user = authData.user;
      const accessToken = authData.session?.access_token;

      if (!user || !accessToken) {
        await supabase.auth.signOut();
        setError("Could not establish a session. Please confirm your email before logging in.");
        setLoading(false);
        return;
      }

      const redirect = new URLSearchParams(window.location.search).get("redirect");
      // Lana Pro is the partner/professional product surface. Every partner
      // branch below lands in the Lana Pro workspace unless the cutover flag is
      // off, in which case the classic dashboards take over verbatim.
      const lanaPro = isLanaProEnabled();

      // 1. Check gym-employed staff trainer first (most restricted account type)
      const { data: gymTrainer } = await supabase
        .from("gym_trainers")
        .select("id, status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (gymTrainer) {
        if (gymTrainer.status !== "active") {
          await supabase.auth.signOut();
          setError("Your trainer account is not active. Contact your gym for help.");
          setLoading(false);
          return;
        }
        window.location.href = redirect || (lanaPro ? LANA_PRO_HOME : "/trainer-dashboard");
        return;
      }

      // 2. Check personal trainer
      const { data: ptRecord } = await supabase
        .from("personal_trainers")
        .select("id, status, rejection_reason")
        .eq("user_id", user.id)
        .maybeSingle();

      if (ptRecord) {
        if (ptRecord.status === "rejected") {
          await supabase.auth.signOut();
          setError(
            ptRecord.rejection_reason
              ? `Your application was not approved: ${ptRecord.rejection_reason}`
              : "Your trainer application was not approved. Contact support for more information."
          );
          setLoading(false);
          return;
        }
        if (ptRecord.status === "pending") {
          // The Lana Pro workspace is not pending-gated (unlike /pt-dashboard),
          // so pending pros go straight in; the classic flow still parks them
          // on /pt-pending.
          window.location.href = lanaPro ? LANA_PRO_HOME : "/pt-pending";
          return;
        }
        window.location.href = redirect || (lanaPro ? LANA_PRO_HOME : "/pt-dashboard");
        return;
      }

      // 3. Community owner/admin — any logged-in user can become one via self-serve
      // creation, so this is checked before falling through to the partner
      // dashboard (no existing gym-trainer/PT role implies "not yet a partner
      // either", not "reject").
      const { data: membership } = await supabase
        .from("community_members")
        .select("community_id, role, communities(review_status)")
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (membership) {
        const reviewStatus = (membership.communities as any)?.review_status;
        window.location.href = reviewStatus === "approved" ? (redirect || "/community-dashboard") : "/community-onboarding/pending";
        return;
      }

      // 4. Not a trainer or community organiser — venue owner (or a partner with
      // no venues yet). Lana Pro's workspace handles both; the classic partner
      // dashboard is the fallback when the cutover is off.
      window.location.href = redirect || (lanaPro ? LANA_PRO_HOME : "/partner-dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials and try again.");
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "Failed to send reset email");
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col text-[#111]"
      style={{
        background:
          "linear-gradient(180deg, #d0e0ff 0%, rgba(208,224,255,0) 460px), #ffffff",
      }}
    >
      {/* Lana Pro top bar */}
      <header className="border-b border-gray-100">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/lana-pro/onboarding" className="flex items-center gap-2">
            <img src="/images/lana-wordmark.png" alt="Lana" className="h-6 w-auto" />
            <span className="text-[11px] font-bold text-[#050040]/50 uppercase tracking-[0.16em]">
              Pro
            </span>
          </Link>
          <Link
            href={partnerSignupEntry()}
            className="text-sm text-gray-500 hover:text-gray-800 transition"
          >
            Create an account
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-20 flex justify-center">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-[1.15] tracking-tight">
                {showForgotPassword ? "Reset your password" : "Welcome back"}
              </h1>
              <p className="text-gray-500 mt-3 text-[15px] leading-relaxed">
                {showForgotPassword
                  ? "Enter your email and we'll send you a reset link."
                  : "Sign in to your Lana Pro workspace."}
              </p>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3 mb-4">{error}</div>
            )}
            {resetSent && (
              <div className="rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-sm px-4 py-3 mb-4">
                Password reset email sent — check your inbox.
              </div>
            )}

            {!showForgotPassword ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={error ? fieldErrorClass : fieldClass}
                    placeholder="you@email.com"
                    autoComplete="email"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <label className="block text-sm font-semibold text-gray-700">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotPassword(true);
                        setError("");
                      }}
                      className="text-xs font-semibold text-[#050040] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={error ? fieldErrorClass : fieldClass}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                </div>

                <div className="pt-2">
                  <PrimaryButton type="submit" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </PrimaryButton>
                </div>
              </form>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className={fieldClass}
                    placeholder="you@email.com"
                    autoComplete="email"
                    autoFocus
                    required
                  />
                </div>

                <div className="pt-2 flex items-center gap-4">
                  <PrimaryButton type="submit" disabled={loading}>
                    {loading ? "Sending…" : "Send reset link"}
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetSent(false);
                      setError("");
                    }}
                    className="text-sm text-gray-500 hover:text-gray-800 transition"
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            )}

            <div className="mt-8 pt-6 border-t border-gray-100 text-sm text-gray-500">
              <p>
                New to Lana Pro?{" "}
                <Link href={partnerSignupEntry()} className="font-semibold text-[#050040] hover:underline">
                  Create an account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-100">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-5 text-xs text-gray-400">
          By signing in you agree to Lana&apos;s Terms of Service and Privacy Policy.
        </div>
      </footer>
    </div>
  );
}
