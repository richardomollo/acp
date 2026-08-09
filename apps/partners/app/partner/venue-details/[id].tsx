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
  cancellation_cutoff_hours: number;
  deposit_pct: number;
  no_show_grace_mins: number;
}

interface Stats {
  total_sessions: number;
  upcoming_sessions: number;
  total_bookings: number;
  active_sessions: number;
}

const VENUE_TYPES = ['gym', 'studio', 'box', 'center', 'club', 'other'];
const CUTOFF_OPTIONS = [0, 1, 2, 4, 12, 24, 48, 72];
const DEPOSIT_OPTIONS = [10, 20, 25, 30, 40, 50];
const NO_SHOW_OPTIONS = [0, 5, 10, 15, 30];

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
  const [newImageBase64, setNewImageBase64] = useState<string | null>(null);
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
    cancellation_cutoff_hours: 24,
    deposit_pct: 30,
    no_show_grace_mins: 15,
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
        cancellation_cutoff_hours: venueData.cancellation_cutoff_hours ?? 24,
        deposit_pct: venueData.deposit_pct ?? 30,
        no_show_grace_mins: venueData.no_show_grace_mins ?? 15,
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
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        setNewImageUri(result.assets[0].uri);
        setNewImageBase64(result.assets[0].base64 ?? null);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadImage = async (base64: string, venueId: string, uri: string) => {
    try {
      setUploadingImage(true);

      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const fileName = `gyms/${venueId}/main/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const { data, error: uploadError } = await supabase.storage
        .from('fitpass-images')
        .upload(fileName, bytes, { contentType: mimeType, upsert: true });

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
        } else if (newImageBase64) {
          const uploadedUrl = await uploadImage(newImageBase64, id as string, newImageUri);
          if (uploadedUrl) imageUrl = uploadedUrl;
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
          cancellation_cutoff_hours: editForm.cancellation_cutoff_hours,
          deposit_pct: editForm.deposit_pct,
          no_show_grace_mins: editForm.no_show_grace_mins,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      Alert.alert('Success', 'Venue updated successfully');
      setEditMode(false);
      setNewImageUri(null);
      setNewImageBase64(null);
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
              setNewImageBase64(null);
              // Reset form
              setEditForm({
                name: venue.name,
                location: venue.location,
                area: venue.area || '',
                address: venue.address || '',
                type: venue.type || 'gym',
                description: venue.description || '',
                cancellation_cutoff_hours: venue.cancellation_cutoff_hours ?? 24,
                deposit_pct: venue.deposit_pct ?? 30,
                no_show_grace_mins: venue.no_show_grace_mins ?? 15,
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

            {/* ── Cancellation Policy ── */}
            <View style={styles.policySectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#002fff" />
              <ThemedText style={styles.policySectionTitle}>Cancellation Policy</ThemedText>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Free cancellation window</ThemedText>
              <ThemedText style={styles.inputHint}>
                Customers can cancel for a full refund up to this many hours before the session.
                Set to 0 to disable free cancellation.
              </ThemedText>
              <View style={styles.chipGrid}>
                {CUTOFF_OPTIONS.map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.chip, editForm.cancellation_cutoff_hours === h && styles.chipActive]}
                    onPress={() => setEditForm({ ...editForm, cancellation_cutoff_hours: h })}
                  >
                    <ThemedText style={[styles.chipText, editForm.cancellation_cutoff_hours === h && styles.chipTextActive]}>
                      {h === 0 ? 'None' : `${h}h`}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Deposit percentage</ThemedText>
              <ThemedText style={styles.inputHint}>
                Percentage of the session price collected upfront at booking.
              </ThemedText>
              <View style={styles.chipGrid}>
                {DEPOSIT_OPTIONS.map(pct => (
                  <TouchableOpacity
                    key={pct}
                    style={[styles.chip, editForm.deposit_pct === pct && styles.chipActive]}
                    onPress={() => setEditForm({ ...editForm, deposit_pct: pct })}
                  >
                    <ThemedText style={[styles.chipText, editForm.deposit_pct === pct && styles.chipTextActive]}>
                      {pct}%
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>No-show grace period</ThemedText>
              <ThemedText style={styles.inputHint}>
                Minutes after the session starts before an unchecked booking is marked as no-show.
              </ThemedText>
              <View style={styles.chipGrid}>
                {NO_SHOW_OPTIONS.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.chip, editForm.no_show_grace_mins === m && styles.chipActive]}
                    onPress={() => setEditForm({ ...editForm, no_show_grace_mins: m })}
                  >
                    <ThemedText style={[styles.chipText, editForm.no_show_grace_mins === m && styles.chipTextActive]}>
                      {m === 0 ? 'Immediate' : `${m} min`}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
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

            {/* Cancellation Policy Card */}
            <View style={styles.policyCard}>
              <View style={styles.policyCardHeader}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#002fff" />
                <ThemedText style={styles.policyCardTitle}>Cancellation Policy</ThemedText>
                <TouchableOpacity onPress={() => setEditMode(true)} style={styles.policyEditBtn}>
                  <ThemedText style={styles.policyEditBtnText}>Edit</ThemedText>
                </TouchableOpacity>
              </View>

              <View style={styles.policyRow}>
                <View style={styles.policyIconWrap}>
                  <Ionicons name="time-outline" size={18} color="#555" />
                </View>
                <View style={styles.policyContent}>
                  <ThemedText style={styles.policyLabel}>Free cancellation window</ThemedText>
                  <ThemedText style={styles.policyValue}>
                    {(venue.cancellation_cutoff_hours ?? 24) === 0
                      ? 'No free cancellation'
                      : `Up to ${venue.cancellation_cutoff_hours ?? 24} hours before session`}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.policyRow}>
                <View style={styles.policyIconWrap}>
                  <Ionicons name="card-outline" size={18} color="#555" />
                </View>
                <View style={styles.policyContent}>
                  <ThemedText style={styles.policyLabel}>Deposit required</ThemedText>
                  <ThemedText style={styles.policyValue}>
                    {venue.deposit_pct ?? 30}% of session price paid upfront
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.policyRow, { borderBottomWidth: 0 }]}>
                <View style={styles.policyIconWrap}>
                  <Ionicons name="alert-circle-outline" size={18} color="#555" />
                </View>
                <View style={styles.policyContent}>
                  <ThemedText style={styles.policyLabel}>No-show grace period</ThemedText>
                  <ThemedText style={styles.policyValue}>
                    {(venue.no_show_grace_mins ?? 15) === 0
                      ? 'Immediate (no grace period)'
                      : `${venue.no_show_grace_mins ?? 15} minutes after session starts`}
                  </ThemedText>
                </View>
              </View>
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

  // ── Policy section (edit mode) ──
  policySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  policySectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  inputHint: {
    fontSize: 12,
    color: '#888',
    marginBottom: 10,
    lineHeight: 17,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  chipActive: {
    borderColor: '#002fff',
    backgroundColor: '#f0f5ff',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  chipTextActive: {
    color: '#002fff',
  },

  // ── Policy card (view mode) ──
  policyCard: {
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
  policyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  policyCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    flex: 1,
  },
  policyEditBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f0f5ff',
  },
  policyEditBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#002fff',
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  policyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f8f8f8',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  policyContent: {
    flex: 1,
    gap: 2,
  },
  policyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  policyValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111',
    lineHeight: 20,
  },

});