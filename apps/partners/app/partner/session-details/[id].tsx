import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  RefreshControl,
  Image,
  Share,
  Linking,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { fetchSessionCategories } from '../../../lib/lookups';
import DatePickerModal from '@/components/DatePickerModal';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';

const CUTOFF_OPTIONS = [null, 0, 1, 2, 4, 12, 24, 48, 72] as const;
const DEPOSIT_OPTIONS = [null, 10, 20, 25, 30, 40, 50] as const;
const NO_SHOW_OPTIONS = [null, 0, 5, 10, 15, 30] as const;

interface Session {
  id: string;
  name: string;
  instructor: string | null;
  category: string | null;
  date: string;
  time: string;
  duration_minutes: number;
  drop_in_price: number | null;
  max_capacity: number;
  is_active: boolean;
  recurring: boolean;
  recurrence_rule: any;
  gym_id: string;
  gym_name: string;
  image_url: string | null;
  cancellation_cutoff_hours: number | null;
  deposit_pct: number | null;
  no_show_grace_mins: number | null;
}

interface Booking {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'cancelled' | 'cancelled_by_customer' | 'cancelled_by_partner' | 'rescheduled' | 'deposit_paid' | 'no_show';
  booking_date: string;
  created_at: string;
  confirmation_code: string | null;
  deposit_amount: number | null;
}

function categoryIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('yoga'))                        return 'leaf';
  if (n.includes('hiit'))                        return 'flame';
  if (n.includes('pilates'))                     return 'fitness';
  if (n.includes('strength') || n.includes('weight')) return 'barbell';
  if (n.includes('cardio') || n.includes('heart'))    return 'heart';
  if (n.includes('crossfit'))                    return 'trending-up';
  if (n.includes('boxing') || n.includes('martial'))  return 'hand-right';
  if (n.includes('cycling') || n.includes('spin'))    return 'bicycle';
  if (n.includes('dance'))                       return 'musical-notes';
  if (n.includes('swimming') || n.includes('swim'))   return 'water';
  if (n.includes('running') || n.includes('run'))     return 'walk';
  if (n.includes('meditation') || n.includes('wellness')) return 'leaf';
  return 'ellipsis-horizontal';
}

const DURATIONS = [30, 45, 60, 75, 90, 120];

// Image upload helper function
async function uploadSessionImage(sessionId: string, base64: string, uri: string): Promise<string | null> {
  try {
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const filename = `sessions/${sessionId}/${Date.now()}.${ext}`;

    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const { data, error } = await supabase.storage
      .from('fitpass-images')
      .upload(filename, bytes, { contentType: mimeType, upsert: true });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from('fitpass-images').getPublicUrl(data.path);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Upload error:', error);
    Alert.alert('Error', 'Failed to upload image');
    return null;
  }
}

export default function SessionDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => { fetchSessionCategories().then(setCategories); }, []);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [uploadingImage, setUploadingImage] = useState(false);
  const [sessionImage, setSessionImage] = useState<string | null>(null);
  const [venuePolicy, setVenuePolicy] = useState<{ cutoff: number; deposit: number; grace: number } | null>(null);
  const [rateFloorPct, setRateFloorPct] = useState<number | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<{ ids: string[]; count: number } | null>(null);
  const [applyToSeries, setApplyToSeries] = useState(false);

  // Accordion state — start with details open, rest collapsed
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const toggleAccordion = (setter: (v: boolean) => void, current: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setter(!current);
  };

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    instructor: '',
    category: '',
    date: new Date(),
    time: new Date(),
    duration_minutes: 60,
    drop_in_price: '',
    max_capacity: 20,
    is_active: true,
    cancellation_cutoff_hours: null as number | null,
    deposit_pct: null as number | null,
    no_show_grace_mins: null as number | null,
  });

  useEffect(() => {
    loadSessionData();
  }, []);

  const loadSessionData = async () => {
    try {
      setLoading(true);

      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*, gyms(name, rate_floor_percentage, cancellation_cutoff_hours, deposit_pct, no_show_grace_mins)')
        .eq('id', id)
        .single();

      if (sessionError) throw sessionError;

      const gymData = sessionData.gyms as any;
      const sessionWithGym = {
        ...sessionData,
        gym_name: gymData?.name || 'Unknown',
      };

      setSession(sessionWithGym);
      setSessionImage(sessionData.image_url || null);

      // Recurring occurrences share no linking column — grouped the same way
      // the admin/web partner dashboards do, by gym_id + name + time + category.
      if (sessionData.recurring) {
        const { data: siblings } = await supabase
          .from('sessions')
          .select('id')
          .eq('gym_id', sessionData.gym_id)
          .eq('name', sessionData.name)
          .eq('time', sessionData.time)
          .eq('category', sessionData.category)
          .eq('recurring', true);
        setSeriesInfo(siblings && siblings.length > 1 ? { ids: siblings.map(s => s.id), count: siblings.length } : null);
      } else {
        setSeriesInfo(null);
      }
      setApplyToSeries(false);

      if (gymData?.rate_floor_percentage != null) {
        setRateFloorPct(gymData.rate_floor_percentage);
      }
      setVenuePolicy({
        cutoff: gymData?.cancellation_cutoff_hours ?? 24,
        deposit: gymData?.deposit_pct ?? 30,
        grace: gymData?.no_show_grace_mins ?? 15,
      });
      // Set edit form initial values
      const sessionDate = new Date(sessionData.date);

      const [hours, minutes] = sessionData.time.split(':');
      const sessionTime = new Date();
      sessionTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      setEditForm({
        name: sessionData.name,
        instructor: sessionData.instructor || '',
        category: sessionData.category || 'yoga',
        date: sessionDate,
        time: sessionTime,
        duration_minutes: sessionData.duration_minutes,
        drop_in_price: sessionData.drop_in_price?.toString() || '',
        max_capacity: sessionData.max_capacity,
        is_active: sessionData.is_active,
        cancellation_cutoff_hours: sessionData.cancellation_cutoff_hours ?? null,
        deposit_pct: sessionData.deposit_pct ?? null,
        no_show_grace_mins: sessionData.no_show_grace_mins ?? null,
      });

      // Get bookings
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, user_id, status, booking_date, created_at, confirmation_code, deposit_amount')
        .eq('session_id', id)
        .order('created_at', { ascending: false });

      if (bookingsError) throw bookingsError;

      // Fetch user details separately (join via RLS can silently return null)
      const userIds = [...new Set((bookingsData || []).map(b => b.user_id).filter(Boolean))];
      const userMap: Record<string, { name: string; email: string }> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', userIds);
        (usersData || []).forEach(u => { userMap[u.id] = { name: u.name || '', email: u.email || '' }; });
      }

      const formattedBookings = (bookingsData || []).map(b => ({
        id: b.id,
        user_id: b.user_id,
        user_name: userMap[b.user_id]?.name || 'Unknown',
        user_email: userMap[b.user_id]?.email || '',
        status: b.status as any,
        booking_date: b.booking_date,
        created_at: b.created_at,
        confirmation_code: (b as any).confirmation_code || null,
        deposit_amount: (b as any).deposit_amount || null,
      }));

      setBookings(formattedBookings);

    } catch (error: any) {
      console.error('Load session error:', error);
      Alert.alert('Error', 'Failed to load session details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleShare = async () => {
    if (!session) return;
    const url = `https://activecitypass.com/sessions/${session.id}`;
    const text = `Book "${session.name}" at ${session.gym_name} — ${formatDate(session.date)} at ${formatTime(session.time)}`;
    try {
      await Share.share({
        message: Platform.OS === 'ios' ? text : `${text}\n\n${url}`,
        url: Platform.OS === 'ios' ? url : undefined,
        title: session.name,
      });
    } catch { /* cancelled */ }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadSessionData();
  };

  const handlePickImage = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please allow access to your photos');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets[0]?.base64) return;

      setUploadingImage(true);

      const imageUrl = await uploadSessionImage(id as string, result.assets[0].base64, result.assets[0].uri);

      if (imageUrl) {
        setSessionImage(imageUrl);
        
        // Update database immediately
        const { error } = await supabase
          .from('sessions')
          .update({ image_url: imageUrl })
          .eq('id', id);

        if (error) {
          Alert.alert('Error', 'Failed to save image');
        } else {
          Alert.alert('Success', 'Session image updated');
        }
      }

    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    Alert.alert(
      'Remove Image',
      'Are you sure you want to remove the session image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('sessions')
                .update({ image_url: null })
                .eq('id', id);

              if (error) throw error;

              setSessionImage(null);
              Alert.alert('Success', 'Image removed');

            } catch (error) {
              Alert.alert('Error', 'Failed to remove image');
            }
          }
        }
      ]
    );
  };

  const handleSaveChanges = async () => {
    if (!editForm.name.trim()) {
      Alert.alert('Error', 'Please enter a session name');
      return;
    }

    setSaving(true);

    try {
      const timeString = editForm.time.toTimeString().split(' ')[0].substring(0, 5);
      const dateString = editForm.date.toISOString().split('T')[0];

      const dropInPriceNum = parseFloat(editForm.drop_in_price) || 0;
      const bulkFields = {
        name: editForm.name.trim(),
        instructor: editForm.instructor.trim() || null,
        category: editForm.category,
        time: timeString,
        duration_minutes: editForm.duration_minutes,
        drop_in_price: dropInPriceNum,
        max_capacity: editForm.max_capacity,
        cancellation_cutoff_hours: editForm.cancellation_cutoff_hours,
        deposit_pct: editForm.deposit_pct,
        no_show_grace_mins: editForm.no_show_grace_mins,
        updated_at: new Date().toISOString(),
      };

      const applyingToSeries = applyToSeries && !!seriesInfo;

      const { error } = applyingToSeries
        // date and is_active always stay per-occurrence, same convention the
        // admin/web "edit series" actions use.
        ? await supabase.from('sessions').update(bulkFields).in('id', seriesInfo!.ids)
        : await supabase.from('sessions').update({ ...bulkFields, date: dateString, is_active: editForm.is_active }).eq('id', id);

      if (error) throw error;

      Alert.alert('Success', applyingToSeries ? `Updated all ${seriesInfo!.count} occurrences` : 'Session updated successfully');
      setEditMode(false);
      loadSessionData();

    } catch (error: any) {
      console.error('Save session error:', error);
      Alert.alert('Error', error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    try {
      const newStatus = !session?.is_active;

      const { error } = await supabase
        .from('sessions')
        .update({ 
          is_active: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      Alert.alert('Success', `Session ${newStatus ? 'activated' : 'deactivated'}`);
      loadSessionData();

    } catch (error) {
      Alert.alert('Error', 'Failed to update session status');
    }
  };

  const handleDeleteSession = () => {
    Alert.alert(
      'Delete Session',
      `Are you sure you want to delete "${session?.name}"? This will also cancel all bookings.`,
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
                .eq('id', id);

              if (error) throw error;

              Alert.alert('Success', 'Session deleted');
              router.back();

            } catch (error) {
              Alert.alert('Error', 'Failed to delete session');
            }
          }
        }
      ]
    );
  };

  const handleCancelBooking = async (bookingId: string, userName: string) => {
    Alert.alert(
      'Cancel Booking',
      `Cancel ${userName}'s booking?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('bookings')
                .update({ status: 'cancelled' })
                .eq('id', bookingId);

              if (error) throw error;

              Alert.alert('Success', 'Booking cancelled');
              loadSessionData();

            } catch (error) {
              Alert.alert('Error', 'Failed to cancel booking');
            }
          }
        }
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'checked_in': return '#00c853';
      case 'confirmed':
      case 'deposit_paid': return '#002fff';
      case 'pending': return '#ff9500';
      case 'cancelled':
      case 'cancelled_by_customer':
      case 'cancelled_by_partner': return '#999';
      case 'rescheduled': return '#8b5cf6';
      case 'no_show': return '#ef4444';
      default: return '#666';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'checked_in': return 'checkmark-circle';
      case 'confirmed':
      case 'deposit_paid': return 'checkmark';
      case 'pending': return 'time';
      case 'cancelled':
      case 'cancelled_by_customer':
      case 'cancelled_by_partner': return 'close-circle';
      case 'rescheduled': return 'repeat';
      case 'no_show': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'checked_in': return 'Checked In';
      case 'confirmed': return 'Confirmed';
      case 'deposit_paid': return 'Deposit Paid';
      case 'pending': return 'Pending';
      case 'cancelled': return 'Cancelled';
      case 'cancelled_by_customer': return 'Cancelled by Customer';
      case 'cancelled_by_partner': return 'Cancelled by Partner';
      case 'rescheduled': return 'Rescheduled';
      case 'no_show': return 'No Show';
      default: return status;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="alert-circle-outline" size={80} color="#e0e0e0" />
        <ThemedText style={styles.errorText}>Session not found</ThemedText>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

  const checkedInCount = bookings.filter(b => b.status === 'checked_in').length;
  const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;
  const activeBookingsCount = bookings.filter(b => b.status !== 'cancelled').length;

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
          {editMode ? 'Edit Session' : 'Session Details'}
        </ThemedText>
        <TouchableOpacity
          style={styles.headerActionButton}
          onPress={() => {
            if (editMode) {
              setEditMode(false);
              // Reset form
              const sessionDate = new Date(session.date);

              setEditForm({
                name: session.name,
                instructor: session.instructor || '',
                category: session.category || 'yoga',
                date: sessionDate,
                time: (() => { const [h, m] = session.time.split(':'); const t = new Date(); t.setHours(parseInt(h), parseInt(m), 0, 0); return t; })(),
                duration_minutes: session.duration_minutes,
                drop_in_price: session.drop_in_price?.toString() || '',
                max_capacity: session.max_capacity,
                is_active: session.is_active,
                cancellation_cutoff_hours: session.cancellation_cutoff_hours ?? null,
                deposit_pct: session.deposit_pct ?? null,
                no_show_grace_mins: session.no_show_grace_mins ?? null,
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
            {/* Session Image */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Session Image</ThemedText>
              
              {sessionImage ? (
                <View style={styles.imageContainer}>
                  <Image 
                    source={{ uri: sessionImage }} 
                    style={styles.sessionImage}
                    resizeMode="cover"
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
                          <Ionicons name="camera" size={20} color="#fff" />
                          <ThemedText style={styles.changeImageText}>Change</ThemedText>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={handleRemoveImage}
                      disabled={uploadingImage}
                    >
                      <Ionicons name="trash" size={20} color="#fff" />
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

            {/* Session Name */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Session Name</ThemedText>
              <TextInput
                style={styles.input}
                value={editForm.name}
                onChangeText={(text) => setEditForm({ ...editForm, name: text })}
                placeholder="Session name"
                placeholderTextColor="#999"
              />
            </View>

            {/* Instructor */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Instructor</ThemedText>
              <TextInput
                style={styles.input}
                value={editForm.instructor}
                onChangeText={(text) => setEditForm({ ...editForm, instructor: text })}
                placeholder="Instructor name"
                placeholderTextColor="#999"
              />
            </View>

            {/* Category */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Category</ThemedText>
              <View style={styles.categoryGrid}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryButton,
                      editForm.category === cat && styles.categoryButtonActive
                    ]}
                    onPress={() => setEditForm({ ...editForm, category: cat })}
                  >
                    <Ionicons
                      name={categoryIcon(cat) as any}
                      size={18}
                      color={editForm.category === cat ? '#002fff' : '#666'}
                    />
                    <ThemedText style={[
                      styles.categoryLabel,
                      editForm.category === cat && styles.categoryLabelActive
                    ]}>
                      {cat}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Date & Time */}
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <ThemedText style={styles.inputLabel}>Date</ThemedText>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={18} color="#666" />
                  <ThemedText style={styles.dateText}>
                    {editForm.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </ThemedText>
                </TouchableOpacity>
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <ThemedText style={styles.inputLabel}>Time</ThemedText>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Ionicons name="time-outline" size={18} color="#666" />
                  <ThemedText style={styles.dateText}>
                    {editForm.time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </ThemedText>
                </TouchableOpacity>
                {showTimePicker && (
                  <DateTimePicker
                    value={editForm.time}
                    mode="time"
                    display="spinner"
                    onChange={(_, selected) => {
                      setShowTimePicker(false);
                      if (selected) setEditForm(f => ({ ...f, time: selected }));
                    }}
                  />
                )}
              </View>
            </View>

            {/* Duration */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Duration (minutes)</ThemedText>
              <View style={styles.durationGrid}>
                {DURATIONS.map((duration) => (
                  <TouchableOpacity
                    key={duration}
                    style={[
                      styles.durationButton,
                      editForm.duration_minutes === duration && styles.durationButtonActive
                    ]}
                    onPress={() => setEditForm({ ...editForm, duration_minutes: duration })}
                  >
                    <ThemedText style={[
                      styles.durationText,
                      editForm.duration_minutes === duration && styles.durationTextActive
                    ]}>
                      {duration}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Max Capacity */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Max Capacity</ThemedText>
              <TextInput
                style={styles.input}
                value={editForm.max_capacity.toString()}
                onChangeText={(text) => setEditForm({ ...editForm, max_capacity: parseInt(text) || 0 })}
                keyboardType="number-pad"
                placeholder="20"
                placeholderTextColor="#999"
              />
            </View>

            {/* Walk-in Rate */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Walk-in Rate (KES)</ThemedText>
              <TextInput
                style={styles.input}
                value={editForm.drop_in_price}
                onChangeText={(text) => setEditForm({ ...editForm, drop_in_price: text })}
                keyboardType="decimal-pad"
                placeholder="e.g. 1500"
                placeholderTextColor="#999"
              />
              <ThemedText style={styles.inputHint}>What customers pay at the door</ThemedText>
            </View>

            {/* Payout Preview */}
            {(() => {
              const price = parseFloat(editForm.drop_in_price) || 0;
              if (price <= 0) return null;
              if (rateFloorPct == null) {
                return (
                  <View style={styles.payoutWarning}>
                    <ThemedText style={styles.payoutWarningText}>No wholesale rate set for this venue. Contact support.</ThemedText>
                  </View>
                );
              }
              const commission = rateFloorPct;
              const payout = Math.round(price * (1 - commission / 100));
              return (
                <View style={styles.payoutCard}>
                  <ThemedText style={styles.payoutTitle}>Payout Preview</ThemedText>
                  <View style={styles.payoutRow}>
                    <ThemedText style={styles.payoutLabel}>Walk-in Rate</ThemedText>
                    <ThemedText style={styles.payoutValue}>KES {price.toLocaleString()}</ThemedText>
                  </View>
                  <View style={styles.payoutRow}>
                    <ThemedText style={styles.payoutLabel}>ACP commission ({commission}%)</ThemedText>
                    <ThemedText style={styles.payoutValue}>KES {Math.round(price * commission / 100).toLocaleString()}</ThemedText>
                  </View>
                  <View style={[styles.payoutRow, styles.payoutDivider]}>
                    <ThemedText style={styles.payoutLabel}>You receive</ThemedText>
                    <ThemedText style={styles.payoutHighlight}>KES {payout.toLocaleString()}</ThemedText>
                  </View>
                </View>
              );
            })()}

            {/* Recurring series */}
            {seriesInfo && (
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <ThemedText style={styles.toggleLabel}>Apply to entire series</ThemedText>
                  <ThemedText style={styles.toggleSubtext}>
                    Part of a series of {seriesInfo.count} sessions. Date and Active status always stay per-occurrence.
                  </ThemedText>
                </View>
                <Switch
                  value={applyToSeries}
                  onValueChange={setApplyToSeries}
                  trackColor={{ false: '#e0e0e0', true: '#002fff' }}
                  thumbColor="#fff"
                />
              </View>
            )}

            {/* Active Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <ThemedText style={styles.toggleLabel}>Active Session</ThemedText>
                <ThemedText style={styles.toggleSubtext}>Visible to customers</ThemedText>
              </View>
              <Switch
                value={editForm.is_active}
                onValueChange={(value) => setEditForm({ ...editForm, is_active: value })}
                trackColor={{ false: '#e0e0e0', true: '#002fff' }}
                thumbColor="#fff"
              />
            </View>

            {/* Cancellation Policy Override */}
            <View style={styles.policySectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#002fff" />
              <ThemedText style={styles.policySectionTitle}>Cancellation Policy</ThemedText>
            </View>
            <ThemedText style={styles.inputHint}>
              Override your venue's default policy for this session. Leave at "Venue default" to inherit.
            </ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Free cancellation window</ThemedText>
              <View style={styles.chipGrid}>
                {CUTOFF_OPTIONS.map(h => {
                  const label = h === null ? 'Venue default' : h === 0 ? 'None' : `${h}h`;
                  const active = editForm.cancellation_cutoff_hours === h;
                  return (
                    <TouchableOpacity
                      key={String(h)}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setEditForm({ ...editForm, cancellation_cutoff_hours: h ?? null })}
                    >
                      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Deposit required</ThemedText>
              <View style={styles.chipGrid}>
                {DEPOSIT_OPTIONS.map(pct => {
                  const label = pct === null ? 'Venue default' : `${pct}%`;
                  const active = editForm.deposit_pct === pct;
                  return (
                    <TouchableOpacity
                      key={String(pct)}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setEditForm({ ...editForm, deposit_pct: pct ?? null })}
                    >
                      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>No-show grace period</ThemedText>
              <View style={styles.chipGrid}>
                {NO_SHOW_OPTIONS.map(m => {
                  const label = m === null ? 'Venue default' : m === 0 ? 'Immediate' : `${m} min`;
                  const active = editForm.no_show_grace_mins === m;
                  return (
                    <TouchableOpacity
                      key={String(m)}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setEditForm({ ...editForm, no_show_grace_mins: m ?? null })}
                    >
                      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveButton, saving && { opacity: 0.6 }]}
              onPress={handleSaveChanges}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          /* VIEW MODE */
          <>
            {/* ── Hero image ── */}
            {sessionImage && (
              <View style={styles.sessionImageView}>
                <Image source={{ uri: sessionImage }} style={styles.sessionImageLarge} resizeMode="cover" />
              </View>
            )}

            {/* ── Header card: name + gym + inline stats ── */}
            <View style={styles.headerCard}>
              <View style={styles.headerTop}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.sessionName}>{session.name}</ThemedText>
                  <View style={styles.gymRow}>
                    <Ionicons name="location-outline" size={14} color="#666" />
                    <ThemedText style={styles.gymName}>{session.gym_name}</ThemedText>
                  </View>
                </View>
                {!session.is_active && (
                  <View style={styles.inactiveBadge}>
                    <ThemedText style={styles.inactiveBadgeText}>Inactive</ThemedText>
                  </View>
                )}
              </View>

              {/* Date / time / duration pills */}
              <View style={styles.pillRow}>
                <View style={styles.pill}>
                  <Ionicons name="calendar-outline" size={13} color="#002fff" />
                  <ThemedText style={styles.pillText}>{formatDate(session.date)}</ThemedText>
                </View>
                <View style={styles.pill}>
                  <Ionicons name="time-outline" size={13} color="#002fff" />
                  <ThemedText style={styles.pillText}>{formatTime(session.time)}</ThemedText>
                </View>
                <View style={styles.pill}>
                  <Ionicons name="hourglass-outline" size={13} color="#002fff" />
                  <ThemedText style={styles.pillText}>{session.duration_minutes} min</ThemedText>
                </View>
              </View>

              {/* Capacity bar */}
              <View style={styles.capacityRow}>
                <View style={styles.capacityBarWrap}>
                  <View style={styles.capacityBar}>
                    <View style={[styles.capacityFill, {
                      width: `${Math.min((activeBookingsCount / session.max_capacity) * 100, 100)}%`,
                      backgroundColor: activeBookingsCount >= session.max_capacity ? '#ff3b30'
                        : activeBookingsCount / session.max_capacity >= 0.8 ? '#ff9500' : '#00c853',
                    }]} />
                  </View>
                </View>
                <View style={styles.capacityStats}>
                  <ThemedText style={styles.capacityStatNum}>{activeBookingsCount}</ThemedText>
                  <ThemedText style={styles.capacityStatSep}>/</ThemedText>
                  <ThemedText style={styles.capacityStatNum}>{session.max_capacity}</ThemedText>
                  <ThemedText style={styles.capacityStatLabel}> booked</ThemedText>
                  <View style={styles.capacityDot} />
                  <ThemedText style={[styles.capacityStatNum, { color: '#00c853' }]}>{checkedInCount}</ThemedText>
                  <ThemedText style={styles.capacityStatLabel}> checked in</ThemedText>
                </View>
              </View>
            </View>

            {/* ── Bookings list (always open, primary content) ── */}
            <View style={styles.bookingsCard}>
              <View style={styles.bookingsHeader}>
                <ThemedText style={styles.bookingsTitle}>Bookings ({bookings.length})</ThemedText>
              </View>
              {bookings.length === 0 ? (
                <View style={styles.emptyBookings}>
                  <Ionicons name="calendar-outline" size={48} color="#e0e0e0" />
                  <ThemedText style={styles.emptyTitle}>No bookings yet</ThemedText>
                  <ThemedText style={styles.emptySubtitle}>Bookings will appear here as customers sign up</ThemedText>
                </View>
              ) : (
                bookings.map((booking) => (
                  <View key={booking.id} style={styles.bookingItem}>
                    <View style={[styles.statusIcon, { backgroundColor: `${getStatusColor(booking.status)}20` }]}>
                      <Ionicons name={getStatusIcon(booking.status) as any} size={22} color={getStatusColor(booking.status)} />
                    </View>
                    <View style={styles.bookingInfo}>
                      <ThemedText style={styles.bookingName}>{booking.user_name}</ThemedText>
                      <ThemedText style={styles.bookingEmail}>{booking.user_email}</ThemedText>
                      {booking.confirmation_code ? (
                        <ThemedText style={styles.bookingCode}>Ref: {booking.confirmation_code}</ThemedText>
                      ) : null}
                      <ThemedText style={styles.bookingDate}>
                        Booked {new Date(booking.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </ThemedText>
                    </View>
                    <View style={styles.bookingActions}>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                        <ThemedText style={styles.statusBadgeText}>{getStatusLabel(booking.status)}</ThemedText>
                      </View>
                      {!['cancelled', 'cancelled_by_customer', 'cancelled_by_partner', 'checked_in', 'rescheduled', 'no_show'].includes(booking.status) && (
                        <TouchableOpacity style={styles.cancelButton} onPress={() => handleCancelBooking(booking.id, booking.user_name)}>
                          <Ionicons name="close-circle-outline" size={20} color="#ff3b30" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* ── ACCORDION: Session Details ── */}
            <View style={styles.accordion}>
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => toggleAccordion(setDetailsOpen, detailsOpen)}
                activeOpacity={0.7}
              >
                <View style={styles.accordionHeaderLeft}>
                  <Ionicons name="information-circle-outline" size={20} color="#002fff" />
                  <ThemedText style={styles.accordionTitle}>Session Details</ThemedText>
                </View>
                <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#999" />
              </TouchableOpacity>
              {detailsOpen && (
                <View style={styles.accordionBody}>
                  {[
                    { icon: 'person-outline', label: 'Instructor', value: session.instructor || 'Not assigned' },
                    { icon: 'fitness-outline', label: 'Category', value: session.category || 'None' },
                    { icon: 'card-outline', label: 'Walk-in rate', value: session.drop_in_price ? `KES ${Number(session.drop_in_price).toLocaleString()}` : 'Not set' },
                    { icon: 'people-outline', label: 'Capacity', value: `${session.max_capacity} spots` },
                    { icon: 'refresh-outline', label: 'Recurring', value: session.recurring ? (seriesInfo ? `Yes — series of ${seriesInfo.count}` : 'Yes') : 'No' },
                  ].map((row, i, arr) => (
                    <View key={row.label} style={[styles.detailRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={styles.detailIconWrap}>
                        <Ionicons name={row.icon as any} size={16} color="#555" />
                      </View>
                      <ThemedText style={styles.detailLabel}>{row.label}</ThemedText>
                      <ThemedText style={styles.detailValue}>{row.value}</ThemedText>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* ── ACCORDION: Booking Policy ── */}
            {venuePolicy && (() => {
              const cutoff = session.cancellation_cutoff_hours ?? venuePolicy.cutoff;
              const deposit = session.deposit_pct ?? venuePolicy.deposit;
              const grace = session.no_show_grace_mins ?? venuePolicy.grace;
              const isOverride = session.cancellation_cutoff_hours != null || session.deposit_pct != null || session.no_show_grace_mins != null;
              return (
                <View style={styles.accordion}>
                  <TouchableOpacity
                    style={styles.accordionHeader}
                    onPress={() => toggleAccordion(setPolicyOpen, policyOpen)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.accordionHeaderLeft}>
                      <Ionicons name="shield-checkmark-outline" size={20} color="#002fff" />
                      <ThemedText style={styles.accordionTitle}>Booking Policy</ThemedText>
                      {isOverride && (
                        <View style={styles.accordionBadge}>
                          <ThemedText style={styles.accordionBadgeText}>Override</ThemedText>
                        </View>
                      )}
                    </View>
                    <Ionicons name={policyOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#999" />
                  </TouchableOpacity>
                  {policyOpen && (
                    <View style={styles.accordionBody}>
                      {[
                        {
                          icon: 'time-outline',
                          label: 'Free cancellation window',
                          value: cutoff === 0 ? 'No free cancellation' : `Up to ${cutoff}h before session`,
                          source: session.cancellation_cutoff_hours != null ? 'session' : 'venue',
                        },
                        {
                          icon: 'cash-outline',
                          label: 'Deposit required',
                          value: `${deposit}% of session price`,
                          source: session.deposit_pct != null ? 'session' : 'venue',
                        },
                        {
                          icon: 'warning-outline',
                          label: 'No-show grace period',
                          value: grace === 0 ? 'No grace period' : `${grace} min after session starts`,
                          source: session.no_show_grace_mins != null ? 'session' : 'venue',
                        },
                      ].map((row, i, arr) => (
                        <View key={row.label} style={[styles.detailRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                          <View style={styles.detailIconWrap}>
                            <Ionicons name={row.icon as any} size={16} color="#555" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <ThemedText style={styles.detailLabel}>{row.label}</ThemedText>
                            <ThemedText style={styles.detailValue}>{row.value}</ThemedText>
                          </View>
                          <View style={[styles.sourceBadge, row.source === 'session' && styles.sourceBadgeOverride]}>
                            <ThemedText style={[styles.sourceBadgeText, row.source === 'session' && styles.sourceBadgeTextOverride]}>
                              {row.source}
                            </ThemedText>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* ── ACCORDION: Quick Actions ── */}
            <View style={styles.accordion}>
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => toggleAccordion(setActionsOpen, actionsOpen)}
                activeOpacity={0.7}
              >
                <View style={styles.accordionHeaderLeft}>
                  <Ionicons name="flash-outline" size={20} color="#002fff" />
                  <ThemedText style={styles.accordionTitle}>Quick Actions</ThemedText>
                </View>
                <Ionicons name={actionsOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#999" />
              </TouchableOpacity>
              {actionsOpen && (
                <View style={styles.accordionBody}>
                  <TouchableOpacity style={styles.actionRow} onPress={handleToggleActive}>
                    <View style={styles.actionRowIcon}>
                      <Ionicons name={session.is_active ? 'pause-circle-outline' : 'play-circle-outline'} size={20} color="#002fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.actionRowTitle}>
                        {session.is_active ? 'Deactivate session' : 'Activate session'}
                      </ThemedText>
                      <ThemedText style={styles.actionRowSub}>
                        {session.is_active ? 'Hide from customers' : 'Make visible to customers'}
                      </ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#ccc" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionRow, { borderBottomWidth: 0 }]} onPress={handleDeleteSession}>
                    <View style={[styles.actionRowIcon, { backgroundColor: '#ffebee' }]}>
                      <Ionicons name="trash-outline" size={20} color="#ff3b30" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[styles.actionRowTitle, { color: '#ff3b30' }]}>Delete session</ThemedText>
                      <ThemedText style={styles.actionRowSub}>Permanently remove this session</ThemedText>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#ccc" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ── ACCORDION: Share ── */}
            {(() => {
              const url = `https://activecitypass.com/sessions/${session.id}`;
              const displayUrl = `activecitypass.com/sessions/${session.id.slice(0, 8)}…`;
              const shareText = encodeURIComponent(`Book "${session.name}" at ${session.gym_name} — ${formatDate(session.date)} at ${formatTime(session.time)}`);
              const encodedUrl = encodeURIComponent(url);
              return (
                <View style={[styles.accordion, { marginBottom: 32 }]}>
                  <TouchableOpacity
                    style={styles.accordionHeader}
                    onPress={() => toggleAccordion(setShareOpen, shareOpen)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.accordionHeaderLeft}>
                      <Ionicons name="share-social-outline" size={20} color="#002fff" />
                      <ThemedText style={styles.accordionTitle}>Share Session</ThemedText>
                    </View>
                    <Ionicons name={shareOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#999" />
                  </TouchableOpacity>
                  {shareOpen && (
                    <View style={styles.accordionBody}>
                      <TouchableOpacity style={styles.linkPill} onPress={handleShare}>
                        <ThemedText style={styles.linkText} numberOfLines={1}>{displayUrl}</ThemedText>
                        <Ionicons name="copy-outline" size={15} color="#002fff" />
                      </TouchableOpacity>
                      <View style={styles.shareRow}>
                        <TouchableOpacity style={[styles.shareIcon, { backgroundColor: '#25D366' }]} onPress={() => Linking.openURL(`https://wa.me/?text=${shareText}%20${encodedUrl}`)}>
                          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.shareIcon, { backgroundColor: '#000' }]} onPress={() => Linking.openURL(`https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}`)}>
                          <ThemedText style={styles.shareIconX}>𝕏</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.shareIcon, { backgroundColor: '#1877F2' }]} onPress={() => Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`)}>
                          <Ionicons name="logo-facebook" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.shareIcon, { backgroundColor: '#229ED9' }]} onPress={() => Linking.openURL(`https://t.me/share/url?url=${encodedUrl}&text=${shareText}`)}>
                          <Ionicons name="send" size={16} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.shareIcon, { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e0e0e0' }]} onPress={handleShare}>
                          <Ionicons name="share-outline" size={18} color="#374151" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })()}
          </>
        )}
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}

        value={editForm.date}
        minimumDate={new Date()}
        onConfirm={(selected) => {
          setShowDatePicker(false);
          setEditForm(f => ({ ...f, date: selected }));
        }}
        onCancel={() => setShowDatePicker(false)}
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
    padding: 20,
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

  // View Mode Styles
  sessionImageView: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#f0f0f0',
  },
  sessionImageLarge: {
    width: '100%',
    height: '100%',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    marginBottom: 8,
  },
  sessionName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    flex: 1,
  },
  gymName: {
    fontSize: 16,
    color: '#666',
  },
  inactiveBadge: {
    backgroundColor: '#ff3b30',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  infoItem: {
    flex: 1,
    minWidth: '45%',
    gap: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    textTransform: 'capitalize',
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
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
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
     paddingTop:5,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  capacityBarContainer: {
    gap: 8,
  },
  capacityBar: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  capacityFill: {
    height: '100%',
    borderRadius: 4,
  },
  capacityText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  actionsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
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
  bookingsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bookingsHeader: {
    marginBottom: 16,
  },
  bookingsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  bookingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  bookingEmail: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  bookingCode: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
    marginBottom: 2,
  },
  bookingDate: {
    fontSize: 12,
    color: '#999',
  },
  bookingActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'capitalize',
  },
  cancelButton: {
    padding: 4,
  },
  emptyBookings: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },

  // Edit Mode Styles
  editContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  categoryButtonActive: {
    borderColor: '#002fff',
    backgroundColor: '#f0f5ff',
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  categoryLabelActive: {
    color: '#002fff',
  },
  row: {
    flexDirection: 'row',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateText: {
    fontSize: 14,
    color: '#000',
  },
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  durationButtonActive: {
    borderColor: '#002fff',
    backgroundColor: '#f0f5ff',
  },
  durationText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  durationTextActive: {
    color: '#002fff',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  toggleSubtext: {
    fontSize: 12,
    color: '#666',
  },
  saveButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 8,
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
  sessionImage: {
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
  inputHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  payoutCard: {
    backgroundColor: '#f0f5ff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  payoutTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#002fff',
    marginBottom: 4,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payoutDivider: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#d0dcff',
    marginTop: 4,
  },
  payoutLabel: {
    fontSize: 13,
    color: '#555',
  },
  payoutValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  payoutHighlight: {
    fontSize: 16,
    fontWeight: '800',
    color: '#002fff',
  },
  payoutBadge: {
    backgroundColor: '#002fff',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  payoutBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  payoutWarning: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  payoutWarningText: {
    fontSize: 13,
    color: '#856404',
  },
  shareCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  shareTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  shareSubtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 14,
  },
  linkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    gap: 8,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    color: '#555',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  shareRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  shareIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareIconX: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  policySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    marginBottom: 6,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  policySectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  chipTextActive: {
    color: '#002fff',
  },
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
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    flex: 1,
  },
  policyOverrideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f0f5ff',
  },
  policyOverrideBadgeText: {
    fontSize: 11,
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
    backgroundColor: '#f0f5ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  policyContent: {
    flex: 1,
    gap: 2,
  },
  policyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  policyValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111',
    lineHeight: 20,
  },

  // ── New view-mode header card ──────────────────────────────────────────────
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f0f5ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#002fff',
  },
  capacityRow: {
    gap: 8,
  },
  capacityBarWrap: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  capacityStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  capacityStatNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  capacityStatSep: {
    fontSize: 13,
    color: '#bbb',
    marginHorizontal: 2,
  },
  capacityStatLabel: {
    fontSize: 13,
    color: '#888',
  },
  capacityDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#ccc',
    marginHorizontal: 8,
  },

  // ── Accordion ─────────────────────────────────────────────────────────────
  accordion: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  accordionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  accordionBadge: {
    marginLeft: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#f0f5ff',
  },
  accordionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#002fff',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  accordionBody: {
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
    paddingHorizontal: 16,
  },

  // ── Detail rows (inside accordions) ───────────────────────────────────────
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  detailIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#f8f8f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#888',
    flex: 1,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    textAlign: 'right',
    flexShrink: 1,
  },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: '#f5f5f5',
    marginLeft: 6,
  },
  sourceBadgeOverride: {
    backgroundColor: '#f0f5ff',
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
  },
  sourceBadgeTextOverride: {
    color: '#002fff',
  },

  // ── Action rows (inside Quick Actions accordion) ───────────────────────────
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  actionRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f0f5ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  actionRowSub: {
    fontSize: 12,
    color: '#888',
  },
});