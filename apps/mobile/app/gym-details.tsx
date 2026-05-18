import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Dimensions } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface Gym {
  id: string;
  name: string;
  location: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  image_url: string | null;
  rating: number | null;
}

interface Session {
  id: string;
  name: string;
  description: string | null;
  instructor: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  credits_required: number;
  max_capacity: number;
  spots_left: number;
  image_url: string | null;
}

export default function GymDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const gymId = params.gymId as string;
  
  const [gym, setGym] = useState<Gym | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  // Generate the next 7 days for filters
  const dateFilters = useMemo(() => {
    const filters = [{ label: 'All', value: 'all' }];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = date.getDate();
      const dateString = date.toISOString().split('T')[0];
      filters.push({
        label: i === 0 ? 'Today' : `${dayName}, ${dayNum}`,
        value: dateString
      });
    }
    return filters;
  }, []);

  const [activeFilter, setActiveFilter] = useState(dateFilters[0].value);

  const getGymImages = (): string[] => {
    if (!gym?.image_url) return [];
    if (gym.image_url.includes(',')) {
      return gym.image_url.split(',').map(url => url.trim()).filter(url => url.length > 0);
    }
    return [gym.image_url];
  };

  const gymImages = getGymImages();

  useEffect(() => {
    if (!gymId) {
      setError('No gym ID provided');
      setLoading(false);
      return;
    }
    loadData();
  }, [gymId]);

  useEffect(() => {
    applyFilters();
  }, [sessions, activeFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: gymData, error: gymError } = await supabase.from('gyms').select('*').eq('id', gymId).single();
      if (gymError) throw gymError;
      setGym(gymData);
      const { data: sessionsData, error: sessionsError } = await supabase.from('sessions').select('*').eq('gym_id', gymId).order('date', { ascending: true }).order('time', { ascending: true });
      if (sessionsError) console.error('Sessions error:', sessionsError);
      setSessions(sessionsData || []);
    } catch (err: any) {
      console.error('Error in loadData:', err);
      setError(err.message || 'Failed to load gym details');
      Alert.alert('Error', err.message || 'Failed to load gym details');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...sessions];
    if (activeFilter !== 'all') {
      filtered = filtered.filter(session => session.date === activeFilter);
    }
    setFilteredSessions(filtered);
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const handlePreviousImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? gymImages.length - 1 : prev - 1));
    setImageError(false);
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) => (prev === gymImages.length - 1 ? 0 : prev + 1));
    setImageError(false);
  };

  const renderStars = (rating: number | null) => {
    const numericRating = rating || 0;
    return [1, 2, 3, 4, 5].map((star) => (
      <Ionicons
        key={star}
        name={star <= Math.floor(numericRating) ? 'star' : star <= numericRating ? 'star-half' : 'star-outline'}
        size={18}
        color="#FFB800"
      />
    ));
  };

  const getStatusColor = (spotsLeft: number, maxCapacity: number) => {
    const percentageFull = ((maxCapacity - spotsLeft) / maxCapacity) * 100;
    if (spotsLeft === 0) return '#f44336';
    if (percentageFull >= 80) return '#ff9800';
    return '#4caf50';
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#000" />
        <ThemedText style={{ marginTop: 16 }}>Loading gym details...</ThemedText>
      </View>
    );
  }

  if (error || !gym) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="alert-circle-outline" size={64} color="#ff3b30" />
        <ThemedText style={styles.errorText}>{error || 'Gym not found'}</ThemedText>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.headerTitle}>{gym.name}</ThemedText>
        <TouchableOpacity style={styles.favoriteButton}>
          <Ionicons name="heart-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.galleryContainer}>
          {gymImages.length > 0 && !imageError ? (
            <>
              <Image source={{ uri: gymImages[currentImageIndex] }} style={styles.gymImage} resizeMode="cover" onError={() => setImageError(true)} />
              {gymImages.length > 1 && (
                <View style={styles.imageCounter}>
                  <ThemedText style={styles.imageCounterText}>{currentImageIndex + 1} / {gymImages.length}</ThemedText>
                </View>
              )}
              {gymImages.length > 1 && (
                <>
                  <TouchableOpacity style={[styles.imageNavButton, styles.leftNavButton]} onPress={handlePreviousImage}>
                    <Ionicons name="chevron-back" size={30} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.imageNavButton, styles.rightNavButton]} onPress={handleNextImage}>
                    <Ionicons name="chevron-forward" size={30} color="#fff" />
                  </TouchableOpacity>
                </>
              )}
              {gymImages.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailContainer} contentContainerStyle={styles.thumbnailContent}>
                  {gymImages.map((imageUrl, index) => (
                    <TouchableOpacity key={index} onPress={() => { setCurrentImageIndex(index); setImageError(false); }} style={[styles.thumbnail, currentImageIndex === index && styles.thumbnailActive]}>
                      <Image source={{ uri: imageUrl }} style={styles.thumbnailImage} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </>
          ) : (
            <View style={styles.gymImagePlaceholder}>
              <Ionicons name="fitness" size={60} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.infoSection}>
          {gym.rating !== null && (
            <View style={styles.ratingRow}>
              <View style={styles.starsContainer}>{renderStars(gym.rating)}</View>
              <ThemedText style={styles.ratingValue}>{gym.rating.toFixed(1)}</ThemedText>
            </View>
          )}
          {gym.description && <ThemedText style={styles.description}>{gym.description}</ThemedText>}
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={16} color="#666" />
            <ThemedText style={styles.location}>{gym.location}</ThemedText>
          </View>
        </View>

        <View style={styles.sessionsSection}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Classes offered</ThemedText>
            <ThemedText style={styles.sessionCount}>{filteredSessions.length} {filteredSessions.length === 1 ? 'class' : 'classes'}</ThemedText>
          </View>

          {/* Date Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtersContainer}
            contentContainerStyle={styles.filtersContent}
          >
            {dateFilters.map((filter) => (
              <TouchableOpacity
                key={filter.value}
                style={[styles.filterChip, activeFilter === filter.value && styles.filterChipActive]}
                onPress={() => setActiveFilter(filter.value)}
              >
                <ThemedText style={[styles.filterText, activeFilter === filter.value && styles.filterTextActive]}>
                  {filter.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          {filteredSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#ccc" />
              <ThemedText style={styles.emptyText}>No classes available for this date</ThemedText>
            </View>
          ) : (
            filteredSessions.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={styles.sessionCard}
                onPress={() => router.push({ pathname: '/session-details', params: { sessionId: session.id, gymName: gym.name } })}
              >
                <View style={styles.sessionImageContainer}>
                  {session.image_url ? (
                    <Image source={{ uri: session.image_url }} style={styles.sessionImageSmall} resizeMode="cover" />
                  ) : (
                    <View style={styles.sessionImagePlaceholderSmall}>
                      <Ionicons name="barbell-outline" size={30} color="#002fff" />
                    </View>
                  )}
                </View>

                <View style={styles.sessionInfo}>
                  <View style={styles.sessionCardHeader}>
                    <View style={styles.sessionTitleContainer}>
                      <ThemedText style={styles.sessionName} numberOfLines={1}>{session.name}</ThemedText>
                      {session.instructor && <ThemedText style={styles.instructorText} numberOfLines={1}>{session.instructor}</ThemedText>}
                    </View>
                    {session.credits_required > 0 && (
                      <View style={styles.creditsContainer}>
                        <Ionicons name="flash" size={12} color="#002fff" />
                        <ThemedText style={styles.creditsText}>{session.credits_required} credit{session.credits_required !== 1 ? 's' : ''}</ThemedText>
                      </View>
                    )}
                  </View>

                  <View style={styles.sessionMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="calendar-outline" size={12} color="#666" />
                      <ThemedText style={styles.metaText}>{formatDate(session.date)} • {session.time}</ThemedText>
                    </View>
                  </View>

                  <View style={styles.sessionFooter}>
                    <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(session.spots_left, session.max_capacity || 20) }]} />
                    <ThemedText style={styles.classSpotsLeft}>{session.spots_left > 0 ? `${session.spots_left} spots left` : 'Fully booked'}</ThemedText>
                    <ThemedText style={styles.durationText}>{session.duration_minutes}m</ThemedText>
                    <Ionicons name="chevron-forward" size={16} color="#ccc" style={{ marginLeft: 8 }} />
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
    padding: 20,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    zIndex: 10,
  },
  headerBackButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: -1, height: 1},
    textShadowRadius: 10
  },
  favoriteButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  content: {
    flex: 1,
  },
  galleryContainer: {
    position: 'relative',
  },
  gymImage: {
    width: '100%',
    height: 400,
  },
  gymImagePlaceholder: {
    width: '100%',
    height: 400,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageCounter: {
    position: 'absolute',
    top: 120,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  imageCounterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  imageNavButton: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -25 }],
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftNavButton: {
    left: 10,
  },
  rightNavButton: {
    right: 10,
  },
  thumbnailContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
  },
  thumbnailContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  thumbnail: {
    width: 70,
    height: 70,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
    marginRight: 8,
  },
  thumbnailActive: {
    borderColor: '#fff',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  infoSection: {
    padding: 20,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  location: {
    fontSize: 16,
    color: '#666',
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 12,
  },
  sessionsSection: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
  },
  sessionCount: {
    fontSize: 14,
    color: '#666',
  },
  filtersContainer: {
    marginBottom: 16,
    maxHeight: 50,
  },
  filtersContent: {
    paddingRight: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  filterChipActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
  },
  sessionCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 0,
  },
  sessionImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sessionImageSmall: {
    width: '100%',
    height: '100%',
  },
  sessionImagePlaceholderSmall: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  sessionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sessionTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  instructorText: {
    fontSize: 13,
    color: '#666',
  },
  creditsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef0ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  creditsText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#002fff',
    marginLeft: 2,
  },
  sessionMeta: {
    marginVertical: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#666',
  },
  sessionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  classSpotsLeft: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  durationText: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: '#000',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
