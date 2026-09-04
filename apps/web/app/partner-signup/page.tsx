"use client";

import { useState, useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { fetchVenueTypes, fetchPTSpecialisations } from "@/app/lib/lookups";
import { NEIGHBOURHOOD_LABELS } from "@/app/lib/neighbourhoods";

function AddressAutocomplete({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary("places");

  useEffect(() => {
    if (!places || !inputRef.current) return;
    const autocomplete = new places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "ke" },
      fields: ["formatted_address", "name"],
      types: ["establishment", "geocode"],
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      onChange(place.name ?? place.formatted_address ?? "");
    });
    return () => { autocomplete.unbindAll(); };
  }, [places]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type PartnerType = "venue" | "pt" | "experience";

type FormData = {
  email: string;
  password: string;
  contactName: string;
  contactPhone: string;
  // Venue / Experience
  gymName: string;
  location: string;
  area: string;
  type: string;
  venueTypes: string[];
  description: string;
  // PT
  ptBio: string;
  ptSpecialisations: string[];
  ptYearsExperience: string;
  ptCertifications: string;
  ptLocations: string[];
  ptAreas: string[];
};

const inputClass =
  "w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#050040]/30 focus:border-[#050040] transition";

const inputError =
  "w-full px-4 py-3 border border-red-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition";

const chipClass = (selected: boolean) =>
  `px-4 py-2 rounded-full text-sm font-semibold border-2 transition ${
    selected ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
  }`;

const TYPE_OPTIONS: { key: PartnerType; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    key: "venue",
    label: "I represent a Venue",
    sub: "Gym, yoga studio, pool, spa, or other fitness facility",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    key: "pt",
    label: "Trainer, Coach or Nutritionist",
    sub: "Personal trainers, coaches, nutritionists and wellness professionals offering 1-on-1 or group sessions",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    key: "experience",
    label: "Wellness & Fitness Experiences",
    sub: "Unique events, retreats, outdoor activities, or group experiences",
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
  },
];

const TRAIN_LOCATION_OPTIONS = [
  { opt: "Home visit", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
  )},
  { opt: "Gym", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
  )},
  { opt: "Outdoor sessions", icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )},
];

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="fixed top-0 left-0 right-0 h-1 bg-gray-100 z-40">
      <div
        className="h-full bg-[#050040] transition-all duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3.5 text-sm">
      <span className="text-gray-400 font-medium flex-shrink-0">{label}</span>
      <span className="text-gray-900 text-right">{value || "—"}</span>
    </div>
  );
}

type Question = {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
  canContinue: boolean;
  onContinue?: () => Promise<boolean> | boolean;
};

export default function PartnerSignupPage() {
  const router = useRouter();
  const [partnerTypes, setPartnerTypes] = useState<PartnerType[]>([]);
  const toggleType = (t: PartnerType) =>
    setPartnerTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const hasVenue = partnerTypes.includes("venue") || partnerTypes.includes("experience");
  const hasPT = partnerTypes.includes("pt");
  const isPureExperience = partnerTypes.includes("experience") && !partnerTypes.includes("venue");

  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [venueTypes, setVenueTypes] = useState<string[]>([]);
  const [ptSpecialisations, setPtSpecialisations] = useState<string[]>([]);

  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [existingAccountLinked, setExistingAccountLinked] = useState(false);

  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "exists" | "free">("idle");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string }>({});

  useEffect(() => {
    fetchVenueTypes().then(setVenueTypes);
    fetchPTSpecialisations().then(setPtSpecialisations);
  }, []);

  const [formData, setFormData] = useState<FormData>({
    email: "", password: "", contactName: "", contactPhone: "",
    gymName: "", location: "", area: "", type: "gym", venueTypes: [], description: "",
    ptBio: "", ptSpecialisations: [], ptYearsExperience: "",
    ptCertifications: "", ptLocations: [], ptAreas: [],
  });

  const set = (field: keyof Omit<FormData, "ptSpecialisations" | "ptAreas" | "ptLocations" | "venueTypes">, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const toggleSpec = (spec: string) =>
    setFormData(prev => ({
      ...prev,
      ptSpecialisations: prev.ptSpecialisations.includes(spec)
        ? prev.ptSpecialisations.filter(s => s !== spec)
        : [...prev.ptSpecialisations, spec],
    }));

  // Multi-select in the UI, but only the first pick becomes `type` — the
  // one value gyms.type (and every venue-category filter/display elsewhere
  // in the app) actually stores and reads today.
  const toggleVenueType = (t: string) =>
    setFormData(prev => {
      const venueTypes = prev.venueTypes.includes(t)
        ? prev.venueTypes.filter(x => x !== t)
        : [...prev.venueTypes, t];
      return { ...prev, venueTypes, type: venueTypes[0] ?? prev.type };
    });

  const checkEmail = async (email: string) => {
    if (!email || !email.includes("@")) return;
    setEmailStatus("checking");
    const [{ data: gym }, { data: pt }] = await Promise.all([
      supabase.from("gyms").select("id").eq("contact_email", email.trim().toLowerCase()).maybeSingle(),
      supabase.from("personal_trainers").select("id").eq("email", email.trim().toLowerCase()).maybeSingle(),
    ]);
    setEmailStatus(gym || pt ? "exists" : "free");
  };

  const handleAccountContinue = async (): Promise<boolean> => {
    setLoading(true);
    setError("");

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: { data: { role: "partner" } },
    });

    if (!authError && authData.user?.id) {
      setResolvedUserId(authData.user.id);
      setLoading(false);
      return true;
    }

    const msg = (authError?.message ?? "").toLowerCase();
    if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("email")) {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });
      if (signInError) {
        setFieldErrors({ password: "Incorrect password for this email address." });
        setLoading(false);
        return false;
      }
      setResolvedUserId(signInData.user?.id ?? null);
      setExistingAccountLinked(true);
      setLoading(false);
      return true;
    }

    setError(authError?.message || "Something went wrong.");
    setLoading(false);
    return false;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      if (!resolvedUserId) throw new Error("Session lost. Please go back and try again.");

      if (hasVenue) {
        const venueType = partnerTypes.includes("experience") && !partnerTypes.includes("venue")
          ? "experience"
          : formData.type;
        const normalizedEmail = formData.email.trim().toLowerCase();

        // A `partners` row (+ partner_gyms link) is what the mobile partner
        // app's login/dashboard screens look up — without it, the account
        // can only be found via the gyms.contact_email fallback that not
        // every screen has, silently locking new venue partners out of the app.
        const { data: existingPartner } = await supabase
          .from("partners").select("id").eq("user_id", resolvedUserId).maybeSingle();

        let partnerId = existingPartner?.id ?? null;
        if (!partnerId) {
          const { data: newPartner, error: partnerError } = await supabase
            .from("partners")
            .insert({
              user_id: resolvedUserId,
              email: normalizedEmail,
              phone: formData.contactPhone,
              business_name: formData.gymName,
              verified: false,
              onboarding_completed: true,
            })
            .select("id")
            .single();
          if (partnerError) throw partnerError;
          partnerId = newPartner.id;
        }

        const { data: newGym, error: gymError } = await supabase.from("gyms").insert({
          name: formData.gymName,
          location: formData.location,
          area: formData.area,
          type: venueType,
          description: formData.description,
          contact_email: normalizedEmail,
          contact_phone: formData.contactPhone,
          rating: 0,
          is_active: false,
          partner_id: partnerId,
        }).select("id").single();
        if (gymError) throw gymError;

        const { error: linkError } = await supabase
          .from("partner_gyms")
          .insert({ partner_id: partnerId, gym_id: newGym.id, role: "owner" });
        if (linkError) throw linkError;
      }

      if (hasPT) {
        const { data: existingPT } = await supabase
          .from("personal_trainers")
          .select("id")
          .eq("user_id", resolvedUserId)
          .maybeSingle();
        if (existingPT) throw new Error("A trainer profile already exists for this account.");

        const { error: ptError } = await supabase.from("personal_trainers").insert({
          user_id: resolvedUserId,
          full_name: formData.contactName,
          email: formData.email.trim().toLowerCase(),
          phone: formData.contactPhone,
          bio: formData.ptBio,
          specialisations: formData.ptSpecialisations,
          years_of_experience: formData.ptYearsExperience ? parseInt(formData.ptYearsExperience) : null,
          certifications: formData.ptCertifications ? formData.ptCertifications.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          training_locations: formData.ptLocations,
          service_areas: formData.ptAreas,
          status: "pending",
        });
        if (ptError) throw ptError;
      }

      const typeLabel = partnerTypes
        .map(t => t === "pt" ? "Trainer / Coach / Nutritionist" : t === "venue" ? "Venue" : "Wellness & Fitness Experiences")
        .join(", ");

      const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;
      const fnHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      };

      // Send both emails and log any failures — non-fatal
      await Promise.allSettled([
        fetch(fnUrl, {
          method: "POST",
          headers: fnHeaders,
          body: JSON.stringify({
            type: "partner_application_received",
            data: {
              email: formData.email,
              name: formData.contactName,
              businessName: formData.gymName || formData.contactName,
              partnerType: typeLabel,
            },
          }),
        }).then(r => r.json()).then(j => console.log("Partner email:", j)).catch(e => console.error("Partner email failed:", e)),

        fetch(fnUrl, {
          method: "POST",
          headers: fnHeaders,
          body: JSON.stringify({
            type: "partner_application_alert",
            data: {
              email: "info@activecitypass.com",
              applicantName: formData.contactName,
              applicantEmail: formData.email,
              applicantPhone: formData.contactPhone,
              businessName: formData.gymName || formData.contactName,
              partnerType: typeLabel,
            },
          }),
        }).then(r => r.json()).then(j => console.log("Alert email:", j)).catch(e => console.error("Alert email failed:", e)),
      ]);

      setDone(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // ── Question list — filtered live against partnerTypes, so picking/unpicking
  // a partner type on question 1 grows or shrinks the rest of the flow automatically.
  const firstName = formData.contactName.trim().split(" ")[0];

  const questions: Question[] = [
    {
      id: "name",
      eyebrow: "Let's get you set up",
      title: "Hi! What's your name?",
      subtitle: "We'll use this to personalise your partner dashboard and application.",
      canContinue: formData.contactName.trim().length > 0,
      content: (
        <input
          type="text"
          autoFocus
          value={formData.contactName}
          onChange={e => set("contactName", e.target.value)}
          placeholder="Jane Doe"
          className={inputClass + " text-lg"}
        />
      ),
    },
    {
      id: "phone",
      eyebrow: "Let's get you set up",
      title: `Nice to meet you${firstName ? ", " + firstName : ""} 👋`,
      subtitle: "What's the best number to reach you on? We'll only use it for account and booking updates — never spam.",
      canContinue: formData.contactPhone.trim().length > 0,
      content: (
        <input
          type="tel"
          autoFocus
          value={formData.contactPhone}
          onChange={e => set("contactPhone", e.target.value)}
          placeholder="+254 7XX XXX XXX"
          className={inputClass + " text-lg"}
        />
      ),
    },
    {
      id: "email",
      eyebrow: "Let's get you set up",
      title: "What's your email address?",
      subtitle: "This becomes your login for the partner dashboard, and where we'll send your application status.",
      canContinue: formData.email.trim().includes("@"),
      onContinue: async () => {
        const trimmed = formData.email.trim();
        if (!trimmed || !trimmed.includes("@")) {
          setFieldErrors(p => ({ ...p, email: "Please enter a valid email address." }));
          return false;
        }
        setFieldErrors(p => ({ ...p, email: undefined }));
        await checkEmail(trimmed);
        return true;
      },
      content: (
        <div>
          <div className="relative">
            <input
              type="email"
              autoFocus
              value={formData.email}
              onChange={e => { set("email", e.target.value); setEmailStatus("idle"); setFieldErrors(p => ({ ...p, email: undefined })); }}
              placeholder="you@email.com"
              className={(fieldErrors.email ? inputError : inputClass) + " text-lg"}
            />
            {emailStatus === "checking" && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              </span>
            )}
          </div>
          {fieldErrors.email && <p className="text-xs text-red-500 mt-1.5">{fieldErrors.email}</p>}
        </div>
      ),
    },
    {
      id: "password",
      eyebrow: "Let's get you set up",
      title: emailStatus === "exists" ? "Looks like you already have an account" : "Create a password",
      subtitle: emailStatus === "exists"
        ? "Enter your existing password and we'll link this application to your account."
        : "At least 6 characters — last step for your account, then we'll get to know your business.",
      canContinue: formData.password.length >= 6,
      onContinue: handleAccountContinue,
      content: (
        <div>
          <input
            type="password"
            autoFocus
            value={formData.password}
            onChange={e => { set("password", e.target.value); setFieldErrors(p => ({ ...p, password: undefined })); }}
            placeholder={emailStatus === "exists" ? "Enter your existing password" : "At least 6 characters"}
            className={(fieldErrors.password ? inputError : inputClass) + " text-lg"}
            minLength={6}
          />
          {fieldErrors.password && <p className="text-xs text-red-500 mt-1.5">{fieldErrors.password}</p>}
        </div>
      ),
    },
    {
      id: "type",
      eyebrow: "Now, tell us about your business",
      title: `Great, you're in${firstName ? ", " + firstName : ""} 🎉 What kind of partner are you?`,
      subtitle: "Select all that apply — this helps us ask the right questions next.",
      canContinue: partnerTypes.length > 0,
      content: (
        <div className="space-y-4">
          {existingAccountLinked && (
            <div className="bg-blue-50 border border-blue-100 text-blue-700 text-sm px-4 py-3 rounded-xl flex items-start gap-2.5">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>We recognised your existing account and linked it. Let's keep going.</span>
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TYPE_OPTIONS.map(({ key, label, sub, icon }) => {
              const selected = partnerTypes.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleType(key)}
                  className={`relative text-left rounded-2xl p-5 transition border-2 flex flex-col justify-start ${
                    selected ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className={`absolute top-4 right-4 w-5 h-5 rounded flex items-center justify-center transition border-2 ${
                    selected ? "bg-gray-900 border-gray-900" : "border-gray-400 bg-white"
                  }`}>
                    {selected && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col items-start gap-3">
                    <div className={`w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center transition ${
                      selected ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
                    }`}>
                      {icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1 pr-6">{label}</h3>
                      <p className="text-xs text-gray-500">{sub}</p>
                    </div>
                  </div>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => router.push("/community-onboarding")}
              className="relative text-left rounded-2xl p-5 transition border-2 border-gray-200 hover:border-gray-400 flex flex-col justify-start"
            >
              <div className="absolute top-4 right-4 text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
              <div className="flex flex-col items-start gap-3">
                <div className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center bg-gray-100 text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 5v-2a4 4 0 00-3-3.87m-9.6 0A4 4 0 006 15.13V17" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1 pr-6">Community & Clubs</h3>
                  <p className="text-xs text-gray-500">Running clubs, cycling crews, yoga circles, or any activity group — this is a separate, quicker signup</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      ),
    },
  ];

  // Selected types are processed one at a time, in the order the partner
  // picked them — e.g. pick "Trainer" then "Venue" and we ask about the
  // trainer profile first, then the venue, each clearly labelled "1 of 2" /
  // "2 of 2" so it reads as one business at a time rather than one giant form.
  const blockOrder: ("venue" | "pt")[] = [];
  partnerTypes.forEach(t => {
    const block = t === "pt" ? "pt" : "venue";
    if (!blockOrder.includes(block)) blockOrder.push(block);
  });
  const totalBlocks = blockOrder.length;
  const blockLabel = (block: "venue" | "pt") =>
    totalBlocks > 1 ? { index: blockOrder.indexOf(block) + 1, total: totalBlocks } : undefined;

  const addVenueQuestions = () => {
    const position = blockLabel("venue");
    const subject = isPureExperience ? "experience" : "venue";
    const venueEyebrow = position ? `${position.index} of ${position.total} — Your ${subject}` : `About your ${subject}`;
    const isSecondBusiness = !!position && position.index > 1;
    questions.push({
      id: "venueName",
      eyebrow: venueEyebrow,
      title: isSecondBusiness
        ? (isPureExperience ? "Now, what's your experience called?" : "Now, what's your venue called?")
        : (isPureExperience ? "What's your experience called?" : "What's your venue called?"),
      subtitle: "This is the name customers will see on Lana Health.",
      canContinue: formData.gymName.trim().length > 0,
      content: (
        <input
          type="text"
          autoFocus
          value={formData.gymName}
          onChange={e => set("gymName", e.target.value)}
          placeholder={isPureExperience ? "e.g. Nairobi Sunrise Hike" : "e.g. Iron Haven Gym"}
          className={inputClass + " text-lg"}
        />
      ),
    });

    if (partnerTypes.includes("venue")) {
      questions.push({
        id: "venueType",
        eyebrow: venueEyebrow,
        title: "What type of venue is it?",
        subtitle: "Select all that apply — pick everything that describes your venue.",
        canContinue: formData.venueTypes.length > 0,
        content: (
          <div className="flex flex-wrap gap-2">
            {venueTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleVenueType(t)}
                className={chipClass(formData.venueTypes.includes(t))}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        ),
      });
    }

    questions.push(
      {
        id: "location",
        eyebrow: venueEyebrow,
        title: "Where can customers find you?",
        subtitle: "Add your address and we'll match it to the right neighbourhood.",
        canContinue: formData.location.trim().length > 0 && formData.area.length > 0,
        content: (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Street address</label>
              <AddressAutocomplete
                value={formData.location}
                onChange={val => set("location", val)}
                placeholder="e.g. Westgate Mall, Westlands"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Area / Neighbourhood</label>
              <select value={formData.area} onChange={e => set("area", e.target.value)} className={inputClass}>
                <option value="">Select area…</option>
                {NEIGHBOURHOOD_LABELS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
        ),
      },
      {
        id: "description",
        eyebrow: venueEyebrow,
        title: isPureExperience ? "What makes it special?" : "What makes your venue special?",
        subtitle: "Tell us in your own words — we'll use this on your listing so customers know what to expect.",
        canContinue: formData.description.trim().length > 0,
        content: (
          <textarea
            autoFocus
            value={formData.description}
            onChange={e => set("description", e.target.value)}
            rows={5}
            placeholder="Tell customers about the atmosphere, equipment, classes, and who it's great for..."
            className={inputClass + " resize-none"}
          />
        ),
      },
    );
  };

  const addPTQuestions = () => {
    const position = blockLabel("pt");
    const ptEyebrow = position ? `${position.index} of ${position.total} — Your trainer profile` : "Your trainer profile";
    const isSecondBusiness = !!position && position.index > 1;
    questions.push(
      {
        id: "ptBio",
        eyebrow: ptEyebrow,
        title: isSecondBusiness ? "Now, tell us about yourself as a trainer" : "Tell us about yourself as a trainer",
        subtitle: "This is what customers will see when browsing trainers on Lana Health — make it personal.",
        canContinue: formData.ptBio.trim().length > 0,
        content: (
          <textarea
            autoFocus
            value={formData.ptBio}
            onChange={e => set("ptBio", e.target.value)}
            rows={5}
            placeholder="Share your background, training philosophy, and what clients can expect working with you..."
            className={inputClass + " resize-none"}
          />
        ),
      },
      {
        id: "ptSpecs",
        eyebrow: ptEyebrow,
        title: "What are your specialisations?",
        subtitle: "Pick everything you're great at — this is how clients will find you.",
        canContinue: formData.ptSpecialisations.length > 0,
        content: (
          <div className="flex flex-wrap gap-2">
            {ptSpecialisations.map(spec => (
              <button key={spec} type="button" onClick={() => toggleSpec(spec)} className={chipClass(formData.ptSpecialisations.includes(spec))}>
                {spec}
              </button>
            ))}
          </div>
        ),
      },
      {
        id: "ptCredentials",
        eyebrow: ptEyebrow,
        title: "Any certifications or years of experience?",
        subtitle: "Totally optional, but it helps build trust with new clients.",
        canContinue: true,
        content: (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Years of experience</label>
              <input type="number" min="0" max="50" value={formData.ptYearsExperience}
                onChange={e => set("ptYearsExperience", e.target.value)}
                placeholder="e.g. 5" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Certifications</label>
              <input type="text" value={formData.ptCertifications}
                onChange={e => set("ptCertifications", e.target.value)}
                placeholder="e.g. NASM CPT, ACE" className={inputClass} />
            </div>
          </div>
        ),
      },
      {
        id: "ptWhereTrain",
        eyebrow: ptEyebrow,
        title: "Where do you train clients?",
        subtitle: "Home visits, your own gym, outdoors — wherever works for you.",
        canContinue: true,
        content: (
          <div className="grid grid-cols-3 gap-3">
            {TRAIN_LOCATION_OPTIONS.map(({ opt, icon }) => {
              const checked = formData.ptLocations.includes(opt);
              return (
                <button key={opt} type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    ptLocations: checked
                      ? prev.ptLocations.filter(l => l !== opt)
                      : [...prev.ptLocations, opt],
                  }))}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition ${
                    checked ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {icon}
                  <span className="text-xs font-semibold leading-tight">{opt}</span>
                </button>
              );
            })}
          </div>
        ),
      },
      {
        id: "ptAreas",
        eyebrow: ptEyebrow,
        title: "Which areas do you serve?",
        subtitle: "Pick the neighbourhoods you're happy to travel to.",
        canContinue: true,
        content: (
          <div className="flex flex-wrap gap-2">
            {NEIGHBOURHOOD_LABELS.map(area => {
              const checked = formData.ptAreas.includes(area);
              return (
                <button key={area} type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    ptAreas: checked ? prev.ptAreas.filter(a => a !== area) : [...prev.ptAreas, area],
                  }))}
                  className={chipClass(checked)}
                >
                  {area}
                </button>
              );
            })}
          </div>
        ),
      },
    );
  };

  blockOrder.forEach(block => {
    if (block === "venue") addVenueQuestions();
    else addPTQuestions();
  });

  const total = questions.length;
  const current = stepIndex < total ? questions[stepIndex] : null;

  const goNext = async () => {
    if (!current || !current.canContinue || loading) return;
    if (current.onContinue) {
      const ok = await current.onContinue();
      if (!ok) return;
    }
    setStepIndex(i => i + 1);
  };
  const goBack = () => setStepIndex(i => Math.max(0, i - 1));

  // ── Success ──
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
            Your application is pending approval. Our team will review it within 24–48 hours and send a confirmation to{" "}
            <strong>{formData.email}</strong>.
          </p>
          <div className="flex flex-col gap-3">
            <Link href="/partner-login"
              className="inline-block bg-[#050040] text-white font-semibold px-8 py-3 rounded-full hover:bg-indigo-900 transition text-sm">
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const submitDisabled =
    loading ||
    (hasVenue && (!formData.gymName || !formData.location)) ||
    (hasPT && !formData.ptBio);

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
      <div className="min-h-screen flex flex-col bg-white">
        <ProgressBar value={Math.min(stepIndex, total) / total} />
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
          <div className="w-full max-w-3xl">

            {current ? (
              <div key={current.id} className="animate-question-in">
                {stepIndex > 0 && (
                  <button onClick={goBack} className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>
                )}

                {error && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-6">{error}</div>
                )}

                {current.eyebrow && (
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{current.eyebrow}</p>
                )}
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-2">{current.title}</h2>
                {current.subtitle && <p className="text-gray-500 mb-8">{current.subtitle}</p>}

                <div
                  className="mb-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA" && current.canContinue && !loading) {
                      e.preventDefault();
                      goNext();
                    }
                  }}
                >
                  {current.content}
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={goNext}
                    disabled={!current.canContinue || loading}
                    className="bg-[#050040] text-white text-sm font-semibold px-8 py-3 rounded-full hover:bg-indigo-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? "Checking…" : "Continue →"}
                  </button>
                </div>

                {stepIndex === 0 && (
                  <p className="text-center text-xs text-gray-400 mt-8">
                    Already have an account?{" "}
                    <Link href="/partner-login" className="text-blue-600 hover:underline">Sign in</Link>
                  </p>
                )}
              </div>
            ) : (
              <div key="review" className="animate-question-in">
                <button onClick={goBack} className="mb-6 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>

                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight mb-2">Everything look right?</h2>
                <p className="text-gray-500 mb-6">Here's what we've got — you can go back and change anything before you submit.</p>

                <div className="bg-gray-50 rounded-2xl divide-y divide-gray-200 mb-6">
                  <ReviewRow label="Name" value={formData.contactName} />
                  <ReviewRow label="Phone" value={formData.contactPhone} />
                  <ReviewRow label="Email" value={formData.email} />
                  {hasVenue && (
                    <>
                      <ReviewRow label={isPureExperience ? "Experience name" : "Venue name"} value={formData.gymName} />
                      {partnerTypes.includes("venue") && <ReviewRow label="Venue type" value={formData.venueTypes.join(", ")} />}
                      <ReviewRow label="Location" value={[formData.location, formData.area].filter(Boolean).join(" · ")} />
                      <ReviewRow label="Description" value={formData.description} />
                    </>
                  )}
                  {hasPT && (
                    <>
                      <ReviewRow label="Trainer bio" value={formData.ptBio} />
                      <ReviewRow label="Specialisations" value={formData.ptSpecialisations.join(", ")} />
                      <ReviewRow label="Experience" value={formData.ptYearsExperience ? `${formData.ptYearsExperience} years` : ""} />
                      <ReviewRow label="Certifications" value={formData.ptCertifications} />
                      <ReviewRow label="Where you train" value={formData.ptLocations.join(", ")} />
                      <ReviewRow label="Service areas" value={formData.ptAreas.join(", ")} />
                    </>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-6">{error}</div>
                )}

                <div className="flex items-center justify-end">
                  <button
                    onClick={handleSubmit}
                    disabled={submitDisabled}
                    className="bg-[#050040] text-white text-sm font-semibold px-8 py-3 rounded-full hover:bg-indigo-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? "Submitting…" : "Submit application"}
                  </button>
                </div>
              </div>
            )}

            <p className="text-center text-xs text-gray-400 mt-8">
              By signing up you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </APIProvider>
  );
}
