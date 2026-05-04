"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const VENUE_TYPES = [
  { value: "gym",          label: "Gym" },
  { value: "yoga",         label: "Yoga" },
  { value: "pilates",      label: "Pilates" },
  { value: "studio",       label: "Studio" },
  { value: "crossfit",     label: "CrossFit" },
  { value: "martial-arts", label: "Martial Arts" },
  { value: "swimming",     label: "Swimming" },
  { value: "spa",          label: "Spa & Wellness" },
  { value: "dance",        label: "Dance" },
  { value: "kids",         label: "Kids Activities" },
];

type FormData = {
  email: string;
  password: string;
  contactName: string;
  contactPhone: string;
  gymName: string;
  location: string;
  area: string;
  type: string;
  description: string;
};

export default function PartnerSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
    contactName: "",
    contactPhone: "",
    gymName: "",
    location: "",
    area: "",
    type: "gym",
    description: "",
  });

  const set = (field: keyof FormData, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error("Account creation failed");

      const { error: gymError } = await supabase.from("gyms").insert({
        name: formData.gymName,
        location: formData.location,
        area: formData.area,
        type: formData.type,
        description: formData.description,
        contact_email: formData.email,
        contact_phone: formData.contactPhone,
        rating: 0,
        is_active: false,
      });

      if (gymError) throw gymError;

      setDone(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#050040]/30 focus:border-[#050040] transition";

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-10 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Application submitted!</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            Your venue is pending approval. Our team will review your profile within 24–48 hours and send a confirmation to <strong>{formData.email}</strong>.
          </p>
          <Link
            href="/partner-login"
            className="inline-block bg-[#050040] text-white font-semibold px-8 py-3 rounded-full hover:bg-indigo-900 transition text-sm"
          >
            Go to Partner Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* ── Banner: top on mobile, left panel on desktop ── */}
      <div className="relative w-full h-64 flex-shrink-0 md:h-auto md:w-5/12 md:min-h-screen">
        <img
          src="/images/desktop.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#000]/35" />
        <div className="relative z-10 flex flex-col justify-between h-full p-8 md:min-h-screen">
          <div className="mt-6 py-90 px-10">
            <p className="text-white/60 text-xs font-semibold tracking-widest uppercase mb-2">For Partners</p>
            <h2 className="text-white text-xl md:text-2xl font-bold leading-snug mb-2">
              Grow your business with Active CityPass
            </h2>
            <p className="text-white/80 text-sm">Through revenue optimization tools, marketing, and access to a high-intent customer base, Active City Pass helps businesses like yours turn unfilled spots into incremental revenue. List your business at no upfront cost to start growing today.</p>
          </div>
        </div>
      </div>

      {/* ── Form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 ">
      <div className="w-full max-w-lg">

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
          {["Your details", "Your business"].map((label, i) => {
            const s = i + 1;
            const active = step === s;
            const done = step > s;
            return (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                  done ? "bg-green-500 text-white" : active ? "bg-[#050040] text-white" : "bg-gray-200 text-gray-500"
                }`}>
                  {done ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                    </svg>
                  ) : s}
                </div>
                <span className={`text-sm font-medium ${active ? "text-gray-900" : "text-gray-400"}`}>{label}</span>
                {s < 2 && <div className="flex-1 h-px bg-gray-200 ml-2" />}
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl p-8">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Create your account</h2>
              <p className="text-sm text-gray-500 mb-6">You'll use these to log into your partner dashboard.</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full name</label>
                  <input type="text" value={formData.contactName}
                    onChange={e => set("contactName", e.target.value)}
                    placeholder="Jane Doe" className={inputClass} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone number</label>
                  <input type="tel" value={formData.contactPhone}
                    onChange={e => set("contactPhone", e.target.value)}
                    placeholder="+254 7XX XXX XXX" className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email address</label>
                <input type="email" value={formData.email}
                  onChange={e => set("email", e.target.value)}
                  placeholder="you@yourvenue.com" className={inputClass} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Password</label>
                <input type="password" value={formData.password}
                  onChange={e => set("password", e.target.value)}
                  placeholder="At least 6 characters" className={inputClass} minLength={6} />
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Tell us about your venue</h2>
              <p className="text-sm text-gray-500 mb-6">This is what members will see on Active CityPass.</p>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Venue name</label>
                <input type="text" value={formData.gymName}
                  onChange={e => set("gymName", e.target.value)}
                  placeholder="e.g. Iron Haven Gym" className={inputClass} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-3">Venue type</label>
                <div className="flex flex-wrap gap-2">
                  {VENUE_TYPES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => set("type", value)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
                        formData.type === value
                          ? "bg-[#050040] text-white border-[#050040]"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Street address</label>
                  <input type="text" value={formData.location}
                    onChange={e => set("location", e.target.value)}
                    placeholder="e.g. Westgate Mall, Westlands" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Area / Neighbourhood</label>
                  <input type="text" value={formData.area}
                    onChange={e => set("area", e.target.value)}
                    placeholder="e.g. Westlands" className={inputClass} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Short description</label>
                <textarea value={formData.description}
                  onChange={e => set("description", e.target.value)}
                  rows={3}
                  placeholder="Tell members what makes your venue special..."
                  className={inputClass + " resize-none"} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            {step > 1 ? (
              <button onClick={() => setStep(s => s - 1)}
                className="text-sm text-gray-500 hover:text-gray-800 transition font-medium">
                ← Back
              </button>
            ) : (
              <Link href="/partner-login" className="text-sm text-gray-400 hover:text-gray-600 transition">
                Already a partner?
              </Link>
            )}

            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={!formData.email || !formData.password || !formData.contactName}
                className="bg-[#050040] text-white text-sm font-semibold px-7 py-2.5 rounded-full hover:bg-indigo-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading || !formData.gymName || !formData.location}
                className="bg-[#050040] text-white text-sm font-semibold px-7 py-2.5 rounded-full hover:bg-indigo-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Submitting…" : "Submit application"}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          By signing up you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
      </div>
    </div>
  );
}
