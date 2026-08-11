"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";

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
        window.location.href = redirect || "/trainer-dashboard";
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
          window.location.href = "/pt-pending";
          return;
        }
        window.location.href = redirect || "/pt-dashboard";
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

      // 4. Not a trainer or community organiser — send to partner dashboard (it handles "no venues" gracefully)
      window.location.href = redirect || "/partner-dashboard";
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Partner & Trainer Login</h1>
          <p className="text-gray-600 mt-2">
            Sign in as a venue partner or personal trainer
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {resetSent && (
            <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm">
              Password reset email sent! Check your inbox.
            </div>
          )}

          {!showForgotPassword ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(true); setError(""); }}
                  className="text-sm text-blue-500 hover:text-blue-600"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white py-3 rounded-full text-sm font-medium hover:bg-gray-900 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Reset Password</h3>
                <p className="text-sm text-gray-600">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white py-3 rounded-full text-sm font-medium hover:bg-gray-900 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              <button
                type="button"
                onClick={() => { setShowForgotPassword(false); setResetSent(false); setError(""); }}
                className="w-full text-sm text-blue-500 hover:text-blue-600 text-center"
              >
                Back to Sign In
              </button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100 space-y-2">
            <p className="text-sm text-gray-600 text-center">
              New venue partner?{" "}
              <Link href="/partner-signup" className="text-blue-500 hover:text-blue-600">
                Sign up here
              </Link>
            </p>
            <p className="text-sm text-gray-600 text-center">
              Looking for member login?{" "}
              <Link href="/login" className="text-blue-500 hover:text-blue-600">
                Member Login
              </Link>
            </p>
            <p className="text-sm text-gray-600 text-center">
              Run a club or activity group?{" "}
              <Link href="/community-onboarding" className="text-blue-500 hover:text-blue-600">
                Start a Community
              </Link>
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <Link href="/partners/signup" className="text-sm text-gray-600 hover:text-gray-800 underline">
            ← Back to Partner Information
          </Link>
        </div>
      </div>
    </div>
  );
}
