// Beta Feedback #019 — the marketplace location the app is currently showing
// supply for. This is SEPARATE from:
//   • the user's physical GPS state, and
//   • fitness_profile.preferred_location (home | gym | both — a training
//     context, never a place).
//
// Two modes:
//   • 'device' — resolved from the phone's location, on demand only (never at
//     startup). Permission denied / unavailable → the app treats location as
//     unknown and offers manual city selection. Nothing here blocks Lana's
//     non-marketplace features.
//   • 'manual' — the user explicitly chose a city to explore ("Explore
//     another city"). Persisted. Always surfaced in the UI so browsing e.g.
//     Nairobi from Amsterdam is unmistakably "Exploring Nairobi".
//
// A device user is NEVER silently switched to another city.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { isMarketplaceGeoGatingEnabled } from '@/lib/flags';
import { MARKETPLACE_RADIUS_KM } from '@/lib/supply/location';
import {
  getMarketplaceAvailability, getMarketplaceMarkets,
  type MarketplaceAvailability, type MarketplaceMarket, type GeoPoint,
} from '@/services/marketplace-availability-service';

const GEO_GATING = isMarketplaceGeoGatingEnabled();

const MANUAL_KEY = '@lana/marketplace-location/manual';

type Mode = 'device' | 'manual';
type Resolution = 'idle' | 'resolving' | 'ready';
type Permission = 'undetermined' | 'granted' | 'denied';

interface ManualMarket {
  label: string;
  latitude: number;
  longitude: number;
}

interface MarketplaceLocationValue {
  /** internal resolution lifecycle — 'ready' once an availability verdict exists */
  resolution: Resolution;
  mode: Mode;
  permission: Permission;
  /** the point availability was last computed for (device or manual) */
  point: GeoPoint | null;
  /** short label for the location in effect ("Nairobi", "Amsterdam") */
  activeLabel: string | null;
  /** true while in manual mode — the UI shows an "Exploring <city>" banner */
  isExploring: boolean;
  availability: MarketplaceAvailability | null;
  /** true only when the availability QUERY failed — show retry, never "not in your city" */
  queryFailed: boolean;
  /** gym ids with valid active+bookable supply within radius (empty unless 'available') */
  venueIdsInRadius: string[];
  /** What a screen should pass to `.in('gym_id', …)`:
   *   • `string[]` — scope to exactly these venues (may be empty → show nothing local)
   *   • `null`     — DO NOT scope (kill switch off) — fetch as pre-#019 */
  venueScopeIds: string[] | null;
  markets: MarketplaceMarket[];
  /** Beta #019 kill switch. When false, every marketplace surface reverts to
   *  pre-#019 behaviour: `availability` is a synthetic 'available', no geo
   *  query runs, and screens must NOT scope by `venueIdsInRadius`. */
  geoGatingEnabled: boolean;

  /** Call when a marketplace surface is entered. Resolves the location and
   *  availability. `requestPermission` lets that surface prompt for GPS the
   *  first time (Discover does; a background check does not). */
  ensureResolved: (opts?: { requestPermission?: boolean }) => Promise<void>;
  /** Re-run after a query failure. */
  retry: () => Promise<void>;
  /** Explicitly explore a city. Persisted; switches to manual mode. */
  setManualMarket: (m: ManualMarket) => Promise<void>;
  /** Drop the manual choice and go back to the device location. */
  useMyLocation: (opts?: { requestPermission?: boolean }) => Promise<void>;
  /** Load the "Explore another city" options. */
  loadMarkets: () => Promise<void>;
}

const Ctx = createContext<MarketplaceLocationValue | null>(null);

async function readManual(): Promise<ManualMarket | null> {
  try {
    const raw = await AsyncStorage.getItem(MANUAL_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.latitude === 'number' && typeof p?.longitude === 'number') {
      return { label: String(p.label ?? 'Selected city'), latitude: p.latitude, longitude: p.longitude };
    }
  } catch { /* ignore */ }
  return null;
}

async function reverseGeocodeLabel(point: GeoPoint): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync(point);
    return place?.city ?? place?.subregion ?? place?.region ?? place?.country ?? null;
  } catch {
    return null;
  }
}

async function readDevicePoint(): Promise<GeoPoint | null> {
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    return { latitude: cur.coords.latitude, longitude: cur.coords.longitude };
  } catch {
    return null;
  }
}

export function MarketplaceLocationProvider({ children }: { children: ReactNode }) {
  const [resolution, setResolution] = useState<Resolution>('idle');
  const [mode, setMode] = useState<Mode>('device');
  const [permission, setPermission] = useState<Permission>('undetermined');
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [availability, setAvailability] = useState<MarketplaceAvailability | null>(null);
  const [queryFailed, setQueryFailed] = useState(false);
  const [venueIdsInRadius, setVenueIdsInRadius] = useState<string[]>([]);
  const [markets, setMarkets] = useState<MarketplaceMarket[]>([]);

  const manualRef = useRef<ManualMarket | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  // Mirror the "have we produced a verdict yet?" state into a ref so
  // `ensureResolved` can keep a STABLE identity (screens depend on it).
  const resolvedOnceRef = useRef(false);

  // On mount: load a persisted manual choice ONLY. No GPS, no permission
  // prompt, no network — Lana opens straight into nutrition/workouts fine.
  useEffect(() => {
    let alive = true;
    (async () => {
      const manual = await readManual();
      if (!alive || !manual) return;
      manualRef.current = manual;
      setMode('manual');
    })();
    return () => { alive = false; };
  }, []);

  const computeFor = useCallback(async (p: GeoPoint | null, label: string | null) => {
    setQueryFailed(false);
    const res = await getMarketplaceAvailability(p, label);
    if (!res.ok) {
      setQueryFailed(true);
      resolvedOnceRef.current = true;
      // Keep any previous availability; the UI shows a retry, never a false
      // "not in your city".
      return;
    }
    setAvailability(res.availability);
    setVenueIdsInRadius(res.venueIdsInRadius);
    resolvedOnceRef.current = true;
  }, []);

  const resolveManual = useCallback(async () => {
    const m = manualRef.current;
    if (!m) return;
    const p = { latitude: m.latitude, longitude: m.longitude };
    setPoint(p);
    setActiveLabel(m.label);
    await computeFor(p, m.label);
  }, [computeFor]);

  const resolveDevice = useCallback(async (requestPermission: boolean) => {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status === 'undetermined' && requestPermission) {
      perm = await Location.requestForegroundPermissionsAsync();
    }
    const status: Permission =
      perm.status === 'granted' ? 'granted' : perm.status === 'denied' ? 'denied' : 'undetermined';
    setPermission(status);

    if (status !== 'granted') {
      setPoint(null);
      setActiveLabel(null);
      await computeFor(null, null); // → location_unknown
      return;
    }

    const p = await readDevicePoint();
    if (!p) {
      setPoint(null);
      setActiveLabel(null);
      await computeFor(null, null);
      return;
    }
    const label = await reverseGeocodeLabel(p);
    setPoint(p);
    setActiveLabel(label);
    await computeFor(p, label);
  }, [computeFor]);

  const run = useCallback((requestPermission: boolean) => {
    // Serialise — a screen focus + a manual pick shouldn't race.
    const task = (async () => {
      setResolution('resolving');
      try {
        if (manualRef.current) await resolveManual();
        else await resolveDevice(requestPermission);
      } finally {
        setResolution('ready');
      }
    })();
    inFlight.current = task;
    return task;
  }, [resolveManual, resolveDevice]);

  const ensureResolved = useCallback(async (opts?: { requestPermission?: boolean }) => {
    if (!GEO_GATING) {
      // Kill switch off → synthetic "available everywhere", no query, no GPS.
      if (!resolvedOnceRef.current) {
        resolvedOnceRef.current = true;
        setAvailability({ status: 'available', radiusKm: MARKETPLACE_RADIUS_KM });
        setResolution('ready');
      }
      return;
    }
    if (inFlight.current) { await inFlight.current; return; }
    // Already produced a verdict → no work. (Screens force a refresh via
    // retry() or useMyLocation().)
    if (resolvedOnceRef.current) return;
    await run(opts?.requestPermission ?? false);
  }, [run]);

  const retry = useCallback(async () => {
    await run(false);
  }, [run]);

  const setManualMarket = useCallback(async (m: ManualMarket) => {
    manualRef.current = m;
    setMode('manual');
    try { await AsyncStorage.setItem(MANUAL_KEY, JSON.stringify(m)); } catch { /* ignore */ }
    await run(false);
  }, [run]);

  const useMyLocation = useCallback(async (opts?: { requestPermission?: boolean }) => {
    manualRef.current = null;
    setMode('device');
    try { await AsyncStorage.removeItem(MANUAL_KEY); } catch { /* ignore */ }
    await run(opts?.requestPermission ?? true);
  }, [run]);

  const loadMarkets = useCallback(async () => {
    setMarkets(await getMarketplaceMarkets());
  }, []);

  const value = useMemo<MarketplaceLocationValue>(() => ({
    resolution, mode, permission, point, activeLabel,
    isExploring: GEO_GATING && mode === 'manual',
    availability, queryFailed, venueIdsInRadius,
    venueScopeIds: GEO_GATING ? venueIdsInRadius : null,
    markets,
    geoGatingEnabled: GEO_GATING,
    ensureResolved, retry, setManualMarket, useMyLocation, loadMarkets,
  }), [
    resolution, mode, permission, point, activeLabel, availability, queryFailed,
    venueIdsInRadius, markets, ensureResolved, retry, setManualMarket, useMyLocation, loadMarkets,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarketplaceLocation(): MarketplaceLocationValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMarketplaceLocation must be used within MarketplaceLocationProvider');
  return v;
}
