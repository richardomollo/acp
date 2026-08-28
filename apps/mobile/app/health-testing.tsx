import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HealthTestingScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.root}>
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.headerTitle}>Health Testing</ThemedText>
          </View>
        </SafeAreaView>

        <View style={s.content}>
          <View style={s.iconWrap}>
            <Ionicons name="flask-outline" size={40} color={palette.blue600} />
          </View>
          <ThemedText style={s.title}>
            Comprehensive health insights through lab testing
          </ThemedText>
          <ThemedText style={s.desc}>
            All tests are processed by certified laboratories, with home collection
            available in Nairobi, Mombasa, and Kisumu.
          </ThemedText>

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

  content: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 },
  iconWrap: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: palette.blue50,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: palette.ink900, textAlign: 'center', marginBottom: 10 },
  desc: { fontSize: 14, color: palette.gray450, textAlign: 'center', lineHeight: 20, marginBottom: 32 },

  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 12, alignSelf: 'stretch',
  },
  noticeText: { flex: 1, fontSize: 13, color: palette.gray450 },
});
