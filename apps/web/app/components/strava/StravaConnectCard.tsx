"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";

interface StravaStatus {
  connected: boolean;
  athleteId?: number;
  connectedAt?: string | null;
  lastSyncedAt?: string | null;
}

// Shared "Connect Strava" card used from both the personal-trainer profile
// page (pt-dashboard) and the gym-partner dashboard (trainer-dashboard) —
// a Strava connection is per-user, not per-role, so one component covers
// both instead of duplicating the connect/sync/disconnect logic.
export function StravaConnectCard({ returnTo }: { returnTo: string }) {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<StravaStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error: fnErr } = await supabase.functions.invoke("strava-status", { body: {} });
    if (fnErr || !data) {
      console.error("[strava] failed to get status:", fnErr?.message);
      setStatus({ connected: false });
    } else {
      setStatus(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const result = searchParams.get("strava");
    if (result === "denied") setError("Strava connection was cancelled — no data was imported.");
    else if (result === "error") setError("Couldn't connect to Strava right now. Please try again.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    const { data, error: fnErr } = await supabase.functions.invoke("strava-oauth-start", {
      body: { platform: "web", returnTo },
    });
    if (fnErr || !data?.url) {
      setConnecting(false);
      setError("Couldn't connect to Strava right now. Please try again.");
      return;
    }
    // Full-page redirect (same pattern as this app's Google OAuth) — Strava's
    // own authorize page, then its redirect lands back on this same route.
    window.location.href = data.url;
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setError(null);
    const { error: fnErr } = await supabase.functions.invoke("strava-sync-activities", { body: {} });
    setSyncing(false);
    if (fnErr) { setError("Couldn't sync right now. Please try again."); return; }
    await load();
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setError(null);
    const { data, error: fnErr } = await supabase.functions.invoke("strava-disconnect", { body: {} });
    setDisconnecting(false);
    if (fnErr || !data?.disconnected) { setError("Couldn't disconnect right now. Please try again."); return; }
    await load();
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-16 animate-pulse bg-surface-muted rounded-xl" />
      </Card>
    );
  }

  return (
    <Card className="p-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#fff1eb] flex items-center justify-center text-[#FC4C02] text-lg">
          🏃
        </div>
        <div>
          <h3 className="font-bold text-ink-900 text-sm">
            {status.connected ? "Strava Connected ✓" : "Connect Strava"}
          </h3>
          <p className="text-xs text-ink-600">
            {status.connected
              ? "Your activities are syncing with Active City Pass."
              : "Bring your runs, walks and rides into Active City Pass."}
          </p>
        </div>
      </div>

      {status.connected && status.lastSyncedAt && (
        <p className="text-[11px] text-gray-400">
          Last synced {new Date(status.lastSyncedAt).toLocaleString("en-KE", {
            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
          })}
        </p>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        {status.connected ? (
          <>
            <Button size="sm" variant="secondary" onClick={handleSyncNow} disabled={syncing || disconnecting}>
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
            <Button size="sm" variant="danger" onClick={handleDisconnect} disabled={syncing || disconnecting}>
              {disconnecting ? "Disconnecting…" : "Disconnect Strava"}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={handleConnect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect Strava"}
          </Button>
        )}
      </div>

      <p className="text-[10px] text-gray-300 mt-1">Powered by Strava</p>
    </Card>
  );
}
