"use client";

import { useState, useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { fetchPTSpecialisations } from "@/app/lib/lookups";
import { StravaConnectCard } from "@/app/components/strava/StravaConnectCard";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type PT = {
  id: string;
  full_name: string;
  bio: string | null;
  specialisations: string[] | null;
  years_of_experience: number | null;
  certifications: string[] | null;
  training_locations: string[] | null;
  service_areas: string[] | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  cover_url: string | null;
  status: string;
};

const inputClass =
  "w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 transition bg-white";

async function uploadPTPhoto(file: File, folder: "profile" | "cover"): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage
    .from("pt-photos")
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("pt-photos").getPublicUrl(data.path).data.publicUrl;
}

export default function PTProfilePage() {
  const [pt, setPt] = useState<PT | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [specialisations, setSpecialisations] = useState<string[]>([]);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    full_name: "",
    bio: "",
    specialisations: [] as string[],
    years_of_experience: "",
    certifications: "",
    training_locations: "",
    service_areas: "",
    phone: "",
  });

  useEffect(() => { fetchPTSpecialisations().then(setSpecialisations); }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("personal_trainers")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setPt(data);
        setPhotoUrl(data.photo_url ?? null);
        setCoverUrl(data.cover_url ?? null);
        setForm({
          full_name: data.full_name ?? "",
          bio: data.bio ?? "",
          specialisations: data.specialisations ?? [],
          years_of_experience: data.years_of_experience?.toString() ?? "",
          certifications: data.certifications?.join(", ") ?? "",
          training_locations: data.training_locations?.join(", ") ?? "",
          service_areas: data.service_areas?.join(", ") ?? "",
          phone: data.phone ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError("");
    try {
      const url = await uploadPTPhoto(file, "profile");
      setPhotoUrl(url);
    } catch (err: any) {
      setError("Failed to upload profile photo: " + (err.message || "unknown error"));
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    setError("");
    try {
      const url = await uploadPTPhoto(file, "cover");
      setCoverUrl(url);
    } catch (err: any) {
      setError("Failed to upload cover photo: " + (err.message || "unknown error"));
    } finally {
      setUploadingCover(false);
      e.target.value = "";
    }
  };

  const set = (field: keyof Omit<typeof form, "specialisations">, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const toggleSpec = (spec: string) =>
    setForm(prev => ({
      ...prev,
      specialisations: prev.specialisations.includes(spec)
        ? prev.specialisations.filter(s => s !== spec)
        : [...prev.specialisations, spec],
    }));

  const handleSave = async () => {
    if (!pt) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const { error: err } = await supabase
        .from("personal_trainers")
        .update({
          full_name: form.full_name,
          bio: form.bio || null,
          specialisations: form.specialisations,
          years_of_experience: form.years_of_experience ? parseInt(form.years_of_experience) : null,
          certifications: form.certifications ? form.certifications.split(",").map(s => s.trim()).filter(Boolean) : [],
          training_locations: form.training_locations ? form.training_locations.split(",").map(s => s.trim()).filter(Boolean) : [],
          service_areas: form.service_areas ? form.service_areas.split(",").map(s => s.trim()).filter(Boolean) : [],
          phone: form.phone || null,
          photo_url: photoUrl,
          cover_url: coverUrl,
        })
        .eq("id", pt.id);
      if (err) throw err;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading profile…
      </div>
    );
  }

  if (!pt) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Profile not found.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">This information is shown to members browsing trainers.</p>
      </div>

      {/* Status banner */}
      {pt.status !== "approved" && (
        <div className={`mb-6 px-4 py-3 rounded-xl text-sm font-medium ${
          pt.status === "pending"
            ? "bg-amber-50 text-amber-700 border border-amber-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {pt.status === "pending"
            ? "Your profile is pending approval. You can update your details while you wait."
            : "Your profile has been rejected. Please contact support for more information."}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      {/* ── Cover + Profile photo ── */}
      <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 mb-4">

        {/* Cover photo */}
        <div className="relative h-44 bg-gradient-to-br from-gray-800 to-gray-600">
          {coverUrl && (
            <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
          )}
          {/* Always-visible edit badge */}
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-medium px-3 py-1.5 rounded-full transition backdrop-blur-sm disabled:opacity-50"
          >
            {uploadingCover ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
            {uploadingCover ? "Uploading…" : coverUrl ? "Edit cover" : "Add cover"}
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleCoverChange}
          />
        </div>

        {/* Profile photo + name row */}
        <div className="px-6 pb-5">
          <div className="flex items-end gap-4 -mt-10 mb-4">
            {/* Profile photo */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-full border-4 border-white bg-gray-200 overflow-hidden shadow-sm">
                {photoUrl ? (
                  <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>
              {/* Always-visible edit badge */}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-gray-900 hover:bg-gray-700 border-2 border-white flex items-center justify-center transition disabled:opacity-50"
                title="Change profile photo"
              >
                {uploadingPhoto ? (
                  <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                )}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>

            <div className="pb-1">
              <p className="text-base font-bold text-gray-900">{form.full_name || "Your Name"}</p>
              <p className="text-xs text-gray-400">{pt.email}</p>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Click your profile photo or cover to upload. JPG, PNG or WebP · max 5 MB.
          </p>
        </div>
      </div>

      {/* ── Form sections ── */}
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100">

        {/* Basic info */}
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Basic Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full name</label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => set("full_name", e.target.value)}
                placeholder="Your full name"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                placeholder="+254 7XX XXX XXX"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
            <input
              type="email"
              value={pt.email ?? ""}
              disabled
              className={inputClass + " bg-gray-50 text-gray-400 cursor-not-allowed"}
            />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed here. Contact support if needed.</p>
          </div>
        </div>

        {/* Bio */}
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">About You</h2>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Bio</label>
            <textarea
              value={form.bio}
              onChange={e => set("bio", e.target.value)}
              rows={4}
              placeholder="Tell clients about your training style, background, and what to expect..."
              className={inputClass + " resize-none"}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Years of experience</label>
              <input
                type="number"
                min="0"
                max="50"
                value={form.years_of_experience}
                onChange={e => set("years_of_experience", e.target.value)}
                placeholder="e.g. 5"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Certifications</label>
              <input
                type="text"
                value={form.certifications}
                onChange={e => set("certifications", e.target.value)}
                placeholder="e.g. NASM CPT, ISSA"
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-1">Separate multiple with commas</p>
            </div>
          </div>
        </div>

        {/* Specialisations */}
        <div className="p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Specialisations</h2>
          <div className="flex flex-wrap gap-2">
            {specialisations.map(spec => (
              <button
                key={spec}
                type="button"
                onClick={() => toggleSpec(spec)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
                  form.specialisations.includes(spec)
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {spec}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Location</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Where you train</label>
              <input
                type="text"
                value={form.training_locations}
                onChange={e => set("training_locations", e.target.value)}
                placeholder="e.g. Various venues, Westlands"
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-1">Separate multiple with commas</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Service areas</label>
              <input
                type="text"
                value={form.service_areas}
                onChange={e => set("service_areas", e.target.value)}
                placeholder="e.g. Westlands, Karen, Kilimani"
                className={inputClass}
              />
              <p className="text-xs text-gray-400 mt-1">Separate multiple with commas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="mt-5 flex items-center justify-end gap-3">
        {saved && (
          <span className="text-sm text-green-600 font-medium flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Changes saved!
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving || uploadingPhoto || uploadingCover}
          className="bg-gray-900 text-white text-sm font-semibold px-7 py-2.5 rounded-full hover:bg-gray-700 transition disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="mt-6">
        <StravaConnectCard returnTo="/pt-dashboard/profile" />
      </div>
    </div>
  );
}
