// ============================================
// FILE: app/partner-login/page.tsx
// Partner-specific login page
// ============================================
"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PartnerLoginPage() {
  const router = useRouter();
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
      // 1. Sign in with credentials
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // 2. Check if user has a gym via server route (bypasses RLS)
      const accessToken = authData.session?.access_token;
      if (!accessToken) {
        await supabase.auth.signOut();
        setError("Could not establish a session. Please confirm your email before logging in.");
        setLoading(false);
        return;
      }

      const res = await fetch('/api/check-partner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, accessToken }),
      });
      const json = await res.json();

      if (!json.isPartner) {
        await supabase.auth.signOut();
        setError(json.error || "No partner venue found for this account. Please sign up as a partner or use the member login.");
        setLoading(false);
        return;
      }

      // 3. Redirect to partner dashboard
      router.push("/partner-dashboard");
      router.refresh();
    } catch (error: any) {
      setError(error.message || "Login failed");
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
    } catch (error: any) {
      setError(error.message || "Failed to send reset email");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mt-4">Partner Login</h1>
          <p className="text-gray-600 mt-2">Sign in to manage your activities,classes, schedules, and bookings</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg p-8">
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="partner@gym.com"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setError("");
                  }}
                   className="text-sm text-blue-500 hover:text-blue-600"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black text-white py-3 rounded-full text-sm hover:bg-gray-900 transition-all disabled:bg-gray-400"
              >
                {loading ? "Logging in..." : "Log In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Reset Password</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Enter your email address and we'll send you a link to reset your password.
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="partner@partner.com"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-black text-white py-3 rounded-full text-sm hover:bg-gray-900 transition-all h-11 disabled:bg-gray-400"
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetSent(false);
                    setError("");
                  }}
                  className="flex-1 text-sm text-blue-500 hover:text-blue-600"
                >
                  Back to Login
                </button>
                
              </div>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
            <p className="text-sm text-gray-600 text-center">
              Don't have a partner account?{" "}
              <Link href="/partner-signup" className="ttext-sm text-blue-500 hover:text-blue-600">
                Sign up here
              </Link>
            </p>
            <p className="text-sm text-gray-600 text-center">
              Looking for member login?{" "}
              <Link href="/login" className="text-blue-500 hover:text-blue-600">
                Member Login
              </Link>
            </p>
          </div>
        </div>

        {/* Back to Partners */}
        <div className="text-center mt-6">
          <Link href="/partners/signup" className="text-sm text-gray-600 hover:text-gray-800 underline">
            ← Back to Partner Information
          </Link>
        </div>
      </div>
    </div>
  );
}