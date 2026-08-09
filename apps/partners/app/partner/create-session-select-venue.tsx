import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  FlatList,
  Alert,
  ActivityIndicator
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
  type: string;
  image_url: string | null;
  sessions_count: number;
}

export default function CreateSessionSelectVenueScreen() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVenues();
  }, []);

  const loadVenues = async () => {
    try {
      setLoading(true);

      // Get current partner
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/(auth)/partner-login');
        return;
      }

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) {
        router.replace('/(auth)/partner-login');
        return;
      }

      // Get partner's gyms
      const { data: partnerGyms } = await supabase
        .from('partner_gyms')
        .select('gym_id, gyms(*)')
        .eq('partner_id', partner.id);

      if (!partnerGyms || partnerGyms.length === 0) {
        Alert.alert('No Venues', 'You need a venue before adding sessions.');
        router.back();
        return;
      }

      // Get sessions count for each venue
      const venuesWithCounts = await Promise.all(
        partnerGyms.map(async (pg) => {
          const gym = pg.gyms as any;
          
          const { count } = await supabase
            .from('sessions')
            .select('*', { count: 'exact', head: true })
            .eq('gym_id', gym.id);

          return {
            id: gym.id,
            name: gym.name,
            location: gym.location,
            type: gym.type,
            image_url: gym.image_url,
            sessions_count: count || 0,
          };
        })
      );

      setVenues(venuesWithCounts);

      // If only one venue, skip selection and go directly to create
      if (venuesWithCounts.length === 1) {
        router.replace(`/create-session/${venuesWithCounts[0].id}`);
      }

    } catch (error: any) {
      console.error('Load venues error:', error);
      Alert.alert('Error', 'Failed to load venues');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVenue = (venueId: string) => {
    router.push(`/create-session/${venueId}`);
  };

  const renderVenue = ({ item }: { item: Venue }) => (
    <TouchableOpacity
      style={styles.venueCard}
      onPress={() => handleSelectVenue(item.id)}
    >
      {item.image_url ? (
        <Image 
          source={{ uri: item.image_url }} 
          style={styles.venueImage}
          contentFit="cover"
        />
      ) : (
        <View style={styles.venueImagePlaceholder}>
          <Ionicons name="business" size={40} color="#999" />
        </View>
      )}

      <View style={styles.venueInfo}>
        <ThemedText style={styles.venueName}>{item.name}</ThemedText>
        <ThemedText style={styles.venueLocation}>{item.location}</ThemedText>
        <View style={styles.venueFooter}>
          <View style={styles.venueType}>
            <Ionicons name="fitness-outline" size={16} color="#666" />
            <ThemedText style={styles.venueTypeText}>{item.type}</ThemedText>
          </View>
          <ThemedText style={styles.sessionsCount}>
            {item.sessions_count} session{item.sessions_count !== 1 ? 's' : ''}
          </ThemedText>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={24} color="#999" />
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
        <ThemedText style={styles.headerTitle}>Select Venue</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <ThemedText style={styles.title}>
          Choose a venue for your session
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Select the location where this session will take place
        </ThemedText>

        <FlatList
          data={venues}
          renderItem={renderVenue}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
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
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 24,
  },
  listContent: {
    paddingBottom: 40,
  },
  venueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  venueImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 12,
  },
  venueImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  venueLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  venueFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  venueType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  venueTypeText: {
    fontSize: 13,
    color: '#666',
    textTransform: 'capitalize',
  },
  sessionsCount: {
    fontSize: 12,
    color: '#999',
  },
});