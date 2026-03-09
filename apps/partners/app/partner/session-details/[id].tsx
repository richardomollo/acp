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
  Image
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';

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
  recurring: boolean;
  recurrence_rule: any;
  gym_id: string;
  gym_name: string;
  image_url: string | null;
  base_credits: number | null;
  current_credits: number | null;
  peak_multiplier: number | null;
  popularity_score: number | null;
  metadata: any;
  gym_rate_floor: number | null;
}

interface Booking {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'cancelled';
  booking_date: string;
  created_at: string;
}

const CATEGORIES = [
  { value: 'yoga', label: 'Yoga', icon: 'leaf' },
  { value: 'hiit', label: 'HIIT', icon: 'flame' },
  { value: 'pilates', label: 'Pilates', icon: 'fitness' },
  { value: 'strength', label: 'Strength', icon: 'barbell' },
  { value: 'cardio', label: 'Cardio', icon: 'heart' },
  { value: 'crossfit', label: 'CrossFit', icon: 'trending-up' },
  { value: 'boxing', label: 'Boxing', icon: 'hand-right' },
  { value: 'cycling', label: 'Cycling', icon: 'bicycle' },
  { value: 'dance', label: 'Dance', icon: 'musical-notes' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
];

const DURATIONS = [30, 45, 60, 75, 90, 120];

// Image upload helper function
async function uploadSessionImage(
  sessionId: string,
  imageUri: string
): Promise<string | null> {
  try {
    // Fetch image and convert to blob
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    // Generate filename
    const timestamp = Date.now();
    const ext = imageUri.split('.').pop() || 'jpg';
    const filename = `sessions/${sessionId}/${timestamp}.${ext}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('fitpass-images')
      .upload(filename, arrayBuffer, {
        contentType: `image/${ext}`,
        upsert: true,
      });

    if (error) {
      console.error('Upload error:', error);
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('fitpass-images')
      .getPublicUrl(data.path);

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
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sessionImage, setSessionImage] = useState<string | null>(null);
  
  // SmartRate configuration state
  const [configuringSmartRate, setConfiguringSmartRate] = useState(false);
  const [savingSmartRate, setSavingSmartRate] = useState(false);
  const [smartRateForm, setSmartRateForm] = useState({
    platformSpots: '5',
    baseCredits: '5',
    enableDynamicPricing: true,
    allowPeakPricing: true,
    allowLastMinuteDiscount: true,
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    instructor: '',
    category: '',
    date: new Date(),
    time: new Date(),
    duration_minutes: 60,
    credits_required: 1,
    max_capacity: 20,
    is_active: true,
  });

  useEffect(() => {
    loadSessionData();
  }, []);

  // Set SmartRate defaults when session loads
  useEffect(() => {
    if (session && !session.base_credits) {
      // Set defaults for sessions without SmartRate
      const defaultSpots = session.gym_rate_floor ? '5' : '5';
      const defaultCredits = session.gym_rate_floor 
        ? Math.max(3, Math.round(session.gym_rate_floor / 200)).toString()
        : '5';
      
      setSmartRateForm({
        platformSpots: defaultSpots,
        baseCredits: defaultCredits,
        enableDynamicPricing: true,
        allowPeakPricing: true,
        allowLastMinuteDiscount: true,
      });
    }
  }, [session]);

  const loadSessionData = async () => {
    try {
      setLoading(true);

      // Get session details with gym info (including rate_floor)
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*, gyms(name, rate_floor)')
        .eq('id', id)
        .single();

      if (sessionError) throw sessionError;

      const sessionWithGym = {
        ...sessionData,
        gym_name: (sessionData.gyms as any)?.name || 'Unknown',
        gym_rate_floor: (sessionData.gyms as any)?.rate_floor || null,
      };

      setSession(sessionWithGym);
      setSessionImage(sessionData.image_url || null);

      // Set edit form initial values
      const sessionDate = new Date(sessionData.date);
      const [hours, minutes] = sessionData.time.split(':');
      const sessionTime = new Date();
      sessionTime.setHours(parseInt(hours), parseInt(minutes));

      setEditForm({
        name: sessionData.name,
        instructor: sessionData.instructor || '',
        category: sessionData.category || 'yoga',
        date: sessionDate,
        time: sessionTime,
        duration_minutes: sessionData.duration_minutes,
        credits_required: sessionData.credits_required,
        max_capacity: sessionData.max_capacity,
        is_active: sessionData.is_active,
      });

      // Get bookings
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          user_id,
          status,
          booking_date,
          created_at,
          users(name, email)
        `)
        .eq('session_id', id)
        .order('created_at', { ascending: false });

      if (bookingsError) throw bookingsError;

      const formattedBookings = (bookingsData || []).map(b => ({
        id: b.id,
        user_id: b.user_id,
        user_name: (b.users as any)?.name || 'Unknown',
        user_email: (b.users as any)?.email || '',
        status: b.status as any,
        booking_date: b.booking_date,
        created_at: b.created_at,
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
        aspect: [16, 9], // Landscape for session images
        quality: 0.8,
      });

      if (result.canceled) return;

      setUploadingImage(true);

      // Upload image
      const imageUrl = await uploadSessionImage(id as string, result.assets[0].uri);

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

      const { error } = await supabase
        .from('sessions')
        .update({
          name: editForm.name.trim(),
          instructor: editForm.instructor.trim() || null,
          category: editForm.category,
          date: dateString,
          time: timeString,
          duration_minutes: editForm.duration_minutes,
          credits_required: editForm.credits_required,
          max_capacity: editForm.max_capacity,
          is_active: editForm.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      Alert.alert('Success', 'Session updated successfully');
      setEditMode(false);
      loadSessionData();

    } catch (error: any) {
      console.error('Save session error:', error);
      Alert.alert('Error', error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSmartRate = async () => {
    if (!session) return;

    // Validate inputs
    const platformSpots = parseInt(smartRateForm.platformSpots) || 0;
    const baseCredits = parseInt(smartRateForm.baseCredits) || 0;

    if (platformSpots <= 0 || platformSpots > session.max_capacity) {
      Alert.alert('Error', `Platform spots must be between 1 and ${session.max_capacity}`);
      return;
    }

    if (baseCredits < 3 || baseCredits > 15) {
      Alert.alert('Error', 'Base credits must be between 3 and 15');
      return;
    }

    // Check rate floor
    if (smartRateForm.enableDynamicPricing && session.gym_rate_floor) {
      const creditValue = 200;
      const estimatedPayout = baseCredits * creditValue;
      
      if (estimatedPayout < session.gym_rate_floor) {
        Alert.alert(
          'Below Rate Floor',
          `Estimated payout (KES ${estimatedPayout}) is below your rate floor (KES ${session.gym_rate_floor}). Please increase base credits.`
        );
        return;
      }
    }

    setSavingSmartRate(true);

    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          base_credits: baseCredits,
          current_credits: baseCredits,
          peak_multiplier: smartRateForm.allowPeakPricing ? 1.5 : 1.0,
          popularity_score: 1.0,
          metadata: {
            platform_spots: platformSpots,
            enable_dynamic_pricing: smartRateForm.enableDynamicPricing,
            allow_peak_pricing: smartRateForm.allowPeakPricing,
            allow_last_minute_discount: smartRateForm.allowLastMinuteDiscount,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      Alert.alert('Success', 'SmartRate pricing enabled for this session');
      setConfiguringSmartRate(false);
      loadSessionData();

    } catch (error: any) {
      console.error('Save SmartRate error:', error);
      Alert.alert('Error', error.message || 'Failed to enable SmartRate');
    } finally {
      setSavingSmartRate(false);
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
      case 'confirmed': return '#002fff';
      case 'pending': return '#ff9500';
      case 'cancelled': return '#999';
      default: return '#666';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'checked_in': return 'checkmark-circle';
      case 'confirmed': return 'checkmark';
      case 'pending': return 'time';
      case 'cancelled': return 'close-circle';
      default: return 'help-circle';
    }
  };

  // Calculate SmartRate estimates for configuration form
  const calculateSmartRateEstimates = () => {
    if (!session) return null;

    const credits = parseInt(smartRateForm.baseCredits) || 5;
    const creditValue = 200; // KES per credit

    if (smartRateForm.enableDynamicPricing) {
      const minMultiplier = 0.7;
      const maxMultiplier = 1.5;
      
      const minCredits = Math.max(3, Math.round(credits * minMultiplier));
      const maxCredits = Math.min(15, Math.round(credits * maxMultiplier));
      
      const avgCredits = (minCredits + maxCredits) / 2;
      const estimatedPayout = avgCredits * creditValue;
      
      return {
        creditRange: { min: minCredits, max: maxCredits },
        estimatedPayout,
        meetsFloor: session.gym_rate_floor ? estimatedPayout >= session.gym_rate_floor : true,
      };
    } else {
      return {
        creditRange: { min: credits, max: credits },
        estimatedPayout: credits * creditValue,
        meetsFloor: session.gym_rate_floor ? credits * creditValue >= session.gym_rate_floor : true,
      };
    }
  };

  // Calculate SmartRate info
  const getSmartRateInfo = () => {
    if (!session) return null;

    const hasSmartRate = session.base_credits && session.metadata;
    const creditValue = 200; // KES per credit
    
    if (hasSmartRate) {
      const baseCredits = session.base_credits || 0;
      const currentCredits = session.current_credits || baseCredits;
      const platformSpots = session.metadata?.platform_spots || 0;
      const enableDynamic = session.metadata?.enable_dynamic_pricing || false;
      const allowPeak = session.metadata?.allow_peak_pricing || false;
      const allowDiscount = session.metadata?.allow_last_minute_discount || false;
      
      // Calculate range
      let minCredits = baseCredits;
      let maxCredits = baseCredits;
      
      if (enableDynamic) {
        minCredits = Math.max(3, Math.round(baseCredits * 0.7));
        maxCredits = Math.min(15, Math.round(baseCredits * 1.5));
      }
      
      const estimatedPayout = currentCredits * creditValue;
      
      return {
        hasSmartRate: true,
        baseCredits,
        currentCredits,
        platformSpots,
        enableDynamic,
        allowPeak,
        allowDiscount,
        creditRange: { min: minCredits, max: maxCredits },
        estimatedPayout,
        rateFloor: session.gym_rate_floor,
        meetsFloor: session.gym_rate_floor ? estimatedPayout >= session.gym_rate_floor : true,
      };
    }
    
    return { hasSmartRate: false };
  };

  const smartRateInfo = getSmartRateInfo();

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
              const [hours, minutes] = session.time.split(':');
              const sessionTime = new Date();
              sessionTime.setHours(parseInt(hours), parseInt(minutes));
              
              setEditForm({
                name: session.name,
                instructor: session.instructor || '',
                category: session.category || 'yoga',
                date: sessionDate,
                time: sessionTime,
                duration_minutes: session.duration_minutes,
                credits_required: session.credits_required,
                max_capacity: session.max_capacity,
                is_active: session.is_active,
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
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryButton,
                      editForm.category === cat.value && styles.categoryButtonActive
                    ]}
                    onPress={() => setEditForm({ ...editForm, category: cat.value })}
                  >
                    <Ionicons 
                      name={cat.icon as any} 
                      size={18} 
                      color={editForm.category === cat.value ? '#002fff' : '#666'} 
                    />
                    <ThemedText style={[
                      styles.categoryLabel,
                      editForm.category === cat.value && styles.categoryLabelActive
                    ]}>
                      {cat.label}
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

            {/* Capacity & Credits */}
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
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

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <ThemedText style={styles.inputLabel}>Credits</ThemedText>
                <TextInput
                  style={styles.input}
                  value={editForm.credits_required.toString()}
                  onChangeText={(text) => setEditForm({ ...editForm, credits_required: parseInt(text) || 0 })}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor="#999"
                />
              </View>
            </View>

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
            {/* Session Image - View Mode */}
            {sessionImage && (
              <View style={styles.sessionImageView}>
                <Image 
                  source={{ uri: sessionImage }} 
                  style={styles.sessionImageLarge}
                  resizeMode="cover"
                />
              </View>
            )}

            {/* Session Info Card */}
            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <View style={styles.infoTitleRow}>
                  <ThemedText style={styles.sessionName}>{session.name}</ThemedText>
                  {!session.is_active && (
                    <View style={styles.inactiveBadge}>
                      <ThemedText style={styles.inactiveBadgeText}>Inactive</ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText style={styles.gymName}>{session.gym_name}</ThemedText>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Ionicons name="calendar-outline" size={20} color="#666" />
                  <ThemedText style={styles.infoLabel}>Date</ThemedText>
                  <ThemedText style={styles.infoValue}>{formatDate(session.date)}</ThemedText>
                </View>

                <View style={styles.infoItem}>
                  <Ionicons name="time-outline" size={20} color="#666" />
                  <ThemedText style={styles.infoLabel}>Time</ThemedText>
                  <ThemedText style={styles.infoValue}>{formatTime(session.time)}</ThemedText>
                </View>

                <View style={styles.infoItem}>
                  <Ionicons name="hourglass-outline" size={20} color="#666" />
                  <ThemedText style={styles.infoLabel}>Duration</ThemedText>
                  <ThemedText style={styles.infoValue}>{session.duration_minutes} min</ThemedText>
                </View>

                <View style={styles.infoItem}>
                  <Ionicons name="person-outline" size={20} color="#666" />
                  <ThemedText style={styles.infoLabel}>Instructor</ThemedText>
                  <ThemedText style={styles.infoValue}>
                    {session.instructor || 'Not assigned'}
                  </ThemedText>
                </View>

                <View style={styles.infoItem}>
                  <Ionicons name="fitness-outline" size={20} color="#666" />
                  <ThemedText style={styles.infoLabel}>Category</ThemedText>
                  <ThemedText style={styles.infoValue}>
                    {session.category || 'None'}
                  </ThemedText>
                </View>

                <View style={styles.infoItem}>
                  <Ionicons name="card-outline" size={20} color="#666" />
                  <ThemedText style={styles.infoLabel}>Credits</ThemedText>
                  <ThemedText style={styles.infoValue}>{session.credits_required}</ThemedText>
                </View>
              </View>
            </View>

            {/* Stats Card */}
            <View style={styles.statsCard}>
              <ThemedText style={styles.statsTitle}>Bookings Overview</ThemedText>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <ThemedText style={styles.statValue}>{activeBookingsCount}</ThemedText>
                  <ThemedText style={styles.statLabel}>Booked</ThemedText>
                </View>
                <View style={styles.statItem}>
                  <ThemedText style={styles.statValue}>{session.max_capacity}</ThemedText>
                  <ThemedText style={styles.statLabel}>Capacity</ThemedText>
                </View>
                <View style={styles.statItem}>
                  <ThemedText style={[styles.statValue, { color: '#00c853' }]}>
                    {checkedInCount}
                  </ThemedText>
                  <ThemedText style={styles.statLabel}>Checked In</ThemedText>
                </View>
                <View style={styles.statItem}>
                  <ThemedText style={styles.statValue}>
                    {session.max_capacity - activeBookingsCount}
                  </ThemedText>
                  <ThemedText style={styles.statLabel}>Available</ThemedText>
                </View>
              </View>

              {/* Capacity Bar */}
              <View style={styles.capacityBarContainer}>
                <View style={styles.capacityBar}>
                  <View 
                    style={[
                      styles.capacityFill,
                      {
                        width: `${(activeBookingsCount / session.max_capacity) * 100}%`,
                        backgroundColor: 
                          activeBookingsCount >= session.max_capacity ? '#ff3b30' :
                          activeBookingsCount / session.max_capacity >= 0.8 ? '#ff9500' : '#00c853'
                      }
                    ]} 
                  />
                </View>
                <ThemedText style={styles.capacityText}>
                  {Math.round((activeBookingsCount / session.max_capacity) * 100)}% Full
                </ThemedText>
              </View>
            </View>

            {/* SmartRate Pricing Card - NEW */}
            <View style={styles.smartRateCard}>
              <View style={styles.smartRateHeader}>
                <View style={styles.smartRateTitleRow}>
                  <Ionicons name="flash" size={24} color="#002fff" />
                  <ThemedText style={styles.smartRateTitle}>SmartRate Pricing</ThemedText>
                </View>
                {smartRateInfo?.hasSmartRate && (
                  <View style={styles.smartRateActiveBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#00c853" />
                    <ThemedText style={styles.smartRateActiveBadgeText}>Active</ThemedText>
                  </View>
                )}
              </View>

              {smartRateInfo?.hasSmartRate ? (
                /* STATE A: SmartRate Active */
                <>
                  <View style={styles.smartRatePricingGrid}>
                    <View style={styles.smartRatePricingItem}>
                      <ThemedText style={styles.smartRatePricingLabel}>Current Credits</ThemedText>
                      <View style={styles.smartRatePricingValueRow}>
                        <ThemedText style={[styles.smartRatePricingValue, styles.smartRateHighlight]}>
                          {smartRateInfo.currentCredits}
                        </ThemedText>
                        <Ionicons name="flash" size={20} color="#002fff" />
                      </View>
                    </View>

                    <View style={styles.smartRatePricingItem}>
                      <ThemedText style={styles.smartRatePricingLabel}>Base Credits</ThemedText>
                      <ThemedText style={styles.smartRatePricingValue}>
                        {smartRateInfo.baseCredits}
                      </ThemedText>
                    </View>

                    <View style={styles.smartRatePricingItem}>
                      <ThemedText style={styles.smartRatePricingLabel}>Credit Range</ThemedText>
                      <ThemedText style={styles.smartRatePricingValue}>
                        {smartRateInfo.creditRange.min}-{smartRateInfo.creditRange.max}
                      </ThemedText>
                    </View>

                    <View style={styles.smartRatePricingItem}>
                      <ThemedText style={styles.smartRatePricingLabel}>Platform Spots</ThemedText>
                      <ThemedText style={styles.smartRatePricingValue}>
                        {smartRateInfo.platformSpots}/{session.max_capacity}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.smartRatePayoutCard}>
                    <View style={styles.smartRatePayoutRow}>
                      <ThemedText style={styles.smartRatePayoutLabel}>Estimated Payout</ThemedText>
                      <ThemedText style={styles.smartRatePayoutValue}>
                        ~KES {smartRateInfo.estimatedPayout.toLocaleString()}
                      </ThemedText>
                    </View>
                    {smartRateInfo.rateFloor && (
                      <View style={styles.smartRatePayoutRow}>
                        <ThemedText style={styles.smartRatePayoutLabel}>Your Rate Floor</ThemedText>
                        <ThemedText style={styles.smartRatePayoutValue}>
                          KES {smartRateInfo.rateFloor.toLocaleString()}
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  {smartRateInfo.meetsFloor ? (
                    <View style={styles.smartRateStatusBadgeGreen}>
                      <Ionicons name="checkmark-circle" size={16} color="#00c853" />
                      <ThemedText style={styles.smartRateStatusTextGreen}>
                        Pricing meets your floor ✓
                      </ThemedText>
                    </View>
                  ) : (
                    <View style={styles.smartRateStatusBadgeRed}>
                      <Ionicons name="alert-circle" size={16} color="#ff3b30" />
                      <ThemedText style={styles.smartRateStatusTextRed}>
                        Below rate floor
                      </ThemedText>
                    </View>
                  )}

                  <View style={styles.smartRateFeaturesRow}>
                    {smartRateInfo.enableDynamic && (
                      <View style={styles.smartRateFeatureBadge}>
                        <Ionicons name="trending-up" size={14} color="#002fff" />
                        <ThemedText style={styles.smartRateFeatureBadgeText}>Dynamic</ThemedText>
                      </View>
                    )}
                    {smartRateInfo.allowPeak && (
                      <View style={styles.smartRateFeatureBadge}>
                        <Ionicons name="sunny" size={14} color="#ff9500" />
                        <ThemedText style={styles.smartRateFeatureBadgeText}>Peak Hours</ThemedText>
                      </View>
                    )}
                    {smartRateInfo.allowDiscount && (
                      <View style={styles.smartRateFeatureBadge}>
                        <Ionicons name="time" size={14} color="#00c853" />
                        <ThemedText style={styles.smartRateFeatureBadgeText}>Last-Minute</ThemedText>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                /* STATE B: Not Set Up */
                <>
                  {!configuringSmartRate ? (
                    /* Setup Prompt */
                    <View style={styles.smartRateSetupPrompt}>
                      <Ionicons name="flash-outline" size={48} color="#666" />
                      <ThemedText style={styles.smartRateSetupTitle}>
                        SmartRate Not Configured
                      </ThemedText>
                      <ThemedText style={styles.smartRateSetupText}>
                        This session uses fixed pricing. Enable SmartRate to maximize revenue with dynamic pricing.
                      </ThemedText>
                      
                      <View style={styles.smartRateSetupBenefits}>
                        <View style={styles.smartRateSetupBenefit}>
                          <Ionicons name="trending-up" size={18} color="#002fff" />
                          <ThemedText style={styles.smartRateSetupBenefitText}>
                            Earn more during peak times
                          </ThemedText>
                        </View>
                        <View style={styles.smartRateSetupBenefit}>
                          <Ionicons name="people" size={18} color="#00c853" />
                          <ThemedText style={styles.smartRateSetupBenefitText}>
                            Fill off-peak sessions
                          </ThemedText>
                        </View>
                        <View style={styles.smartRateSetupBenefit}>
                          <Ionicons name="shield-checkmark" size={18} color="#ff9500" />
                          <ThemedText style={styles.smartRateSetupBenefitText}>
                            Guaranteed minimum payout
                          </ThemedText>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.smartRateSetupButton}
                        onPress={() => setConfiguringSmartRate(true)}
                      >
                        <Ionicons name="flash" size={20} color="#fff" />
                        <ThemedText style={styles.smartRateSetupButtonText}>
                          Configure SmartRate
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    /* Configuration Form */
                    <View style={styles.smartRateConfigForm}>
                      <View style={styles.smartRateConfigHeader}>
                        <ThemedText style={styles.smartRateConfigTitle}>
                          Configure SmartRate Pricing
                        </ThemedText>
                        <TouchableOpacity
                          onPress={() => setConfiguringSmartRate(false)}
                          style={styles.smartRateConfigClose}
                        >
                          <Ionicons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                      </View>

                      {/* Platform Spots */}
                      <View style={styles.smartRateConfigGroup}>
                        <ThemedText style={styles.smartRateConfigLabel}>Platform Spots</ThemedText>
                        <TextInput
                          style={styles.smartRateConfigInput}
                          value={smartRateForm.platformSpots}
                          onChangeText={(text) => setSmartRateForm({ ...smartRateForm, platformSpots: text })}
                          placeholder="5"
                          keyboardType="number-pad"
                          placeholderTextColor="#999"
                        />
                        <ThemedText style={styles.smartRateConfigHelper}>
                          Number of spots available on FitPass (out of {session?.max_capacity || 20} total)
                        </ThemedText>
                      </View>

                      {/* Base Credits */}
                      <View style={styles.smartRateConfigGroup}>
                        <ThemedText style={styles.smartRateConfigLabel}>Base Credits</ThemedText>
                        <TextInput
                          style={styles.smartRateConfigInput}
                          value={smartRateForm.baseCredits}
                          onChangeText={(text) => setSmartRateForm({ ...smartRateForm, baseCredits: text })}
                          placeholder="5"
                          keyboardType="number-pad"
                          placeholderTextColor="#999"
                        />
                        <ThemedText style={styles.smartRateConfigHelper}>
                          Starting point for dynamic pricing (3-15 credits)
                        </ThemedText>
                      </View>

                      {/* Enable Dynamic Pricing */}
                      <View style={styles.smartRateConfigToggle}>
                        <View style={styles.smartRateConfigToggleInfo}>
                          <ThemedText style={styles.smartRateConfigToggleLabel}>
                            Enable Dynamic Pricing
                          </ThemedText>
                          <ThemedText style={styles.smartRateConfigToggleDesc}>
                            Let SmartRate adjust credits based on demand
                          </ThemedText>
                        </View>
                        <Switch
                          value={smartRateForm.enableDynamicPricing}
                          onValueChange={(value) => setSmartRateForm({ ...smartRateForm, enableDynamicPricing: value })}
                          trackColor={{ false: '#e0e0e0', true: '#b3d4ff' }}
                          thumbColor={smartRateForm.enableDynamicPricing ? '#002fff' : '#f4f3f4'}
                        />
                      </View>

                      {smartRateForm.enableDynamicPricing && (
                        <>
                          {/* Peak Hour Pricing */}
                          <View style={styles.smartRateConfigToggle}>
                            <View style={styles.smartRateConfigToggleInfo}>
                              <ThemedText style={styles.smartRateConfigToggleLabel}>
                                Peak Hour Pricing
                              </ThemedText>
                              <ThemedText style={styles.smartRateConfigToggleDesc}>
                                Charge more during 5-8pm and weekends
                              </ThemedText>
                            </View>
                            <Switch
                              value={smartRateForm.allowPeakPricing}
                              onValueChange={(value) => setSmartRateForm({ ...smartRateForm, allowPeakPricing: value })}
                              trackColor={{ false: '#e0e0e0', true: '#b3d4ff' }}
                              thumbColor={smartRateForm.allowPeakPricing ? '#002fff' : '#f4f3f4'}
                            />
                          </View>

                          {/* Last-Minute Discounts */}
                          <View style={styles.smartRateConfigToggle}>
                            <View style={styles.smartRateConfigToggleInfo}>
                              <ThemedText style={styles.smartRateConfigToggleLabel}>
                                Last-Minute Discounts
                              </ThemedText>
                              <ThemedText style={styles.smartRateConfigToggleDesc}>
                                Lower credits for bookings within 24 hours
                              </ThemedText>
                            </View>
                            <Switch
                              value={smartRateForm.allowLastMinuteDiscount}
                              onValueChange={(value) => setSmartRateForm({ ...smartRateForm, allowLastMinuteDiscount: value })}
                              trackColor={{ false: '#e0e0e0', true: '#b3d4ff' }}
                              thumbColor={smartRateForm.allowLastMinuteDiscount ? '#002fff' : '#f4f3f4'}
                            />
                          </View>
                        </>
                      )}

                      {/* Pricing Preview */}
                      {(() => {
                        const estimates = calculateSmartRateEstimates();
                        return estimates && session?.gym_rate_floor ? (
                          <View style={styles.smartRateConfigPreview}>
                            <ThemedText style={styles.smartRateConfigPreviewTitle}>
                              Pricing Preview
                            </ThemedText>
                            
                            <View style={styles.smartRateConfigPreviewRow}>
                              <ThemedText style={styles.smartRateConfigPreviewLabel}>
                                Credit Range:
                              </ThemedText>
                              <ThemedText style={styles.smartRateConfigPreviewValue}>
                                {estimates.creditRange.min} - {estimates.creditRange.max} credits
                              </ThemedText>
                            </View>

                            <View style={styles.smartRateConfigPreviewRow}>
                              <ThemedText style={styles.smartRateConfigPreviewLabel}>
                                Est. Payout/Booking:
                              </ThemedText>
                              <ThemedText style={[styles.smartRateConfigPreviewValue, styles.smartRateHighlight]}>
                                ~KES {Math.round(estimates.estimatedPayout)}
                              </ThemedText>
                            </View>

                            <View style={styles.smartRateConfigPreviewRow}>
                              <ThemedText style={styles.smartRateConfigPreviewLabel}>
                                Your Rate Floor:
                              </ThemedText>
                              <ThemedText style={styles.smartRateConfigPreviewValue}>
                                KES {session.gym_rate_floor}
                              </ThemedText>
                            </View>

                            {estimates.meetsFloor ? (
                              <View style={styles.smartRateStatusBadgeGreen}>
                                <Ionicons name="checkmark-circle" size={16} color="#00c853" />
                                <ThemedText style={styles.smartRateStatusTextGreen}>
                                  Pricing meets your floor ✓
                                </ThemedText>
                              </View>
                            ) : (
                              <View style={styles.smartRateStatusBadgeRed}>
                                <Ionicons name="alert-circle" size={16} color="#ff3b30" />
                                <ThemedText style={styles.smartRateStatusTextRed}>
                                  Below rate floor - increase base credits
                                </ThemedText>
                              </View>
                            )}
                          </View>
                        ) : null;
                      })()}

                      {/* Save/Cancel Buttons */}
                      <View style={styles.smartRateConfigActions}>
                        <TouchableOpacity
                          style={styles.smartRateConfigCancelButton}
                          onPress={() => setConfiguringSmartRate(false)}
                        >
                          <ThemedText style={styles.smartRateConfigCancelText}>
                            Cancel
                          </ThemedText>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.smartRateConfigSaveButton, savingSmartRate && { opacity: 0.6 }]}
                          onPress={handleSaveSmartRate}
                          disabled={savingSmartRate}
                        >
                          {savingSmartRate ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <>
                              <Ionicons name="flash" size={20} color="#fff" />
                              <ThemedText style={styles.smartRateConfigSaveText}>
                                Enable SmartRate
                              </ThemedText>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Quick Actions */}
            <View style={styles.actionsCard}>
              <ThemedText style={styles.actionsTitle}>Quick Actions</ThemedText>
              
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleToggleActive}
              >
                <View style={styles.actionIcon}>
                  <Ionicons 
                    name={session.is_active ? "pause-circle" : "play-circle"} 
                    size={24} 
                    color="#002fff" 
                  />
                </View>
                <View style={styles.actionContent}>
                  <ThemedText style={styles.actionTitle}>
                    {session.is_active ? 'Deactivate Session' : 'Activate Session'}
                  </ThemedText>
                  <ThemedText style={styles.actionSubtitle}>
                    {session.is_active ? 'Hide from customers' : 'Make visible to customers'}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleDeleteSession}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#ffebee' }]}>
                  <Ionicons name="trash" size={24} color="#ff3b30" />
                </View>
                <View style={styles.actionContent}>
                  <ThemedText style={[styles.actionTitle, { color: '#ff3b30' }]}>
                    Delete Session
                  </ThemedText>
                  <ThemedText style={styles.actionSubtitle}>
                    Permanently remove this session
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            </View>

            {/* Bookings List */}
            <View style={styles.bookingsCard}>
              <View style={styles.bookingsHeader}>
                <ThemedText style={styles.bookingsTitle}>
                  Bookings ({bookings.length})
                </ThemedText>
              </View>

              {bookings.length === 0 ? (
                <View style={styles.emptyBookings}>
                  <Ionicons name="calendar-outline" size={60} color="#e0e0e0" />
                  <ThemedText style={styles.emptyTitle}>No bookings yet</ThemedText>
                  <ThemedText style={styles.emptySubtitle}>
                    Bookings will appear here as customers sign up
                  </ThemedText>
                </View>
              ) : (
                bookings.map((booking) => (
                  <View key={booking.id} style={styles.bookingItem}>
                    <View style={[
                      styles.statusIcon,
                      { backgroundColor: `${getStatusColor(booking.status)}20` }
                    ]}>
                      <Ionicons 
                        name={getStatusIcon(booking.status) as any}
                        size={24} 
                        color={getStatusColor(booking.status)} 
                      />
                    </View>

                    <View style={styles.bookingInfo}>
                      <ThemedText style={styles.bookingName}>{booking.user_name}</ThemedText>
                      <ThemedText style={styles.bookingEmail}>{booking.user_email}</ThemedText>
                      <ThemedText style={styles.bookingDate}>
                        Booked {new Date(booking.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </ThemedText>
                    </View>

                    <View style={styles.bookingActions}>
                      <View style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(booking.status) }
                      ]}>
                        <ThemedText style={styles.statusBadgeText}>
                          {booking.status}
                        </ThemedText>
                      </View>

                      {booking.status !== 'cancelled' && booking.status !== 'checked_in' && (
                        <TouchableOpacity
                          style={styles.cancelButton}
                          onPress={() => handleCancelBooking(booking.id, booking.user_name)}
                        >
                          <Ionicons name="close-circle-outline" size={20} color="#ff3b30" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Date/Time Pickers */}
      {showDatePicker && (
        <DateTimePicker
          value={editForm.date}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setEditForm({ ...editForm, date: selectedDate });
            }
          }}
          minimumDate={new Date()}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={editForm.time}
          mode="time"
          display="default"
          onChange={(event, selectedTime) => {
            setShowTimePicker(false);
            if (selectedTime) {
              setEditForm({ ...editForm, time: selectedTime });
            }
          }}
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

  // SmartRate Pricing Card Styles (NEW - appended at bottom)
  smartRateCard: {
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
  smartRateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
  smartRateActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  smartRateActiveBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00c853',
  },
  smartRatePricingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  smartRatePricingItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 12,
  },
  smartRatePricingLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  smartRatePricingValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
  },
  smartRatePricingValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smartRateHighlight: {
    color: '#002fff',
  },
  smartRatePayoutCard: {
    backgroundColor: '#f0f5ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  smartRatePayoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  smartRatePayoutLabel: {
    fontSize: 14,
    color: '#666',
  },
  smartRatePayoutValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  smartRateStatusBadgeGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  smartRateStatusTextGreen: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00c853',
  },
  smartRateStatusBadgeRed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  smartRateStatusTextRed: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff3b30',
  },
  smartRateFeaturesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smartRateFeatureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  smartRateFeatureBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  smartRateSetupPrompt: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  smartRateSetupTitle: {
    fontSize: 18,
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
    paddingHorizontal: 10,
  },
  smartRateSetupBenefits: {
    width: '100%',
    gap: 12,
    marginBottom: 20,
  },
  smartRateSetupBenefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8f8f8',
    padding: 12,
    borderRadius: 12,
  },
  smartRateSetupBenefitText: {
    fontSize: 14,
    color: '#000',
    flex: 1,
  },
  smartRateSetupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#002fff',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    shadowColor: '#002fff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  smartRateSetupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // SmartRate Configuration Form Styles (NEW - appended)
  smartRateConfigForm: {
    paddingTop: 10,
  },
  smartRateConfigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  smartRateConfigTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  smartRateConfigClose: {
    padding: 4,
  },
  smartRateConfigGroup: {
    marginBottom: 16,
  },
  smartRateConfigLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  smartRateConfigInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    width: 120,
  },
  smartRateConfigHelper: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
    lineHeight: 16,
  },
  smartRateConfigToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  smartRateConfigToggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  smartRateConfigToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  smartRateConfigToggleDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  smartRateConfigPreview: {
    backgroundColor: '#f0f5ff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  smartRateConfigPreviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  smartRateConfigPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  smartRateConfigPreviewLabel: {
    fontSize: 14,
    color: '#666',
  },
  smartRateConfigPreviewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  smartRateConfigActions: {
    flexDirection: 'row',
    gap: 12,
  },
  smartRateConfigCancelButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smartRateConfigCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '700',
  },
  smartRateConfigSaveButton: {
    flex: 2,
    backgroundColor: '#002fff',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#002fff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  smartRateConfigSaveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});