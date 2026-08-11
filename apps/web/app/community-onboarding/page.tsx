"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

export default function CommunityOnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("Nairobi");
  const [category, setCategory] = useState<string | null>(null);
  const [communityType, setCommunityType] = useState<"open" | "approval_required">("open");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleCreate = async () => {
    setError("");
    if (!name.trim()) { setError("Give your community a name."); return; }
    if (!category) { setError("Pick the activity this community is organised around."); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Please sign in first."); setSaving(false); return; }

      let logoUrl: string | null = null;
      if (logoFile) {
        logoUrl = await uploadPhoto(logoFile, "fitpass-images", `communities/temp/${Date.now()}`);
      }

      const { error: insertErr } = await supabase.from("communities").insert({
        name: name.trim(),
        description: description.trim() || null,
        category,
        location: location.trim() || null,
        community_type: communityType,
        logo_url: logoUrl,
        owner_user_id: user.id,
      });

      if (insertErr) throw insertErr;
      router.replace("/community-onboarding/pending");
    } catch (e: any) {
      setError(e.message ?? "Could not create community.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-14">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Start a Community</h1>
      <p className="text-sm text-gray-500 mb-8">
        Organise runs, rides, classes or meetups around a shared activity. Your community will be
        reviewed by our team before it goes live — usually within 24–48 hours.
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="flex justify-center">
          <label className="w-24 h-24 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-gray-400 text-center px-2">Add logo</span>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Community name</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nairobi Running Club"
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
            placeholder="What's this community about?"
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

        <button
          onClick={handleCreate}
          disabled={saving}
          className="w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-60"
        >
          {saving ? "Creating…" : "Create Community"}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Not signed in yet?{" "}
          <Link href={`/login?redirect=${encodeURIComponent("/community-onboarding")}`} className="underline hover:text-black">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
