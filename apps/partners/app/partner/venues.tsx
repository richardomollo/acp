import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Image } from 'expo-image';

interface Venue {
  id: string;
  name: string;
  location: string;
  area: string;
  address: string;
  type: string;
  description: string | null;
  image_url: string | null;
  sessions_count: number;
  upcoming_sessions: number;
  total_bookings: number;
  amenities: string[];
  operating_hours: any;
}

export default function VenuesScreen() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadVenues();
  }, []);

  const loadVenues = async () => {
    try {
      setLoading(true);

      // Get current partner
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/partner-login');
        return;
      }

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) {
        router.replace('/partner-login');
        return;
      }

      // Get partner's gyms
      const { data: partnerGyms } = await supabase
        .from('partner_gyms')
        .select('gym_id, gyms(*)')
        .eq('partner_id', partner.id);

      if (!partnerGyms || partnerGyms.length === 0) {
        setVenues([]);
        setLoading(false);
        return;
      }

      // Get stats for each venue
      const today = new Date().toISOString().split('T')[0];

      const venuesWithStats = await Promise.all(
        partnerGyms.map(async (pg) => {
          const gym = pg.gyms as any;

          // Total sessions
          const { count: totalSessions } = await supabase
            .from('sessions')
            .select('*', { count: 'exact', head: true })
            .eq('gym_id', gym.id);

          // Upcoming sessions
          const { count: upcomingSessions } = await supabase
            .from('sessions')
            .select('*', { count: 'exact', head: true })
            .eq('gym_id', gym.id)
            .gte('date', today)
            .eq('is_active', true);

          // Total bookings
          const { count: totalBookings } = await supabase
            .from('bookings')
            .select('*, sessions!inner(gym_id)', { count: 'exact', head: true })
            .eq('sessions.gym_id', gym.id);

          return {
            id: gym.id,
            name: gym.name,
            location: gym.location,
            area: gym.area || '',
            address: gym.address || '',
            type: gym.type,
            description: gym.description,
            image_url: gym.image_url,
            sessions_count: totalSessions || 0,
            upcoming_sessions: upcomingSessions || 0,
            total_bookings: totalBookings || 0,
            amenities: gym.amenities || [],
            operating_hours: gym.operating_hours || {},
          };
        })
      );

      setVenues(venuesWithStats);

    } catch (error: any) {
      console.error('Load venues error:', error);
      Alert.alert('Error', 'Failed to load venues');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadVenues();
  };

  const handleEditVenue = (venueId: string) => {
    router.push(`/partner/venue-details/${venueId}`);
  };

  const handleAddVenue = () => {
    router.push('/(partner-onboarding)/venue-setup');
  };

  const renderVenue = ({ item }: { item: Venue }) => (
    <TouchableOpacity
      style={styles.venueCard}
      onPress={() => handleEditVenue(item.id)}
    >
      {/* Venue Image */}
      {item.image_url ? (
        <Image 
          source={{ uri: item.image_url }} 
          style={styles.venueImage}
          contentFit="cover"
        />
      ) : (
        <View style={styles.venueImagePlaceholder}>
          <Ionicons name="business" size={50} color="#999" />
        </View>
      )}

      {/* Venue Info */}
      <View style={styles.venueInfo}>
        <View style={styles.venueHeader}>
          <ThemedText style={styles.venueName}>{item.name}</ThemedText>
          <View style={styles.venueType}>
            <Ionicons name="fitness-outline" size={16} color="#666" />
            <ThemedText style={styles.venueTypeText}>{item.type}</ThemedText>
          </View>
        </View>

        <View style={styles.venueLocation}>
          <Ionicons name="location-outline" size={16} color="#666" />
          <ThemedText style={styles.venueLocationText}>
            {item.area}, {item.location}
          </ThemedText>
        </View>

        {item.description && (
          <ThemedText style={styles.venueDescription} numberOfLines={2}>
            {item.description}
          </ThemedText>
        )}

        {/* Stats */}
        <View style={styles.venueStats}>
          <View style={styles.statItem}>
            <Ionicons name="calendar-outline" size={18} color="#002fff" />
            <ThemedText style={styles.statValue}>{item.upcoming_sessions}</ThemedText>
            <ThemedText style={styles.statLabel}>Upcoming</ThemedText>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <Ionicons name="list-outline" size={18} color="#666" />
            <ThemedText style={styles.statValue}>{item.sessions_count}</ThemedText>
            <ThemedText style={styles.statLabel}>Sessions</ThemedText>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <Ionicons name="people-outline" size={18} color="#00c853" />
            <ThemedText style={styles.statValue}>{item.total_bookings}</ThemedText>
            <ThemedText style={styles.statLabel}>Bookings</ThemedText>
          </View>
        </View>

        {/* Amenities Preview */}
        {item.amenities && item.amenities.length > 0 && (
          <View style={styles.amenitiesPreview}>
            <Ionicons name="checkmark-circle" size={14} color="#00c853" />
            <ThemedText style={styles.amenitiesText}>
              {item.amenities.slice(0, 3).join(' • ')}
              {item.amenities.length > 3 ? ` +${item.amenities.length - 3}` : ''}
            </ThemedText>
          </View>
        )}

        {/* Edit Button */}
        <TouchableOpacity 
          style={styles.editButton}
          onPress={() => handleEditVenue(item.id)}
        >
          <Ionicons name="create-outline" size={18} color="#002fff" />
          <ThemedText style={styles.editButtonText}>Edit Details</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Chevron */}
      <View style={styles.chevron}>
        <Ionicons name="chevron-forward" size={24} color="#999" />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>My Venues</ThemedText>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddVenue}
        >
          <Ionicons name="add-circle" size={28} color="#002fff" />
        </TouchableOpacity>
      </View>

      {venues.length === 0 ? (
        /* Empty State */
        <ScrollView 
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="business-outline" size={80} color="#e0e0e0" />
            </View>
            <ThemedText style={styles.emptyTitle}>No Venues Yet</ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              Add your first venue to start creating sessions and accepting bookings
            </ThemedText>
            <TouchableOpacity
              style={styles.addVenueButton}
              onPress={handleAddVenue}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <ThemedText style={styles.addVenueButtonText}>Add Venue</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        /* Venues List */
        <FlatList
          data={venues}
          renderItem={renderVenue}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <ThemedText style={styles.listHeaderTitle}>
                {venues.length} Venue{venues.length !== 1 ? 's' : ''}
              </ThemedText>
              <ThemedText style={styles.listHeaderSubtitle}>
                Tap any venue to view details and edit
              </ThemedText>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  addButton: {
    padding: 4,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  listHeader: {
    marginBottom: 20,
  },
  listHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  listHeaderSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  venueCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  venueImage: {
    width: '100%',
    height: 180,
  },
  venueImagePlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  venueInfo: {
    padding: 20,
  },
  venueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  venueName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    flex: 1,
    marginRight: 12,
  },
  venueType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f5ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  venueTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#002fff',
    textTransform: 'capitalize',
  },
  venueLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  venueLocationText: {
    fontSize: 14,
    color: '#666',
  },
  venueDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  venueStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e0e0e0',
  },
  amenitiesPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  amenitiesText: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f5ff',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#002fff',
  },
  chevron: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  addVenueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#002fff',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    gap: 8,
  },
  addVenueButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});