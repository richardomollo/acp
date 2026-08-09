"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Design tokens (mirrors venue partner dashboard) ─────────────────────────

const inp =
  "w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#050040]/25 focus:border-[#050040] transition bg-white";

// ─── Icons ───────────────────────────────────────────────────────────────────

const Ic = {
  Plus: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Upload: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Trash: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  Check: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Share: (p: React.ComponentPropsWithoutRef<"svg">) => (
    <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  ),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate  = (d: string) =>
  new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const fmtKes   = (n: number) =>
  "KES " + n.toLocaleString("en-KE", { maximumFractionDigits: 0 });

async function uploadPhoto(file: File, ptId: string): Promise<string> {
  const ext  = file.name.split(".").pop() ?? "jpg";
  const path = `experiences/pt-${ptId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("fitpass-images").upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from("fitpass-images").getPublicUrl(path).data.publicUrl;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Experience = {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  price_kes: number;
  max_capacity: number;
  spots_left: number;
  category: string | null;
  meeting_point: string | null;
  transport_info: string | null;
  image_url: string | null;
  includes: string[];
  itinerary: { time: string; activity: string; detail: string }[];
  is_active: boolean;
  slug: string | null;
  cancellation_cutoff_hours: number | null;
  deposit_pct: number | null;
  no_show_grace_mins: number | null;
};

const EXP_EMPTY = {
  name: "",
  tagline: "",
  description: "",
  date: "",
  start_time: "",
  end_time: "",
  price_kes: 0 as number | string,
  max_capacity: 20 as number | string,
  category: "",
  meeting_point: "",
  transport_info: "",
  image_url: "" as string | null,
  includes: [""] as string[],
  itinerary: [{ time: "", activity: "", detail: "" }] as { time: string; activity: string; detail: string }[],
  is_active: true,
  cancellation_cutoff_hours: null as number | null,
  deposit_pct: null as number | null,
  no_show_grace_mins: null as number | null,
};

const CUTOFF_OPTIONS  = [null, 0, 1, 2, 4, 12, 24, 48, 72] as const;
const DEPOSIT_OPTIONS = [null, 10, 20, 25, 30, 40, 50]   as const;
const GRACE_OPTIONS   = [null, 0, 5, 10, 15, 30]          as const;

// ─── Share row ────────────────────────────────────────────────────────────────

function ShareRow({ exp }: { exp: Experience }) {
  const [copied, setCopied] = useState(false);
  const id   = exp.slug ?? exp.id;
  const url  = `${typeof window !== "undefined" ? window.location.origin : "https://activecitypass.com"}/experiences/${id}`;
  const display = `activecitypass.com/experiences/${id}`;
  const text = encodeURIComponent(`Join "${exp.name}" — ${fmtDate(exp.date)} at ${exp.start_time.slice(0, 5)}`);
  const enc  = encodeURIComponent(url);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (navigator.share) {
      try { await navigator.share({ title: exp.name, url }); } catch { /* cancelled */ }
    } else {
      handleCopy();
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs text-gray-400 mb-2">Share this experience to get more bookings.</p>
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex-1 min-w-0 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
          <span className="text-xs text-gray-400 truncate font-mono flex-1">{display}</span>
          <button onClick={handleCopy} title={copied ? "Copied!" : "Copy link"}
            className={`flex-shrink-0 transition ${copied ? "text-green-600" : "text-gray-400 hover:text-gray-600"}`}>
            {copied
              ? <Ic.Check className="w-3.5 h-3.5" />
              : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )
            }
          </button>
        </div>
        <button onClick={handleShare}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-[#050040] text-white text-xs font-semibold rounded-lg hover:bg-[#0a006b] transition">
          <Ic.Share className="w-3.5 h-3.5" />
          Share
        </button>
      </div>
      <div className="flex items-center gap-2">
        <a href={`https://wa.me/?text=${text}%20${enc}`} target="_blank" rel="noopener noreferrer"
          title="Share on WhatsApp"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#25D366] hover:opacity-80 transition">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
        <a href={`https://twitter.com/intent/tweet?text=${text}&url=${enc}`} target="_blank" rel="noopener noreferrer"
          title="Share on X"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-black hover:opacity-75 transition">
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.26 5.632 5.905-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${enc}`} target="_blank" rel="noopener noreferrer"
          title="Share on Facebook"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#1877F2] hover:opacity-80 transition">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        </a>
        <a href={`https://t.me/share/url?url=${enc}&text=${text}`} target="_blank" rel="noopener noreferrer"
          title="Share on Telegram"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#229ED9] hover:opacity-80 transition">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
        </a>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PTExperiencesPage() {
  const router   = useRouter();
  const [ptId,        setPtId]        = useState<string | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [form,        setForm]        = useState({ ...EXP_EMPTY });
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [filter,      setFilter]      = useState<"upcoming" | "past" | "all">("upcoming");
  const fileRef = useRef<HTMLInputElement>(null);
  const t = todayStr();

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login"); return; }

    const { data: pt } = await supabase
      .from("personal_trainers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!pt) { router.push("/partner-login"); return; }
    setPtId(pt.id);
    await load(pt.id);
  }

  async function load(id: string) {
    setLoading(true);
    const { data } = await supabase
      .from("experiences")
      .select("*")
      .eq("pt_id", id)
      .order("date", { ascending: false });
    setExperiences((data as Experience[]) ?? []);
    setLoading(false);
  }

  const setF = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  function openNew() {
    setForm({ ...EXP_EMPTY, includes: [""], itinerary: [{ time: "", activity: "", detail: "" }] });
    setEditId(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEdit(e: Experience) {
    setForm({
      name: e.name,
      tagline: e.tagline ?? "",
      description: e.description ?? "",
      date: e.date,
      start_time: e.start_time.slice(0, 5),
      end_time: e.end_time?.slice(0, 5) ?? "",
      price_kes: e.price_kes,
      max_capacity: e.max_capacity,
      category: e.category ?? "",
      meeting_point: e.meeting_point ?? "",
      transport_info: e.transport_info ?? "",
      image_url: e.image_url,
      includes: e.includes?.length ? e.includes : [""],
      itinerary: e.itinerary?.length ? e.itinerary : [{ time: "", activity: "", detail: "" }],
      is_active: e.is_active,
      cancellation_cutoff_hours: e.cancellation_cutoff_hours ?? null,
      deposit_pct: e.deposit_pct ?? null,
      no_show_grace_mins: e.no_show_grace_mins ?? null,
    });
    setEditId(e.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePhotoUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file || !ptId) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(file, ptId);
      setF("image_url", url);
    } catch (err: unknown) {
      alert("Upload failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!ptId) return;
    if (!form.name || !form.date || !form.start_time) {
      alert("Please fill in name, date, and start time.");
      return;
    }
    setSaving(true);
    const cleanIncludes  = (form.includes as string[]).map(s => s.trim()).filter(Boolean);
    const cleanItinerary = (form.itinerary as { time: string; activity: string; detail: string }[])
      .filter(r => r.time.trim() || r.activity.trim());

    const payload = {
      pt_id: ptId,
      gym_id: null,
      name: (form.name as string).trim(),
      tagline: (form.tagline as string).trim() || null,
      description: (form.description as string).trim() || null,
      date: form.date as string,
      start_time: form.start_time as string,
      end_time: (form.end_time as string).trim() || null,
      price_kes: Number(form.price_kes) || 0,
      max_capacity: Number(form.max_capacity) || 20,
      category: (form.category as string).trim() || null,
      meeting_point: (form.meeting_point as string).trim() || null,
      transport_info: (form.transport_info as string).trim() || null,
      image_url: form.image_url || null,
      includes: cleanIncludes,
      itinerary: cleanItinerary,
      is_active: form.is_active as boolean,
      cancellation_cutoff_hours: (form.cancellation_cutoff_hours as number | null) ?? null,
      deposit_pct: (form.deposit_pct as number | null) ?? null,
      no_show_grace_mins: (form.no_show_grace_mins as number | null) ?? null,
    };

    if (editId) {
      await supabase.from("experiences").update(payload).eq("id", editId);
    } else {
      await supabase.from("experiences").insert({ ...payload, spots_left: Number(form.max_capacity) || 20 });
    }

    setSaving(false);
    setShowForm(false);
    await load(ptId);
  }

  async function toggleActive(e: Experience) {
    if (!ptId) return;
    await supabase.from("experiences").update({ is_active: !e.is_active }).eq("id", e.id);
    await load(ptId);
  }

  async function handleDelete(id: string) {
    if (!ptId || !confirm("Delete this experience? This cannot be undone.")) return;
    await supabase.from("experiences").delete().eq("id", id);
    await load(ptId);
  }

  function addInclude() { setF("includes", [...(form.includes as string[]), ""]); }
  function removeInclude(i: number) { setF("includes", (form.includes as string[]).filter((_, idx) => idx !== i)); }
  function setInclude(i: number, v: string) {
    const next = [...(form.includes as string[])]; next[i] = v; setF("includes", next);
  }

  function addItinerary() {
    setF("itinerary", [...(form.itinerary as { time: string; activity: string; detail: string }[]), { time: "", activity: "", detail: "" }]);
  }
  function removeItinerary(i: number) {
    setF("itinerary", (form.itinerary as { time: string; activity: string; detail: string }[]).filter((_, idx) => idx !== i));
  }
  function setItinerary(i: number, k: string, v: string) {
    const next = (form.itinerary as { time: string; activity: string; detail: string }[]).map((r, idx) =>
      idx === i ? { ...r, [k]: v } : r
    );
    setF("itinerary", next);
  }

  const filtered = experiences.filter(e =>
    filter === "upcoming" ? e.date >= t :
    filter === "past"     ? e.date < t  : true
  );

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-7 h-7 border-[3px] border-[#050040] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Experiences</h1>
          <p className="text-sm text-gray-400 mt-0.5">Retreats, hikes, and wellness events</p>
        </div>
        {!showForm && (
          <button onClick={openNew}
            className="flex items-center gap-2 bg-[#050040] text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-indigo-900 transition">
            <Ic.Plus className="w-4 h-4" />
            New Experience
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900 text-lg">
              {editId ? "Edit Experience" : "New Experience"}
            </h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-sm transition">
              Cancel
            </button>
          </div>

          {/* Cover photo */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cover Photo</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            {form.image_url ? (
              <div className="relative w-full aspect-[16/7] rounded-xl overflow-hidden group cursor-pointer"
                onClick={() => fileRef.current?.click()}>
                <img src={form.image_url as string} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <span className="text-white text-sm font-medium">Change photo</span>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full h-36 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition">
                {uploading
                  ? <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  : <>
                      <Ic.Upload className="w-6 h-6" />
                      <span className="text-sm">Upload cover photo</span>
                      <span className="text-xs text-gray-300">16:9 recommended · JPG / PNG · max 5 MB</span>
                    </>
                }
              </button>
            )}
          </div>

          {/* Name + tagline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name *</label>
              <input className={inp} placeholder="e.g. Sunrise Yoga & Hike at Karura"
                value={form.name as string} onChange={e => setF("name", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tagline</label>
              <input className={inp} placeholder='e.g. "The Journey Inward"'
                value={form.tagline as string} onChange={e => setF("tagline", e.target.value)} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
            <textarea className={inp + " resize-none"} rows={3} placeholder="What is this experience about?"
              value={form.description as string} onChange={e => setF("description", e.target.value)} />
          </div>

          {/* Date + times */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date *</label>
              <input type="date" className={inp} value={form.date as string} onChange={e => setF("date", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Start Time *</label>
              <input type="time" className={inp} value={form.start_time as string} onChange={e => setF("start_time", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">End Time</label>
              <input type="time" className={inp} value={form.end_time as string} onChange={e => setF("end_time", e.target.value)} />
            </div>
          </div>

          {/* Price + capacity + category */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Price (KES) *</label>
              <input type="number" min={0} className={inp} placeholder="0"
                value={form.price_kes as number} onChange={e => setF("price_kes", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Max Capacity</label>
              <input type="number" min={1} className={inp} placeholder="20"
                value={form.max_capacity as number} onChange={e => setF("max_capacity", Number(e.target.value))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
              <input className={inp} placeholder="e.g. Hiking, Wellness, Yoga"
                value={form.category as string} onChange={e => setF("category", e.target.value)} />
            </div>
          </div>

          {/* Meeting point + transport */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Meeting Point</label>
              <input className={inp} placeholder="e.g. Shell CBD, Kenyatta Ave"
                value={form.meeting_point as string} onChange={e => setF("meeting_point", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Transport Info</label>
              <input className={inp} placeholder="e.g. 26-seater bus, departure 5:30 AM"
                value={form.transport_info as string} onChange={e => setF("transport_info", e.target.value)} />
            </div>
          </div>

          {/* Cancellation policy */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Cancellation Policy</p>
              <p className="text-xs text-gray-400 mb-4">Leave at "Platform default" to use standard policy. Override only for this experience.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Free cancellation window</label>
              <div className="flex flex-wrap gap-2">
                {CUTOFF_OPTIONS.map(h => {
                  const label  = h === null ? "Platform default" : h === 0 ? "None" : `${h}h`;
                  const active = (form.cancellation_cutoff_hours as number | null) === (h ?? null);
                  return (
                    <button key={String(h)} type="button"
                      onClick={() => {
                        setF("cancellation_cutoff_hours", h ?? null);
                        if (h === 0) setF("deposit_pct", null);
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
            </div>
            {(form.cancellation_cutoff_hours as number | null) !== 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Deposit required</label>
              <div className="flex flex-wrap gap-2">
                {DEPOSIT_OPTIONS.map(pct => {
                  const label  = pct === null ? "Platform default" : `${pct}%`;
                  const active = (form.deposit_pct as number | null) === (pct ?? null);
                  return (
                    <button key={String(pct)} type="button"
                      onClick={() => setF("deposit_pct", pct ?? null)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
            </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">No-show grace period</label>
              <div className="flex flex-wrap gap-2">
                {GRACE_OPTIONS.map(m => {
                  const label  = m === null ? "Platform default" : m === 0 ? "Immediate" : `${m} min`;
                  const active = (form.no_show_grace_mins as number | null) === (m ?? null);
                  return (
                    <button key={String(m)} type="button"
                      onClick={() => setF("no_show_grace_mins", m ?? null)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                        active ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>{label}</button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* What's included */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What&apos;s Included</label>
            <div className="space-y-2">
              {(form.includes as string[]).map((inc, i) => (
                <div key={i} className="flex gap-2">
                  <input className={inp + " flex-1"} placeholder="e.g. Return Transport" value={inc}
                    onChange={e => setInclude(i, e.target.value)} />
                  {(form.includes as string[]).length > 1 && (
                    <button type="button" onClick={() => removeInclude(i)}
                      className="text-gray-400 hover:text-red-500 transition px-2">
                      <Ic.Trash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addInclude}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#050040] hover:opacity-70 transition mt-1">
                <Ic.Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>
          </div>

          {/* Itinerary */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Itinerary</label>
            <div className="space-y-2">
              {(form.itinerary as { time: string; activity: string; detail: string }[]).map((row, i) => (
                <div key={i} className="grid grid-cols-[90px_1fr_1fr_auto] gap-2 items-center">
                  <input className={inp} placeholder="5:30 AM" value={row.time}
                    onChange={e => setItinerary(i, "time", e.target.value)} />
                  <input className={inp} placeholder="Activity" value={row.activity}
                    onChange={e => setItinerary(i, "activity", e.target.value)} />
                  <input className={inp} placeholder="Details (optional)" value={row.detail}
                    onChange={e => setItinerary(i, "detail", e.target.value)} />
                  {(form.itinerary as { time: string; activity: string; detail: string }[]).length > 1 && (
                    <button type="button" onClick={() => removeItinerary(i)}
                      className="text-gray-400 hover:text-red-500 transition">
                      <Ic.Trash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addItinerary}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#050040] hover:opacity-70 transition mt-1">
                <Ic.Plus className="w-3.5 h-3.5" /> Add step
              </button>
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setF("is_active", !(form.is_active as boolean))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? "bg-[#050040]" : "bg-gray-200"}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm text-gray-600">Visible to members</span>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-50">
            <button onClick={handleSave} disabled={saving}
              className="bg-[#050040] text-white text-sm font-semibold px-8 py-2.5 rounded-full hover:bg-indigo-900 transition disabled:opacity-50">
              {saving ? "Saving…" : editId ? "Save Changes" : "Create Experience"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 hover:text-gray-800 font-medium px-4 py-2.5 transition">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {!showForm && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {(["upcoming", "past", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                filter === f ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}>
              {f}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {!showForm && (
        <div className="space-y-3">
          {experiences.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-16 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-3xl">🌿</div>
              <p className="text-gray-500 font-medium">No experiences yet</p>
              <p className="text-sm text-gray-400 text-center max-w-xs">
                Create a wellness event, retreat, or outdoor activity to sell directly to clients.
              </p>
              <button onClick={openNew}
                className="mt-2 bg-[#050040] text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-indigo-900 transition">
                Create your first experience
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-sm text-gray-400">
              {filter === "upcoming" ? "No upcoming experiences. Create one above!" : "No experiences found."}
            </div>
          ) : filtered.map(e => (
            <div key={e.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex gap-4 p-4">
                {e.image_url ? (
                  <img src={e.image_url} alt={e.name} className="w-24 h-20 object-cover rounded-xl flex-shrink-0" />
                ) : (
                  <div className="w-24 h-20 bg-gradient-to-br from-[#050040] to-indigo-400 rounded-xl flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{e.name}</p>
                      {e.tagline && <p className="text-xs text-gray-400 italic mt-0.5">{e.tagline}</p>}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                      e.is_active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
                    }`}>
                      {e.is_active ? "Active" : "Hidden"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    <span className="text-xs text-gray-500">{fmtDate(e.date)}</span>
                    <span className="text-xs text-gray-500">
                      {e.start_time.slice(0, 5)}{e.end_time ? ` – ${e.end_time.slice(0, 5)}` : ""}
                    </span>
                    <span className="text-xs font-semibold text-gray-900">{fmtKes(Number(e.price_kes))}</span>
                    <span className="text-xs text-gray-500">{e.spots_left}/{e.max_capacity} spots</span>
                    {e.category && (
                      <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{e.category}</span>
                    )}
                    {e.meeting_point && (
                      <span className="text-xs text-gray-400 truncate max-w-[180px]">{e.meeting_point}</span>
                    )}
                  </div>
                  {e.includes?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {e.includes.slice(0, 4).map((inc, i) => (
                        <span key={i} className="bg-indigo-50 text-indigo-600 text-[10px] font-medium px-2 py-0.5 rounded-full">{inc}</span>
                      ))}
                      {e.includes.length > 4 && (
                        <span className="text-[10px] text-gray-400">+{e.includes.length - 4} more</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="border-t border-gray-50 px-4 py-2.5 flex items-center justify-between">
                <button onClick={() => toggleActive(e)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition">
                  {e.is_active ? "Hide" : "Make active"}
                </button>
                <div className="flex gap-3">
                  <button onClick={() => openEdit(e)}
                    className="text-xs font-semibold text-[#050040] hover:opacity-70 transition">Edit</button>
                  <button onClick={() => handleDelete(e.id)}
                    className="text-xs font-semibold text-red-500 hover:opacity-70 transition">Delete</button>
                </div>
              </div>
              <div className="px-4 pb-4">
                <ShareRow exp={e} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
