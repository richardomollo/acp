import {
  StyleSheet, View, ScrollView, TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { palette, radii, fontSize } from '@/constants/theme';

type PT = {
  id: string;
  full_name: string;
  professional_name: string | null;
  photo_url: string | null;
  cover_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  years_of_experience: number | null;
  certifications: string[];
  specialisations: string[];
  languages: string[];
  training_locations: string[];
  session_types: string[];
  service_areas: string[];
  is_certified_verified: boolean;
};

type Offering = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  duration_minutes: number;
  price_kes: number | null;
  max_participants: number;
  is_programme: boolean;
  programme_weeks: number | null;
  programme_price_kes: number | null;
  intro_price_kes: number | null;
  image_url: string | null;
};

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  users: { full_name: string | null } | null;
};

const TYPE_LABELS: Record<string, string> = {
  '1-on-1': '1-on-1', group: 'Group', online: 'Online',
  outdoor: 'Outdoor', 'home-visit': 'Home-visit', 'drop-in': 'Drop-in',
};

const TYPE_ICONS: Record<string, string> = {
  '1-on-1': 'person-outline', group: 'people-outline', online: 'videocam-outline',
  outdoor: 'sunny-outline', 'home-visit': 'home-outline', 'drop-in': 'enter-outline',
};
const offeringIcon = (type: string) => TYPE_ICONS[type] ?? 'barbell-outline';

export default function TrainerProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [pt, setPt] = useState<PT | null>(null);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'about' | 'sessions'>('sessions');

  useEffect(() => {
    load();
  }, [id]);

  const load = async () => {
    const [{ data: ptData }, { data: offerData }, { data: reviewData }] = await Promise.all([
      supabase.from('personal_trainers').select('*').eq('id', id).single(),
      supabase.from('pt_offerings').select('id, title, description, type, duration_minutes, price_kes, max_participants, is_programme, programme_weeks, programme_price_kes, intro_price_kes, image_url')
        .eq('pt_id', id).eq('is_active', true).eq('is_draft', false).order('price_kes', { ascending: true }),
      supabase.from('pt_reviews').select('id, rating, comment, created_at, users(full_name)')
        .eq('pt_id', id).order('created_at', { ascending: false }).limit(5),
    ]);

    if (ptData) setPt(ptData as any);
    if (offerData) setOfferings(offerData as any);
    if (reviewData) {
      setReviews(reviewData as any);
      if (reviewData.length) {
        const avg = reviewData.reduce((s, r) => s + r.rating, 0) / reviewData.length;
        setAvgRating(Math.round(avg * 10) / 10);
      }
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={palette.blue500} />
      </View>
    );
  }
  if (!pt) return null;

  const displayName = pt.professional_name ?? pt.full_name;

  return (
    <View style={styles.container}>
      {/* Back button — fixed over cover */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color={palette.white} />
      </TouchableOpacity>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        stickyHeaderIndices={[2]}
      >
        {/* 0: Cover photo */}
        <View style={styles.cover}>
          {pt.cover_url ? (
            <Image source={{ uri: pt.cover_url }} style={styles.coverImg} contentFit="cover" />
          ) : (
            <View style={styles.coverFallback} />
          )}
          <View style={styles.coverOverlay} />
        </View>

        {/* 1: Hero — overlaps cover with rounded top corners */}
        <View style={styles.hero}>
          <View style={styles.heroAvatarWrap}>
            {pt.photo_url ? (
              <Image source={{ uri: pt.photo_url }} style={styles.heroAvatar} contentFit="cover" />
            ) : (
              <View style={styles.heroAvatarFallback}>
                <ThemedText style={styles.heroAvatarInitial}>{displayName[0].toUpperCase()}</ThemedText>
              </View>
            )}
            {pt.is_certified_verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={18} color={palette.blue500} />
              </View>
            )}
          </View>

          <ThemedText style={styles.heroName}>{displayName}</ThemedText>
          {pt.professional_name && (
            <ThemedText style={styles.heroSubName}>{pt.full_name}</ThemedText>
          )}

          <View style={styles.heroMeta}>
            {avgRating && (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color={palette.warning500} />
                <ThemedText style={styles.ratingText}>
                  {avgRating} · {reviews.length} review{reviews.length !== 1 ? 's' : ''}
                </ThemedText>
              </View>
            )}
            {pt.years_of_experience && (
              <ThemedText style={styles.heroMetaText}>· {pt.years_of_experience} yrs experience</ThemedText>
            )}
          </View>

          <View style={styles.badgesRow}>
            {pt.training_locations.map(loc => (
              <View key={loc} style={styles.badge}>
                <Ionicons name="location-outline" size={11} color={palette.gray450} />
                <ThemedText style={styles.badgeText}>{loc}</ThemedText>
              </View>
            ))}
          </View>
          <View style={styles.badgesRow}>
            {pt.languages.map(l => (
              <View key={l} style={styles.badge}>
                <Ionicons name="chatbubble-outline" size={11} color={palette.gray450} />
                <ThemedText style={styles.badgeText}>{l}</ThemedText>
              </View>
            ))}
            {pt.is_certified_verified && (
              <View style={[styles.badge, styles.badgeVerified]}>
                <Ionicons name="checkmark-circle" size={11} color={palette.blue500} />
                <ThemedText style={[styles.badgeText, { color: palette.blue500 }]}>REPs Verified</ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* 2: Tab bar (sticky) */}
        <View style={styles.tabBarWrap}>
          <View style={styles.segmentBar}>
            <TouchableOpacity
              style={[styles.segment, activeTab === 'about' && styles.segmentActive]}
              onPress={() => setActiveTab('about')}
            >
              <ThemedText style={[styles.segmentText, activeTab === 'about' && styles.segmentTextActive]}>About</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, activeTab === 'sessions' && styles.segmentActive]}
              onPress={() => setActiveTab('sessions')}
            >
              <ThemedText style={[styles.segmentText, activeTab === 'sessions' && styles.segmentTextActive]}>Sessions</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3: Tab content */}
        <View>
          {activeTab === 'about' ? (
            <>
              {/* Specialisations */}
              <Section title="Specialises in">
                <View style={styles.tagsRow}>
                  {pt.specialisations.map(s => (
                    <View key={s} style={styles.specTag}>
                      <ThemedText style={styles.specTagText}>{s}</ThemedText>
                    </View>
                  ))}
                </View>
              </Section>

              {/* Certifications */}
              {pt.certifications.length > 0 && (
                <Section title="Certifications">
                  <View style={styles.tagsRow}>
                    {pt.certifications.map(c => (
                      <View key={c} style={[styles.specTag, pt.is_certified_verified && styles.specTagVerified]}>
                        {pt.is_certified_verified && <Ionicons name="checkmark" size={11} color={palette.blue500} />}
                        <ThemedText style={[styles.specTagText, pt.is_certified_verified && { color: palette.blue500 }]}>{c}</ThemedText>
                      </View>
                    ))}
                  </View>
                </Section>
              )}

              {/* Bio */}
              {pt.bio && (
                <Section title="About">
                  <ThemedText style={styles.bioText}>{pt.bio}</ThemedText>
                </Section>
              )}

              {/* Reviews */}
              {reviews.length > 0 && (
                <Section title={`Reviews (${reviews.length})`}>
                  {avgRating && (
                    <View style={styles.avgRatingRow}>
                      <ThemedText style={styles.avgRatingNum}>{avgRating}</ThemedText>
                      <View>
                        <View style={styles.starsRow}>
                          {[1,2,3,4,5].map(i => (
                            <Ionicons key={i} name="star" size={14}
                              color={i <= Math.round(avgRating) ? palette.warning500 : palette.border} />
                          ))}
                        </View>
                        <ThemedText style={styles.avgRatingSub}>{reviews.length} reviews</ThemedText>
                      </View>
                    </View>
                  )}
                  {reviews.map(r => (
                    <View key={r.id} style={styles.reviewCard}>
                      <View style={styles.reviewHeader}>
                        <ThemedText style={styles.reviewerName}>
                          {(r.users as any)?.full_name ?? 'Client'}
                        </ThemedText>
                        <View style={styles.starsRow}>
                          {[1,2,3,4,5].map(i => (
                            <Ionicons key={i} name="star" size={12}
                              color={i <= r.rating ? palette.warning500 : palette.border} />
                          ))}
                        </View>
                      </View>
                      {r.comment && <ThemedText style={styles.reviewComment}>{r.comment}</ThemedText>}
                      <ThemedText style={styles.reviewDate}>
                        {new Date(r.created_at).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}
                      </ThemedText>
                    </View>
                  ))}
                </Section>
              )}
            </>
          ) : (
            /* Sessions tab */
            <View style={styles.sessionsList}>
              {offerings.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={palette.gray200} />
                  <ThemedText style={styles.emptyText}>No sessions listed yet</ThemedText>
                </View>
              ) : (
                offerings.map(o => {
                  const price = o.is_programme
                    ? o.programme_price_kes ?? 0
                    : o.price_kes ?? 0;
                  const subPrice = o.is_programme
                    ? (o.intro_price_kes ?? null)
                    : null;

                  return (
                    <TouchableOpacity
                      key={o.id}
                      style={styles.sessionRow}
                      activeOpacity={0.85}
                      onPress={() => router.push({ pathname: '/pt-session-details', params: { offeringId: o.id, ptId: id } })}
                    >
                      {/* Thumbnail */}
                      <View style={styles.sessionThumb}>
                        {o.image_url ? (
                          <Image source={{ uri: o.image_url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                        ) : (
                          <View style={[StyleSheet.absoluteFillObject, styles.sessionThumbFallback]}>
                            <Ionicons name={offeringIcon(o.type) as any} size={22} color="rgba(255,255,255,0.9)" />
                          </View>
                        )}
                      </View>

                      {/* Info */}
                      <View style={styles.sessionInfo}>
                        <View style={styles.sessionBadges}>
                          <View style={[styles.catChip, o.is_programme && styles.catChipProgramme]}>
                            <Ionicons
                              name={o.is_programme ? 'calendar-outline' : offeringIcon(o.type) as any}
                              size={11}
                              color={o.is_programme ? '#4f46e5' : palette.gray450}
                            />
                            <ThemedText style={[styles.catChipText, o.is_programme && styles.catChipTextProgramme]}>
                              {o.is_programme ? `${o.programme_weeks ? `${o.programme_weeks}W ` : ''}Programme` : (TYPE_LABELS[o.type] ?? o.type)}
                            </ThemedText>
                          </View>
                        </View>
                        <ThemedText style={styles.sessionName} numberOfLines={1}>{o.title}</ThemedText>
                        <View style={styles.sessionMeta}>
                          {o.is_programme ? (
                            <>
                              <Ionicons name="calendar-outline" size={12} color={palette.gray450} />
                              <ThemedText style={styles.metaText}>{o.programme_weeks} weeks</ThemedText>
                            </>
                          ) : (
                            <>
                              <Ionicons name="time-outline" size={12} color={palette.gray450} />
                              <ThemedText style={styles.metaText}>
                                {o.duration_minutes} min{o.max_participants > 1 ? ` · up to ${o.max_participants}` : ''}
                              </ThemedText>
                            </>
                          )}
                        </View>
                      </View>

                      {/* Price */}
                      <View style={styles.sessionPrice}>
                        <ThemedText style={styles.priceAmount}>KES {price.toLocaleString()}</ThemedText>
                        {subPrice != null && (
                          <ThemedText style={styles.priceSub}>Intro {subPrice.toLocaleString()}</ThemedText>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white },
  container: { flex: 1, backgroundColor: palette.white },
  backBtn: {
    position: 'absolute', top: 56, left: 20, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  cover: { height: 220, position: 'relative' },
  coverImg: { width: '100%', height: '100%' },
  coverFallback: { flex: 1, backgroundColor: '#1a1a2e' },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  hero: {
    alignItems: 'center', paddingBottom: 20, paddingHorizontal: 20, paddingTop: 0,
    marginTop: -24, backgroundColor: palette.white,
    borderTopLeftRadius: radii['2xl'], borderTopRightRadius: radii['2xl'],
  },
  heroAvatarWrap: {
    marginTop: -52, marginBottom: 12, position: 'relative',
    width: 100, height: 100,
  },
  heroAvatar: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, borderColor: palette.white,
  },
  heroAvatarFallback: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: palette.blue50, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: palette.white,
  },
  heroAvatarInitial: { fontSize: 38, fontWeight: '800', color: palette.blue500 },
  verifiedBadge: {
    position: 'absolute', bottom: 2, right: 2,
    backgroundColor: palette.white, borderRadius: 12, padding: 1,
  },
  heroName: { fontSize: fontSize['2xl'], fontWeight: '800', color: palette.ink900, textAlign: 'center' },
  heroSubName: { fontSize: fontSize.base, color: palette.gray300, marginTop: 2 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontSize: fontSize.sm, fontWeight: '700', color: '#92400e' },
  heroMetaText: { fontSize: fontSize.sm, color: palette.gray450 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: palette.surfaceMuted, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radii.lg, borderWidth: 1, borderColor: palette.border,
  },
  badgeVerified: { backgroundColor: palette.blue50, borderColor: palette.blue100 },
  badgeText: { fontSize: fontSize.xs, color: palette.gray450, fontWeight: '500' },
  section: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: palette.hairline },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink900, marginBottom: 12 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  specTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.xl,
    backgroundColor: palette.surfaceMuted, borderWidth: 1, borderColor: palette.border,
  },
  specTagVerified: { backgroundColor: palette.blue50, borderColor: palette.blue100 },
  specTagText: { fontSize: fontSize.sm, color: palette.ink600, fontWeight: '500' },
  bioText: { fontSize: fontSize.base, color: palette.ink600, lineHeight: 24 },
  sessionsList: { paddingHorizontal: 20, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.hairline },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: fontSize.base, color: palette.gray300 },

  // RowCard-style session rows
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  sessionThumb: { width: 84, height: 84, borderRadius: radii.md, overflow: 'hidden', flexShrink: 0 },
  sessionThumbFallback: { backgroundColor: palette.blue500, justifyContent: 'center', alignItems: 'center' },
  sessionInfo: { flex: 1, gap: 4 },
  sessionBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: palette.surfaceMuted, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4, flexShrink: 1,
  },
  catChipProgramme: { backgroundColor: '#eef2ff' },
  catChipText: { fontSize: 11, fontWeight: '500', color: palette.gray450, flexShrink: 1 },
  catChipTextProgramme: { color: '#4f46e5', fontWeight: '700' },
  sessionName: { fontSize: 15.5, fontWeight: '700', color: palette.ink900 },
  sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: fontSize.xs, color: palette.gray450 },
  sessionPrice: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  priceAmount: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink900 },
  priceSub: { fontSize: 10, color: palette.gray300 },
  avgRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avgRatingNum: { fontSize: 40, fontWeight: '800', color: palette.ink900 },
  starsRow: { flexDirection: 'row', gap: 2 },
  avgRatingSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 2 },
  reviewCard: {
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reviewerName: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink900 },
  reviewComment: { fontSize: fontSize.base, color: palette.ink600, lineHeight: 20, marginBottom: 4 },
  reviewDate: { fontSize: fontSize.xs, color: palette.gray300 },
  tabBarWrap: { backgroundColor: palette.white, paddingVertical: 12 },
  segmentBar: {
    flexDirection: 'row', marginHorizontal: 20,
    backgroundColor: palette.hairline, borderRadius: radii.md, padding: 4,
  },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  segmentActive: {
    backgroundColor: palette.white,
    shadowColor: palette.ink900, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
  },
  segmentText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray300 },
  segmentTextActive: { color: palette.ink900 },
});
