// Beta Feedback #019 — shared rendering of the four marketplace-location
// states, so every marketplace surface handles geography identically:
//
//   available           → render the real marketplace content (children)
//   no_local_inventory  → "We're not in <city> yet" + [Explore another city]
//   location_unknown    → "Choose a city" (+ Use my location)
//   query failed        → neutral retry — NEVER "not in your city" (spec §22)
//
// Non-marketplace Lana features are never routed through this — they stay
// visible regardless of what this renders.

import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { palette, radii, fontSize } from '@/constants/theme';
import { useMarketplaceLocation } from '@/contexts/marketplace-location-context';

// ── The "Exploring <city>" banner — shown whenever a manual city is active,
//    so Nairobi supply viewed from Amsterdam is unmistakably not local. ──
export function ExploringBanner() {
  const { isExploring, activeLabel, useMyLocation } = useMarketplaceLocation();
  if (!isExploring) return null;
  return (
    <View style={s.exploring}>
      <Ionicons name="compass-outline" size={15} color={palette.blue600} />
      <Text style={s.exploringText}>
        Exploring <Text style={s.exploringCity}>{activeLabel ?? 'another city'}</Text>
      </Text>
      <View style={{ flex: 1 }} />
      <TouchableOpacity onPress={() => useMyLocation({ requestPermission: true })} hitSlop={8}>
        <Text style={s.exploringAction}>Use my location</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── City picker ──────────────────────────────────────────────────────────
export function CityPickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { markets, loadMarkets, setManualMarket, useMyLocation, permission } = useMarketplaceLocation();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    loadMarkets().finally(() => setLoading(false));
  }, [visible, loadMarkets]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.modal}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Choose a city</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color={palette.ink900} /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.modalBody}>
          <TouchableOpacity
            style={s.cityRow}
            activeOpacity={0.7}
            onPress={() => { useMyLocation({ requestPermission: true }); onClose(); }}
          >
            <Ionicons name="locate-outline" size={18} color={palette.blue600} />
            <Text style={s.cityRowLabel}>Use my current location</Text>
            {permission === 'denied' && <Text style={s.cityRowHint}>Location off</Text>}
          </TouchableOpacity>

          <Text style={s.modalSection}>Where Lana has partners</Text>

          {loading && <ActivityIndicator style={{ marginTop: 20 }} color={palette.blue500} />}

          {!loading && markets.length === 0 && (
            <Text style={s.modalEmpty}>Couldn’t load cities right now. Pull to close and try again.</Text>
          )}

          {!loading && markets.map((m, i) => (
            <TouchableOpacity
              key={`${m.label}-${i}`}
              style={s.cityRow}
              activeOpacity={0.7}
              onPress={() => {
                setManualMarket({ label: m.label, latitude: m.latitude, longitude: m.longitude });
                onClose();
              }}
            >
              <Ionicons name="location-outline" size={18} color={palette.ink700} />
              <Text style={s.cityRowLabel}>{m.label}</Text>
              <View style={{ flex: 1 }} />
              <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── The non-available notice (reused by MarketplaceGate AND other surfaces
//    e.g. the Fitness empty-state, so the market-availability language stays
//    identical everywhere — Beta #019B §2/§9). Renders one of: retry (query
//    failed), "We're not in <city> yet" (no_local_inventory), "Where should
//    we look?" (location_unknown). Returns null when the market is available
//    or still resolving (unless `showLoading`). ──
export function MarketplaceUnavailableNotice({
  supplyNoun = 'bookable gyms, trainers or wellness partners',
  showLoading = true,
}: {
  supplyNoun?: string;
  showLoading?: boolean;
}) {
  const { resolution, availability, queryFailed, retry, activeLabel } = useMarketplaceLocation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const cityBit = activeLabel ? ` in ${activeLabel}` : ' here';

  if (resolution !== 'ready' && !availability && !queryFailed) {
    return showLoading ? <View style={s.centre}><ActivityIndicator color={palette.blue500} /></View> : null;
  }

  if (queryFailed && (!availability || availability.status !== 'available')) {
    return (
      <View style={s.stateCard}>
        <Ionicons name="cloud-offline-outline" size={26} color={palette.gray450} />
        <Text style={s.stateTitle}>Couldn’t check what’s available{cityBit}</Text>
        <Text style={s.stateBody}>This is a connection hiccup, not a coverage gap. Try again in a moment.</Text>
        <TouchableOpacity style={s.stateBtn} onPress={() => retry()} activeOpacity={0.85}>
          <Text style={s.stateBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = availability?.status;
  if (status === 'available' || status == null) return null;

  if (status === 'no_local_inventory') {
    return (
      <>
        <View style={s.stateCard}>
          <Ionicons name="map-outline" size={26} color={palette.blue600} />
          <Text style={s.stateTitle}>
            We’re not{activeLabel ? ` in ${activeLabel}` : ' in your city'} yet
          </Text>
          <Text style={s.stateBody}>
            Lana doesn’t have {supplyNoun}{cityBit} yet. You can still use your fitness plan,
            workouts, nutrition and progress tools.
          </Text>
          <TouchableOpacity style={s.stateBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
            <Text style={s.stateBtnText}>Explore another city</Text>
          </TouchableOpacity>
        </View>
        <CityPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
      </>
    );
  }

  // location_unknown
  return (
    <>
      <View style={s.stateCard}>
        <Ionicons name="location-outline" size={26} color={palette.blue600} />
        <Text style={s.stateTitle}>Where should we look?</Text>
        <Text style={s.stateBody}>
          Turn on location, or pick a city, to see bookable gyms, classes and trainers.
          Everything else in Lana works without it.
        </Text>
        <TouchableOpacity style={s.stateBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
          <Text style={s.stateBtnText}>Choose a city</Text>
        </TouchableOpacity>
      </View>
      <CityPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}

// ── Beta Feedback #019E — professional-support empty states ────────────────
// The shared presentation for `ProfessionalSupportAvailability`
// (lib/professional-support.ts), reused by every surface that recommends a
// named professional (Nutrition, Log Progress, My Plan, Fitness Journey,
// Activity Fulfilment) instead of each screen inventing its own copy
// conditions. Renders nothing for 'available' — the caller renders its own
// matched-professional list in that case.
export function ProfessionalSupportUnavailableNotice({
  availability,
  /** e.g. "nutrition professionals", "personal trainers" — kept generic so
   *  this isn't nutrition-specific (§7). */
  professionalNoun = 'professionals',
  /** what the user can still do meanwhile, e.g. "Lana's nutrition guidance and meal tracking" */
  continueWithNoun = "Lana's guidance and tracking tools",
}: {
  availability: 'no_local_or_online_support' | 'location_unknown' | 'error';
  professionalNoun?: string;
  continueWithNoun?: string;
}) {
  const { activeLabel, retry } = useMarketplaceLocation();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (availability === 'error') {
    return (
      <View style={s.stateCard}>
        <Ionicons name="cloud-offline-outline" size={22} color={palette.gray450} />
        <Text style={s.stateTitle}>We couldn’t load professional support right now.</Text>
        <Text style={s.stateBody}>Please try again.</Text>
        <TouchableOpacity style={s.stateBtn} onPress={() => retry()} activeOpacity={0.85}>
          <Text style={s.stateBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (availability === 'location_unknown') {
    return (
      <>
        <View style={s.stateCard}>
          <Ionicons name="location-outline" size={22} color={palette.blue600} />
          <Text style={s.stateTitle}>Choose a city to find support</Text>
          <Text style={s.stateBody}>Select your location to see professional support available to you.</Text>
          <TouchableOpacity style={s.stateBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
            <Text style={s.stateBtnText}>Choose a city</Text>
          </TouchableOpacity>
        </View>
        <CityPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
      </>
    );
  }

  // no_local_or_online_support — §8: only interpolate a city we actually
  // trust (the same #019 activeLabel every other surface uses); otherwise
  // "your area", never a manufactured or guessed city.
  const cityBit = activeLabel ? ` in ${activeLabel}` : ' in your area';
  return (
    <>
      <View style={s.stateCard}>
        <Ionicons name="map-outline" size={22} color={palette.blue600} />
        <Text style={s.stateTitle}>Not available{cityBit} yet</Text>
        <Text style={s.stateBody}>
          We don’t currently have {professionalNoun} available in your area. You can still use {continueWithNoun} in the meantime.
        </Text>
        <TouchableOpacity style={s.stateBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
          <Text style={s.stateBtnText}>Explore another city</Text>
        </TouchableOpacity>
      </View>
      <CityPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}

// ── The gate ─────────────────────────────────────────────────────────────
export function MarketplaceGate({
  children,
  /** copy tweak for the unsupported state, e.g. "bookable classes" */
  supplyNoun = 'bookable gyms, trainers or wellness partners',
  /** when true, resolve location as soon as this mounts and prompt for GPS
   *  the first time (Discover). A background surface passes false. */
  autoResolve = true,
}: {
  children: ReactNode;
  supplyNoun?: string;
  autoResolve?: boolean;
}) {
  const { resolution, availability, queryFailed, ensureResolved } = useMarketplaceLocation();

  useEffect(() => {
    if (autoResolve) ensureResolved({ requestPermission: true });
  }, [autoResolve, ensureResolved]);

  // Still resolving and nothing to show yet.
  if (resolution !== 'ready' && !availability && !queryFailed) {
    return <View style={s.centre}><ActivityIndicator color={palette.blue500} /></View>;
  }

  // Available (incl. stale-but-available while a refetch failed) → real content.
  if (availability?.status === 'available') {
    return <>{children}</>;
  }

  return <MarketplaceUnavailableNotice supplyNoun={supplyNoun} />;
}

const s = StyleSheet.create({
  centre: { paddingVertical: 48, alignItems: 'center' },

  exploring: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.blue50, borderRadius: radii.lg,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14,
  },
  exploringText: { fontSize: fontSize.sm, color: palette.ink700 },
  exploringCity: { fontWeight: '800', color: palette.blue600 },
  exploringAction: { fontSize: fontSize.sm, fontWeight: '700', color: palette.blue600 },

  stateCard: {
    alignItems: 'center',
    backgroundColor: palette.surfaceMuted, borderRadius: radii.xl,
    paddingVertical: 28, paddingHorizontal: 22, gap: 8, marginVertical: 8,
  },
  stateTitle: { fontSize: fontSize.lg, fontWeight: '800', color: palette.ink900, textAlign: 'center', marginTop: 4 },
  stateBody: { fontSize: fontSize.sm, color: palette.gray450, textAlign: 'center', lineHeight: 20 },
  stateBtn: {
    marginTop: 12, backgroundColor: palette.ink900, borderRadius: radii.lg,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  stateBtnText: { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },

  modal: { flex: 1, backgroundColor: palette.white },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '800', color: palette.ink900 },
  modalBody: { padding: 20 },
  modalSection: {
    fontSize: 11, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase',
    letterSpacing: 0.6, marginTop: 20, marginBottom: 6,
  },
  modalEmpty: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 16 },
  cityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  cityRowLabel: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink900 },
  cityRowHint: { fontSize: fontSize.xs, color: palette.gray450 },
});
