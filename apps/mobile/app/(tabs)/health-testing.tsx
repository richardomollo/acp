import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { palette, radii } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HealthTestingScreen() {
  const router = useRouter();

  return (
    <>
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
          {/* Moved here from the Home screen — the intro to Health Testing
              now lives at the top of this page. */}
          <View style={s.card}>
            <ThemedText style={s.cardEyebrow}>Health Testing</ThemedText>
            <ThemedText style={s.cardTitle}>
              Comprehensive health insights through lab testing
            </ThemedText>
            <ThemedText style={s.cardBody}>
              Hormone Panel and Nutritional Deficiency Tests processed by certified laboratories
              with home collection available in Nairobi, Mombasa, and Kisumu.
            </ThemedText>
          </View>

          <View style={s.notice}>
            <Ionicons name="information-circle-outline" size={18} color={palette.gray450} />
            <ThemedText style={s.noticeText}>
              Booking is coming soon — check back shortly to schedule a test.
            </ThemedText>
          </View>
        </View>
      </View>
    </>
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

  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 12, alignSelf: 'stretch',
  },
  noticeText: { flex: 1, fontSize: 13, color: palette.gray450 },
});
