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
  Image,
  Share,
  Linking,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import DatePickerModal from '@/components/DatePickerModal';

interface SessionForm {
  name: string;
  description: string;
  instructor: string;
  category: string;
  date: string;
  time: string;
  durationMinutes: number;
  dropInPrice: string;
  maxCapacity: number;
  recurring: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly';
  recurrenceDays?: string[];
  recurrenceEndDate?: string;
}

async function uploadSessionImage(base64: string, uri: string): Promise<string | null> {
  try {
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const filename = `sessions/temp/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

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

export default function CreateSessionScreen() {
  const router = useRouter();
  const { gymId } = useLocalSearchParams();
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sessionImage, setSessionImage] = useState<string | null>(null);
  const [gym, setGym] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerEndDate, setPickerEndDate] = useState(new Date());
  
  const [rateFloorPct, setRateFloorPct] = useState<number | null>(null);

  const [session, setSession] = useState<SessionForm>({
    name: '',
    description: '',
    instructor: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    durationMinutes: 60,
    dropInPrice: '',
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

  const loadGym = async () => {
    try {
      const gymRes = await supabase.from('gyms').select('id, name, location, rate_floor_percentage').eq('id', gymId).single();

      if (gymRes.error) throw gymRes.error;
      setGym(gymRes.data);
      setRateFloorPct(gymRes.data.rate_floor_percentage ?? null);
    } catch (error) {
      console.error('Error loading gym:', error);
      Alert.alert('Error', 'Failed to load venue');
    }
  };


  const shareSession = async (sessionId: string, name: string) => {
    const url = `https://activecitypass.com/sessions/${sessionId}`;
    const text = `Book "${name}" at ${gym?.name ?? 'our venue'} — activecitypass.com`;
    try {
      await Share.share({
        message: Platform.OS === 'ios' ? text : `${text}\n\n${url}`,
        url: Platform.OS === 'ios' ? url : undefined,
        title: name,
      });
    } catch { /* cancelled */ }
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

      if (result.canceled || !result.assets[0].base64) return;

      setUploadingImage(true);

      const imageUrl = await uploadSessionImage(result.assets[0].base64, result.assets[0].uri);

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
    const dropInPriceNum = parseFloat(session.dropInPrice) || 0;

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
          drop_in_price: dropInPriceNum,
          max_capacity: session.maxCapacity,
          is_active: true,
          recurring: true,
          image_url: sessionImage,
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

    setLoading(true);

    try {
      if (session.recurring && session.recurrenceEndDate) {
        // Generate recurring sessions
        const sessions = generateRecurringSessions(session.date, session.recurrenceEndDate);
        
        if (sessions.length === 0) {
          Alert.alert('Error', 'No sessions generated. Check your recurring settings.');
          return;
        }

        const { data: created, error } = await supabase
          .from('sessions')
          .insert(sessions)
          .select('id');

        if (error) throw error;

        const firstId = created?.[0]?.id;
        Alert.alert(
          'Success!',
          `Created ${sessions.length} recurring sessions`,
          [
            { text: 'Create Another', style: 'cancel', onPress: resetForm },
            ...(firstId ? [{ text: 'Share', onPress: () => shareSession(firstId, session.name) }] : []),
            { text: 'View Sessions', onPress: () => router.push(`/partner/session-details/${gymId}`) },
          ]
        );
      } else {
        // Create single session
        const dropInPriceNum = parseFloat(session.dropInPrice) || 0;
        const { data: created, error } = await supabase
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
            drop_in_price: dropInPriceNum,
            max_capacity: session.maxCapacity,
            is_active: true,
            image_url: sessionImage,
          }])
          .select('id')
          .single();

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
            { text: 'Share', onPress: () => shareSession(created.id, session.name) },
            { text: 'View Sessions', onPress: () => router.push(`/partner/sessions/${gymId}`) },
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
      dropInPrice: '',
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
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
                disabled={loading}
              >
                <Ionicons name="calendar-outline" size={18} color="#666" />
                <ThemedText style={styles.dateText}>{session.date}</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <ThemedText style={styles.inputLabel}>
                Time <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="HH:MM"
                placeholderTextColor="#999"
                value={session.time}
                onChangeText={(text) => setSession({ ...session, time: text })}
                editable={!loading}
              />
            </View>
          </View>

          {/* Duration & Capacity */}
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

          {/* Walk-in Rate */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Walk-in Rate (KES)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1500"
              placeholderTextColor="#999"
              value={session.dropInPrice}
              onChangeText={(text) => setSession({ ...session, dropInPrice: text })}
              keyboardType="decimal-pad"
              editable={!loading}
            />
            <ThemedText style={styles.inputHint}>What customers pay at the door</ThemedText>
          </View>

          {/* Payout Preview */}
          {(() => {
            const price = parseFloat(session.dropInPrice) || 0;
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
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => setShowEndDatePicker(true)}
                    disabled={loading}
                  >
                    <Ionicons name="calendar-outline" size={18} color="#666" />
                    <ThemedText style={styles.dateText}>
                      {session.recurrenceEndDate || 'Select end date'}
                    </ThemedText>
                  </TouchableOpacity>
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

      <DatePickerModal
        visible={showDatePicker}

        value={pickerDate}
        minimumDate={new Date()}
        onConfirm={(selected) => {
          setShowDatePicker(false);
          setPickerDate(selected);
          setSession(s => ({ ...s, date: selected.toISOString().split('T')[0] }));
        }}
        onCancel={() => setShowDatePicker(false)}
      />
      <DatePickerModal
        visible={showEndDatePicker}

        value={pickerEndDate}
        minimumDate={new Date()}
        onConfirm={(selected) => {
          setShowEndDatePicker(false);
          setPickerEndDate(selected);
          setSession(s => ({ ...s, recurrenceEndDate: selected.toISOString().split('T')[0] }));
        }}
        onCancel={() => setShowEndDatePicker(false)}
      />
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
  inputHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  payoutCard: {
    backgroundColor: '#f0f5ff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
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
    marginBottom: 20,
  },
  payoutWarningText: {
    fontSize: 13,
    color: '#856404',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dateText: {
    fontSize: 16,
    color: '#000',
  },

});