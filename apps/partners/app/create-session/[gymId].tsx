import { useRouter, useLocalSearchParams } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Image
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';

interface SessionForm {
  name: string;
  description: string;
  instructor: string;
  category: string;
  date: string;
  time: string;
  durationMinutes: number;
  creditsRequired: number;
  maxCapacity: number;
  recurring: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly';
  recurrenceDays?: string[];
  recurrenceEndDate?: string;
}

// Image upload helper function
async function uploadSessionImage(
  imageUri: string
): Promise<string | null> {
  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const ext = imageUri.split('.').pop() || 'jpg';
    const filename = `sessions/temp/${timestamp}-${random}.${ext}`;

    const { data, error } = await supabase.storage
      .from('fitpass-images')
      .upload(filename, arrayBuffer, {
        contentType: `image/${ext}`,
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      throw error;
    }

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

export default function CreateSessionScreen() {
  const router = useRouter();
  const { gymId } = useLocalSearchParams();
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sessionImage, setSessionImage] = useState<string | null>(null);
  const [gym, setGym] = useState<any>(null);
  
  // SmartRate state
  const [platformSpots, setPlatformSpots] = useState('5');
  const [baseCredits, setBaseCredits] = useState('5');
  const [enableDynamicPricing, setEnableDynamicPricing] = useState(true);
  const [allowPeakPricing, setAllowPeakPricing] = useState(true);
  const [allowLastMinuteDiscount, setAllowLastMinuteDiscount] = useState(true);
  const [estimatedPayout, setEstimatedPayout] = useState<number | null>(null);
  const [creditRange, setCreditRange] = useState({ min: 0, max: 0 });
  
  const [session, setSession] = useState<SessionForm>({
    name: '',
    description: '',
    instructor: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    durationMinutes: 60,
    creditsRequired: 1,
    maxCapacity: 20,
    recurring: false,
  });

  const categories = [
    'Yoga', 'HIIT', 'Pilates', 'Strength', 'Cardio', 
    'CrossFit', 'Boxing', 'Cycling', 'Dance', 'Other'
  ];

  const weekDays = [
    { short: 'M', full: 'monday' },
    { short: 'T', full: 'tuesday' },
    { short: 'W', full: 'wednesday' },
    { short: 'T', full: 'thursday' },
    { short: 'F', full: 'friday' },
    { short: 'S', full: 'saturday' },
    { short: 'S', full: 'sunday' },
  ];

  useEffect(() => {
    loadGym();
  }, [gymId]);

  useEffect(() => {
    calculateEstimates();
  }, [baseCredits, enableDynamicPricing, gym]);

  const loadGym = async () => {
    try {
      const { data, error } = await supabase
        .from('gyms')
        .select('id, name, location, rate_floor, drop_in_price, max_platform_spots')
        .eq('id', gymId)
        .single();

      if (error) throw error;
      setGym(data);
      
      // Set defaults from gym settings
      if (data.max_platform_spots) {
        setPlatformSpots(data.max_platform_spots.toString());
      }
      
      // Calculate suggested base credits from rate floor
      if (data.rate_floor) {
        const suggestedCredits = Math.max(3, Math.round(data.rate_floor / 200));
        setBaseCredits(suggestedCredits.toString());
      }
    } catch (error) {
      console.error('Error loading gym:', error);
      Alert.alert('Error', 'Failed to load venue');
    }
  };

  const calculateEstimates = () => {
    if (!gym || !baseCredits) return;

    const credits = parseInt(baseCredits) || 5;
    const creditValue = 200; // KES per credit

    if (enableDynamicPricing) {
      const minMultiplier = 0.7; // Early booking, off-peak
      const maxMultiplier = 1.5; // Peak time, high demand
      
      const minCredits = Math.max(3, Math.round(credits * minMultiplier));
      const maxCredits = Math.min(15, Math.round(credits * maxMultiplier));
      
      setCreditRange({ min: minCredits, max: maxCredits });
      
      // Estimated payout (average of range)
      const avgCredits = (minCredits + maxCredits) / 2;
      setEstimatedPayout(avgCredits * creditValue);
    } else {
      setCreditRange({ min: credits, max: credits });
      setEstimatedPayout(credits * creditValue);
    }
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

      if (result.canceled) return;

      setUploadingImage(true);

      const imageUrl = await uploadSessionImage(result.assets[0].uri);

      if (imageUrl) {
        setSessionImage(imageUrl);
        Alert.alert('Success', 'Image uploaded successfully');
      }

    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    Alert.alert(
      'Remove Image',
      'Are you sure you want to remove the session image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setSessionImage(null);
          }
        }
      ]
    );
  };

  const toggleRecurrenceDay = (day: string) => {
    const days = session.recurrenceDays || [];
    if (days.includes(day)) {
      setSession({
        ...session,
        recurrenceDays: days.filter(d => d !== day)
      });
    } else {
      setSession({
        ...session,
        recurrenceDays: [...days, day]
      });
    }
  };

  const generateRecurringSessions = (startDate: string, endDate: string) => {
    const sessions: any[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = session.recurrenceDays || [];

    let current = new Date(start);

    while (current <= end) {
      const dayName = current.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      
      if (days.includes(dayName)) {
        sessions.push({
          gym_id: gymId,
          name: session.name,
          description: session.description || null,
          instructor: session.instructor || null,
          category: session.category || null,
          date: current.toISOString().split('T')[0],
          time: session.time,
          duration_minutes: session.durationMinutes,
          credits_required: session.creditsRequired,
          max_capacity: session.maxCapacity,
          is_active: true,
          recurring: true,
          image_url: sessionImage,
          // SmartRate fields
          base_credits: parseInt(baseCredits) || 5,
          current_credits: parseInt(baseCredits) || 5,
          peak_multiplier: allowPeakPricing ? 1.5 : 1.0,
          popularity_score: 1.0,
          metadata: {
            platform_spots: parseInt(platformSpots) || 5,
            enable_dynamic_pricing: enableDynamicPricing,
            allow_peak_pricing: allowPeakPricing,
            allow_last_minute_discount: allowLastMinuteDiscount,
          }
        });
      }

      current.setDate(current.getDate() + 1);
    }

    return sessions;
  };

  const handleCreateSession = async () => {
    // Validation
    if (!session.name || !session.date || !session.time) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (session.recurring && (!session.recurrenceDays || session.recurrenceDays.length === 0)) {
      Alert.alert('Error', 'Please select at least one day for recurring sessions');
      return;
    }

    if (session.recurring && !session.recurrenceEndDate) {
      Alert.alert('Error', 'Please set an end date for recurring sessions');
      return;
    }

    // Check if using SmartRate but no rate floor
    if (enableDynamicPricing && !gym?.rate_floor) {
      Alert.alert(
        'Rate Floor Required',
        'Please set up your rate floor before creating sessions with SmartRate pricing.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Set Up Now', 
            onPress: () => router.push(`/partner/rate-floor/${gymId}`)
          }
        ]
      );
      return;
    }

    // Validate payout meets floor
    if (gym?.rate_floor && estimatedPayout && estimatedPayout < gym.rate_floor) {
      Alert.alert(
        'Below Rate Floor',
        `Estimated payout (KES ${Math.round(estimatedPayout)}) is below your rate floor (KES ${gym.rate_floor}). Please increase base credits.`
      );
      return;
    }

    setLoading(true);

    try {
      if (session.recurring && session.recurrenceEndDate) {
        // Generate recurring sessions
        const sessions = generateRecurringSessions(session.date, session.recurrenceEndDate);
        
        if (sessions.length === 0) {
          Alert.alert('Error', 'No sessions generated. Check your recurring settings.');
          return;
        }

        const { error } = await supabase
          .from('sessions')
          .insert(sessions);

        if (error) throw error;

        Alert.alert(
          'Success!',
          `Created ${sessions.length} recurring sessions`,
          [
            { text: 'Create Another', style: 'cancel', onPress: resetForm },
            { text: 'View Sessions', onPress: () => router.push(`/partner/session-details/${gymId}`) }
          ]
        );
      } else {
        // Create single session
        const { error } = await supabase
          .from('sessions')
          .insert([{
            gym_id: gymId,
            name: session.name,
            description: session.description || null,
            instructor: session.instructor || null,
            category: session.category || null,
            date: session.date,
            time: session.time,
            duration_minutes: session.durationMinutes,
            credits_required: session.creditsRequired,
            max_capacity: session.maxCapacity,
            is_active: true,
            image_url: sessionImage,
            // SmartRate fields
            base_credits: parseInt(baseCredits) || 5,
            current_credits: parseInt(baseCredits) || 5,
            peak_multiplier: allowPeakPricing ? 1.5 : 1.0,
            popularity_score: 1.0,
            metadata: {
              platform_spots: parseInt(platformSpots) || 5,
              enable_dynamic_pricing: enableDynamicPricing,
              allow_peak_pricing: allowPeakPricing,
              allow_last_minute_discount: allowLastMinuteDiscount,
            }
          }]);

        if (error) throw error;

        // Update onboarding if this is first session
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: partner } = await supabase
            .from('partners')
            .select('id')
            .eq('user_id', user.id)
            .single();

          if (partner) {
            await supabase
              .from('partner_onboarding_progress')
              .update({ first_session_created: true, completed_at: new Date().toISOString() })
              .eq('partner_id', partner.id);
          }
        }

        Alert.alert(
          'Success!',
          'Session created successfully',
          [
            { text: 'Create Another', style: 'cancel', onPress: resetForm },
            { text: 'View Sessions', onPress: () => router.push(`/partner/sessions/${gymId}`) }
          ]
        );
      }
    } catch (error: any) {
      console.error('Session creation error:', error);
      Alert.alert('Error', error.message || 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSession({
      name: '',
      description: '',
      instructor: '',
      category: '',
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      durationMinutes: 60,
      creditsRequired: 1,
      maxCapacity: 20,
      recurring: false,
    });
    setSessionImage(null);
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Create Session</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          {/* Venue Info */}
          {gym && (
            <View style={styles.venueCard}>
              <Ionicons name="business" size={24} color="#002fff" />
              <View style={styles.venueInfo}>
                <ThemedText style={styles.venueName}>{gym.name}</ThemedText>
                <ThemedText style={styles.venueLocation}>{gym.location}</ThemedText>
                {gym.rate_floor && (
                  <ThemedText style={styles.venueFloor}>
                    Rate Floor: KES {gym.rate_floor.toLocaleString()}
                  </ThemedText>
                )}
              </View>
            </View>
          )}

          <ThemedText type="title" style={styles.title}>
            New Class/Session
          </ThemedText>

          {/* Session Image */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Session Image (Optional)</ThemedText>
            
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
            <ThemedText style={styles.inputLabel}>
              Session Name <ThemedText style={styles.required}>*</ThemedText>
            </ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g., Morning Yoga Flow"
              placeholderTextColor="#999"
              value={session.name}
              onChangeText={(text) => setSession({ ...session, name: text })}
              editable={!loading}
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
                    styles.categoryChip,
                    session.category === cat && styles.categoryChipActive
                  ]}
                  onPress={() => setSession({ ...session, category: cat })}
                  disabled={loading}
                >
                  <ThemedText style={[
                    styles.categoryLabel,
                    session.category === cat && styles.categoryLabelActive
                  ]}>
                    {cat}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Instructor */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Instructor Name</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g., Sarah Johnson"
              placeholderTextColor="#999"
              value={session.instructor}
              onChangeText={(text) => setSession({ ...session, instructor: text })}
              editable={!loading}
            />
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Description</ThemedText>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe this session..."
              placeholderTextColor="#999"
              value={session.description}
              onChangeText={(text) => setSession({ ...session, description: text })}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!loading}
            />
          </View>

          {/* Date & Time */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <ThemedText style={styles.inputLabel}>
                Date <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                value={session.date}
                onChangeText={(text) => setSession({ ...session, date: text })}
                editable={!loading}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <ThemedText style={styles.inputLabel}>
                Time <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="HH:MM"
                value={session.time}
                onChangeText={(text) => setSession({ ...session, time: text })}
                editable={!loading}
              />
            </View>
          </View>

          {/* Duration, Credits, Capacity */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <ThemedText style={styles.inputLabel}>Duration (min)</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="60"
                value={session.durationMinutes.toString()}
                onChangeText={(text) => setSession({ ...session, durationMinutes: parseInt(text) || 60 })}
                keyboardType="number-pad"
                editable={!loading}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <ThemedText style={styles.inputLabel}>Capacity</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="20"
                value={session.maxCapacity.toString()}
                onChangeText={(text) => setSession({ ...session, maxCapacity: parseInt(text) || 20 })}
                keyboardType="number-pad"
                editable={!loading}
              />
            </View>
          </View>

          {/* SmartRate Pricing Section - NEW */}
          <View style={styles.smartRateSection}>
            <View style={styles.smartRateHeader}>
              <View style={styles.smartRateTitleRow}>
                <Ionicons name="flash" size={24} color="#002fff" />
                <View>
                  <ThemedText style={styles.smartRateTitle}>SmartRate Pricing</ThemedText>
                  <ThemedText style={styles.smartRateSubtitle}>
                    Dynamic pricing to maximize revenue
                  </ThemedText>
                </View>
              </View>
              {!gym?.rate_floor && (
                <TouchableOpacity
                  style={styles.setupFloorButton}
                  onPress={() => router.push(`/partner/rate-floor/${gymId}`)}
                >
                  <ThemedText style={styles.setupFloorText}>Set Up Floor</ThemedText>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.smartRateInputGroup}>
              <ThemedText style={styles.inputLabel}>Platform Spots</ThemedText>
              <TextInput
                style={styles.smartRateSmallInput}
                value={platformSpots}
                onChangeText={setPlatformSpots}
                placeholder="5"
                keyboardType="number-pad"
                placeholderTextColor="#999"
                editable={!loading}
              />
              <ThemedText style={styles.smartRateHelperText}>
                Number of spots available on FitPass (out of {session.maxCapacity} total)
              </ThemedText>
            </View>

            <View style={styles.smartRateInputGroup}>
              <ThemedText style={styles.inputLabel}>Base Credits</ThemedText>
              <TextInput
                style={styles.smartRateSmallInput}
                value={baseCredits}
                onChangeText={setBaseCredits}
                placeholder="5"
                keyboardType="number-pad"
                placeholderTextColor="#999"
                editable={!loading}
              />
              <ThemedText style={styles.smartRateHelperText}>
                Starting point for dynamic pricing calculations
              </ThemedText>
            </View>

            <View style={styles.smartRateToggleGroup}>
              <View style={styles.smartRateToggleHeader}>
                <View style={styles.smartRateToggleInfo}>
                  <ThemedText style={styles.smartRateToggleLabel}>Enable Dynamic Pricing</ThemedText>
                  <ThemedText style={styles.smartRateToggleDescription}>
                    Let SmartRate adjust credits based on demand
                  </ThemedText>
                </View>
                <Switch
                  value={enableDynamicPricing}
                  onValueChange={setEnableDynamicPricing}
                  trackColor={{ false: '#e0e0e0', true: '#b3d4ff' }}
                  thumbColor={enableDynamicPricing ? '#002fff' : '#f4f3f4'}
                />
              </View>
            </View>

            {enableDynamicPricing && (
              <>
                <View style={styles.smartRateToggleGroup}>
                  <View style={styles.smartRateToggleHeader}>
                    <View style={styles.smartRateToggleInfo}>
                      <ThemedText style={styles.smartRateToggleLabel}>Peak Hour Pricing</ThemedText>
                      <ThemedText style={styles.smartRateToggleDescription}>
                        Charge more during 5-8pm and weekends
                      </ThemedText>
                    </View>
                    <Switch
                      value={allowPeakPricing}
                      onValueChange={setAllowPeakPricing}
                      trackColor={{ false: '#e0e0e0', true: '#b3d4ff' }}
                      thumbColor={allowPeakPricing ? '#002fff' : '#f4f3f4'}
                    />
                  </View>
                </View>

                <View style={styles.smartRateToggleGroup}>
                  <View style={styles.smartRateToggleHeader}>
                    <View style={styles.smartRateToggleInfo}>
                      <ThemedText style={styles.smartRateToggleLabel}>Last-Minute Discounts</ThemedText>
                      <ThemedText style={styles.smartRateToggleDescription}>
                        Lower credits for bookings within 24 hours
                      </ThemedText>
                    </View>
                    <Switch
                      value={allowLastMinuteDiscount}
                      onValueChange={setAllowLastMinuteDiscount}
                      trackColor={{ false: '#e0e0e0', true: '#b3d4ff' }}
                      thumbColor={allowLastMinuteDiscount ? '#002fff' : '#f4f3f4'}
                    />
                  </View>
                </View>
              </>
            )}

            {/* Pricing Preview */}
            {estimatedPayout && gym?.rate_floor && (
              <View style={styles.smartRatePreviewCard}>
                <ThemedText style={styles.smartRatePreviewTitle}>Pricing Preview</ThemedText>
                
                <View style={styles.smartRatePreviewRow}>
                  <ThemedText style={styles.smartRatePreviewLabel}>Credit Range:</ThemedText>
                  <ThemedText style={styles.smartRatePreviewValue}>
                    {creditRange.min} - {creditRange.max} credits
                  </ThemedText>
                </View>

                <View style={styles.smartRatePreviewRow}>
                  <ThemedText style={styles.smartRatePreviewLabel}>Est. Payout/Booking:</ThemedText>
                  <ThemedText style={[styles.smartRatePreviewValue, styles.smartRateHighlight]}>
                    ~KES {Math.round(estimatedPayout)}
                  </ThemedText>
                </View>

                <View style={styles.smartRatePreviewRow}>
                  <ThemedText style={styles.smartRatePreviewLabel}>Your Rate Floor:</ThemedText>
                  <ThemedText style={styles.smartRatePreviewValue}>
                    KES {gym.rate_floor}
                  </ThemedText>
                </View>

                {estimatedPayout >= gym.rate_floor ? (
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
            )}

            {!gym?.rate_floor && (
              <View style={styles.smartRateWarning}>
                <Ionicons name="information-circle" size={20} color="#ff9500" />
                <ThemedText style={styles.smartRateWarningText}>
                  Set up your rate floor to use SmartRate pricing
                </ThemedText>
              </View>
            )}
          </View>

          {/* Recurring Toggle */}
          <View style={styles.recurringSection}>
            <View style={styles.recurringHeader}>
              <View>
                <ThemedText style={styles.recurringTitle}>Recurring Session</ThemedText>
                <ThemedText style={styles.recurringSubtitle}>
                  Create multiple sessions at once
                </ThemedText>
              </View>
              <Switch
                value={session.recurring}
                onValueChange={(value) => setSession({ ...session, recurring: value })}
                trackColor={{ false: '#e0e0e0', true: '#002fff' }}
                thumbColor={'#fff'}
              />
            </View>

            {session.recurring && (
              <View style={styles.recurringOptions}>
                {/* Days Selection */}
                <ThemedText style={styles.inputLabel}>Repeat on</ThemedText>
                <View style={styles.daysRow}>
                  {weekDays.map((day, index) => (
                    <TouchableOpacity
                      key={day.full}
                      style={[
                        styles.dayButton,
                        session.recurrenceDays?.includes(day.full) && styles.dayButtonActive
                      ]}
                      onPress={() => toggleRecurrenceDay(day.full)}
                    >
                      <ThemedText style={[
                        styles.dayLabel,
                        session.recurrenceDays?.includes(day.full) && styles.dayLabelActive
                      ]}>
                        {day.short}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* End Date */}
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>
                    End Date <ThemedText style={styles.required}>*</ThemedText>
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    value={session.recurrenceEndDate || ''}
                    onChangeText={(text) => setSession({ ...session, recurrenceEndDate: text })}
                    editable={!loading}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Create Button */}
          <TouchableOpacity
            style={[styles.createButton, loading && { opacity: 0.6 }]}
            onPress={handleCreateSession}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.createButtonText}>
                {session.recurring ? 'Create Recurring Sessions' : 'Create Session'}
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  formContainer: {
    flex: 1,
    padding: 20,
  },
  venueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f0f5ff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  venueLocation: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  venueFloor: {
    fontSize: 13,
    color: '#002fff',
    fontWeight: '600',
    marginTop: 4,
  },
  title: {
    marginBottom: 20,
    color: '#000000',
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
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  categoryChipActive: {
    borderColor: '#002fff',
    backgroundColor: '#f0f5ff',
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  categoryLabelActive: {
    color: '#002fff',
  },
  recurringSection: {
    marginVertical: 20,
    padding: 20,
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
  },
  recurringHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  recurringTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  recurringSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  recurringOptions: {
    gap: 16,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  dayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  dayButtonActive: {
    borderColor: '#002fff',
    backgroundColor: '#002fff',
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
  },
  dayLabelActive: {
    color: '#fff',
  },
  createButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 20,
  },
  createButtonText: {
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

  // SmartRate Pricing Styles (NEW - appended at bottom)
  smartRateSection: {
    marginVertical: 20,
    padding: 20,
    backgroundColor: '#f0f5ff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d0e0ff',
  },
  smartRateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  smartRateTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  smartRateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  smartRateSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  setupFloorButton: {
    backgroundColor: '#002fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  setupFloorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  smartRateInputGroup: {
    marginBottom: 16,
  },
  smartRateSmallInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    width: 100,
  },
  smartRateHelperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  smartRateToggleGroup: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#d0e0ff',
  },
  smartRateToggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  smartRateToggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  smartRateToggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  smartRateToggleDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  smartRatePreviewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  smartRatePreviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  smartRatePreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  smartRatePreviewLabel: {
    fontSize: 14,
    color: '#666',
  },
  smartRatePreviewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  smartRateHighlight: {
    color: '#002fff',
    fontSize: 16,
  },
  smartRateStatusBadgeGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
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
    marginTop: 8,
  },
  smartRateStatusTextRed: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff3b30',
  },
  smartRateWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff3e0',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  smartRateWarningText: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
});