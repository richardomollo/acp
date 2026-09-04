import { useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity, View, ActivityIndicator, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | null;

const STATUS_CONFIG: Record<string, { icon: string; color: string; bg: string; title: string; message: string }> = {
  pending: {
    icon: 'time-outline', color: '#d97706', bg: '#fffbeb',
    title: 'Community Under Review',
    message: 'Our team is reviewing your community. This usually takes 24–48 hours. We\'ll notify you once it\'s approved.',
  },
  approved: {
    icon: 'checkmark-circle', color: '#16a34a', bg: '#f0fdf4',
    title: 'You\'re Approved!',
    message: 'Your community is now live. Go to your dashboard to create events and invite members.',
  },
  rejected: {
    icon: 'close-circle', color: '#dc2626', bg: '#fef2f2',
    title: 'Not Approved',
    message: 'Your community wasn\'t approved at this time. See the reason below and feel free to update and reapply.',
  },
};

export default function CommunityOnboardingPending() {
  const router = useRouter();
  const [status, setStatus] = useState<ReviewStatus>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasVenueRole, setHasVenueRole] = useState(false);
  const [hasPTRole, setHasPTRole] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: membership }, { data: gym }, { data: pt }] = await Promise.all([
        supabase.from('community_members')
          .select('communities(name, review_status, rejection_reason)')
          .eq('user_id', user.id).in('role', ['owner', 'admin']).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('gyms').select('id').ilike('contact_email', user.email ?? '').maybeSingle(),
        supabase.from('personal_trainers').select('status').eq('user_id', user.id).maybeSingle(),
      ]);
      const community = membership?.communities as any;
      if (community) {
        setStatus(community.review_status as ReviewStatus);
        setRejectionReason(community.rejection_reason ?? null);
        setCommunityName(community.name ?? '');
      }
      setHasVenueRole(!!gym);
      setHasPTRole(!!pt && pt.status === 'approved');
    } catch {}
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { checkStatus(); }, [checkStatus]));

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); router.replace('/(auth)/partner-login'); } },
    ]);
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#000" /></View>;
  }

  const cfg = status ? STATUS_CONFIG[status] : STATUS_CONFIG.pending;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <ThemedText style={styles.headerTitle}>Community Status</ThemedText>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <ThemedText style={styles.logo}>Lana Health</ThemedText>
          <View style={styles.badge}><ThemedText style={styles.badgeText}>Communities</ThemedText></View>
        </View>

        <View style={[styles.statusCard, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon as any} size={56} color={cfg.color} style={{ marginBottom: 16 }} />
          {!!communityName && <ThemedText style={styles.communityName}>{communityName}</ThemedText>}
          <ThemedText style={[styles.statusTitle, { color: cfg.color }]}>{cfg.title}</ThemedText>
          <ThemedText style={styles.statusMessage}>{cfg.message}</ThemedText>

          {status === 'rejected' && rejectionReason && (
            <View style={styles.reasonBox}>
              <ThemedText style={styles.reasonLabel}>Reason:</ThemedText>
              <ThemedText style={styles.reasonText}>{rejectionReason}</ThemedText>
            </View>
          )}
        </View>

        {status === 'approved' && (
          <TouchableOpacity style={styles.dashboardBtn} onPress={() => router.replace('/(community-tabs)' as any)}>
            <ThemedText style={styles.dashboardBtnText}>Go to Dashboard</ThemedText>
            <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        )}

        {status === 'pending' && (
          <View style={styles.stepsCard}>
            <ThemedText style={styles.stepsTitle}>What happens next?</ThemedText>
            {[
              { icon: 'mail-outline', text: 'We\'ll email you when your community is reviewed' },
              { icon: 'people-outline', text: 'Your community page goes live upon approval' },
              { icon: 'calendar-outline', text: 'Create your first event and invite members' },
              { icon: 'qr-code-outline', text: 'Check people in at events with a QR code' },
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepIcon}><Ionicons name={step.icon as any} size={18} color="#000" /></View>
                <ThemedText style={styles.stepText}>{step.text}</ThemedText>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.refreshBtn} onPress={checkStatus}>
          <Ionicons name="refresh-outline" size={16} color="#666" style={{ marginRight: 6 }} />
          <ThemedText style={styles.refreshText}>Refresh status</ThemedText>
        </TouchableOpacity>

        {hasVenueRole && (
          <TouchableOpacity style={styles.switchBtn} onPress={() => router.replace('/(tabs)' as any)}>
            <Ionicons name="swap-horizontal-outline" size={18} color="#000000" />
            <ThemedText style={styles.switchText}>Switch to Venue Dashboard</ThemedText>
          </TouchableOpacity>
        )}
        {hasPTRole && (
          <TouchableOpacity style={styles.switchBtn} onPress={() => router.replace('/(pt-tabs)' as any)}>
            <Ionicons name="swap-horizontal-outline" size={18} color="#000000" />
            <ThemedText style={styles.switchText}>Switch to Trainer Dashboard</ThemedText>
          </TouchableOpacity>
        )}

        <ThemedText style={styles.supportText}>
          Questions? Email <ThemedText style={styles.supportLink}>support@activecitypass.com</ThemedText>
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#000' },
  logoutBtn: { padding: 8 },
  content: { flex: 1, padding: 24, alignItems: 'center' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28 },
  logo: { fontSize: 22, fontWeight: '800', color: '#000' },
  badge: { backgroundColor: '#f0f5ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#002fff' },
  statusCard: { width: '100%', borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 20 },
  communityName: { fontSize: 14, fontWeight: '700', color: '#666', marginBottom: 8 },
  statusTitle: { fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  statusMessage: { fontSize: 15, color: '#444', textAlign: 'center', lineHeight: 22 },
  reasonBox: { marginTop: 16, backgroundColor: '#fff', borderRadius: 12, padding: 14, width: '100%' },
  reasonLabel: { fontSize: 12, fontWeight: '700', color: '#dc2626', marginBottom: 4 },
  reasonText: { fontSize: 14, color: '#444', lineHeight: 20 },
  stepsCard: { width: '100%', backgroundColor: '#f9fafb', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#f0f0f0' },
  stepsTitle: { fontSize: 15, fontWeight: '700', color: '#000', marginBottom: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  stepIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f0f5ff', alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontSize: 14, color: '#444', lineHeight: 20, paddingTop: 7 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 20 },
  refreshText: { fontSize: 14, color: '#666' },
  supportText: { fontSize: 13, color: '#888', textAlign: 'center' },
  supportLink: { color: '#002fff', fontWeight: '600' },
  switchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', paddingVertical: 16, borderRadius: 16,
    borderWidth: 1, borderColor: '#c7d7ff', backgroundColor: '#eff6ff', marginBottom: 12,
  },
  switchText: { fontSize: 15, fontWeight: '600', color: '#000000' },
  dashboardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#000', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 30, width: '100%', marginBottom: 20,
  },
  dashboardBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
