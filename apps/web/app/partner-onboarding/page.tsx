"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchSessionCategories } from "@/app/lib/lookups";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function uploadPhoto(file: File, bucket: string, prefix: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

type GymStatus = { id: string; name: string; image_url: string | null; hasSession: boolean };
type PTStatus = {
  id: string;
  full_name: string;
  professional_name: string | null;
  photo_url: string | null;
  hasOffering: boolean;
  hasAvailability: boolean;
};

const inputClass =
  "w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[#050040]/30 focus:border-[#050040] transition";

const chipClass = (selected: boolean) =>
  `px-4 py-2 rounded-full text-sm font-semibold border-2 transition ${
    selected ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
  }`;

const OFFERING_TYPES = ["1-on-1", "group", "online", "outdoor", "home-visit", "drop-in"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

type Question = {
  id: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
  canContinue: boolean;
  onContinue: () => Promise<boolean>;
};

export default function PartnerOnboardingPage() {
  const router = useRouter();
  const [pageLoading, setPageLoading] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [gyms, setGyms] = useState<GymStatus[]>([]);
  const [pt, setPt] = useState<PTStatus | null>(null);
  const [sessionCategories, setSessionCategories] = useState<string[]>([]);

  // Shared per-question local state — only one photo/session/offering/availability
  // question is ever "current" at a time, so a single slot each is enough.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [sessionForm, setSessionForm] = useState({
    name: "", category: "", date: "", time: "", duration_minutes: "60", max_capacity: "10", drop_in_price: "",
  });
  const setSessionField = (k: keyof typeof sessionForm, v: string) =>
    setSessionForm(prev => ({ ...prev, [k]: v }));

  const [offeringForm, setOfferingForm] = useState({
    title: "", type: "1-on-1", duration_minutes: "60", price_kes: "",
  });
  const setOfferingField = (k: keyof typeof offeringForm, v: string) =>
    setOfferingForm(prev => ({ ...prev, [k]: v }));

  const [availDays, setAvailDays] = useState<number[]>([]);
  const [availStart, setAvailStart] = useState("08:00");
  const [availEnd, setAvailEnd] = useState("17:00");
  const toggleAvailDay = (d: number) =>
    setAvailDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  useEffect(() => {
    fetchSessionCategories().then(setSessionCategories);
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      router.push("/partner-login?redirect=/partner-onboarding");
      return;
    }

    const { data: partner } = await supabase
      .from("partners").select("id").eq("user_id", user.id).maybeSingle();

    const partnerGymsRes = partner
      ? await supabase.from("partner_gyms").select("gyms(id, name, image_url)").eq("partner_id", partner.id)
      : { data: [] as any[] };

    const rawGyms = (partnerGymsRes.data ?? []).map((pg: any) => pg.gyms).filter(Boolean);

    const gymsWithStatus: GymStatus[] = await Promise.all(
      rawGyms.map(async (gym: any) => {
        const { count } = await supabase
          .from("sessions").select("id", { count: "exact", head: true }).eq("gym_id", gym.id);
        return { id: gym.id, name: gym.name, image_url: gym.image_url, hasSession: (count ?? 0) > 0 };
      })
    );

    const { data: ptData } = await supabase
      .from("personal_trainers")
      .select("id, full_name, professional_name, photo_url")
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    let ptStatus: PTStatus | null = null;
    if (ptData) {
      const [offeringsRes, availabilityRes] = await Promise.all([
        supabase.from("pt_offerings").select("id", { count: "exact", head: true }).eq("pt_id", ptData.id),
        supabase.from("pt_availability").select("id", { count: "exact", head: true }).eq("pt_id", ptData.id),
      ]);
      ptStatus = {
        ...ptData,
        hasOffering: (offeringsRes.count ?? 0) > 0,
        hasAvailability: (availabilityRes.count ?? 0) > 0,
      };
    }

    setGyms(gymsWithStatus);
    setPt(ptStatus);
    setPageLoading(false);
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const questions: Question[] = [];

  gyms.forEach(gym => {
    if (!gym.image_url) {
      questions.push({
        id: `gymPhoto-${gym.id}`,
        eyebrow: gym.name,
        title: "Add a photo for your venue",
        subtitle: "This is the first thing customers see — a bright, welcoming shot works best.",
        canContinue: !!photoFile,
        onContinue: async () => {
          if (!photoFile) return false;
          setLoading(true);
          setError("");
          try {
            const url = await uploadPhoto(photoFile, "fitpass-images", `gyms/gym-${gym.id}`);
            const { error: updateError } = await supabase.from("gyms").update({ image_url: url }).eq("id", gym.id);
            if (updateError) throw updateError;
            setPhotoFile(null);
            setPhotoPreview(null);
            return true;
          } catch (err: any) {
            setError(err.message || "Photo upload failed.");
            return false;
          } finally {
            setLoading(false);
          }
        },
        content: (
          <div className="space-y-4">
            {photoPreview && (
              <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
            )}
            <input type="file" accept="image/*" onChange={handlePhotoChange} className={inputClass} />
          </div>
        ),
      });
    }

    if (!gym.hasSession) {
      questions.push({
        id: `gymSession-${gym.id}`,
        eyebrow: gym.name,
        title: "Create your first session",
        subtitle: "A bookable class or slot customers can find on Lana Health. You can add more or fine-tune this one anytime from your dashboard.",
        canContinue: !!(sessionForm.name.trim() && sessionForm.category && sessionForm.date && sessionForm.time && sessionForm.drop_in_price),
        onContinue: async () => {
          setLoading(true);
          setError("");
          try {
            const maxCapacity = Number(sessionForm.max_capacity) || 10;
            const { error: insertError } = await supabase.from("sessions").insert({
              gym_id: gym.id,
              name: sessionForm.name.trim(),
              description: "",
              category: sessionForm.category,
              date: sessionForm.date,
              time: sessionForm.time,
              duration_minutes: Number(sessionForm.duration_minutes) || 60,
              max_capacity: maxCapacity,
              spots_left: maxCapacity,
              drop_in_price: Number(sessionForm.drop_in_price) || 0,
              is_active: true,
              recurring: false,
            });
            if (insertError) throw insertError;
            setSessionForm({ name: "", category: "", date: "", time: "", duration_minutes: "60", max_capacity: "10", drop_in_price: "" });
            return true;
          } catch (err: any) {
            setError(err.message || "Could not create the session.");
            return false;
          } finally {
            setLoading(false);
          }
        },
        content: (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Session name</label>
              <input type="text" autoFocus value={sessionForm.name} onChange={e => setSessionField("name", e.target.value)}
                placeholder="e.g. Morning HIIT" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Category</label>
              <div className="flex flex-wrap gap-2">
                {sessionCategories.map(cat => (
                  <button key={cat} type="button" onClick={() => setSessionField("category", cat)} className={chipClass(sessionForm.category === cat)}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date</label>
                <input type="date" value={sessionForm.date} onChange={e => setSessionField("date", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Time</label>
                <input type="time" value={sessionForm.time} onChange={e => setSessionField("time", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Duration (mins)</label>
                <input type="number" min="1" value={sessionForm.duration_minutes} onChange={e => setSessionField("duration_minutes", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Capacity</label>
                <input type="number" min="1" value={sessionForm.max_capacity} onChange={e => setSessionField("max_capacity", e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Drop-in price (KES)</label>
              <input type="number" min="0" value={sessionForm.drop_in_price} onChange={e => setSessionField("drop_in_price", e.target.value)} placeholder="e.g. 1000" className={inputClass} />
            </div>
          </div>
        ),
      });
    }
  });

  if (pt) {
    const ptName = pt.professional_name ?? pt.full_name;

    if (!pt.photo_url) {
      questions.push({
        id: "ptPhoto",
        eyebrow: "Your trainer profile",
        title: "Add your photo",
        subtitle: "Clients like to see who they're booking with.",
        canContinue: !!photoFile,
        onContinue: async () => {
          if (!photoFile) return false;
          setLoading(true);
          setError("");
          try {
            const url = await uploadPhoto(photoFile, "pt-photos", `trainers/pt-${pt.id}`);
            const { error: updateError } = await supabase.from("personal_trainers").update({ photo_url: url }).eq("id", pt.id);
            if (updateError) throw updateError;
            setPhotoFile(null);
            setPhotoPreview(null);
            return true;
          } catch (err: any) {
            setError(err.message || "Photo upload failed.");
            return false;
          } finally {
            setLoading(false);
          }
        },
        content: (
          <div className="space-y-4">
            {photoPreview && (
              <img src={photoPreview} alt="Preview" className="w-48 h-48 object-cover rounded-xl mx-auto" />
            )}
            <input type="file" accept="image/*" onChange={handlePhotoChange} className={inputClass} />
          </div>
        ),
      });
    }

    if (!pt.hasOffering) {
      questions.push({
        id: "ptOffering",
        eyebrow: "Your trainer profile",
        title: "Create your first offering",
        subtitle: `What's one session type you offer, ${ptName.split(" ")[0]}? You can add more anytime from your dashboard.`,
        canContinue: !!(offeringForm.title.trim() && offeringForm.price_kes),
        onContinue: async () => {
          setLoading(true);
          setError("");
          try {
            const slug = offeringForm.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
            const { error: insertError } = await supabase.from("pt_offerings").insert({
              pt_id: pt.id,
              title: offeringForm.title.trim(),
              description: null,
              type: offeringForm.type,
              duration_minutes: Number(offeringForm.duration_minutes) || 60,
              price_kes: Number(offeringForm.price_kes) || 0,
              max_participants: offeringForm.type === "group" ? 10 : 1,
              is_active: true,
              is_draft: false,
              slug,
            });
            if (insertError) throw insertError;
            setOfferingForm({ title: "", type: "1-on-1", duration_minutes: "60", price_kes: "" });
            return true;
          } catch (err: any) {
            setError(err.message || "Could not create the offering.");
            return false;
          } finally {
            setLoading(false);
          }
        },
        content: (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Offering title</label>
              <input type="text" autoFocus value={offeringForm.title} onChange={e => setOfferingField("title", e.target.value)}
                placeholder="e.g. 1-on-1 Strength Coaching" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Type</label>
              <div className="flex flex-wrap gap-2">
                {OFFERING_TYPES.map(t => (
                  <button key={t} type="button" onClick={() => setOfferingField("type", t)} className={chipClass(offeringForm.type === t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Duration (mins)</label>
                <input type="number" min="1" value={offeringForm.duration_minutes} onChange={e => setOfferingField("duration_minutes", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Price (KES)</label>
                <input type="number" min="0" value={offeringForm.price_kes} onChange={e => setOfferingField("price_kes", e.target.value)} placeholder="e.g. 3000" className={inputClass} />
              </div>
            </div>
          </div>
        ),
      });
    }

    if (!pt.hasAvailability) {
      questions.push({
        id: "ptAvailability",
        eyebrow: "Your trainer profile",
        title: "When are you available?",
        subtitle: "Pick the days you generally train clients — you can fine-tune hours per day, or set exceptions, anytime from your dashboard.",
        canContinue: availDays.length > 0,
        onContinue: async () => {
          setLoading(true);
          setError("");
          try {
            const rows = availDays.map(day_of_week => ({
              pt_id: pt.id, day_of_week, start_time: availStart, end_time: availEnd,
            }));
            const { error: insertError } = await supabase.from("pt_availability").insert(rows);
            if (insertError) throw insertError;
            return true;
          } catch (err: any) {
            setError(err.message || "Could not save your availability.");
            return false;
          } finally {
            setLoading(false);
          }
        },
        content: (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day, i) => (
                <button key={day} type="button" onClick={() => toggleAvailDay(i)} className={chipClass(availDays.includes(i))}>
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">From</label>
                <input type="time" value={availStart} onChange={e => setAvailStart(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">To</label>
                <input type="time" value={availEnd} onChange={e => setAvailEnd(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>
        ),
      });
    }
  }

  const total = questions.length;
  const current = stepIndex < total ? questions[stepIndex] : null;

  const goNext = async () => {
    if (!current || !current.canContinue || loading) return;
    const ok = await current.onContinue();
    if (!ok) return;
    setStepIndex(i => i + 1);
  };
  const goBack = () => setStepIndex(i => Math.max(0, i - 1));

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <svg className="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {total > 0 && <ProgressBar value={Math.min(stepIndex, total) / total} />}
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

              <div className="mb-8">{current.content}</div>

              <div className="flex items-center justify-end">
                <button
                  onClick={goNext}
                  disabled={!current.canContinue || loading}
                  className="bg-[#050040] text-white text-sm font-semibold px-8 py-3 rounded-full hover:bg-indigo-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? "Saving…" : "Continue →"}
                </button>
              </div>
            </div>
          ) : (
            <div key="done" className="animate-question-in text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                {total === 0 ? "You're all set!" : "Your profile is complete!"}
              </h2>
              <p className="text-gray-500 mb-8">
                Your profile is live on Lana Health. You can keep refining it anytime from your dashboard.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {gyms.length > 0 && (
                  <Link href="/partner-dashboard" className="bg-[#050040] text-white font-semibold px-8 py-3 rounded-full hover:bg-indigo-900 transition text-sm">
                    Go to My Dashboard →
                  </Link>
                )}
                {pt && (
                  <Link href="/pt-dashboard" className="border border-gray-300 text-gray-700 font-medium px-8 py-3 rounded-full hover:bg-gray-50 transition text-sm">
                    Go to My Trainer Dashboard →
                  </Link>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
