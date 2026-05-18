import { useRouter, useLocalSearchParams } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

interface Venue {
  id: string;
  name: string;
  location: string;
  area: string;
  address: string;
  type: string;
  description: string | null;
  image_url: string | null;
  amenities: string[];
  operating_hours: any;
  drop_in_price: number | null;
  rate_floor: number | null;
  rate_floor_percentage: number | null;
  max_platform_spots: number;
}

interface Stats {
  total_sessions: number;
  upcoming_sessions: number;
  total_bookings: number;
  active_sessions: number;
}

const VENUE_TYPES = ['gym', 'studio', 'box', 'center', 'club', 'other'];

export default function VenueDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [newImageUri, setNewImageUri] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    total_sessions: 0,
    upcoming_sessions: 0,
    total_bookings: 0,
    active_sessions: 0,
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    location: '',
    area: '',
    address: '',
    type: 'gym',
    description: '',
  });

  useEffect(() => {
    loadVenueData();
  }, []);

  const loadVenueData = async () => {
    try {
      setLoading(true);

      // Get venue details
      const { data: venueData, error: venueError } = await supabase
        .from('gyms')
        .select('*')
        .eq('id', id)
        .single();

      if (venueError) throw venueError;

      setVenue(venueData);

      // Set edit form initial values
      setEditForm({
        name: venueData.name,
        location: venueData.location,
        area: venueData.area || '',
        address: venueData.address || '',
        type: venueData.type || 'gym',
        description: venueData.description || '',
      });

      // Get stats
      const today = new Date().toISOString().split('T')[0];

      // Total sessions
      const { count: totalSessions } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('gym_id', id);

      // Upcoming sessions
      const { count: upcomingSessions } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('gym_id', id)
        .gte('date', today)
        .eq('is_active', true);

      // Active sessions
      const { count: activeSessions } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('gym_id', id)
        .eq('is_active', true);

      // Total bookings
      const { count: totalBookings } = await supabase
        .from('bookings')
        .select('*, sessions!inner(gym_id)', { count: 'exact', head: true })
        .eq('sessions.gym_id', id);

      setStats({
        total_sessions: totalSessions || 0,
        upcoming_sessions: upcomingSessions || 0,
        total_bookings: totalBookings || 0,
        active_sessions: activeSessions || 0,
      });

    } catch (error: any) {
      console.error('Load venue error:', error);
      Alert.alert('Error', 'Failed to load venue details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadVenueData();
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please allow access to your photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled) {
        setNewImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (uri: string, venueId: string) => {
    try {
      setUploadingImage(true);
      
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const ext = uri.split('.').pop() || 'jpg';
      const fileName = `gyms/${venueId}/main/${timestamp}-${random}.${ext}`;

      const { data, error: uploadError } = await supabase.storage
        .from('fitpass-images')
        .upload(fileName, arrayBuffer, {
          contentType: `image/${ext}`,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('fitpass-images')
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Image upload error:', error);
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    Alert.alert(
      'Remove Image',
      'Are you sure you want to remove the venue image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setNewImageUri('REMOVE'); // Special flag to indicate removal
          }
        }
      ]
    );
  };

  const handleSaveChanges = async () => {
    // Validation
    if (!editForm.name.trim()) {
      Alert.alert('Error', 'Please enter a venue name');
      return;
    }

    if (!editForm.location.trim()) {
      Alert.alert('Error', 'Please enter a city/location');
      return;
    }

    if (!editForm.area.trim()) {
      Alert.alert('Error', 'Please enter an area/district');
      return;
    }

    if (!editForm.address.trim()) {
      Alert.alert('Error', 'Please enter an address');
      return;
    }

    setSaving(true);

    try {
      let imageUrl = venue?.image_url;

      // Handle image upload or removal
      if (newImageUri) {
        if (newImageUri === 'REMOVE') {
          imageUrl = null;
        } else {
          const uploadedUrl = await uploadImage(newImageUri, id as string);
          if (uploadedUrl) {
            imageUrl = uploadedUrl;
          }
        }
      }

      const { error } = await supabase
        .from('gyms')
        .update({
          name: editForm.name.trim(),
          location: editForm.location.trim(),
          area: editForm.area.trim(),
          address: editForm.address.trim(),
          type: editForm.type,
          description: editForm.description.trim() || null,
          image_url: imageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      Alert.alert('Success', 'Venue updated successfully');
      setEditMode(false);
      setNewImageUri(null);
      loadVenueData();

    } catch (error: any) {
      console.error('Save venue error:', error);
      Alert.alert('Error', error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVenue = () => {
    Alert.alert(
      'Delete Venue',
      `Are you sure you want to delete "${venue?.name}"? This will also delete all sessions and bookings for this venue. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('gyms')
                .delete()
                .eq('id', id);

              if (error) throw error;

              Alert.alert('Success', 'Venue deleted');
              router.back();

            } catch (error) {
              Alert.alert('Error', 'Failed to delete venue');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
      </View>
    );
  }

  if (!venue) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="alert-circle-outline" size={80} color="#e0e0e0" />
        <ThemedText style={styles.errorText}>Venue not found</ThemedText>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  // Determine which image to show
  const currentImageUri = newImageUri && newImageUri !== 'REMOVE' 
    ? newImageUri 
    : (newImageUri === 'REMOVE' ? null : venue.image_url);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerBackButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>
          {editMode ? 'Edit Venue' : 'Venue Details'}
        </ThemedText>
        <TouchableOpacity
          style={styles.headerActionButton}
          onPress={() => {
            if (editMode) {
              setEditMode(false);
              setNewImageUri(null);
              // Reset form
              setEditForm({
                name: venue.name,
                location: venue.location,
                area: venue.area || '',
                address: venue.address || '',
                type: venue.type || 'gym',
                description: venue.description || '',
              });
            } else {
              setEditMode(true);
            }
          }}
        >
          <Ionicons 
            name={editMode ? "close" : "create-outline"} 
            size={24} 
            color="#002fff" 
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {editMode ? (
          /* EDIT MODE */
          <View style={styles.editContainer}>
            {/* Venue Image Upload */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Venue Image</ThemedText>
              
              {currentImageUri ? (
                <View style={styles.imageContainer}>
                  <Image 
                    source={{ uri: currentImageUri }} 
                    style={styles.uploadedImage}
                    contentFit="cover"
                  />
                  <View style={styles.imageOverlay}>
                    <TouchableOpacity
                      style={styles.changeImageButton}
                      onPress={handlePickImage}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="camera" size={18} color="#fff" />
                          <ThemedText style={styles.changeImageText}>Change</ThemedText>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={handleRemoveImage}
                      disabled={uploadingImage}
                    >
                      <Ionicons name="trash" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={handlePickImage}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <ActivityIndicator color="#002fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={40} color="#002fff" />
                      <ThemedText style={styles.uploadText}>Upload Image</ThemedText>
                      <ThemedText style={styles.uploadSubtext}>
                        Recommended: 16:9 ratio, max 5MB
                      </ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Venue Name */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>
                Venue Name <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={styles.input}
                value={editForm.name}
                onChangeText={(text) => setEditForm({ ...editForm, name: text })}
                placeholder="e.g., Downtown Fitness"
                placeholderTextColor="#999"
              />
            </View>

            {/* City/Location */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>
                City <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={styles.input}
                value={editForm.location}
                onChangeText={(text) => setEditForm({ ...editForm, location: text })}
                placeholder="e.g., San Francisco"
                placeholderTextColor="#999"
              />
            </View>

            {/* Area */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>
                Area/District <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={styles.input}
                value={editForm.area}
                onChangeText={(text) => setEditForm({ ...editForm, area: text })}
                placeholder="e.g., Mission District"
                placeholderTextColor="#999"
              />
            </View>

            {/* Address */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>
                Full Address <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editForm.address}
                onChangeText={(text) => setEditForm({ ...editForm, address: text })}
                placeholder="e.g., 123 Market Street, Suite 100"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Type */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Venue Type</ThemedText>
              <View style={styles.typeGrid}>
                {VENUE_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      editForm.type === type && styles.typeButtonActive
                    ]}
                    onPress={() => setEditForm({ ...editForm, type })}
                  >
                    <ThemedText style={[
                      styles.typeText,
                      editForm.type === type && styles.typeTextActive
                    ]}>
                      {type}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Description (Optional)</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editForm.description}
                onChangeText={(text) => setEditForm({ ...editForm, description: text })}
                placeholder="Describe your venue, facilities, atmosphere..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveButton, (saving || uploadingImage) && { opacity: 0.6 }]}
              onPress={handleSaveChanges}
              disabled={saving || uploadingImage}
            >
              {saving || uploadingImage ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          /* VIEW MODE */
          <>
            {/* Venue Image */}
            {venue.image_url ? (
              <Image 
                source={{ uri: venue.image_url }} 
                style={styles.venueImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.venueImagePlaceholder}>
                <Ionicons name="business" size={80} color="#999" />
              </View>
            )}

            {/* Venue Info Card */}
            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <View style={styles.infoTitleRow}>
                  <ThemedText style={styles.venueName}>{venue.name}</ThemedText>
                  <View style={styles.venueTypeBadge}>
                    <ThemedText style={styles.venueTypeBadgeText}>{venue.type}</ThemedText>
                  </View>
                </View>
              </View>

              <View style={styles.infoSection}>
                <View style={styles.infoItem}>
                  <Ionicons name="location" size={20} color="#000000" />
                  <View style={styles.infoContent}>
                    <ThemedText style={styles.infoLabel}>Location</ThemedText>
                    <ThemedText style={styles.infoValue}>
                      {venue.area}, {venue.location}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.infoItem}>
                  <Ionicons name="map" size={20} color="#000000" />
                  <View style={styles.infoContent}>
                    <ThemedText style={styles.infoLabel}>Address</ThemedText>
                    <ThemedText style={styles.infoValue}>{venue.address}</ThemedText>
                  </View>
                </View>

                {venue.description && (
                  <View style={styles.infoItem}>
                    <Ionicons name="information-circle" size={20} color="#000000" />
                    <View style={styles.infoContent}>
                      <ThemedText style={styles.infoLabel}>Description</ThemedText>
                      <ThemedText style={styles.infoValue}>{venue.description}</ThemedText>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* Stats Card */}
            <View style={styles.statsCard}>
              <ThemedText style={styles.statsTitle}>Overview</ThemedText>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Ionicons name="calendar-outline" size={28} color="#000000" />
                  <ThemedText style={styles.statValue}>{stats.upcoming_sessions}</ThemedText>
                  <ThemedText style={styles.statLabel}>Upcoming Sessions</ThemedText>
                </View>

                <View style={styles.statCard}>
                  <Ionicons name="list-outline" size={28} color="#000000" />
                  <ThemedText style={styles.statValue}>{stats.total_sessions}</ThemedText>
                  <ThemedText style={styles.statLabel}>Total Sessions</ThemedText>
                </View>

                <View style={styles.statCard}>
                  <Ionicons name="checkmark-circle-outline" size={28} color="#000000" />
                  <ThemedText style={styles.statValue}>{stats.active_sessions}</ThemedText>
                  <ThemedText style={styles.statLabel}>Active</ThemedText>
                </View>

                <View style={styles.statCard}>
                  <Ionicons name="people-outline" size={28} color="#000000" />
                  <ThemedText style={styles.statValue}>{stats.total_bookings}</ThemedText>
                  <ThemedText style={styles.statLabel}>Total Bookings</ThemedText>
                </View>
              </View>
            </View>

            {/* SmartRate Pricing Card - NEW */}
            <View style={styles.smartRateCard}>
              <View style={styles.smartRateHeader}>
                <View style={styles.smartRateTitleRow}>
                  <Ionicons name="flash" size={24} color="#002fff" />
                  <ThemedText style={styles.smartRateTitle}>SmartRate Pricing</ThemedText>
                </View>
                {venue.rate_floor && (
                  <View style={styles.smartRateStatusBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#00c853" />
                    <ThemedText style={styles.smartRateStatusText}>Active</ThemedText>
                  </View>
                )}
              </View>

              {venue.rate_floor ? (
                <>
                  <View style={styles.smartRatePricingInfo}>
                    <View style={styles.smartRatePricingRow}>
                      <ThemedText style={styles.smartRatePricingLabel}>Drop-in Price:</ThemedText>
                      <ThemedText style={styles.smartRatePricingValue}>
                        KES {venue.drop_in_price?.toLocaleString()}
                      </ThemedText>
                    </View>
                    
                    <View style={styles.smartRatePricingRow}>
                      <ThemedText style={styles.smartRatePricingLabel}>
                        Rate Floor ({venue.rate_floor_percentage}%):
                      </ThemedText>
                      <ThemedText style={[styles.smartRatePricingValue, styles.smartRateHighlight]}>
                        KES {venue.rate_floor?.toLocaleString()}
                      </ThemedText>
                    </View>
                    
                    <View style={styles.smartRatePricingRow}>
                      <ThemedText style={styles.smartRatePricingLabel}>Max Platform Spots:</ThemedText>
                      <ThemedText style={styles.smartRatePricingValue}>
                        {venue.max_platform_spots || 5} per session
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.smartRateInfoBox}>
                    <Ionicons name="information-circle" size={16} color="#002fff" />
                    <ThemedText style={styles.smartRateInfoText}>
                      You're guaranteed to earn at least KES {venue.rate_floor?.toLocaleString()} per booking, 
                      while SmartRate optimizes pricing based on demand.
                    </ThemedText>
                  </View>
                </>
              ) : (
                <View style={styles.smartRateSetupPrompt}>
                  <Ionicons name="flash-outline" size={32} color="#666" />
                  <ThemedText style={styles.smartRateSetupTitle}>
                    Set Up SmartRate Pricing
                  </ThemedText>
                  <ThemedText style={styles.smartRateSetupText}>
                    Enable dynamic pricing to maximize revenue while protecting your minimum payout
                  </ThemedText>
                  
                  <View style={styles.smartRateFeatures}>
                    <View style={styles.smartRateFeature}>
                      <Ionicons name="checkmark-circle" size={18} color="#00c853" />
                      <ThemedText style={styles.smartRateFeatureText}>Guaranteed minimum revenue</ThemedText>
                    </View>
                    <View style={styles.smartRateFeature}>
                      <Ionicons name="trending-up" size={18} color="#002fff" />
                      <ThemedText style={styles.smartRateFeatureText}>Earn more during peak times</ThemedText>
                    </View>
                    <View style={styles.smartRateFeature}>
                      <Ionicons name="shield-checkmark" size={18} color="#ff9500" />
                      <ThemedText style={styles.smartRateFeatureText}>Protect direct bookings</ThemedText>
                    </View>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={styles.smartRateActionButton}
                onPress={() => router.push(`/partner/rate-floor/${venue.id}`)}
              >
                <Ionicons name="flash" size={20} color="#fff" />
                <ThemedText style={styles.smartRateActionButtonText}>
                  {venue.rate_floor ? 'Update Pricing' : 'Set Up SmartRate'}
                </ThemedText>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Quick Actions */}
            <View style={styles.actionsCard}>
              <ThemedText style={styles.actionsTitle}>Quick Actions</ThemedText>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(`/create-session/${venue.id}`)}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="add-circle" size={24} color="#000000" />
                </View>
                <View style={styles.actionContent}>
                  <ThemedText style={styles.actionTitle}>Create Session</ThemedText>
                  <ThemedText style={styles.actionSubtitle}>Add a new class or session</ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/partner/sessionsoverview')}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="calendar" size={24} color="#000000" />
                </View>
                <View style={styles.actionContent}>
                  <ThemedText style={styles.actionTitle}>View Sessions</ThemedText>
                  <ThemedText style={styles.actionSubtitle}>
                    {stats.total_sessions} session{stats.total_sessions !== 1 ? 's' : ''}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleDeleteVenue}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#ffebee' }]}>
                  <Ionicons name="trash" size={24} color="#ff3b30" />
                </View>
                <View style={styles.actionContent}>
                  <ThemedText style={[styles.actionTitle, { color: '#ff3b30' }]}>
                    Delete Venue
                  </ThemedText>
                  <ThemedText style={styles.actionSubtitle}>
                    Permanently remove this venue
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerBackButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  headerActionButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 20,
  },
  backButton: {
    backgroundColor: '#002fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 24,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  venueImage: {
    width: '100%',
    height: 250,
  },
  venueImagePlaceholder: {
    width: '100%',
    height: 250,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    backgroundColor: '#fff',
    padding: 20,
    marginHorizontal: 20,
    marginTop: -30,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  infoHeader: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  venueName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    flex: 1,
    marginRight: 12,
  },
  venueTypeBadge: {
    backgroundColor: '#f0f5ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  venueTypeBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#002fff',
    textTransform: 'capitalize',
  },
  infoSection: {
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    gap: 12,
  },
  infoContent: {
    flex: 1,
    gap: 4,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  infoValue: {
    fontSize: 15,
    color: '#000',
    lineHeight: 22,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f5ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  editContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    margin: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  required: {
    color: '#ff3b30',
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  typeButtonActive: {
    borderColor: '#002fff',
    backgroundColor: '#f0f5ff',
  },
  typeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textTransform: 'capitalize',
  },
  typeTextActive: {
    color: '#002fff',
  },
  saveButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  
  // Image Upload Styles
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  changeImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 47, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  changeImageText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  removeImageButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButton: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#002fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f0f5ff',
    height: 200,
    justifyContent: 'center',
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#002fff',
    marginTop: 12,
  },
  uploadSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },

  // SmartRate Pricing Card Styles (NEW - appended at bottom)
  smartRateCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 20,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  smartRateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  smartRateTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smartRateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  smartRateStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  smartRateStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00c853',
  },
  smartRatePricingInfo: {
    marginBottom: 16,
  },
  smartRatePricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  smartRatePricingLabel: {
    fontSize: 14,
    color: '#666',
  },
  smartRatePricingValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  smartRateHighlight: {
    color: '#002fff',
    fontWeight: '700',
  },
  smartRateInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#f0f5ff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  smartRateInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  smartRateSetupPrompt: {
    alignItems: 'center',
    padding: 20,
    marginBottom: 16,
  },
  smartRateSetupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  smartRateSetupText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  smartRateFeatures: {
    width: '100%',
    gap: 12,
  },
  smartRateFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  smartRateFeatureText: {
    fontSize: 14,
    color: '#000',
  },
  smartRateActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#002fff',
    paddingVertical: 14,
    borderRadius: 25,
    shadowColor: '#002fff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  smartRateActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});