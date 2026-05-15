import { StyleSheet, View, ScrollView, TouchableOpacity, Image, Dimensions, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.7;

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Gym {
  id: string;
  name: string;
  location: string;
  image_url: string | null;
  description: string | null;
}

interface Session {
  id: string;
  name: string;
  instructor: string | null;
  description: string | null;
  date: string;
  time: string;
  credits_required: number;
  image_url: string | null;
  gym_id: string;
  spots_left: number;
  gyms?: {
    name: string;
  };
}

interface Category {
  name: string;
  icon: string;
  color: string;
}

interface UserProfile {
  name: string;
  credits: number;
}

interface ActiveBooking {
  id: string;
  booking_date: string;
  booking_time: string;
  sessions: {
    name: string;
    gyms: {
      name: string;
    } | null;
  } | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const [isGuest, setIsGuest] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [nearTermSessions, setNearTermSessions] = useState<Session[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeBooking, setActiveBooking] = useState<ActiveBooking | null>(null);
  const [loading, setLoading] = useState(true);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // 1. Check auth status
      const authSession = await authService.getSession();
      
      if (authSession && authSession.user) {
        setIsGuest(false);
        
        // 2. Load user profile
        const { data: userData } = await supabase
          .from('users')
          .select('name, credits')
          .eq('id', authSession.user.id)
          .maybeSingle();
        
        if (userData) {
          setUser(userData);
        } else {
          setUser({
            name: authSession.user.user_metadata?.full_name || 'User',
            credits: 0
          });
        }

        // 3. Load most recent active booking for check-in
        const today = new Date().toISOString().split('T')[0];
        const { data: bookingData } = await supabase
          .from('bookings')
          .select(`
            id,
            booking_date,
            booking_time,
            sessions (
              name,
              gyms (
                name
              )
            )
          `)
          .eq('user_id', authSession.user.id)
          .eq('status', 'confirmed')
          .gte('booking_date', today)
          .order('booking_date', { ascending: true })
          .order('booking_time', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (bookingData) setActiveBooking(bookingData as any);
      } else {
        setIsGuest(true);
        setUser(null);
        setActiveBooking(null);
      }

      // 4. Load gyms
      const { data: gymsData } = await supabase
        .from('gyms')
        .select('id, name, location, image_url, description')
        .limit(5);

      if (gymsData) setGyms(gymsData);

      // 5. Load near-term upcoming sessions (next 3 days)
      const todayStr = new Date().toISOString().split('T')[0];
      const threeDaysLater = new Date();
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];

      const { data: nearTermData } = await supabase
        .from('sessions')
        .select('id, name, instructor, description, date, time, credits_required, image_url, gym_id, spots_left, gyms(name)')
        .gte('date', todayStr)
        .lte('date', threeDaysLaterStr)
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(10);

      if (nearTermData) setNearTermSessions(nearTermData as any);

      // 6. Load all upcoming sessions
      const { data: sessionsData } = await supabase
        .from('sessions')
        .select('id, name, instructor, description, date, time, credits_required, image_url, gym_id, spots_left')
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .limit(5);

      if (sessionsData) setSessions(sessionsData as Session[]);

      // 7. Load dynamic categories from sessions
      const { data: categoriesData } = await supabase
        .from('sessions')
        .select('category')
        .not('category', 'is', null);
      
      if (categoriesData) {
        const uniqueCategories = Array.from(new Set(categoriesData.map(c => c.category)));
        const mappedCategories = uniqueCategories.map(name => {
          // Map category names to icons and colors
          const mapping: Record<string, { icon: string, color: string }> = {
            'Gym': { icon: 'fitness-outline', color: '#4A90E2' },
            'Yoga': { icon: 'body-outline', color: '#50E3C2' },
            'Swimming': { icon: 'water-outline', color: '#4A90E2' },
            'Boxing': { icon: 'hand-left-outline', color: '#D0021B' },
            'Dance': { icon: 'musical-notes-outline', color: '#F5A623' },
            'Spa': { icon: 'leaf-outline', color: '#7ED321' },
            'Pilates': { icon: 'body-outline', color: '#9B59B6' },
            'Crossfit': { icon: 'barbell-outline', color: '#E67E22' },
          };
          const info = mapping[name as string] || { icon: 'apps-outline', color: '#95A5A6' };
          return { name: name as string, ...info };
        });
        setCategories(mappedCategories);
      }

    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    try {
      const parts = timeString.split(':');
      const hour = parseInt(parts[0], 10);
      const minutes = parts[1];
      return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
    } catch { return timeString; }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>
          {isGuest ? 'Active CityPass' : `${getGreeting()}, ${user?.name?.split(' ')[0] || 'there'}!`}
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          {isGuest ? 'Your wellness journey starts here' : 'Ready to get moving?'}
        </ThemedText>
      </View>

      {/* Credits Card (Logged In Users) */}
      {!isGuest && user && (
        <View style={styles.creditsCard}>
          <View style={styles.creditsContent}>
            <Ionicons name="wallet-outline" size={32} color="#666" />
            <View style={styles.creditsInfo}>
              <ThemedText style={styles.creditsLabel}>Available Credits</ThemedText>
              <ThemedText style={styles.creditsValue}>{user.credits}</ThemedText>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.creditsButton}
            onPress={() => router.push('/add-credits')}
          >
            <ThemedText style={styles.creditsButtonText}>Add Credits</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {/* Free Trial Banner (Guest Users) */}
      {isGuest && (
        <TouchableOpacity 
          style={styles.trialBanner}
          onPress={() => router.push('/signup')}
        >
          <View style={styles.trialContent}>
            <View style={styles.trialTextContainer}>
              <ThemedText style={styles.trialTitle}>Start with your Free Trial Today!</ThemedText>
              <ThemedText style={styles.trialDescription}>
                Explore top gyms, fitness studios, kids activities, salons, and spas. All with one flexible membership.
              </ThemedText>
            </View>
            <Ionicons name="arrow-forward-circle" size={48} color="#fff" />
          </View>
        </TouchableOpacity>
      )}

      {/* Quick Check-in Link (Active Bookings) */}
      {!isGuest && activeBooking && (
        <TouchableOpacity 
          style={styles.checkInLink}
          onPress={() => router.push('/(tabs)/check-in', { sessionId: activeBooking.sessions ? activeBooking.sessions.id : null })}
        >
          <View style={styles.checkInContent}>
            <View style={styles.checkInIconContainer}>
              <Ionicons name="qr-code-outline" size={24} color="#002fff" />
            </View>
            <View style={styles.checkInTextContainer}>
              <ThemedText style={styles.checkInTitle}>Ready for your session?</ThemedText>
              <ThemedText style={styles.checkInSubtitle}>
                {activeBooking.sessions?.name} at {activeBooking.sessions?.gyms?.name}
              </ThemedText>
              <ThemedText style={styles.checkInSubtitle}>
                {formatDate(activeBooking.booking_date)} • {formatTime(activeBooking.booking_time)}
              </ThemedText>
            </View>
            <ThemedText style={styles.checkInAction}>Check In</ThemedText>
            <Ionicons name="chevron-forward" size={16} color="#002fff" />
          </View>
        </TouchableOpacity>
      )}

      {/* Near-term Upcoming Sessions (Next 3 Days) */}
      {nearTermSessions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Coming Up Soon</ThemedText>
            <TouchableOpacity onPress={() => router.push('/(tabs)/classes')}>
              <ThemedText style={styles.seeAllText}>See All</ThemedText>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {nearTermSessions.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={styles.sessionCard}
                onPress={() => router.push({
                  pathname: '/session-details',
                  params: { sessionId: session.id }
                })}
              >
                {session.image_url ? (
                  <Image source={{ uri: session.image_url }} style={styles.sessionCardImage} resizeMode="cover" />
                ) : (
                  <View style={styles.sessionCardImagePlaceholder}>
                    <Ionicons name="fitness" size={32} color="#fff" />
                  </View>
                )}
                <View style={styles.sessionCardContent}>
                  <View style={styles.sessionDateBadge}>
                    <ThemedText style={styles.sessionDateText}>{formatDate(session.date)}</ThemedText>
                  </View>
                  <ThemedText style={styles.sessionName} numberOfLines={1}>{session.name}</ThemedText>
                  <ThemedText style={styles.sessionGym} numberOfLines={1}>{session.gyms?.name}</ThemedText>
                  <View style={styles.sessionMeta}>
                    <Ionicons name="time-outline" size={14} color="#666" />
                    <ThemedText style={styles.sessionMetaText}>{formatTime(session.time)}</ThemedText>
                    <View style={styles.dot} />
                    <Ionicons name="flash-outline" size={14} color="#002fff" />
                    <ThemedText style={styles.sessionMetaText}>{session.credits_required} Credits</ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Venues Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Top Venues</ThemedText>
          <TouchableOpacity onPress={() => router.push('/(tabs)/venues')}>
            <ThemedText style={styles.seeAllText}>See All</ThemedText>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {gyms.map((gym) => (
            <TouchableOpacity
              key={gym.id}
              style={styles.venueCard}
              onPress={() => router.push({
                pathname: '/gym-details',
                params: { gymId: gym.id }
              })}
            >
              {gym.image_url ? (
                <Image
                  source={{ uri: gym.image_url.split(',')[0] }}
                  style={styles.venueImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.venueImagePlaceholder}>
                  <Ionicons name="fitness" size={40} color="#fff" />
                </View>
              )}
              <View style={styles.venueInfo}>
                <ThemedText style={styles.venueName} numberOfLines={1}>
                  {gym.name}
                </ThemedText>
                 <View style={styles.venueLocation}>
                  <ThemedText style={styles.venueLocationText} numberOfLines={1}>
                    {gym.description}
                  </ThemedText>
                </View>
                <View style={styles.venueLocation}>
                  <Ionicons name="location-outline" size={14} color="#666" />
                  <ThemedText style={styles.venueLocationText} numberOfLines={1}>
                    {gym.location}
                  </ThemedText>
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {/* See All Card */}
          <TouchableOpacity 
            style={styles.seeAllCard}
            onPress={() => router.push('/(tabs)/venues')}
          >
            <View style={styles.seeAllIconContainer}>
              <Ionicons name="arrow-forward" size={32} color="#002fff" />
            </View>
            <ThemedText style={styles.seeAllCardText}>Explore All Venues</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Categories Section */}
      <View style={styles.section}>
        <ThemedText style={[styles.sectionTitle, { paddingHorizontal: 20 }]}>Explore Categories</ThemedText>
        <View style={styles.categoriesGrid}>
          {categories.map((category) => (
            <TouchableOpacity 
              key={category.name} 
              style={styles.categoryItem}
              onPress={() => router.push({
                pathname: '/(tabs)/classes',
                params: { category: category.name }
              })}
            >
              <View style={[styles.categoryIcon, { backgroundColor: category.color + '15' }]}>
                <Ionicons name={category.icon as any} size={24} color={category.color} />
              </View>
              <ThemedText style={styles.categoryName}>{category.name}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Featured Classes */}
      <View style={[styles.section, { marginBottom: 40 }]}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Featured Classes</ThemedText>
          <TouchableOpacity onPress={() => router.push('/(tabs)/classes')}>
            <ThemedText style={styles.seeAllText}>See All</ThemedText>
          </TouchableOpacity>
        </View>
        
        {sessions.map((session) => (
          <TouchableOpacity
            key={session.id}
            style={styles.sessionListItem}
            onPress={() => router.push({
              pathname: '/session-details',
              params: { sessionId: session.id }
            })}
          >
            {session.image_url ? (
              <Image source={{ uri: session.image_url }} style={styles.sessionListImage} resizeMode="cover" />
            ) : (
              <View style={styles.sessionListImagePlaceholder}>
                <Ionicons name="fitness" size={24} color="#fff" />
              </View>
            )}
            <View style={styles.sessionListInfo}>
              <ThemedText style={styles.sessionListName}>{session.name}</ThemedText>
              <ThemedText style={styles.sessionListInstructor}>with {session.instructor || 'Professional'}</ThemedText>
              <View style={styles.sessionListMeta}>
                <ThemedText style={styles.sessionListDate}>{formatDate(session.date)} • {formatTime(session.time)}</ThemedText>
              </View>
            </View>
            <View style={styles.sessionListPrice}>
              <ThemedText style={styles.sessionListPriceValue}>{session.credits_required}</ThemedText>
              <ThemedText style={styles.sessionListPriceLabel}>Credits</ThemedText>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  creditsCard: {
    margin: 20,
    marginTop: 0,
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#eee',
  },
  creditsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  creditsInfo: {
    gap: 2,
  },
  creditsLabel: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  creditsValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  creditsButton: {
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  creditsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  trialBanner: {
    margin: 20,
    marginTop: 0,
    backgroundColor: '#002fff',
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
  },
  trialContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 15,
  },
  trialTextContainer: {
    flex: 1,
    gap: 8,
  },
  trialTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    lineHeight: 28,
  },
  trialDescription: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 20,
  },
  checkInLink: {
    margin: 20,
    marginTop: 0,
    backgroundColor: '#f0f4ff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d0e0ff',
  },
  checkInContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkInIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkInTextContainer: {
    flex: 1,
    gap: 2,
  },
  checkInTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000',
  },
  checkInSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  checkInAction: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#002fff',
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  seeAllText: {
    color: '#002fff',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 15,
  },
  venueCard: {
    width: CARD_WIDTH,
    marginHorizontal: 5,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
  },
  venueImage: {
    width: '100%',
    height: 150,
  },
  venueImagePlaceholder: {
    width: '100%',
    height: 150,
    backgroundColor: '#002fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  venueInfo: {
    padding: 15,
    gap: 8,
  },
  venueName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  venueLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  venueLocationText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  seeAllCard: {
    width: 160,
    height: 240,
    marginHorizontal: 5,
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 15,
    borderWidth: 1,
    borderColor: '#eee',
    borderStyle: 'dashed',
  },
  seeAllIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  seeAllCardText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#002fff',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  sessionCard: {
    width: 260,
    marginHorizontal: 5,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sessionCardImage: {
    width: '100%',
    height: 120,
  },
  sessionCardImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#002fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionCardContent: {
    padding: 16,
  },
  sessionDateBadge: {
    backgroundColor: '#f0f4ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  sessionDateText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#002fff',
  },
  sessionInfo: {
    gap: 4,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sessionGym: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionMetaText: {
    fontSize: 12,
    color: '#666',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#ccc',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    marginTop: 8,
  },
  categoryItem: {
    width: '33.33%',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
  },
  sessionListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  sessionListImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  sessionListImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#002fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionListInfo: {
    flex: 1,
    gap: 4,
  },
  sessionListName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sessionListInstructor: {
    fontSize: 14,
    color: '#666',
  },
  sessionListMeta: {
    marginTop: 4,
  },
  sessionListDate: {
    fontSize: 12,
    color: '#999',
  },
  sessionListPrice: {
    alignItems: 'center',
    backgroundColor: '#f0f4ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 70,
  },
  sessionListPriceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#002fff',
  },
  sessionListPriceLabel: {
    fontSize: 10,
    color: '#002fff',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
});
