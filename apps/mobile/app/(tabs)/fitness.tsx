import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { palette, radii, fontSize, shadows } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface HubTile {
  key: string;
  route: string;
  title: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  iconColor?: string;
  emoji?: string;
}

const TILES: HubTile[] = [
  {
    key: 'nutrition',
    route: '/nutrition-hub',
    title: 'Nutrition Hub',
    subtitle: 'Kenyan meals, meal plans & nutritionist coaching',
    icon: '',
    emoji: '🥗',
    iconBg: palette.success50,
  },
  {
    key: 'workouts',
    route: '/workout-hub',
    title: 'Workout Hub',
    subtitle: 'Browse exercises, your workouts & trainer plans',
    icon: 'barbell-outline',
    iconBg: palette.blue25,
    iconColor: palette.blue500,
  },
  {
    key: 'outdoor',
    route: '/outdoor-activities',
    title: 'Outdoor Activities',
    subtitle: 'Runs, walks & rides synced from Strava',
    icon: 'walk-outline',
    iconBg: '#fff1eb',
    iconColor: '#FC4C02',
  },
  {
    key: 'challenges',
    route: '/challenges',
    title: 'Challenges',
    subtitle: 'Compete against yourself this month',
    icon: 'trophy-outline',
    iconBg: palette.warning100,
    iconColor: palette.warning700,
  },
  {
    key: 'history',
    route: '/workout-history',
    title: 'Workout History',
    subtitle: 'Your completed sessions',
    icon: 'time-outline',
    iconBg: palette.surfaceMuted,
    iconColor: palette.ink900,
  },
  {
    key: 'journey',
    route: '/fitness-journey',
    title: 'Fitness Journey',
    subtitle: 'Streaks, achievements, goals & body stats',
    icon: 'stats-chart-outline',
    iconBg: palette.blue25,
    iconColor: palette.blue500,
  },
  {
    key: 'discover',
    route: '/(tabs)/discover',
    title: 'Discover',
    subtitle: 'Find gyms, classes, trainers & experiences near you',
    icon: 'search-outline',
    iconBg: palette.navy + '1a',
    iconColor: palette.navy,
  },
];

export default function FitnessScreen() {
  const router = useRouter();

  return (
    <View style={s.root}>
      <View style={s.header}>
        <ThemedText style={s.headerTitle}>Fitness Hub</ThemedText>
        <ThemedText style={s.headerSub}>Everything you need to stay active</ThemedText>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {TILES.map(tile => (
          <TouchableOpacity
            key={tile.key}
            style={s.tile}
            onPress={() => router.push(tile.route as any)}
            activeOpacity={0.85}
          >
            <View style={[s.tileIcon, { backgroundColor: tile.iconBg }]}>
              {tile.emoji ? (
                <ThemedText style={{ fontSize: 20 }}>{tile.emoji}</ThemedText>
              ) : (
                <Ionicons name={tile.icon as any} size={22} color={tile.iconColor ?? palette.ink900} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={s.tileTitle}>{tile.title}</ThemedText>
              <ThemedText style={s.tileSub}>{tile.subtitle}</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
          </TouchableOpacity>
        ))}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    backgroundColor: palette.white,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.56, color: palette.ink900, paddingTop: 10 },
  headerSub: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2 },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  tile: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: radii.xl, borderWidth: 1,
    borderColor: palette.hairline, backgroundColor: palette.white,
    padding: 16, marginBottom: 14, ...shadows.sm,
  },
  tileIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  tileTitle: { fontSize: 15, fontWeight: '800', color: palette.ink900 },
  tileSub: { fontSize: 12, color: palette.gray300, marginTop: 2 },
});
