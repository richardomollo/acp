// Component to display dynamic credit pricing to customers
// Shows current credit cost with visual indicators for deals/peak pricing
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface DynamicCreditDisplayProps {
  sessionId: string;
  baseCredits: number;
  currentCredits?: number;
  showDetails?: boolean;
}

interface PricingFactors {
  isP

eakTime: boolean;
  isLastMinute: boolean;
  isEarlyBird: boolean;
  limitedSpots: boolean;
  popularClass: boolean;
}

export function DynamicCreditDisplay({ 
  sessionId, 
  baseCredits, 
  currentCredits,
  showDetails = true 
}: DynamicCreditDisplayProps) {
  const [credits, setCredits] = useState(currentCredits || baseCredits);
  const [factors, setFactors] = useState<PricingFactors>({
    isPeakTime: false,
    isLastMinute: false,
    isEarlyBird: false,
    limitedSpots: false,
    popularClass: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    calculateDynamicCredits();
  }, [sessionId]);

  const calculateDynamicCredits = async () => {
    try {
      // Call the database function to calculate credits
      const { data, error } = await supabase
        .rpc('calculate_session_credits', {
          p_session_id: sessionId,
          p_booking_time: new Date().toISOString(),
        });

      if (error) throw error;

      if (data) {
        setCredits(data);
      }

      // Get session details to show pricing factors
      const { data: session } = await supabase
        .from('sessions')
        .select('*, gyms(*)')
        .eq('id', sessionId)
        .single();

      if (session) {
        // Determine pricing factors
        const sessionTime = new Date(`${session.date} ${session.time}`);
        const now = new Date();
        const hoursUntil = (sessionTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        const hour = new Date(`2000-01-01 ${session.time}`).getHours();

        // Get spots remaining
        const { count: bookedCount } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', sessionId)
          .eq('status', 'confirmed');

        const spotsRemaining = session.max_capacity - (bookedCount || 0);

        setFactors({
          isPeakTime: (hour >= 17 && hour <= 20) || (hour >= 8 && hour <= 12),
          isLastMinute: hoursUntil <= 24,
          isEarlyBird: hoursUntil >= 168, // 7+ days
          limitedSpots: spotsRemaining <= 3,
          popularClass: session.popularity_score >= 1.2,
        });
      }

    } catch (error) {
      console.error('Calculate credits error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPricingStatus = () => {
    if (credits < baseCredits) {
      return { type: 'deal', color: '#00c853', icon: 'trending-down' };
    } else if (credits > baseCredits) {
      return { type: 'premium', color: '#ff9500', icon: 'trending-up' };
    }
    return { type: 'normal', color: '#666', icon: 'remove' };
  };

  const status = getPricingStatus();
  const discount = baseCredits > 0 ? Math.round(((baseCredits - credits) / baseCredits) * 100) : 0;
  const premium = baseCredits > 0 ? Math.round(((credits - baseCredits) / baseCredits) * 100) : 0;

  return (
    <View style={styles.container}>
      {/* Main Credit Display */}
      <View style={styles.creditCard}>
        <View style={styles.creditMain}>
          <View style={styles.creditBadge}>
            <Ionicons name="flash" size={20} color="#002fff" />
            <ThemedText style={styles.creditAmount}>{credits}</ThemedText>
            <ThemedText style={styles.creditLabel}>credits</ThemedText>
          </View>

          {/* Price Change Indicator */}
          {status.type !== 'normal' && (
            <View style={[styles.changeIndicator, { backgroundColor: `${status.color}20` }]}>
              <Ionicons name={status.icon as any} size={16} color={status.color} />
              <ThemedText style={[styles.changeText, { color: status.color }]}>
                {status.type === 'deal' 
                  ? `${discount}% off` 
                  : `+${premium}% peak`
                }
              </ThemedText>
            </View>
          )}
        </View>

        {/* Base Credits Comparison */}
        {credits !== baseCredits && (
          <ThemedText style={styles.baseCreditsText}>
            Usually {baseCredits} credits
          </ThemedText>
        )}
      </View>

      {/* Pricing Factors (Optional Details) */}
      {showDetails && Object.values(factors).some(f => f) && (
        <View style={styles.factorsContainer}>
          <ThemedText style={styles.factorsTitle}>Smart pricing based on:</ThemedText>
          
          {factors.isPeakTime && (
            <View style={styles.factor}>
              <Ionicons name="time" size={14} color="#ff9500" />
              <ThemedText style={styles.factorText}>Peak hours</ThemedText>
            </View>
          )}

          {factors.limitedSpots && (
            <View style={styles.factor}>
              <Ionicons name="alert-circle" size={14} color="#ff3b30" />
              <ThemedText style={styles.factorText}>Limited spots</ThemedText>
            </View>
          )}

          {factors.popularClass && (
            <View style={styles.factor}>
              <Ionicons name="flame" size={14} color="#ff9500" />
              <ThemedText style={styles.factorText}>High demand</ThemedText>
            </View>
          )}

          {factors.isEarlyBird && (
            <View style={styles.factor}>
              <Ionicons name="gift" size={14} color="#00c853" />
              <ThemedText style={styles.factorText}>Early booking discount</ThemedText>
            </View>
          )}

          {factors.isLastMinute && !factors.limitedSpots && (
            <View style={styles.factor}>
              <Ionicons name="time-outline" size={14} color="#00c853" />
              <ThemedText style={styles.factorText}>Last-minute deal</ThemedText>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  creditCard: {
    backgroundColor: '#f0f5ff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#d0e0ff',
  },
  creditMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  creditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creditAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#002fff',
  },
  creditLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  changeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  baseCreditsText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textDecorationLine: 'line-through',
  },
  factorsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  factorsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  factor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  factorText: {
    fontSize: 12,
    color: '#666',
  },
});