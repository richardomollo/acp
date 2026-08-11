import { TourOverlay, type TourStep } from '@/components/tour-overlay';
import { useTour } from '@/hooks/use-tour';
import {
  StyleSheet, View, ScrollView, TouchableOpacity, Image, Dimensions,
  Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { palette, radii, shadows, fontSize } from '@/constants/theme';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@/services/auth';
import { useAuthModal } from '@/contexts/auth-modal-context';

const W = Dimensions.get('window').width;
const CW = W - 40; // content width (20px padding each side)

type TabKey = 'venues' | 'classes' | 'trainers' | 'experiences' | 'communities';

const TABS: { key: TabKey; label: string; icon: string; route: string }[] = [
  { key: 'venues',      label: 'Venues',      icon: 'business-outline', route: '/(tabs)/venues'      },
  { key: 'classes',     label: 'Classes',     icon: 'calendar-outline', route: '/(tabs)/classes'     },
  { key: 'trainers',    label: 'Trainers',    icon: 'body-outline',     route: '/(tabs)/trainers'    },
  { key: 'experiences', label: 'Experiences', icon: 'sparkles-outline', route: '/(tabs)/experiences' },
  { key: 'communities', label: 'Communities', icon: 'people-outline',   route: '/(tabs)/communities' },
];

const BROWSE_CARD_BG: Record<TabKey, string> = {
  venues:      palette.blue500,
  classes:     palette.navy,
  trainers:    palette.success700,
  experiences: palette.warning700,
  communities: '#7c3aed',
};

interface SessionCategory {
  id: string;
  name: string;
  emoji: string | null;
  image_url: string | null;
}

interface SearchSession {
  id: string; name: string; date: string; drop_in_price?: number | null;
  image_url: string | null; gyms: { name: string; deposit_pct?: number | null } | null;
}
interface SearchGym {
  id: string; name: string; location: string; image_url: string | null;
}
interface SearchExperience {
  id: string; name: string; tagline: string | null; category: string | null;
  price_kes: number; discount_kes: number; image_url: string | null;
}
interface SearchTrainer {
  id: string; full_name: string; professional_name: string | null;
  photo_url: string | null; specialisations: string[];
}

function sessionDeposit(session: SearchSession) {
  const total = Number(session.drop_in_price) || 0;
  const pct = session.gyms?.deposit_pct ?? 30;
  const deposit = Math.round(total * pct / 100);
  return { deposit };
}

// ─── Tour ─────────────────────────────────────────────────────────────────────

const DISCOVER_TOUR: TourStep[] = [
  { icon: 'compass-outline', title: 'Your Discovery Hub', description: 'Browse venues, classes, trainers, and experiences — all from one place.' },
  { icon: 'options-outline', title: 'Find Your Fit', description: 'Tap a card to open that category, where you can filter and search in more detail.' },
  { icon: 'person-outline', title: 'Find a Personal Trainer', description: 'Tap Trainers to browse certified coaches — see their specialisations, ratings, and pricing.' },
  { icon: 'ticket-outline', title: 'Discover Experiences', description: 'Tap Experiences for upcoming retreats, hikes, and wellness days. Secure your spot with a small deposit.' },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DiscoverScreen() {
  const router = useRouter();
  const { showAuthModal } = useAuthModal();
  const { visible: tourVisible, dismiss: dismissTour } = useTour('discover');
  const [cardImages, setCardImages] = useState<Record<TabKey, string | null>>({
    venues: null, classes: null, trainers: null, experiences: null, communities: null,
  });
  const [categories, setCategories] = useState<SessionCategory[]>([]);
  const [isGuest, setIsGuest] = useState(true);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    sessions: SearchSession[]; gyms: SearchGym[]; experiences: SearchExperience[]; trainers: SearchTrainer[];
  }>({ sessions: [], gyms: [], experiences: [], trainers: [] });
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults({ sessions: [], gyms: [], experiences: [], trainers: [] });
      return;
    }
    setSearchLoading(true);
    try {
      const term = `%${q.trim()}%`;
      const [sessRes, gymRes, expRes, ptRes] = await Promise.all([
        supabase.from('sessions').select('id, name, date, drop_in_price, image_url, gyms(name, deposit_pct)').ilike('name', term).limit(5),
        supabase.from('gyms').select('id, name, location, image_url').ilike('name', term).limit(4),
        supabase.from('experiences').select('id, name, tagline, category, price_kes, discount_kes, image_url').ilike('name', term).limit(4),
        supabase.from('personal_trainers').select('id, full_name, professional_name, photo_url, specialisations').ilike('full_name', term).eq('status', 'approved').limit(4),
      ]);
      setSearchResults({
        sessions: (sessRes.data ?? []) as any,
        gyms: (gymRes.data ?? []) as any,
        experiences: (expRes.data ?? []) as any,
        trainers: (ptRes.data ?? []) as any,
      });
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(q), 350);
  };

  const closeSearch = () => {
    setSearchVisible(false);
    setSearchQuery('');
    setSearchResults({ sessions: [], gyms: [], experiences: [], trainers: [] });
    if (searchTimer.current) clearTimeout(searchTimer.current);
  };

  useEffect(() => {
    (async () => {
      const session = await authService.getSession();
      setIsGuest(!session?.user);
    })();

    (async () => {
      const [{ data: gym }, { data: session }, { data: pt }, { data: exp }, { data: community }] = await Promise.all([
        supabase.from('gyms').select('image_url').eq('is_active', true).not('image_url', 'is', null).limit(1).maybeSingle(),
        supabase.from('sessions').select('image_url').not('image_url', 'is', null).order('date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('personal_trainers').select('photo_url').eq('status', 'approved').not('photo_url', 'is', null).limit(1).maybeSingle(),
        supabase.from('experiences').select('image_url').not('image_url', 'is', null).order('date', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('communities').select('logo_url').eq('review_status', 'approved').eq('is_active', true).not('logo_url', 'is', null).limit(1).maybeSingle(),
      ]);
      setCardImages({
        venues: (gym as any)?.image_url ?? null,
        classes: (session as any)?.image_url ?? null,
        trainers: (pt as any)?.photo_url ?? null,
        experiences: (exp as any)?.image_url ?? null,
        communities: (community as any)?.logo_url ?? null,
      });
    })();

    (async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const [{ data: cats }, { data: sessionCats }] = await Promise.all([
        supabase
          .from('session_categories')
          .select('id, name, emoji, image_url')
          .not('image_url', 'is', null)
          .order('sort_order', { ascending: true }),
        supabase
          .from('sessions')
          .select('category')
          .not('category', 'is', null)
          .gte('date', todayStr),
      ]);
      const activeCategoryNames = new Set(
        (sessionCats ?? []).map((s: any) => (s.category as string).toLowerCase())
      );
      const withItems = ((cats as SessionCategory[]) ?? []).filter(c =>
        activeCategoryNames.has(c.name.toLowerCase())
      );
      setCategories(withItems);
    })();
  }, []);

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <ThemedText style={s.headerTitle}>Discover</ThemedText>
        <TouchableOpacity style={s.headerSearchBtn} onPress={() => setSearchVisible(true)} activeOpacity={0.8}>
          <Ionicons name="search" size={16} color={palette.gray300} />
          <ThemedText style={s.headerSearchPlaceholder}>Search classes, gyms, trainers...</ThemedText>
        </TouchableOpacity>
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={s.browseTitle}>Browse all</ThemedText>
        <View style={s.browseGrid}>
          {TABS.map(t => {
            const imageUrl = cardImages[t.key];
            return (
              <TouchableOpacity
                key={t.key}
                style={[s.browseCard, { backgroundColor: BROWSE_CARD_BG[t.key] }]}
                onPress={() => router.push(t.route as any)}
                activeOpacity={0.9}
              >
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : null}
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.6)']}
                  style={[StyleSheet.absoluteFill, { top: '30%' }]}
                />
                <View style={s.browseCardIconWrap}>
                  <Ionicons name={t.icon as any} size={16} color="#fff" />
                </View>
                <ThemedText style={s.browseCardLabel}>{t.label}</ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>

        {categories.length > 0 && (
          <>
            <ThemedText style={s.categoriesTitle}>Top categories</ThemedText>
            <View style={s.categoriesGrid}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={s.categoryRow}
                  activeOpacity={0.8}
                  onPress={() => router.push({ pathname: '/(tabs)/classes', params: { category: cat.name } } as any)}
                >
                  <Image source={{ uri: cat.image_url! }} style={s.categoryThumb} resizeMode="cover" />
                  <ThemedText style={s.categoryLabel} numberOfLines={1}>{cat.name}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ─── My Journey CTA (fitness + nutrition, merged) ─── */}
        <ThemedText style={s.journeyTitle}>Fitness & Nutrition</ThemedText>
        <TouchableOpacity
          style={s.journeyCta}
          onPress={() => isGuest
            ? showAuthModal(undefined, { defaultTab: 'signup' })
            : router.push('/fitness-journey' as any)
          }
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[palette.blue500, palette.success700]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.journeyCtaGrad}
          >
            <View style={s.journeyCtaIcon}>
              <Ionicons name="trophy-outline" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={s.journeyCtaTitle}>My Journey</ThemedText>
              <ThemedText style={s.journeyCtaSub}>
                {isGuest ? 'Sign up to track your progress' : 'Workouts, meals, streaks & achievements'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <TourOverlay visible={tourVisible} steps={DISCOVER_TOUR} onDismiss={dismissTour} />

      {/* ─── Search Modal ─── */}
      <Modal visible={searchVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSearch}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.searchModal}>
          <View style={s.searchHeader}>
            <TouchableOpacity onPress={closeSearch} style={s.searchBackBtn}>
              <Ionicons name="arrow-back" size={22} color={palette.ink900} />
            </TouchableOpacity>
            <TextInput
              style={s.searchModalInput}
              placeholder="Search classes, gyms, trainers..."
              placeholderTextColor={palette.gray300}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {searchLoading && <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue500} />}

            {!searchLoading && searchQuery.trim().length >= 2
              && searchResults.sessions.length === 0 && searchResults.gyms.length === 0
              && searchResults.experiences.length === 0 && searchResults.trainers.length === 0 && (
              <View style={s.searchEmpty}>
                <Ionicons name="search-outline" size={40} color={palette.gray300} />
                <ThemedText style={s.searchEmptyText}>No results for &quot;{searchQuery}&quot;</ThemedText>
              </View>
            )}

            {searchResults.sessions.length > 0 && (
              <View>
                <ThemedText style={s.searchSectionLabel}>Classes</ThemedText>
                {searchResults.sessions.map(session => {
                  const { deposit } = sessionDeposit(session);
                  return (
                    <TouchableOpacity key={session.id} style={s.searchResultRow}
                      onPress={() => { closeSearch(); router.push({ pathname: '/session-details', params: { sessionId: session.id } }); }}>
                      {session.image_url
                        ? <Image source={{ uri: session.image_url }} style={s.searchThumb} />
                        : <View style={[s.searchThumb, s.searchThumbFallback]}><Ionicons name="fitness" size={20} color="rgba(255,255,255,0.5)" /></View>}
                      <View style={{ flex: 1 }}>
                        <ThemedText style={s.searchResultName} numberOfLines={1}>{session.name}</ThemedText>
                        <ThemedText style={s.searchResultSub} numberOfLines={1}>
                          {session.gyms?.name} · {new Date(session.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} · KES {deposit.toLocaleString()} deposit
                        </ThemedText>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {searchResults.gyms.length > 0 && (
              <View>
                <ThemedText style={s.searchSectionLabel}>Venues</ThemedText>
                {searchResults.gyms.map(gym => (
                  <TouchableOpacity key={gym.id} style={s.searchResultRow}
                    onPress={() => { closeSearch(); router.push({ pathname: '/gym-details', params: { gymId: gym.id } }); }}>
                    {gym.image_url
                      ? <Image source={{ uri: gym.image_url }} style={s.searchThumb} />
                      : <View style={[s.searchThumb, s.searchThumbFallback, { backgroundColor: palette.blue500 }]}><Ionicons name="business" size={20} color="rgba(255,255,255,0.5)" /></View>}
                    <View style={{ flex: 1 }}>
                      <ThemedText style={s.searchResultName} numberOfLines={1}>{gym.name}</ThemedText>
                      <ThemedText style={s.searchResultSub} numberOfLines={1}>{gym.location}</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {searchResults.experiences.length > 0 && (
              <View>
                <ThemedText style={s.searchSectionLabel}>Experiences</ThemedText>
                {searchResults.experiences.map(exp => (
                  <TouchableOpacity key={exp.id} style={s.searchResultRow}
                    onPress={() => { closeSearch(); router.push({ pathname: '/experience-details', params: { id: exp.id } } as any); }}>
                    {exp.image_url
                      ? <Image source={{ uri: exp.image_url }} style={s.searchThumb} />
                      : <View style={[s.searchThumb, s.searchThumbFallback]}><Ionicons name="sparkles" size={20} color="rgba(255,255,255,0.5)" /></View>}
                    <View style={{ flex: 1 }}>
                      <ThemedText style={s.searchResultName} numberOfLines={1}>{exp.name}</ThemedText>
                      <ThemedText style={s.searchResultSub} numberOfLines={1}>
                        {exp.tagline ?? exp.category} · KES {(Number(exp.price_kes) - (exp.discount_kes || 0)).toLocaleString()}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {searchResults.trainers.length > 0 && (
              <View>
                <ThemedText style={s.searchSectionLabel}>Trainers</ThemedText>
                {searchResults.trainers.map(pt => (
                  <TouchableOpacity key={pt.id} style={s.searchResultRow}
                    onPress={() => { closeSearch(); router.push({ pathname: '/trainer-profile', params: { id: pt.id } }); }}>
                    {pt.photo_url
                      ? <Image source={{ uri: pt.photo_url }} style={[s.searchThumb, { borderRadius: 24 }]} />
                      : <View style={[s.searchThumb, s.searchThumbFallback, { backgroundColor: palette.blue500, borderRadius: 24 }]}><Ionicons name="person" size={20} color="rgba(255,255,255,0.5)" /></View>}
                    <View style={{ flex: 1 }}>
                      <ThemedText style={s.searchResultName} numberOfLines={1}>{pt.professional_name ?? pt.full_name}</ThemedText>
                      <ThemedText style={s.searchResultSub} numberOfLines={1}>{pt.specialisations.slice(0, 2).join(' · ')}</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.white },

  header: {
    backgroundColor: palette.white,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
    paddingHorizontal: 20,
    paddingTop: 60,   // safe area + status bar
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28, fontWeight: '800', letterSpacing: -0.56, lineHeight: 36,
    color: palette.ink900,
  },

  content: { paddingHorizontal: 20, paddingTop: 16 },

  browseTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900, marginBottom: 14 },
  browseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  browseCard: {
    width: (CW - 12) / 2, height: Math.round((CW - 12) / 2 * 0.6),
    borderRadius: radii.xl, overflow: 'hidden',
    padding: 14, justifyContent: 'flex-end',
    ...shadows.sm,
  },
  browseCardIconWrap: {
    position: 'absolute', top: 12, right: 12,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  browseCardLabel: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },

  categoriesTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900, marginTop: 28, marginBottom: 14 },
  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  categoryRow: {
    width: (CW - 12) / 2,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.md, padding: 6, paddingRight: 12,
  },
  categoryThumb: { width: 48, height: 48, borderRadius: radii.md - 2 },
  categoryLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: palette.ink900 },

  // My Journey CTA (fitness + nutrition, merged)
  journeyTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, color: palette.ink900, marginTop: 28, marginBottom: 14 },
  journeyCta: {},
  journeyCtaGrad: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radii.xl, paddingHorizontal: 18, paddingVertical: 16 },
  journeyCtaIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  journeyCtaTitle: { fontSize: fontSize.lg, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  journeyCtaSub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.82)', marginTop: 2 },

  // Header search trigger
  headerSearchBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, backgroundColor: palette.surfaceMuted, borderRadius: radii.xl, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: palette.borderFaint },
  headerSearchPlaceholder: { fontSize: fontSize.base, color: palette.gray300, flex: 1 },

  // Search modal
  searchModal: { flex: 1, backgroundColor: palette.white },
  searchHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline, gap: 10 },
  searchBackBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  searchModalInput: { flex: 1, height: 42, backgroundColor: palette.surfaceMuted, borderRadius: radii.xl, paddingHorizontal: 16, fontSize: fontSize.base, color: palette.ink900, borderWidth: 1, borderColor: palette.borderFaint },
  searchSectionLabel: { fontSize: 11, fontWeight: '700', color: palette.gray300, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  searchThumb: { width: 48, height: 48, borderRadius: 10 },
  searchThumbFallback: { backgroundColor: palette.navy, alignItems: 'center', justifyContent: 'center' },
  searchResultName: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, letterSpacing: -0.2 },
  searchResultSub: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2 },
  searchEmpty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  searchEmptyText: { fontSize: fontSize.base, color: palette.gray300, textAlign: 'center' },
});
