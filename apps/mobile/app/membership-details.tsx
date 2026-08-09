import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { authService } from '@/services/auth';
import { supabase } from '@/lib/supabase';
import { palette, radii, fontSize } from '@/constants/theme';

interface MembershipData {
  subscription_tier: string | null;
  subscription_status: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
}

export default function MembershipDetailsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<MembershipData | null>(null);

  useEffect(() => {
    loadMembershipDetails();
  }, []);

  const loadMembershipDetails = async () => {
    try {
      setLoading(true);
      const session = await authService.getSession();
      
      if (!session) {
        router.replace('/login');
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('subscription_tier, subscription_status, subscription_start_date, subscription_end_date')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;

      setMembership(data);
    } catch (error) {
      console.error('Error loading membership:', error);
      Alert.alert('Error', 'Failed to load membership details');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={palette.ink900} />
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
          <Ionicons name="arrow-back" size={24} color={palette.ink900} />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.headerTitle}>Membership</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Current Plan */}
        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <View>
              <ThemedText style={styles.planTitle}>
                {membership?.subscription_tier ? 
                  membership.subscription_tier.charAt(0).toUpperCase() + membership.subscription_tier.slice(1) : 
                  'Free'} Plan
              </ThemedText>
              <View style={[styles.statusBadge, { backgroundColor: palette.success700 }]}>
                <ThemedText style={styles.statusBadgeText}>
                  {membership?.subscription_status?.toUpperCase() || 'INACTIVE'}
                </ThemedText>
              </View>
            </View>
            <Ionicons name="diamond-outline" size={48} color={palette.blue500} />
          </View>

        </View>

        {/* Membership Details */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>DETAILS</ThemedText>

          <View style={styles.detailItem}>
            <ThemedText style={styles.detailLabel}>Subscription Status</ThemedText>
            <ThemedText style={styles.detailValue}>
              {membership?.subscription_status || 'N/A'}
            </ThemedText>
          </View>

          {membership?.subscription_start_date && (
            <View style={styles.detailItem}>
              <ThemedText style={styles.detailLabel}>Start Date</ThemedText>
              <ThemedText style={styles.detailValue}>
                {formatDate(membership.subscription_start_date)}
              </ThemedText>
            </View>
          )}

          {membership?.subscription_end_date && (
            <View style={styles.detailItem}>
              <ThemedText style={styles.detailLabel}>Renewal Date</ThemedText>
              <ThemedText style={styles.detailValue}>
                {formatDate(membership.subscription_end_date)}
              </ThemedText>
            </View>
          )}

        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="card-outline" size={24} color={palette.ink900} />
            <ThemedText style={styles.actionButtonText}>Payment Methods</ThemedText>
            <Ionicons name="chevron-forward" size={24} color={palette.gray300} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="receipt-outline" size={24} color={palette.ink900} />
            <ThemedText style={styles.actionButtonText}>Billing History</ThemedText>
            <Ionicons name="chevron-forward" size={24} color={palette.gray300} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="gift-outline" size={24} color={palette.ink900} />
            <ThemedText style={styles.actionButtonText}>Upgrade Plan</ThemedText>
            <Ionicons name="chevron-forward" size={24} color={palette.gray300} />
          </TouchableOpacity>
        </View>

        {/* Cancel Subscription */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => {
              Alert.alert(
                'Cancel Subscription',
                'Are you sure you want to cancel your subscription?',
                [
                  { text: 'Keep Subscription', style: 'cancel' },
                  {
                    text: 'Cancel',
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert('Info', 'Cancellation coming soon');
                    },
                  },
                ]
              );
            }}
          >
            <ThemedText style={styles.cancelButtonText}>Cancel Subscription</ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.white,
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
    borderBottomWidth: 1,
    borderBottomColor: palette.borderFaint,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: palette.ink900,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  planCard: {
    margin: 20,
    padding: 24,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.lg,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  planTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: palette.ink900,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.md,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    color: palette.white,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: palette.gray300,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
  },
  detailLabel: {
    fontSize: fontSize.lg,
    color: palette.gray450,
  },
  detailValue: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: palette.ink900,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
    gap: 12,
  },
  actionButtonText: {
    flex: 1,
    fontSize: fontSize.lg,
    color: palette.ink900,
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: palette.danger500,
  },
});