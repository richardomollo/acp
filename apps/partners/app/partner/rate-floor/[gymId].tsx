import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

interface Gym {
  id: string;
  name: string;
  drop_in_price: number | null;
  rate_floor_percentage: number | null;
}

export default function CommissionRateScreen() {
  const router = useRouter();
  const { gymId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [gym, setGym] = useState<Gym | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from('gyms')
        .select('id, name, drop_in_price, rate_floor_percentage')
        .eq('id', gymId)
        .single();

      if (error) throw error;
      setGym(data);
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#002fff" />
      </View>
    );
  }

  const commission = gym?.rate_floor_percentage ?? null;
  const dropIn = gym?.drop_in_price ?? null;
  const payout = commission != null && dropIn != null
    ? Math.round(dropIn * (1 - commission / 100))
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Commission Rate</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {gym && (
          <View style={styles.venueCard}>
            <Ionicons name="business" size={20} color="#002fff" />
            <ThemedText style={styles.venueName}>{gym.name}</ThemedText>
          </View>
        )}

        {commission != null ? (
          <View style={styles.rateCard}>
            <ThemedText style={styles.rateLabel}>ACP Commission</ThemedText>
            <ThemedText style={styles.rateValue}>{commission}%</ThemedText>
            <ThemedText style={styles.rateSubLabel}>
              You receive {100 - commission}% of each booking
            </ThemedText>

            {dropIn != null && (
              <View style={styles.breakdownBox}>
                <ThemedText style={styles.breakdownTitle}>Per Booking Breakdown</ThemedText>
                <View style={styles.breakdownRow}>
                  <ThemedText style={styles.breakdownLabel}>Walk-in price</ThemedText>
                  <ThemedText style={styles.breakdownValue}>KES {dropIn.toLocaleString()}</ThemedText>
                </View>
                <View style={styles.breakdownRow}>
                  <ThemedText style={styles.breakdownLabel}>ACP commission ({commission}%)</ThemedText>
                  <ThemedText style={styles.breakdownValue}>
                    KES {Math.round(dropIn * commission / 100).toLocaleString()}
                  </ThemedText>
                </View>
                <View style={[styles.breakdownRow, styles.breakdownDivider]}>
                  <ThemedText style={[styles.breakdownLabel, { fontWeight: '700', color: '#000' }]}>You receive</ThemedText>
                  <ThemedText style={styles.breakdownHighlight}>KES {payout?.toLocaleString()}</ThemedText>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noRateCard}>
            <Ionicons name="alert-circle-outline" size={40} color="#ff9500" />
            <ThemedText style={styles.noRateTitle}>Commission not yet agreed</ThemedText>
            <ThemedText style={styles.noRateText}>
              Contact ACP to finalise your commission rate before creating sessions.
            </ThemedText>
          </View>
        )}

        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={22} color="#002fff" />
            <ThemedText style={styles.infoTitle}>How it works</ThemedText>
          </View>
          <ThemedText style={styles.infoText}>
            ACP takes a commission on each booking made through the platform. Your payout is calculated automatically and paid out monthly.
          </ThemedText>
          <ThemedText style={styles.infoText}>
            Commission rates are negotiated directly with the ACP team and apply to all sessions at this venue.
          </ThemedText>
        </View>

        <TouchableOpacity
          style={styles.contactButton}
          onPress={() => Linking.openURL('mailto:hello@activecitypass.com?subject=Commission%20Rate%20Enquiry')}
        >
          <Ionicons name="mail-outline" size={20} color="#fff" />
          <ThemedText style={styles.contactButtonText}>Contact ACP to Negotiate</ThemedText>
        </TouchableOpacity>
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
    backgroundColor: '#fff',
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
    padding: 20,
    paddingBottom: 40,
  },
  venueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f5ff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  venueName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#002fff',
  },
  rateCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rateLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  rateValue: {
    fontSize: 56,
    fontWeight: '800',
    color: '#002fff',
    lineHeight: 64,
  },
  rateSubLabel: {
    fontSize: 15,
    color: '#444',
    marginTop: 4,
    marginBottom: 20,
  },
  breakdownBox: {
    width: '100%',
    backgroundColor: '#f0f5ff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  breakdownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#002fff',
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownDivider: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#d0dcff',
    marginTop: 4,
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#555',
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  breakdownHighlight: {
    fontSize: 16,
    fontWeight: '800',
    color: '#002fff',
  },
  noRateCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    gap: 12,
  },
  noRateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  noRateText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#002fff',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 8,
  },
  contactButton: {
    backgroundColor: '#002fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 25,
  },
  contactButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
