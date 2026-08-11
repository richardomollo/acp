"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter, useSearchParams } from "next/navigation";

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

const EVENT_TYPES = [
  { key: "free", label: "Free" }, { key: "paid", label: "Paid" }, { key: "external", label: "External" },
] as const;

const ACTIVITY_TYPES = [
  "running", "walking", "cycling", "strength", "boxing", "yoga",
  "pilates", "hiking", "dance", "outdoor_fitness", "football", "other",
] as const;

export default function CreateEventClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("id");
  const isEditMode = !!eventId;

  const [loadingEvent, setLoadingEvent] = useState(isEditMode);
  const [notEditable, setNotEditable] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState<typeof EVENT_TYPES[number]["key"]>("free");
  const [activityType, setActivityType] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [priceKes, setPriceKes] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [distanceKm, setDistanceKm] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data: event } = await supabase.from("community_events").select("*").eq("id", eventId).single();
      if (event) {
        if (event.event_type === "partner_session") {
          // Not editable here — this form's type picker doesn't cover
          // partner-linked events (gym_id/session_id), and saving would
          // silently downgrade it to "free". Edit those in the Expo app.
          setNotEditable(true);
          setLoadingEvent(false);
          return;
        }
        setTitle(event.title ?? "");
        setDescription(event.description ?? "");
        setEventType(event.event_type);
        setActivityType(event.activity_type);
        setDate(event.date ?? "");
        setTime((event.start_time ?? "").slice(0, 5));
        setLocation(event.location ?? "");
        setCapacity(event.capacity != null ? String(event.capacity) : "");
        setPriceKes(event.price_kes != null ? String(event.price_kes) : "");
        setExternalUrl(event.external_url ?? "");
        setDistanceKm(event.distance_km != null ? String(event.distance_km) : "");
        setImagePreview(event.image_url ?? null);
      }
      setLoadingEvent(false);
    })();
  }, [eventId]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setError("");
    if (!title.trim()) { setError("Give the event a title."); return; }
    if (!date || !time) { setError("Pick a date and start time."); return; }
    if (eventType !== "external" && !location.trim()) { setError("Where is this happening?"); return; }
    if (eventType === "paid" && (!priceKes || Number(priceKes) <= 0)) { setError("Set a price in KES."); return; }
    if (eventType === "external" && !externalUrl.trim()) { setError("Add the external registration link."); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Please sign in."); setSaving(false); return; }

      const { data: membership } = await supabase
        .from("community_members").select("community_id")
        .eq("user_id", user.id).in("role", ["owner", "admin"]).eq("status", "active")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      if (!membership) { setError("No community found for this account."); setSaving(false); return; }

      let imageUrl: string | null = imagePreview && !imageFile ? imagePreview : null;
      if (imageFile) {
        imageUrl = await uploadPhoto(imageFile, "fitpass-images", `community-events/temp/${Date.now()}`);
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        event_type: eventType,
        activity_type: activityType,
        date,
        start_time: `${time}:00`,
        location: eventType === "external" ? (location.trim() || "Online") : location.trim(),
        capacity: capacity ? Number(capacity) : null,
        price_kes: eventType === "paid" ? Number(priceKes) : null,
        external_url: eventType === "external" ? externalUrl.trim() : null,
        distance_km: distanceKm ? Number(distanceKm) : null,
        image_url: imageUrl,
      };

      const { error: saveErr } = isEditMode
        ? await supabase.from("community_events").update(payload).eq("id", eventId)
        : await supabase.from("community_events").insert({
            ...payload,
            community_id: membership.community_id,
            organiser_user_id: user.id,
          });

      if (saveErr) throw saveErr;
      router.push("/community-dashboard/events");
    } catch (e: any) {
      setError(e.message ?? "Could not save event.");
    } finally {
      setSaving(false);
    }
  };

  if (loadingEvent) {
    return <div className="p-8 text-sm text-gray-400">Loading…</div>;
  }

  if (notEditable) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Edit Event</h1>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
          This event is linked to a venue session and can only be edited in the partners app.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">{isEditMode ? "Edit Event" : "Create Event"}</h1>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Event image (optional)</label>
          <label className="block w-full h-32 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer">
            {imagePreview ? (
              <img src={imagePreview} alt="Event" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-gray-400">Add a photo</span>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Event type</label>
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((t) => (
              <button key={t.key} onClick={() => setEventType(t.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${eventType === t.key ? "bg-black text-white border-black" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Wednesday Social Run"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Activity</label>
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_TYPES.map((a) => (
              <button key={a} onClick={() => setActivityType(a)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border capitalize transition ${activityType === a ? "bg-black text-white border-black" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                {a.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{eventType === "external" ? "Location (optional)" : "Location"}</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Karura Forest"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Capacity (optional)</label>
            <input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="50"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Distance km (optional)</label>
            <input type="number" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="5"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>
        </div>

        {eventType === "paid" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Price (KES)</label>
            <input type="number" value={priceKes} onChange={(e) => setPriceKes(e.target.value)} placeholder="1500"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>
        )}

        {eventType === "external" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Registration link</label>
            <input type="text" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            placeholder="What should people know before showing up?"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20" />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button onClick={handleSave} disabled={saving}
          className="w-full py-3 text-sm font-semibold rounded-xl bg-black text-white hover:bg-gray-800 transition disabled:opacity-60">
          {saving ? "Saving…" : isEditMode ? "Save Changes" : "Create Event"}
        </button>
      </div>
    </div>
  );
}
