import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Dimensions } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

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

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: gymData, error: gymError } = await supabase
        .from('gyms')
        .select('*')
        .eq('id', gymId)
        .single();

      if (gymError) throw gymError;
      setGym(gymData);

      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('gym_id', gymId)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

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

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
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
        name={
          star <= Math.floor(numericRating)
            ? 'star'
            : star <= numericRating
            ? 'star-half'
            : 'star-outline'
        }
        size={18}
        color="#FFB800"
      />
    ));
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#000" />
        <ThemedText style={{ marginTop: 16 }}>Loading gym details...</ThemedText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="alert-circle-outline" size={64} color="#ff3b30" />
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  if (!gym) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="alert-circle-outline" size={64} color="#ccc" />
        <ThemedText style={styles.errorText}>Gym not found</ThemedText>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.headerTitle}>{gym.name}</ThemedText>
        <TouchableOpacity style={styles.favoriteButton}>
          <Ionicons name="heart-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Image Gallery */}
        <View style={styles.galleryContainer}>
          {gymImages.length > 0 && !imageError ? (
            <>
              <Image
                source={{ uri: gymImages[currentImageIndex] }}
                style={styles.gymImage}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
              
              {gymImages.length > 1 && (
                <View style={styles.imageCounter}>
                  <ThemedText style={styles.imageCounterText}>
                    {currentImageIndex + 1} / {gymImages.length}
                  </ThemedText>
                </View>
              )}

              {gymImages.length > 1 && (
                <>
                  <TouchableOpacity
                    style={[styles.imageNavButton, styles.leftNavButton]}
                    onPress={handlePreviousImage}
                  >
                    <Ionicons name="chevron-back" size={30} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.imageNavButton, styles.rightNavButton]}
                    onPress={handleNextImage}
                  >
                    <Ionicons name="chevron-forward" size={30} color="#fff" />
                  </TouchableOpacity>
                </>
              )}

              {gymImages.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.thumbnailContainer}
                  contentContainerStyle={styles.thumbnailContent}
                >
                  {gymImages.map((imageUrl, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => { setCurrentImageIndex(index); setImageError(false); }}
                      style={[styles.thumbnail, currentImageIndex === index && styles.thumbnailActive]}
                    >
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

        {/* Gym Info */}
        <View style={styles.infoSection}>
          {/* Rating Row */}
          {gym.rating !== null && (
            <View style={styles.ratingRow}>
              <View style={styles.starsContainer}>
                {renderStars(gym.rating)}
              </View>
              <ThemedText style={styles.ratingValue}>
                {gym.rating.toFixed(1)}
              </ThemedText>
            </View>
          )}

          {gym.description && (
            <ThemedText style={styles.description}>{gym.description}</ThemedText>
          )}
          
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={16} color="#666" />
            <ThemedText style={styles.location}>{gym.location}</ThemedText>
          </View>
        </View>

        {/* Sessions Section */}
        <View style={styles.sessionsSection}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Classes offered</ThemedText>
            <ThemedText style={styles.sessionCount}>
              {sessions.length} {sessions.length === 1 ? 'class' : 'classes'}
            </ThemedText>
          </View>
          
          {sessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#ccc" />
              <ThemedText style={styles.emptyText}>No classes available</ThemedText>
            </View>
          ) : (
            sessions.map((session) => (
              <TouchableOpacity
                key={session.id}
                style={styles.sessionCard}
                onPress={() => router.push({
                  pathname: '/session-details',
                  params: { sessionId: session.id, gymName: gym.name }
                })}
              >
                {session.image_url ? (
                  <Image source={{ uri: session.image_url }} style={styles.sessionImage} resizeMode="cover" />
                ) : (
                  <View style={styles.sessionImagePlaceholder}>
                    <Ionicons name="barbell-outline" size={40} color="#002fff" />
                  </View>
                )}

                <View style={styles.sessionCardContent}>
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionInfo}>
                      <ThemedText style={styles.sessionName}>{session.name}</ThemedText>
                      {session.instructor && (
                        <View style={styles.instructorRow}>
                          <Ionicons name="person-outline" size={16} color="#666" />
                          <ThemedText style={styles.instructor}>{session.instructor}</ThemedText>
                        </View>
                      )}
                    </View>
                    
                  </View>

                  {session.description && (
                    <ThemedText style={styles.sessionDescription} numberOfLines={2}>
                      {session.description}
                    </ThemedText>
                  )}

                  <View style={styles.sessionDetails}>
                    <View style={styles.detailItem}>
                      <Ionicons name="calendar-outline" size={18} color="#666" />
                      <ThemedText style={styles.detailText}>{formatDate(session.date)}</ThemedText>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="time-outline" size={18} color="#666" />
                      <ThemedText style={styles.detailText}>
                        {session.time} · {session.duration_minutes} min
                      </ThemedText>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="people-outline" size={18} color="#00a63e" />
                      <ThemedText style={styles.detailSpotsText}>{session.spots_left} spots left,  {session.credits_required} credits required to book</ThemedText>
                    </View>
                  </View>

                  <View style={styles.sessionFooter}>
                    <ThemedText style={styles.viewDetailsText}>View Details</ThemedText>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
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
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  favoriteButton: {
    padding: 8,
    borderRadius: 20,
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
    borderBottomWidth: 8,
    borderBottomColor: '#f8f8f8',
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
    padding: 20,
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
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionImage: {
    width: '100%',
    height: 180,
  },
  sessionImagePlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionCardContent: {
    padding: 16,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
  },
  instructorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  instructor: {
    fontSize: 14,
    color: '#666',
  },
  creditsBox: {
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  creditsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  creditsLabel: {
    fontSize: 11,
    color: '#fff',
  },
  sessionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  sessionDetails: {
    gap: 4,
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
 detailSpotsText: {
    fontSize: 14, 
    color:'#00a63e',
  },
  sessionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
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