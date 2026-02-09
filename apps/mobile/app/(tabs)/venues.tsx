import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';

interface Gym {
  id: string;
  name: string;
  location: string;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  type: string | null;
  rating: string | null;
  image_url: string | null;
}

export default function venues() {
  const router = useRouter();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadGyms();
  }, []);

  const loadGyms = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('gyms')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      setGyms(data || []);
    } catch (error) {
      console.error('Error loading gyms:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredGyms = gyms.filter(gym =>
    gym.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    gym.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>Discover Venues</ThemedText>
        <ThemedText style={styles.subtitle}>
          Find the perfect gym for your fitness journey
        </ThemedText>
      </View>

      {/* Search Bar - FIXED */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search gyms or locations..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        {/* Gyms Count */}
        <ThemedText style={styles.resultsText}>
          {filteredGyms.length} {filteredGyms.length === 1 ? 'gym' : 'gyms'} available
        </ThemedText>

        {/* Gyms Grid */}
        <View style={styles.gymsGrid}>
          {filteredGyms.map((gym) => (
            <TouchableOpacity
              key={gym.id}
              style={styles.gymCard}
              onPress={() => router.push({
                pathname: '/gym-details',
                params: { gymId: gym.id }
              })}
            >
              {/* Gym Image Placeholder */}
              
              <View style={styles.gymCardContainer}>
                <Image
                    source={{ uri: gym.image_url || fallbackImage }}
                    style={styles.gymImage}
                />

                </View>

              {/* Gym Info */}
              <View style={styles.gymInfo}>
                <ThemedText style={styles.gymName}>{gym.name}</ThemedText>
                <ThemedText style={styles.gymDescription}>{gym.type}</ThemedText>
                
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={16} color="#666" />
                  <ThemedText style={styles.gymLocation}>{gym.location}</ThemedText>
                </View>

                {gym.description && (
                  <ThemedText style={styles.gymDescription} numberOfLines={2}>
                    {gym.description}
                  </ThemedText>
                )}

                <View style={styles.gymFooter}>
                  <View style={styles.ratingContainer}>
                    <Ionicons name="star" size={16} color="#FFB800" />
                    <ThemedText style={styles.rating}>{gym.rating}</ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {filteredGyms.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={64} color="#ccc" />
            <ThemedText style={styles.emptyText}>No gyms found</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Try adjusting your search
            </ThemedText>
          </View>
        )}
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
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  resultsText: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  gymsGrid: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  gymCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
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
  gymCardContainer: {
  backgroundColor: '#fff',
  borderRadius: 20,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 4, // Android
},
  gymImage: {
    height: 160,
    backgroundColor: '#002fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymInfo: {
    padding: 16,
  },
  gymName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 4,
  },
  gymLocation: {
    fontSize: 14,
    color: '#666',
  },
  gymDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  gymFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rating: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});