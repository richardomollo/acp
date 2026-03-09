import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  ScrollView,
  Alert,
  Switch,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface PartnerProfile {
  id: string;
  business_name: string;
  email: string;
  phone: string;
  contact_person: string | null;
  description: string | null;
  website: string | null;
}

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [editMode, setEditMode] = useState(false);
  
  // Edit form
  const [editForm, setEditForm] = useState({
    business_name: '',
    contact_person: '',
    phone: '',
    description: '',
    website: '',
  });

  // Settings
  const [notifications, setNotifications] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [bookingReminders, setBookingReminders] = useState(true);

  // Stats
  const [stats, setStats] = useState({
    total_venues: 0,
    total_sessions: 0,
    total_bookings: 0,
    member_since: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/partner-login');
        return;
      }

      // Get partner profile
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (partnerError) throw partnerError;

      setProfile(partnerData);
      setEditForm({
        business_name: partnerData.business_name || '',
        contact_person: partnerData.contact_person || '',
        phone: partnerData.phone || '',
        description: partnerData.description || '',
        website: partnerData.website || '',
      });

      // Get stats
      const { data: venues } = await supabase
        .from('partner_gyms')
        .select('gym_id')
        .eq('partner_id', partnerData.id);

      const gymIds = venues?.map(v => v.gym_id) || [];

      const { count: sessionsCount } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .in('gym_id', gymIds);

      const { count: bookingsCount } = await supabase
        .from('bookings')
        .select('*, sessions!inner(gym_id)', { count: 'exact', head: true })
        .in('sessions.gym_id', gymIds);

      setStats({
        total_venues: gymIds.length,
        total_sessions: sessionsCount || 0,
        total_bookings: bookingsCount || 0,
        member_since: new Date(partnerData.created_at).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric'
        }),
      });

    } catch (error: any) {
      console.error('Load profile error:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editForm.business_name.trim()) {
      Alert.alert('Error', 'Business name is required');
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from('partners')
        .update({
          business_name: editForm.business_name.trim(),
          contact_person: editForm.contact_person.trim() || null,
          phone: editForm.phone.trim() || null,
          description: editForm.description.trim() || null,
          website: editForm.website.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile?.id);

      if (error) throw error;

      Alert.alert('Success', 'Profile updated successfully');
      setEditMode(false);
      loadProfile();

    } catch (error: any) {
      console.error('Save profile error:', error);
      Alert.alert('Error', error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = () => {
    Alert.alert(
      'Change Password',
      'We\'ll send you an email with instructions to reset your password.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Email',
          onPress: async () => {
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(
                profile?.email || '',
                { redirectTo: 'fitpass://reset-password' }
              );

              if (error) throw error;

              Alert.alert('Email Sent', 'Check your inbox for password reset instructions');
            } catch (error) {
              Alert.alert('Error', 'Failed to send reset email');
            }
          }
        }
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.auth.signOut();
              router.replace('/partner-login');
            } catch (error) {
              Alert.alert('Error', 'Failed to logout');
            }
          }
        }
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, all venues, sessions, and bookings. This action cannot be undone.\n\nAre you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final Confirmation',
              'Type DELETE in the next screen to confirm account deletion',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Continue',
                  style: 'destructive',
                  onPress: () => {
                    // In a real app, you'd show a text input modal here
                    Alert.alert('Feature Coming Soon', 'Please contact support to delete your account');
                  }
                }
              ]
            );
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
        <ThemedText style={styles.headerTitle}>Profile & Settings</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <ThemedText style={styles.avatarText}>
              {profile?.business_name?.charAt(0).toUpperCase() || 'P'}
            </ThemedText>
          </View>
          <ThemedText style={styles.businessName}>{profile?.business_name}</ThemedText>
          <ThemedText style={styles.email}>{profile?.email}</ThemedText>
          <ThemedText style={styles.memberSince}>Member since {stats.member_since}</ThemedText>

          {/* Quick Stats */}
          <View style={styles.quickStats}>
            <View style={styles.quickStatItem}>
              <ThemedText style={styles.quickStatValue}>{stats.total_venues}</ThemedText>
              <ThemedText style={styles.quickStatLabel}>Venues</ThemedText>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStatItem}>
              <ThemedText style={styles.quickStatValue}>{stats.total_sessions}</ThemedText>
              <ThemedText style={styles.quickStatLabel}>Sessions</ThemedText>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStatItem}>
              <ThemedText style={styles.quickStatValue}>{stats.total_bookings}</ThemedText>
              <ThemedText style={styles.quickStatLabel}>Bookings</ThemedText>
            </View>
          </View>
        </View>

        {/* Business Information */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Business Information</ThemedText>
            {!editMode && (
              <TouchableOpacity onPress={() => setEditMode(true)}>
                <Ionicons name="create-outline" size={22} color="#002fff" />
              </TouchableOpacity>
            )}
          </View>

          {editMode ? (
            /* Edit Mode */
            <View style={styles.editContainer}>
              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Business Name *</ThemedText>
                <TextInput
                  style={styles.input}
                  value={editForm.business_name}
                  onChangeText={(text) => setEditForm({ ...editForm, business_name: text })}
                  placeholder="Your Business Name"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Contact Person</ThemedText>
                <TextInput
                  style={styles.input}
                  value={editForm.contact_person}
                  onChangeText={(text) => setEditForm({ ...editForm, contact_person: text })}
                  placeholder="John Doe"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Phone Number</ThemedText>
                <TextInput
                  style={styles.input}
                  value={editForm.phone}
                  onChangeText={(text) => setEditForm({ ...editForm, phone: text })}
                  placeholder="+1 (555) 123-4567"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Website</ThemedText>
                <TextInput
                  style={styles.input}
                  value={editForm.website}
                  onChangeText={(text) => setEditForm({ ...editForm, website: text })}
                  placeholder="https://yourwebsite.com"
                  placeholderTextColor="#999"
                  keyboardType="url"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.inputLabel}>Description</ThemedText>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editForm.description}
                  onChangeText={(text) => setEditForm({ ...editForm, description: text })}
                  placeholder="Tell us about your business..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditMode(false);
                    setEditForm({
                      business_name: profile?.business_name || '',
                      contact_person: profile?.contact_person || '',
                      phone: profile?.phone || '',
                      description: profile?.description || '',
                      website: profile?.website || '',
                    });
                  }}
                >
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && { opacity: 0.6 }]}
                  onPress={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* View Mode */
            <View style={styles.infoList}>
              {profile?.contact_person && (
                <View style={styles.infoItem}>
                  <Ionicons name="person-outline" size={20} color="#666" />
                  <View style={styles.infoContent}>
                    <ThemedText style={styles.infoLabel}>Contact Person</ThemedText>
                    <ThemedText style={styles.infoValue}>{profile.contact_person}</ThemedText>
                  </View>
                </View>
              )}

              {profile?.phone && (
                <View style={styles.infoItem}>
                  <Ionicons name="call-outline" size={20} color="#666" />
                  <View style={styles.infoContent}>
                    <ThemedText style={styles.infoLabel}>Phone</ThemedText>
                    <ThemedText style={styles.infoValue}>{profile.phone}</ThemedText>
                  </View>
                </View>
              )}

              {profile?.website && (
                <View style={styles.infoItem}>
                  <Ionicons name="globe-outline" size={20} color="#666" />
                  <View style={styles.infoContent}>
                    <ThemedText style={styles.infoLabel}>Website</ThemedText>
                    <ThemedText style={styles.infoValue}>{profile.website}</ThemedText>
                  </View>
                </View>
              )}

              {profile?.description && (
                <View style={styles.infoItem}>
                  <Ionicons name="document-text-outline" size={20} color="#666" />
                  <View style={styles.infoContent}>
                    <ThemedText style={styles.infoLabel}>Description</ThemedText>
                    <ThemedText style={styles.infoValue}>{profile.description}</ThemedText>
                  </View>
                </View>
              )}

              {!profile?.contact_person && !profile?.phone && !profile?.website && !profile?.description && (
                <View style={styles.emptyInfo}>
                  <ThemedText style={styles.emptyInfoText}>
                    No additional information yet
                  </ThemedText>
                  <TouchableOpacity onPress={() => setEditMode(true)}>
                    <ThemedText style={styles.addInfoLink}>Add Information</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Notifications</ThemedText>
          
          <View style={styles.settingsList}>
            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <ThemedText style={styles.settingLabel}>Push Notifications</ThemedText>
                <ThemedText style={styles.settingDescription}>
                  Receive alerts for new bookings and updates
                </ThemedText>
              </View>
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: '#e0e0e0', true: '#002fff' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <ThemedText style={styles.settingLabel}>Email Alerts</ThemedText>
                <ThemedText style={styles.settingDescription}>
                  Get daily summary emails
                </ThemedText>
              </View>
              <Switch
                value={emailAlerts}
                onValueChange={setEmailAlerts}
                trackColor={{ false: '#e0e0e0', true: '#002fff' }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <ThemedText style={styles.settingLabel}>Booking Reminders</ThemedText>
                <ThemedText style={styles.settingDescription}>
                  Reminders for upcoming sessions
                </ThemedText>
              </View>
              <Switch
                value={bookingReminders}
                onValueChange={setBookingReminders}
                trackColor={{ false: '#e0e0e0', true: '#002fff' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Account</ThemedText>
          
          <TouchableOpacity 
            style={styles.actionItem} 
            onPress={() => router.push('/partner/payout-information')}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="card-outline" size={22} color="#00c853" />
            </View>
            <View style={styles.actionContent}>
              <ThemedText style={styles.actionLabel}>Payout Information</ThemedText>
              <ThemedText style={styles.actionDescription}>Manage bank details and payouts</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleChangePassword}>
            <View style={styles.actionIcon}>
              <Ionicons name="lock-closed-outline" size={22} color="#002fff" />
            </View>
            <View style={styles.actionContent}>
              <ThemedText style={styles.actionLabel}>Change Password</ThemedText>
              <ThemedText style={styles.actionDescription}>Reset your password</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleLogout}>
            <View style={styles.actionIcon}>
              <Ionicons name="log-out-outline" size={22} color="#ff9500" />
            </View>
            <View style={styles.actionContent}>
              <ThemedText style={styles.actionLabel}>Logout</ThemedText>
              <ThemedText style={styles.actionDescription}>Sign out of your account</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleDeleteAccount}>
            <View style={[styles.actionIcon, { backgroundColor: '#ffebee' }]}>
              <Ionicons name="trash-outline" size={22} color="#ff3b30" />
            </View>
            <View style={styles.actionContent}>
              <ThemedText style={[styles.actionLabel, { color: '#ff3b30' }]}>
                Delete Account
              </ThemedText>
              <ThemedText style={styles.actionDescription}>Permanently delete your account</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* Support */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Support & Help</ThemedText>
          
          <TouchableOpacity style={styles.actionItem}>
            <View style={styles.actionIcon}>
              <Ionicons name="help-circle-outline" size={22} color="#00c853" />
            </View>
            <View style={styles.actionContent}>
              <ThemedText style={styles.actionLabel}>Help Center</ThemedText>
              <ThemedText style={styles.actionDescription}>FAQs and guides</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem}>
            <View style={styles.actionIcon}>
              <Ionicons name="chatbubble-outline" size={22} color="#002fff" />
            </View>
            <View style={styles.actionContent}>
              <ThemedText style={styles.actionLabel}>Contact Support</ThemedText>
              <ThemedText style={styles.actionDescription}>Get help from our team</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem}>
            <View style={styles.actionIcon}>
              <Ionicons name="document-text-outline" size={22} color="#666" />
            </View>
            <View style={styles.actionContent}>
              <ThemedText style={styles.actionLabel}>Terms & Privacy</ThemedText>
              <ThemedText style={styles.actionDescription}>Legal information</ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <ThemedText style={styles.versionText}>FitPass Partner v1.0.0</ThemedText>
        </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#002fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
  },
  businessName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  memberSince: {
    fontSize: 13,
    color: '#999',
    marginBottom: 20,
  },
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignSelf: 'stretch',
  },
  quickStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#000',
    marginBottom: 4,
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#666',
  },
  quickStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e0e0e0',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
  },
  infoList: {
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
  emptyInfo: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyInfoText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  addInfoLink: {
    fontSize: 15,
    fontWeight: '600',
    color: '#002fff',
  },
  editContainer: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  input: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#002fff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  settingsList: {
    gap: 0,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f5ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionContent: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 13,
    color: '#666',
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  versionText: {
    fontSize: 13,
    color: '#999',
  },
});