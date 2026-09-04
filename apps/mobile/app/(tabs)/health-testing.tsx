import { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { palette, radii } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMarketplaceLocation } from '@/contexts/marketplace-location-context';
import { CityPickerModal } from '@/components/marketplace/marketplace-gate';
import {
  resolveHealthTestingAvailability, healthTestingBody, HEALTH_TESTING_COPY,
} from '@/lib/health-testing-availability';

export default function HealthTestingScreen() {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Beta #019C — reuse #019's location (device or manually explored). Never
  // request GPS here (§6/§12) — this tab isn't a location-relevant surface;
  // if #019 already has a location we use its label, otherwise neutral copy.
  const ml = useMarketplaceLocation();
  useEffect(() => { ml.ensureResolved({ requestPermission: false }); }, [ml]);

  const resolving = ml.resolution !== 'ready' && !ml.activeLabel;
  // Health testing is its OWN capability — it does NOT read ml.availability
  // (that's bookable-gym supply). Testing has no provider model yet, so this
  // is 'coming_soon' wherever a location is known, 'location_unknown' when not.
  const { status, locationLabel } = resolveHealthTestingAvailability({
    locationLabel: ml.activeLabel,
    hasLocation: !!ml.activeLabel,
    queryFailed: ml.queryFailed && ml.resolution === 'ready' && !ml.activeLabel,
  });

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.header}>
        {router.canGoBack() && (
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Health Testing</ThemedText>
        </View>
      </SafeAreaView>

      <View style={s.content}>
        {resolving ? (
          <ActivityIndicator color={palette.blue500} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={s.card}>
              <ThemedText style={s.cardEyebrow}>{HEALTH_TESTING_COPY.eyebrow}</ThemedText>
              <ThemedText style={s.cardTitle}>{HEALTH_TESTING_COPY.title}</ThemedText>
              <ThemedText style={s.cardBody}>{healthTestingBody(status, locationLabel)}</ThemedText>

              {status === 'location_unknown' && (
                <TouchableOpacity style={s.cta} activeOpacity={0.85} onPress={() => setPickerOpen(true)}>
                  <ThemedText style={s.ctaText}>Choose a city</ThemedText>
                </TouchableOpacity>
              )}
              {status === 'error' && (
                <TouchableOpacity style={s.cta} activeOpacity={0.85} onPress={() => ml.retry()}>
                  <ThemedText style={s.ctaText}>Retry</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            {status !== 'error' && status !== 'location_unknown' && (
              <View style={s.notice}>
                <Ionicons name="information-circle-outline" size={18} color={palette.gray450} />
                <ThemedText style={s.noticeText}>{HEALTH_TESTING_COPY.comingSoonNotice}</ThemedText>
              </View>
            )}
          </>
        )}
      </View>

      <CityPickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },

  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },

  card: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii['2xl'],
    padding: 20,
    marginBottom: 16,
  },
  cardEyebrow: {
    fontSize: 12, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: palette.ink700 },
  cardBody: { fontSize: 14, color: palette.ink600, marginTop: 6, lineHeight: 20 },

  cta: {
    alignSelf: 'flex-start', marginTop: 14,
    backgroundColor: palette.ink900, borderRadius: radii.lg,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  ctaText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 12, alignSelf: 'stretch',
  },
  noticeText: { flex: 1, fontSize: 13, color: palette.gray450 },
});
