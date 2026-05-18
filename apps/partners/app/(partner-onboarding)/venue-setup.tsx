import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';

interface VenueForm {
  name: string;
  location: string;
  area: string;
  address: string;
  type: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  imageUri: string | null;
}

export default function VenueSetupScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [checkingPartner, setCheckingPartner] = useState(true);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  
  const [venue, setVenue] = useState<VenueForm>({
    name: '',
    location: '',
    area: '',
    address: '',
    type: 'gym',
    description: '',
    contactEmail: '',
    contactPhone: '',
    imageUri: null,
  });

  const venueTypes = [
    { value: 'gym', label: 'Gym', icon: 'barbell' },
    { value: 'studio', label: 'Studio', icon: 'body' },
    { value: 'crossfit', label: 'CrossFit', icon: 'fitness' },
    { value: 'yoga', label: 'Yoga', icon: 'leaf' },
    { value: 'pilates', label: 'Pilates', icon: 'ellipse' },
    { value: 'dance', label: 'Dance', icon: 'musical-notes' },
    { value: 'martial-arts', label: 'Martial Arts', icon: 'hand-left' },
    { value: 'other', label: 'Other', icon: 'apps' },
  ];

  useEffect(() => {
    checkOrCreatePartnerProfile();
  }, []);

  const checkOrCreatePartnerProfile = async () => {
    try {
      setCheckingPartner(true);
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.error('No authenticated user:', userError);
        Alert.alert(
          'Authentication Required',
          'Please sign in to continue',
          [{ text: 'OK', onPress: () => router.replace('/partner-login') }]
        );
        return;
      }

      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, email, phone')
        .eq('user_id', user.id)
        .maybeSingle();

      if (partnerError) {
        console.error('Error fetching partner:', partnerError);
      }

      if (partner) {
        console.log('✅ Partner profile found:', partner.id);
        setPartnerId(partner.id);
      } else {
        console.log('⚠️ No partner profile found, creating one...');
        
        const { data: newPartner, error: createError } = await supabase
          .from('partners')
          .insert([{
            user_id: user.id,
            email: user.email || 'pending@example.com',
            phone: '+1234567890',
            verified: false,
            onboarding_completed: false
          }])
          .select('id')
          .single();

        if (createError) {
          console.error('Error creating partner:', createError);
          throw new Error(`Failed to create partner profile: ${createError.message}`);
        }

        console.log('✅ Partner profile created:', newPartner.id);
        setPartnerId(newPartner.id);

        await supabase
          .from('partner_onboarding_progress')
          .insert([{
            partner_id: newPartner.id,
            account_created: true,
            venue_created: false
          }]);
      }

    } catch (error: any) {
      console.error('Partner check/create error:', error);
      Alert.alert(
        'Setup Error',
        `Could not set up partner profile: ${error.message}. Please try logging in again.`,
        [
          { text: 'Try Again', onPress: () => checkOrCreatePartnerProfile() },
          { text: 'Go Back', onPress: () => router.back() }
        ]
      );
    } finally {
      setCheckingPartner(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera roll permissions to upload images');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled) {
      setVenue({ ...venue, imageUri: result.assets[0].uri });
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

  const handleCreateVenue = async () => {
    // Validation
    if (!venue.name || !venue.location || !venue.area || !venue.address) {
      Alert.alert('Error', 'Please fill in all required fields (Name, Location, Area, Address)');
      return;
    }

    if (!partnerId) {
      Alert.alert('Error', 'Partner profile not ready. Please wait or refresh.');
      return;
    }

    setLoading(true);

    try {
      console.log('Creating venue for partner:', partnerId);
      console.log('Venue data:', {
        name: venue.name,
        location: venue.location,
        area: venue.area,
        address: venue.address,
      });

      // Create venue with ALL required fields
      const { data: gymData, error: gymError } = await supabase
        .from('gyms')
        .insert([{
          name: venue.name,
          location: venue.location,
          area: venue.area,
          address: venue.address,
          type: venue.type,
          description: venue.description || null,
          contact_email: venue.contactEmail || null,
          contact_phone: venue.contactPhone || null,
          partner_id: partnerId,
          is_active: true,
          setup_completed: true,
          rating: 0,
        }])
        .select()
        .single();

      if (gymError) {
        console.error('Gym creation error:', gymError);
        throw gymError;
      }

      console.log('✅ Venue created:', gymData.id);

      // Upload image if provided
      let imageUrl = null;
      if (venue.imageUri && gymData) {
        imageUrl = await uploadImage(venue.imageUri, gymData.id);
        
        if (imageUrl) {
          await supabase
            .from('gyms')
            .update({ image_url: imageUrl })
            .eq('id', gymData.id);
          
          console.log('✅ Image uploaded');
        }
      }

      // Link partner to gym
      const { error: linkError } = await supabase
        .from('partner_gyms')
        .insert([{
          partner_id: partnerId,
          gym_id: gymData.id,
          role: 'owner'
        }]);

      if (linkError) {
        console.error('Partner-gym link error:', linkError);
      } else {
        console.log('✅ Partner linked to gym');
      }

      
     // Update progress tracker
    await supabase
      .from('partner_onboarding_progress')
      .update({ venue_created: true, completed_at: new Date().toISOString() })
      .eq('partner_id', partnerId);

    // ✨ NEW: Mark onboarding complete in partners table
    await supabase
      .from('partners')
      .update({ onboarding_completed: true })
      .eq('id', partnerId);

      console.log('✅ Onboarding progress updated');

      Alert.alert(
        'Success!',
        'Your venue has been created',
        [
          {
            text: 'Add Another Venue',
            style: 'cancel',
            onPress: () => {
              setVenue({
                name: '',
                location: '',
                area: '',
                address: '',
                type: 'gym',
                description: '',
                contactEmail: '',
                contactPhone: '',
                imageUri: null,
              });
            }
          },
          {
            text: 'Continue to Dashboard',
            onPress: () => router.replace('/partner/venues')
          }
        ]
      );

    } catch (error: any) {
      console.error('Venue creation error:', error);
      Alert.alert(
        'Error', 
        `Failed to create venue: ${error.message || 'Unknown error'}. Please check console for details.`
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingPartner) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
        <ThemedText style={{ marginTop: 20, color: '#666' }}>
          Setting up your profile...
        </ThemedText>
      </View>
    );
  }

  if (!partnerId) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="alert-circle-outline" size={60} color="#ff3b30" />
        <ThemedText style={{ marginTop: 20, fontSize: 18, fontWeight: '700' }}>
          Setup Failed
        </ThemedText>
        <ThemedText style={{ marginTop: 10, color: '#666', textAlign: 'center', paddingHorizontal: 40 }}>
          Could not set up your partner profile. Please try again.
        </ThemedText>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={checkOrCreatePartnerProfile}
        >
          <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }

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
        <ThemedText style={styles.headerTitle}>Create Venue</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          <ThemedText type="title" style={styles.title}>
            Let's get started
          </ThemedText>

          <ThemedText style={styles.description}>
            Tell us about your fitness space
          </ThemedText>

          {/* Image Upload */}
          <TouchableOpacity style={styles.imageUpload} onPress={pickImage}>
            {venue.imageUri ? (
              <Image source={{ uri: venue.imageUri }} style={styles.uploadedImage} contentFit="cover" />
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Ionicons name="camera" size={40} color="#999" />
                <ThemedText style={styles.uploadText}>Add Venue Photo</ThemedText>
              </View>
            )}
          </TouchableOpacity>

          {/* Venue Name */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Venue Name <ThemedText style={styles.required}>*</ThemedText>
            </ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g., Sunrise Fitness Studio"
              placeholderTextColor="#999"
              value={venue.name}
              onChangeText={(text) => setVenue({ ...venue, name: text })}
              editable={!loading}
            />
          </View>

          {/* Location/City */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              City <ThemedText style={styles.required}>*</ThemedText>
            </ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g., Nairobi"
              placeholderTextColor="#999"
              value={venue.location}
              onChangeText={(text) => setVenue({ ...venue, location: text })}
              editable={!loading}
            />
          </View>

          {/* Area/Region */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Area/Region <ThemedText style={styles.required}>*</ThemedText>
            </ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g., Ngong Road, Nairobi"
              placeholderTextColor="#999"
              value={venue.area}
              onChangeText={(text) => setVenue({ ...venue, area: text })}
              editable={!loading}
            />
            <ThemedText style={styles.helperText}>
              Neighborhood or district
            </ThemedText>
          </View>

          {/* Full Address */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Full Address <ThemedText style={styles.required}>*</ThemedText>
            </ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Airport N Rd, Nairobi, Kenya"
              placeholderTextColor="#999"
              value={venue.address}
              onChangeText={(text) => setVenue({ ...venue, address: text })}
              editable={!loading}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Venue Type */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Venue Type <ThemedText style={styles.required}>*</ThemedText>
            </ThemedText>
            <View style={styles.typeGrid}>
              {venueTypes.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeButton,
                    venue.type === type.value && styles.typeButtonActive
                  ]}
                  onPress={() => setVenue({ ...venue, type: type.value })}
                  disabled={loading}
                >
                  <Ionicons 
                    name={type.icon as any} 
                    size={24} 
                    color={venue.type === type.value ? '#002fff' : '#666'} 
                  />
                  <ThemedText style={[
                    styles.typeLabel,
                    venue.type === type.value && styles.typeLabelActive
                  ]}>
                    {type.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Description (Optional)
            </ThemedText>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe your venue, amenities, and what makes it special..."
              placeholderTextColor="#999"
              value={venue.description}
              onChangeText={(text) => setVenue({ ...venue, description: text })}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!loading}
            />
          </View>

          {/* Contact Email */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Contact Email (Optional)
            </ThemedText>
            <TextInput
              style={styles.input}
              placeholder="contact@yourgym.com"
              placeholderTextColor="#999"
              value={venue.contactEmail}
              onChangeText={(text) => setVenue({ ...venue, contactEmail: text })}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
          </View>

          {/* Contact Phone */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Contact Phone (Optional)
            </ThemedText>
            <TextInput
              style={styles.input}
              placeholder="+1 (555) 123-4567"
              placeholderTextColor="#999"
              value={venue.contactPhone}
              onChangeText={(text) => setVenue({ ...venue, contactPhone: text })}
              keyboardType="phone-pad"
              editable={!loading}
            />
          </View>

          {/* Create Button */}
          <TouchableOpacity
            style={[styles.createButton, (loading || uploadingImage) && { opacity: 0.6 }]}
            onPress={handleCreateVenue}
            disabled={loading || uploadingImage}
          >
            {loading || uploadingImage ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.createButtonText}>
                Create Venue
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
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#002fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
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
    paddingTop: 30,
  },
  title: {
    marginBottom: 10,
    color: '#000000',
    textAlign: 'center',
  },
  description: {
    marginBottom: 30,
    color: '#666',
    textAlign: 'center',
    fontSize: 15,
  },
  imageUpload: {
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#f8f8f8',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  uploadPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
  },
  uploadText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginTop: 10,
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
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeButton: {
    flex: 1,
    minWidth: '30%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    gap: 8,
  },
  typeButtonActive: {
    borderColor: '#002fff',
    backgroundColor: '#f0f5ff',
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  typeLabelActive: {
    color: '#002fff',
  },
  createButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
    marginTop: 10,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});