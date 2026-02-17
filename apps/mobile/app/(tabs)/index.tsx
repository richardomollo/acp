import { StyleSheet, View, ScrollView, TouchableOpacity, Image, Dimensions, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { authService } from '../services/auth';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.7;

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
  date: string;
  time: string;
  credits_required: number;
  image_url: string | null;
  gym_id: string;
}

interface UserProfile {
  name: string;
  credits: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const [isGuest, setIsGuest] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Check auth status
      const session = await authService.getSession();
      
      if (session) {
        setIsGuest(false);
        
        // Load user profile
        const { data: userData } = await supabase
          .from('users')
          .select('name, credits')
          .eq('id', session.user.id)
          .single();
        
        if (userData) setUser(userData);
      } else {
        setIsGuest(true);
      }

      // Load gyms (limit to 5)
      const { data: gymsData } = await supabase
        .from('gyms')
        .select('id, name, location, image_url, description')
        .limit(5);

      if (gymsData) setGyms(gymsData);

      // Load upcoming sessions (limit to 5)
      const { data: sessionsData } = await supabase
        .from('sessions')
        .select('id, name, instructor, description, date, time, credits_required, image_url, gym_id, spots_left')
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(5);

      if (sessionsData) setSessions(sessionsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
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
          {isGuest ? 'Active CityPass' : `Hi, ${user?.name || 'there'}!`}
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          {isGuest ? 'Your fitness journey starts here' : 'Ready to get moving?'}
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
          <TouchableOpacity style={styles.creditsButton}>
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
            <Ionicons name="arrow-forward-circle-outline" size={48} color="#666" />
            <ThemedText style={styles.seeAllCardText}>View All Venues</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Classes Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Upcoming Classes</ThemedText>
          <TouchableOpacity onPress={() => router.push('/(tabs)/classes')}>
            <ThemedText style={styles.seeAllText}>See All</ThemedText>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {sessions.map((session) => (
            <TouchableOpacity
              key={session.id}
              style={styles.classCard}
              onPress={() => router.push({
                pathname: '/session-details',
                params: { 
                  sessionId: session.id,
                  gymName: 'Gym' 
                }
              })}
            >
              {session.image_url ? (
                <Image
                  source={{ uri: session.image_url }}
                  style={styles.classImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.classImagePlaceholder}>
                  <Ionicons name="barbell" size={40} color="#fff" />
                </View>
              )}
              

              <View style={styles.classInfo}>
                <ThemedText style={styles.className} numberOfLines={1}>
                  {session.name}
                </ThemedText>
                 <ThemedText style={styles.classInstructorText} numberOfLines={1}>
                  {session.description}
                </ThemedText>
                {session.instructor && (
                  <View style={styles.classInstructor}>
                    <Ionicons name="person-outline" size={12} color="#666" />
                    <ThemedText style={styles.classInstructorText} numberOfLines={1}>
                      {session.instructor}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.classTime}>
                  <Ionicons name="calendar-outline" size={12} color="#666" />
                  <ThemedText style={styles.classTimeText}>
                    {formatDate(session.date)} • {session.time}
                  </ThemedText>
                </View>
                <ThemedText style={styles.classSpotsLeft} numberOfLines={1}>
                  {session.spots_left} Spots left, {session.credits_required} credits required to book
                </ThemedText>
              </View>
            </TouchableOpacity>
          ))}

          {/* See All Card */}
          <TouchableOpacity
            style={styles.seeAllCard}
            onPress={() => router.push('/(tabs)/classes')}
          >
            <Ionicons name="arrow-forward-circle-outline" size={48} color="#666" />
            <ThemedText style={styles.seeAllCardText}>View All Classes</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Getting Started Card */}
      <View style={styles.gettingStartedCard}>
        <Ionicons name="rocket-outline" size={48} color="#002fff" />
        <ThemedText style={styles.gettingStartedTitle}>
          Getting Started on FitPass
        </ThemedText>
        <ThemedText style={styles.gettingStartedDescription}>
          Discover hundreds of activities and start your fitness journey today
        </ThemedText>
        <TouchableOpacity 
          style={styles.exploreButton}
          onPress={() => router.push('/(tabs)/classes')}
        >
          <ThemedText style={styles.exploreButtonText}>Explore Classes</ThemedText>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Bottom Spacing */}
      <View style={{ height: 40 }} />
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
    paddingBottom: 35,
    backgroundColor: '#ffffff',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#020202',
    marginBottom: 4,
  },
  subtitle: {
    color: '#000000',
    fontSize: 16,
    opacity: 0.9,
  },
  creditsCard: {
    backgroundColor: '#f8f8f8',
    marginHorizontal: 20,
    marginTop: -10,
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  creditsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  creditsInfo: {
    gap: 4,
  },
  creditsLabel: {
    fontSize: 13,
    color: '#666',
  },
  creditsValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    
  },
  creditsButton: {
    backgroundColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  creditsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  trialBanner: {
    backgroundColor: '#002fff',
    marginHorizontal: 20,
    marginTop: -20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  trialContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
  },
  trialTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  trialTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  trialDescription: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    lineHeight: 20,
  },
  section: {
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#002fff',
  },
  scrollContent: {
    paddingLeft: 20,
    paddingRight: 20,
  },
  venueCard: {
    width: CARD_WIDTH,
    marginRight: 16,
    backgroundColor: '#fff',
    borderRadius: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  venueImage: {
    width: '100%',
    height: 160,
  },
  venueImagePlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: '#002fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueInfo: {
    padding: 16,
  },
  venueName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
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
  classCard: {
    width: CARD_WIDTH * 0.75,
    marginRight: 16,
    backgroundColor: '#fff',
    borderRadius: 5,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  classImage: {
    width: '100%',
    height: 140,
  },
  classImagePlaceholder: {
    width: '100%',
    height: 140,
    backgroundColor: '#002fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classCredits: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#002fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  classCreditsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  classInfo: {
    padding: 12,
  },
  className: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
  },
  classInstructor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  classInstructorText: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  classTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  classTimeText: {
    fontSize: 12,
    color: '#666',
  },
  classSpotsLeft: {
    fontSize: 13,
    color: '#00a63e',
    flex: 1,
  },
  seeAllCard: {
    width: CARD_WIDTH * 0.6,
    height: 220,
    marginRight: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAllCardText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#002fff',
    marginTop: 12,
  },
  gettingStartedCard: {
    backgroundColor: '#f8f8f8',
    marginHorizontal: 20,
    marginTop: 32,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  gettingStartedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  gettingStartedDescription: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  exploreButton: {
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 25,
  },
  exploreButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});