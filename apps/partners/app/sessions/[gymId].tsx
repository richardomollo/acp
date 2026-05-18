import { useRouter, useLocalSearchParams } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Session {
  id: string;
  name: string;
  instructor: string | null;
  category: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  credits_required: number;
  max_capacity: number;
  is_active: boolean;
}

export default function SessionsListScreen() {
  const router = useRouter();
  const { gymId } = useLocalSearchParams();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [gym, setGym] = useState<any>(null);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');

  useEffect(() => {
    loadData();
  }, [gymId, filter]);

  const loadData = async () => {
    try {
      // Load gym
      const { data: gymData } = await supabase
        .from('gyms')
        .select('*')
        .eq('id', gymId)
        .single();

      setGym(gymData);

      // Load sessions
      let query = supabase
        .from('sessions')
        .select('*')
        .eq('gym_id', gymId)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      const today = new Date().toISOString().split('T')[0];

      if (filter === 'upcoming') {
        query = query.gte('date', today);
      } else if (filter === 'past') {
        query = query.lt('date', today);
      }

      const { data, error } = await query;

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
      Alert.alert('Error', 'Failed to load sessions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleToggleActive = async (sessionId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ is_active: !currentStatus })
        .eq('id', sessionId);

      if (error) throw error;

      // Reload data
      loadData();
      Alert.alert('Success', `Session ${!currentStatus ? 'activated' : 'deactivated'}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to update session');
    }
  };

  const handleDeleteSession = (sessionId: string) => {
    Alert.alert(
      'Delete Session',
      'Are you sure you want to delete this session? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('sessions')
                .delete()
                .eq('id', sessionId);

              if (error) throw error;
              loadData();
              Alert.alert('Success', 'Session deleted');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete session');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  const renderSession = ({ item }: { item: Session }) => (
    <TouchableOpacity
      style={[styles.sessionCard, !item.is_active && styles.sessionCardInactive]}
      onPress={() => router.push(`/partner/session-details/${item.id}`)}
    >
      {/* Header */}
      <View style={styles.sessionHeader}>
        <View style={styles.sessionTitleRow}>
          <ThemedText style={styles.sessionName}>{item.name}</ThemedText>
          {!item.is_active && (
            <View style={styles.inactiveBadge}>
              <ThemedText style={styles.inactiveBadgeText}>Inactive</ThemedText>
            </View>
          )}
        </View>
        {item.category && (
          <View style={styles.categoryBadge}>
            <ThemedText style={styles.categoryBadgeText}>{item.category}</ThemedText>
          </View>
        )}
      </View>

      {/* Details */}
      <View style={styles.sessionDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color="#666" />
          <ThemedText style={styles.detailText}>{formatDate(item.date)}</ThemedText>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color="#666" />
          <ThemedText style={styles.detailText}>
            {formatTime(item.time)} ({item.duration_minutes} min)
          </ThemedText>
        </View>
        {item.instructor && (
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <ThemedText style={styles.detailText}>{item.instructor}</ThemedText>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.sessionFooter}>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <ThemedText style={styles.statValue}>{item.credits_required}</ThemedText>
            <ThemedText style={styles.statLabel}>Credits</ThemedText>
          </View>
          <View style={styles.stat}>
            <ThemedText style={styles.statValue}>{item.max_capacity}</ThemedText>
            <ThemedText style={styles.statLabel}>Capacity</ThemedText>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleToggleActive(item.id, item.is_active)}
          >
            <Ionicons 
              name={item.is_active ? 'pause-circle-outline' : 'play-circle-outline'} 
              size={24} 
              color="#002fff" 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDeleteSession(item.id)}
          >
            <Ionicons name="trash-outline" size={24} color="#ff3b30" />
          </TouchableOpacity>
        </View>
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
        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>Sessions</ThemedText>
          {gym && <ThemedText style={styles.headerSubtitle}>{gym.name}</ThemedText>}
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push(`/partner/create-session/${gymId}`)}
        >
          <Ionicons name="add" size={24} color="#002fff" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'upcoming' && styles.filterTabActive]}
          onPress={() => setFilter('upcoming')}
        >
          <ThemedText style={[styles.filterText, filter === 'upcoming' && styles.filterTextActive]}>
            Upcoming
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'past' && styles.filterTabActive]}
          onPress={() => setFilter('past')}
        >
          <ThemedText style={[styles.filterText, filter === 'past' && styles.filterTextActive]}>
            Past
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <ThemedText style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Sessions List */}
      <FlatList
        data={sessions}
        renderItem={renderSession}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={80} color="#e0e0e0" />
            <ThemedText style={styles.emptyTitle}>No sessions yet</ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              Create your first session to get started
            </ThemedText>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push(`/partner/create-session/${gymId}`)}
            >
              <ThemedText style={styles.emptyButtonText}>Create Session</ThemedText>
            </TouchableOpacity>
          </View>
        }
      />
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  addButton: {
    padding: 8,
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f8f8f8',
  },
  filterTabActive: {
    backgroundColor: '#002fff',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sessionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sessionCardInactive: {
    opacity: 0.6,
  },
  sessionHeader: {
    marginBottom: 12,
  },
  sessionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    flex: 1,
  },
  inactiveBadge: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f5ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#002fff',
  },
  sessionDetails: {
    gap: 8,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: '#002fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 24,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});