"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { isLanaProEnabled, LANA_PRO_HOME } from "@/lib/lana-pro-flags";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BENEFITS = [
  "Access 50+ gyms, studios, pools & wellness venues across Nairobi",
  "10+ activities — yoga, boxing, pilates, spinning, spa & more",
  "Pay only for the sessions you book — no subscription",
  "Book in seconds, cancel easily",
  "No card required to sign up",
];

const STATS = [
  { value: "50+", label: "Venues" },
  { value: "10+", label: "Activities" },
  { value: "0", label: "Lock-in" },
  { value: "M-Pesa", label: "Instant pay" },
];

// ── Input shared style ─────────────────────────────────────────────────────────
const INPUT = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black transition";
const LABEL = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

export default function UserLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [view, setView] = useState<"login" | "signup" | "forgot" | "reset">(
    searchParams.get("view") === "signup" ? "signup" : "login"
  );

  // Safe internal redirect only — prevents open-redirect attacks
  const rawRedirect = searchParams.get("redirect") || "";
  const redirectTo = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") ? rawRedirect : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupDone, setSignupDone] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);

  useEffect(() => {
    const viewParam = searchParams.get("view");
    // Set server-side by /auth/callback when the OAuth code exchange fails.
    const queryError = searchParams.get("error");

    // Supabase sends errors and implicit-flow tokens as hash fragments (#)
    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    const hashError = hashParams.get("error_description") || hashParams.get("error");
    const hashType = hashParams.get("type");
    const hashAccessToken = hashParams.get("access_token");

    if (viewParam === "signup") {
      setView("signup");
    } else if (hashError) {
      setError(hashError.replace(/\+/g, " "));
      setView("login");
    } else if (hashType === "recovery" && hashAccessToken) {
      // Implicit-flow recovery link — set the session then show reset form
      supabase.auth.setSession({
        access_token: hashAccessToken,
        refresh_token: hashParams.get("refresh_token") ?? "",
      }).then(() => setView("reset"));
    } else if (searchParams.get("type") === "recovery" || searchParams.get("token")) {
      setView("reset");
    } else if (queryError) {
      setError(queryError);
      setView("login");
    }
  }, [searchParams]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error: authError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (authError) throw authError;
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        const { data: gymData } = await supabase.from("gyms").select("id").ilike("contact_email", normalizedEmail).maybeSingle();
        const partnerHome = isLanaProEnabled() ? LANA_PRO_HOME : "/partner-dashboard";
        router.push(gymData ? partnerHome : "/sessions");
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Login failed");
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error: signupError } = await supabase.auth.signUp({ email: normalizedEmail, password });
      if (signupError) throw signupError;
      // Supabase returns a fake "user" with no identities for an email that's
      // already registered (to avoid leaking which emails exist), rather than
      // a clean error — this is the standard way to detect it.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError("You already have an account with this email — try signing in instead.");
        return;
      }
      // If session is returned immediately (no email confirmation required), redirect now
      if (data.session) {
        router.push(redirectTo || "/sessions");
        router.refresh();
        return;
      }
      setSignupDone(true);
    } catch (err: any) {
      const msg = (err.message || "").toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists")) {
        setError("You already have an account with this email — try signing in instead.");
      } else {
        setError(err.message || "Signup failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setResetSuccess(true);
      setTimeout(() => router.push(redirectTo || "/sessions"), 2000);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: "google" | "facebook" | "twitter") => {
    setSocialLoading(provider);
    setError("");
    const next = redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback${next}` },
    });
    if (error) { setError(error.message); setSocialLoading(null); }
  };

  // ── Signup — full split-screen ────────────────────────────────────────────────

  const SocialButtons = ({ bg = "bg-white" }: { bg?: string }) => (
    <>
      <div className="space-y-3">
        {(
          [
            { provider: "google",   label: "Google",   icon: (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )},
            // { provider: "facebook", label: "Facebook", icon: (
            //   <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#1877F2">
            //     <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
            //   </svg>
            // )},
            // { provider: "twitter",  label: "X",        icon: (
            //   <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            //     <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
            //   </svg>
            // )},
          ] as const
        ).map(({ provider, label, icon }) => (
          <button
            key={provider}
            type="button"
            onClick={() => handleSocialAuth(provider)}
            disabled={!!socialLoading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors disabled:opacity-50"
          >
            {icon}
            {socialLoading === provider ? "Redirecting…" : `Continue with ${label}`}
          </button>
        ))}
      </div>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center">
          <span className={`px-3 ${bg} text-xs text-gray-400`}>or continue with email</span>
        </div>
      </div>
    </>
  );

  if (view === "signup") {
    return (
      <div className="flex flex-col lg:flex-row lg:min-h-[calc(100vh-4rem)]">

        {/* ── Left: value proposition ─────────────────────────────────────── */}
        <div className="lg:w-[55%] bg-black text-white px-8 py-14 lg:px-16 lg:py-20 flex flex-col">

          {/* Headline */}
          <div className="flex-1">
            <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-white/60 text-xs font-semibold uppercase tracking-wide mb-8">
              No subscription · Pay per booking
            </span>
            <h1
              className="font-black text-white leading-[0.92] mb-6"
              style={{ fontSize: "clamp(2.6rem, 5.5vw, 4.2rem)" }}
            >
              Nairobi's most<br />
              <span className="text-white/35">flexible way to</span><br />
              move.
            </h1>
            <p className="text-white/55 text-lg leading-relaxed mb-10 max-w-md">
              50+ venues. 10+ activities. Pay only for what you book.
            </p>

            {/* Benefits */}
            <ul className="space-y-4 mb-12">
              {BENEFITS.map((b, i) => {
                const isHighlight = i === BENEFITS.length - 1;
                return (
                  <li key={b} className={`flex items-start gap-3 ${isHighlight ? "rounded-xl bg-green-500/10 px-3 py-2 -mx-3" : ""}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isHighlight ? "bg-green-500/20" : "bg-white/10"}`}>
                      <svg className={`w-3 h-3 ${isHighlight ? "text-green-400" : "text-white"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    <span className={`text-sm leading-relaxed ${isHighlight ? "text-green-400 font-semibold" : "text-white/75"}`}>{b}</span>
                  </li>
                );
              })}
            </ul>

            {/* Stat grid */}
            <div className="grid grid-cols-4 gap-3 mb-12">
              {STATS.map((s) => (
                <div key={s.label} className="bg-white/5 rounded-2xl p-4 text-center border border-white/5">
                  <p className="text-2xl font-black text-white">{s.value}</p>
                  <p className="text-white/35 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Image strip */}
            <div className="grid grid-cols-3 gap-2 rounded-2xl overflow-hidden h-32 mb-10">
              <img src="/images/ref.jpeg" alt="Gym" className="w-full h-full object-cover" />
              <img src="/images/yoga.jpg" alt="Yoga" className="w-full h-full object-cover" />
              <img src="/images/plts.webp" alt="Pilates" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Testimonial */}
          <div className="border-t border-white/10 pt-8">
            <div className="flex gap-1 mb-3">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className="w-3.5 h-3.5 text-white/60" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
            <p className="text-white/50 text-sm italic leading-relaxed mb-2">
              "Gym on Monday, yoga on Wednesday, spa on Friday — all through Lana. I've never been this consistent."
            </p>
            <p className="text-white/30 text-xs font-semibold">Amara N. — Lana member</p>
          </div>
        </div>

        {/* ── Right: form ─────────────────────────────────────────────────── */}
        <div className="lg:w-[45%] bg-gray-50 px-8 py-14 lg:px-14 lg:py-20 flex flex-col justify-center">
          <div className="max-w-sm mx-auto w-full">

            {signupDone ? (
              /* Success state */
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="font-black text-black text-2xl mb-2">Check your inbox!</h2>
                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                  We sent a verification link to <strong>{email}</strong>. Click it to activate your account and start booking.
                </p>
                <button
                  onClick={() => { setSignupDone(false); setView("login"); }}
                  className="w-full py-3.5 rounded-full bg-black text-white font-bold text-sm hover:bg-gray-900 transition-colors"
                >
                  Go to sign in
                </button>
              </div>
            ) : (
              <>
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black text-white text-xs font-bold mb-7">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  No card required
                </div>

                <h2 className="font-black text-black text-2xl mb-1">Create your account</h2>
                <p className="text-gray-500 text-sm mb-8">Join thousands of Nairobians moving with Lana.</p>

                {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">{error}</div>}

                <SocialButtons bg="bg-gray-50" />

                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <label className={LABEL}>Email address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={INPUT}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={INPUT}
                      placeholder="At least 6 characters"
                      minLength={6}
                      required
                    />
                  </div>

                  {/* What you get */}
                  <div className="bg-white border border-gray-100 rounded-2xl p-4">
                    <p className="text-xs font-bold text-black uppercase tracking-wide mb-2">What you get</p>
                    <ul className="space-y-1.5 text-xs text-gray-600">
                      {[
                        { text: "Access 50+ gyms, studios, pools & wellness venues across Nairobi", highlight: false },
                        { text: "10+ activities — yoga, boxing, pilates, spinning, spa & more", highlight: false },
                        { text: "Book and pay only for the sessions you attend", highlight: false },
                        { text: "No subscription — no card required to sign up", highlight: true },
                      ].map(({ text, highlight }) => (
                        <li key={text} className={`flex items-start gap-2 ${highlight ? "font-semibold text-green-700" : ""}`}>
                          <svg className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${highlight ? "text-green-600" : "text-black"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          {text}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-full bg-black text-white font-bold text-sm hover:bg-gray-900 transition-colors disabled:opacity-50"
                  >
                    {loading ? "Creating account…" : "Create account →"}
                  </button>
                  <p className="text-center text-xs text-gray-400">
                    By signing up you agree to our{" "}
                    <Link href="/" className="underline hover:text-gray-600">Terms</Link> and{" "}
                    <Link href="/" className="underline hover:text-gray-600">Privacy Policy</Link>.
                  </p>
                </form>

                <div className="mt-6 pt-6 border-t border-gray-200 text-center">
                  <p className="text-sm text-gray-500">
                    Already have an account?{" "}
                    <button
                      onClick={() => { setView("login"); setError(""); }}
                      className="font-semibold text-black hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Password reset success ────────────────────────────────────────────────────

  if (resetSuccess) {
    return (
      <div className="flex items-center justify-center px-4 py-16">
        <div className="max-w-sm w-full bg-white rounded-3xl p-10 text-center shadow-sm">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-black text-black text-xl mb-2">Password updated!</h2>
          <p className="text-gray-500 text-sm">Redirecting you to your dashboard…</p>
        </div>
      </div>
    );
  }

  // ── Login / Forgot / Reset — centered card ────────────────────────────────────

  return (
    <div className="flex items-center justify-center px-4 py-14">
      <div className="max-w-md w-full">

        <div className="text-center mb-6">
          <h1 className="font-black text-black text-2xl mb-1">
            {view === "login" && "Welcome back."}
            {view === "forgot" && "Reset your password"}
            {view === "reset" && "Set a new password"}
          </h1>
          <p className="text-gray-500 text-sm">
            {view === "login" && "Sign in to book your next session."}
            {view === "forgot" && "We'll send a reset link to your email."}
            {view === "reset" && "Choose a new password for your account."}
          </p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-4 text-sm">{error}</div>}
          {resetSent && <div className="bg-green-50 text-green-700 p-3 rounded-xl mb-4 text-sm">Reset link sent — check your inbox.</div>}

          {/* Login */}
          {view === "login" && (
            <>
              <SocialButtons bg="bg-white" />
              <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={LABEL}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} placeholder="you@example.com" required />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={LABEL} style={{ marginBottom: 0 }}>Password</label>
                  <button
                    type="button"
                    onClick={() => { setView("forgot"); setError(""); setResetSent(false); }}
                    className="text-xs text-gray-400 hover:text-black transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3.5 rounded-full bg-black text-white font-bold text-sm hover:bg-gray-900 transition-colors disabled:opacity-50">
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
            </>
          )}

          {/* Forgot */}
          {view === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className={LABEL}>Email address</label>
                <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className={INPUT} placeholder="you@example.com" required />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3.5 rounded-full bg-black text-white font-bold text-sm hover:bg-gray-900 transition-colors disabled:opacity-50">
                {loading ? "Sending…" : "Send reset link"}
              </button>
              <button type="button" onClick={() => { setView("login"); setResetSent(false); setError(""); }} className="w-full text-sm text-gray-400 hover:text-black transition-colors py-1">
                ← Back to sign in
              </button>
            </form>
          )}

          {/* Reset */}
          {view === "reset" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className={LABEL}>New password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={INPUT} placeholder="••••••••" minLength={6} required />
              </div>
              <div>
                <label className={LABEL}>Confirm new password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={INPUT} placeholder="••••••••" minLength={6} required />
              </div>
              <button type="submit" disabled={loading} className="w-full py-3.5 rounded-full bg-black text-white font-bold text-sm hover:bg-gray-900 transition-colors disabled:opacity-50">
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}

          {/* Toggle to signup */}
          {view === "login" && (
            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              <p className="text-sm text-gray-500">
                No account?{" "}
                <button
                  onClick={() => { setView("signup"); setError(""); }}
                  className="font-semibold text-black hover:underline"
                >
                  Create a free account
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
