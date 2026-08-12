"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

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

const CATEGORIES = [
  { key: "running", label: "Running" }, { key: "walking", label: "Walking" },
  { key: "cycling", label: "Cycling" }, { key: "strength", label: "Strength" },
  { key: "boxing", label: "Boxing" }, { key: "yoga", label: "Yoga" },
  { key: "pilates", label: "Pilates" }, { key: "hiking", label: "Hiking" },
  { key: "dance", label: "Dance" }, { key: "outdoor_fitness", label: "Outdoor Fitness" },
  { key: "football", label: "Football" }, { key: "other", label: "Other" },
] as const;

export default function CommunitySettingsPage() {
  const router = useRouter();
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("other");
  const [communityType, setCommunityType] = useState<"open" | "approval_required">("open");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/partner-login"); return; }

      const { data: membership } = await supabase
        .from("community_members").select("community_id")
        .eq("user_id", user.id).in("role", ["owner", "admin"]).eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const cid = membership?.community_id ?? null;
      setCommunityId(cid);
      if (!cid) { setLoading(false); return; }

      const { data: community } = await supabase
        .from("communities")
        .select("name, description, location, category, community_type, logo_url, cover_url")
        .eq("id", cid).single();

      if (community) {
        setName(community.name ?? "");
        setDescription(community.description ?? "");
        setLocation(community.location ?? "");
        setCategory(community.category ?? "other");
        setCommunityType(community.community_type ?? "open");
        setLogoPreview(community.logo_url ?? null);
        setCoverPreview(community.cover_url ?? null);
      }
      setLoading(false);
    })();
  }, [router]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!communityId) return;
    setError("");
    setSaved(false);
    if (!name.trim()) { setError("Give your community a name."); return; }

    setSaving(true);
    try {
      let logoUrl = logoFile ? null : logoPreview;
      if (logoFile) logoUrl = await uploadPhoto(logoFile, "fitpass-images", `communities/temp/${Date.now()}-logo`);

      let coverUrl = coverFile ? null : coverPreview;
      if (coverFile) coverUrl = await uploadPhoto(coverFile, "fitpass-images", `communities/temp/${Date.now()}-cover`);

      const { error: updateErr } = await supabase.from("communities").update({
        name: name.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        category,
        community_type: communityType,
        logo_url: logoUrl,
        cover_url: coverUrl,
      }).eq("id", communityId);

      if (updateErr) throw updateErr;
      setSaved(true);
      setLogoFile(null);
      setCoverFile(null);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e.message ?? "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Community Settings</h1>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Cover photo</label>
          <label className="block w-full h-36 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer">
            {coverPreview ? (
              <img src={coverPreview} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-gray-400">Add a cover photo</span>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
          <label className="block w-20 h-20 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] text-gray-400 text-center px-1">Add logo</span>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Community name</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Activity</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${category === c.key ? "bg-black text-white border-black" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
          <input
            type="text" value={location} onChange={(e) => setLocation(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Who can join?</label>
          <div className="flex gap-2">
            {[
              { key: "open" as const, label: "Open — anyone can join instantly" },
              { key: "approval_required" as const, label: "Approval required" },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setCommunityType(opt.key)}
                className={`flex-1 px-3.5 py-2.5 rounded-xl text-xs font-semibold border text-left transition ${communityType === opt.key ? "bg-black text-white border-black" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {saved && <p className="text-xs text-green-600 font-semibold">Saved!</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
