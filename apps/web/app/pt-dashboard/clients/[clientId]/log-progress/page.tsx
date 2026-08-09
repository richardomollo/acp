"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { Button } from "../../../../components/ui/Button";
import { Field, Input } from "../../../../components/ui/Input";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LogProgressPage({ params }: { params: Promise<{ clientId: string }> }) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(null);

  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [chest, setChest] = useState("");
  const [hips, setHips] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { params.then(p => setClientId(p.clientId)); }, [params]);

  const canSave = [weight, waist, chest, hips, notes].some(v => v.trim().length > 0);

  const handleSave = async () => {
    if (!canSave || !clientId) return;
    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); router.push("/partner-login"); return; }

    const { data: pt } = await supabase
      .from("personal_trainers").select("id").eq("user_id", user.id).single();
    if (!pt) {
      setError("Trainer profile not found.");
      setSaving(false);
      return;
    }

    const { error: err } = await supabase.from("client_measurements").insert({
      user_id: clientId,
      logged_by_pt_id: pt.id,
      weight_kg: weight.trim() ? Number(weight) : null,
      waist_cm: waist.trim() ? Number(waist) : null,
      chest_cm: chest.trim() ? Number(chest) : null,
      hips_cm: hips.trim() ? Number(hips) : null,
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (err) { setError(err.message); return; }
    router.push(`/pt-dashboard/clients/${clientId}`);
  };

  return (
    <div className="p-6 md:p-8 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.back()} className="text-sm text-[--text-secondary] hover:underline">
          ← Back
        </button>
        <h1 className="text-lg font-bold text-ink-900">Log Progress</h1>
        <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {error && <div className="bg-danger-50 text-danger text-sm px-4 py-3 rounded-lg mb-4">{error}</div>}

      <p className="text-xs font-bold text-[--text-muted] uppercase tracking-wide mb-4">Measurements (optional)</p>

      <div className="space-y-4 mb-4">
        {[
          { label: "Weight (kg)", value: weight, set: setWeight, placeholder: "e.g. 68.5" },
          { label: "Waist (cm)", value: waist, set: setWaist, placeholder: "e.g. 80" },
          { label: "Chest (cm)", value: chest, set: setChest, placeholder: "e.g. 96" },
          { label: "Hips (cm)", value: hips, set: setHips, placeholder: "e.g. 98" },
        ].map(f => (
          <Field key={f.label} label={f.label}>
            <Input
              type="number"
              step="0.1"
              placeholder={f.placeholder}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
            />
          </Field>
        ))}
      </div>

      <div className="mt-4">
        <Field label="Note (optional)">
          <textarea
            placeholder="Observations from today's session..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full px-4 py-[13px] border-[1.5px] border-border rounded-[12px] text-[15px] text-ink-900 focus:outline-none focus:border-blue-500 resize-none bg-surface"
          />
        </Field>
      </div>
    </div>
  );
}
