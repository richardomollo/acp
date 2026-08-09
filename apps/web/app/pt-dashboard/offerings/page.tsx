"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type OfferingType =
  | "1-on-1"
  | "group"
  | "online"
  | "outdoor"
  | "home-visit"
  | "drop-in";

type Offering = {
  id: string;
  pt_id: string;
  title: string;
  description: string | null;
  type: OfferingType;
  duration_minutes: number;
  price_kes: number;
  max_participants: number;
  image_url: string | null;
  is_active: boolean;
  is_draft: boolean;
  created_at: string;
  // Programme fields
  is_programme: boolean;
  programme_weeks: number | null;
  programme_price_kes: number | null;
  intro_price_kes: number | null;
  deposit_pct: number;
  instalment_frequency_weeks: number | null;
};

const OFFERING_TYPES: OfferingType[] = [
  "1-on-1",
  "group",
  "online",
  "outdoor",
  "home-visit",
  "drop-in",
];

const TYPE_COLORS: Record<string, string> = {
  "1-on-1": "bg-purple-100 text-purple-700",
  group: "bg-blue-100 text-blue-700",
  online: "bg-cyan-100 text-cyan-700",
  outdoor: "bg-green-100 text-green-700",
  "home-visit": "bg-orange-100 text-orange-700",
  "drop-in": "bg-pink-100 text-pink-700",
};

const EMPTY_FORM = {
  title: "",
  description: "",
  type: "1-on-1" as string,
  duration_minutes: 60,
  price_kes: 0,
  max_participants: 1,
  image_url: "",
  is_active: true,
  is_programme: false,
  programme_weeks: 8,
  programme_price_kes: 0,
  intro_price_kes: 0,
  deposit_pct: 30,
  instalment_frequency_weeks: 3,
};

export default function OfferingsPage() {
  const router = useRouter();
  const [ptId, setPtId] = useState<string | null>(null);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/partner-login");
      return;
    }

    const { data: pt } = await supabase
      .from("personal_trainers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!pt) {
      router.push("/partner-login");
      return;
    }

    setPtId(pt.id);

    const { data, error } = await supabase
      .from("pt_offerings")
      .select("*")
      .eq("pt_id", pt.id)
      .order("created_at", { ascending: false });

    if (!error) setOfferings((data as unknown as Offering[]) ?? []);
    setLoading(false);
  }

  function openNewForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setSuccessMsg("");
    setShowForm(true);
  }

  function openEditForm(offering: Offering) {
    setEditingId(offering.id);
    setForm({
      title: offering.title,
      description: offering.description ?? "",
      type: offering.type,
      duration_minutes: offering.duration_minutes,
      price_kes: offering.price_kes,
      max_participants: offering.max_participants,
      image_url: offering.image_url ?? "",
      is_active: offering.is_active,
      is_programme: offering.is_programme ?? false,
      programme_weeks: offering.programme_weeks ?? 8,
      programme_price_kes: offering.programme_price_kes ?? 0,
      intro_price_kes: offering.intro_price_kes ?? 0,
      deposit_pct: offering.deposit_pct ?? 30,
      instalment_frequency_weeks: offering.instalment_frequency_weeks ?? 3,
    });
    setFormError("");
    setSuccessMsg("");
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
  }

  async function uploadOfferingImage(file: File) {
    setUploadingImage(true);
    const ext = file.name.split(".").pop();
    const path = `offerings/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("pt-photos").upload(path, file, { upsert: true });
    if (error) {
      setFormError("Image upload failed: " + error.message);
      setUploadingImage(false);
      return;
    }
    const { data } = supabase.storage.from("pt-photos").getPublicUrl(path);
    setForm((f) => ({ ...f, image_url: data.publicUrl }));
    setUploadingImage(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!ptId) return;
    setSaving(true);
    setFormError("");

    if (!form.title.trim()) {
      setFormError("Title is required.");
      setSaving(false);
      return;
    }

    const basePayload: Record<string, any> = {
      pt_id: ptId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      type: form.type,
      duration_minutes: Number(form.duration_minutes),
      price_kes: form.is_programme ? Number(form.intro_price_kes) : Number(form.price_kes),
      max_participants: Number(form.max_participants),
      image_url: form.image_url || null,
      is_active: form.is_active,
      is_draft: false,
      is_programme: form.is_programme,
      programme_weeks: form.is_programme ? Number(form.programme_weeks) : null,
      programme_price_kes: form.is_programme ? Number(form.programme_price_kes) : null,
      intro_price_kes: form.is_programme ? Number(form.intro_price_kes) : null,
      deposit_pct: form.is_programme ? Number(form.deposit_pct) : 30,
      instalment_frequency_weeks: form.is_programme ? Number(form.instalment_frequency_weeks) : null,
    };

    let error: any = null;

    if (editingId) {
      const { error: err } = await supabase
        .from("pt_offerings")
        .update(basePayload)
        .eq("id", editingId);
      error = err;
    } else {
      const slug = form.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now();
      const { error: err } = await supabase.from("pt_offerings").insert({ ...basePayload, slug });
      error = err;
    }

    if (error) {
      setFormError(error.message || "Failed to save offering.");
      setSaving(false);
      return;
    }

    await loadData();
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
    setSuccessMsg(editingId ? "Offering updated successfully." : "Offering created successfully.");
    setTimeout(() => setSuccessMsg(""), 4000);
  }

  async function toggleActive(offering: Offering) {
    setTogglingId(offering.id);
    const { error } = await supabase
      .from("pt_offerings")
      .update({ is_active: !offering.is_active })
      .eq("id", offering.id);

    if (!error) {
      setOfferings((prev) =>
        prev.map((o) =>
          o.id === offering.id ? { ...o, is_active: !o.is_active } : o
        )
      );
    }
    setTogglingId(null);
  }

  async function handleDelete(offeringId: string) {
    if (!confirm("Delete this offering? This cannot be undone.")) return;
    setDeletingId(offeringId);
    const { error } = await supabase
      .from("pt_offerings")
      .delete()
      .eq("id", offeringId);

    if (!error) {
      setOfferings((prev) => prev.filter((o) => o.id !== offeringId));
    }
    setDeletingId(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 text-sm">Loading offerings...</p>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offerings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage the sessions and services you offer clients
          </p>
        </div>
        {!showForm && (
          <button
            onClick={openNewForm}
            className="px-5 py-2.5 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-900 transition"
          >
            + New Offering
          </button>
        )}
      </div>

      {/* Availability info callout */}
      {!showForm && (
        <div className="flex gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-blue-800">
            Each session can have its own availability schedule — ideal when different session types run at different times.
            Click the <span className="font-semibold">clock icon</span> on any session to set its hours, or manage your{" "}
            <Link href="/pt-dashboard/availability" className="underline font-medium hover:text-blue-900">
              default schedule
            </Link>
            .
          </p>
        </div>
      )}

      {/* Success banner */}
      {successMsg && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm mb-4">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* Inline form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-5">
            {editingId ? "Edit Offering" : "New Offering"}
          </h2>

          {formError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
              {formError}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                placeholder="e.g. Morning Strength Session"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none resize-none"
                placeholder="Describe what clients can expect..."
              />
            </div>

            {/* Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session Image</label>
              {form.image_url ? (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                  <img src={form.image_url} alt="Offering" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                    className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full hover:bg-black/80 transition"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition ${uploadingImage ? "border-gray-200 bg-gray-50" : "border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100"}`}>
                  {uploadingImage ? (
                    <span className="text-xs text-gray-400">Uploading...</span>
                  ) : (
                    <>
                      <svg className="w-6 h-6 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs text-gray-500">Click to upload image</span>
                      <span className="text-xs text-gray-400 mt-0.5">JPG, PNG, WebP · max 5 MB</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingImage}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadOfferingImage(file);
                    }}
                  />
                </label>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session Type
                {form.is_programme && <span className="text-xs font-normal text-gray-400 ml-1.5">— select all that apply</span>}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {OFFERING_TYPES.map((t) => {
                  const isGroup = t === "group";
                  const selectedTypes = form.type.split(",").filter(Boolean);
                  const isSelected = selectedTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={isGroup}
                      onClick={() => {
                        if (isGroup) return;
                        if (form.is_programme) {
                          const next = isSelected
                            ? selectedTypes.filter((x) => x !== t)
                            : [...selectedTypes, t];
                          setForm((f) => ({ ...f, type: next.join(",") }));
                        } else {
                          setForm((f) => ({ ...f, type: t }));
                        }
                      }}
                      className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors flex items-center justify-between gap-2 ${
                        isGroup
                          ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                          : isSelected
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50 bg-white"
                      }`}
                    >
                      <span className="capitalize">{t.replace(/-/g, " ")}</span>
                      {form.is_programme && !isGroup && (
                        <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                          isSelected ? "border-white" : "border-current opacity-40"
                        }`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Group sessions are not available for PT bookings.</p>
            </div>

            {/* Duration / Price / Max */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration (min)
                </label>
                <input
                  type="number"
                  min={15}
                  step={5}
                  value={form.duration_minutes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price (KES)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.price_kes || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price_kes: Number(e.target.value) }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Participants
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.max_participants || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, max_participants: Number(e.target.value) }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                  placeholder="1"
                />
              </div>
            </div>

            {/* Programme toggle */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-3 mb-1">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({
                    ...f,
                    is_programme: !f.is_programme,
                    type: f.is_programme && f.type.includes(",") ? f.type.split(",")[0] : f.type,
                  }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.is_programme ? "bg-indigo-500" : "bg-gray-300"}`}
                  role="switch"
                  aria-checked={form.is_programme}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_programme ? "translate-x-6" : "translate-x-1"}`} />
                </button>
                <span className="text-sm font-medium text-gray-900">Multi-week programme</span>
              </div>
              <p className="text-xs text-gray-400 ml-14">Clients book an intro session first, then commit to the full programme.</p>
            </div>

            {form.is_programme && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Programme details</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration (weeks)</label>
                    <input
                      type="number" min={1} value={form.programme_weeks ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, programme_weeks: Number(e.target.value) }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="e.g. 12"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full programme price (KES)</label>
                    <input
                      type="number" min={0} value={form.programme_price_kes || ""}
                      onChange={(e) => setForm((f) => ({ ...f, programme_price_kes: Number(e.target.value) }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="e.g. 42000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Intro session price (KES)</label>
                    <input
                      type="number" min={0} value={form.intro_price_kes ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, intro_price_kes: Number(e.target.value) }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="0 = free"
                    />
                    <p className="text-xs text-gray-400 mt-1">Set to 0 for a free intro.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Deposit % (Stage 2)</label>
                    <input
                      type="number" min={0} max={100} value={form.deposit_pct ?? 30}
                      onChange={(e) => setForm((f) => ({ ...f, deposit_pct: Number(e.target.value) }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="30"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Instalment every (weeks)</label>
                    <input
                      type="number" min={1} value={form.instalment_frequency_weeks ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, instalment_frequency_weeks: Number(e.target.value) }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                      placeholder="e.g. 3"
                    />
                    <p className="text-xs text-gray-400 mt-1">Remaining balance split across these intervals.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  form.is_active ? "bg-green-500" : "bg-gray-300"
                }`}
                role="switch"
                aria-checked={form.is_active}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    form.is_active ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-gray-700">
                {form.is_active ? "Active – visible to clients" : "Inactive – hidden from clients"}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving || uploadingImage}
                className="px-6 py-2.5 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-900 transition disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Save Changes" : "Create Offering"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Offerings list */}
      {offerings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm mb-4">You haven't created any offerings yet.</p>
          <button
            onClick={openNewForm}
            className="px-5 py-2.5 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-900 transition"
          >
            Create your first offering
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {offerings.map((offering) => (
            <div
              key={offering.id}
              className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition ${
                offering.is_active ? "border-gray-100" : "border-gray-100 opacity-60"
              }`}
            >
              {offering.image_url && (
                <div className="w-full h-36 bg-gray-100">
                  <img src={offering.image_url} alt={offering.title} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex items-start justify-between gap-4 p-5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-semibold text-gray-900">{offering.title}</h3>
                    {offering.type.split(",").filter(Boolean).map((t) => (
                      <span
                        key={t}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          TYPE_COLORS[t] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {t.replace(/-/g, " ")}
                      </span>
                    ))}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        offering.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {offering.is_active ? "Active" : "Inactive"}
                    </span>
                    {offering.is_programme && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                        Programme
                      </span>
                    )}
                    {offering.is_draft && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        Draft
                      </span>
                    )}
                  </div>
                  {offering.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {offering.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                    <span>{offering.duration_minutes} min</span>
                    {offering.is_programme ? (
                      <>
                        <span className="text-indigo-600 font-medium">{offering.programme_weeks}-week programme</span>
                        <span>KES {Number(offering.programme_price_kes ?? 0).toLocaleString()} total</span>
                        <span>Intro: {Number(offering.intro_price_kes ?? 0) === 0 ? "Free" : `KES ${Number(offering.intro_price_kes).toLocaleString()}`}</span>
                      </>
                    ) : (
                      <span>KES {offering.price_kes.toLocaleString()}</span>
                    )}
                    {offering.max_participants > 1 && (
                      <span>Up to {offering.max_participants} participants</span>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Active toggle */}
                  <button
                    onClick={() => toggleActive(offering)}
                    disabled={togglingId === offering.id}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                      offering.is_active ? "bg-green-500" : "bg-gray-300"
                    }`}
                    role="switch"
                    aria-checked={offering.is_active}
                    title={offering.is_active ? "Deactivate" : "Activate"}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        offering.is_active ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>

                  {/* Availability */}
                  <Link
                    href={`/pt-dashboard/availability?offering=${offering.id}`}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition"
                    title="Set availability for this session"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </Link>

                  {/* Edit */}
                  <button
                    onClick={() => openEditForm(offering)}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(offering.id)}
                    disabled={deletingId === offering.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition disabled:opacity-50"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
