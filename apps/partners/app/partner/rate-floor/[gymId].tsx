import { useRouter, useLocalSearchParams } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

interface Gym {
  id: string;
  name: string;
  drop_in_price: number | null;
  rate_floor: number | null;
  rate_floor_percentage: number | null;
  max_platform_spots: number;
}

interface Negotiation {
  id: string;
  proposed_floor: number;
  proposed_percentage: number;
  status: string;
  platform_counter_offer: number | null;
  notes: string | null;
  submitted_at: string;
}

export default function RateFloorNegotiationScreen() {
  const router = useRouter();
  const { gymId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gym, setGym] = useState<Gym | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);

  const [dropInPrice, setDropInPrice] = useState('');
  const [proposedFloor, setProposedFloor] = useState('');
  const [proposedPercentage, setProposedPercentage] = useState('50');
  const [maxPlatformSpots, setMaxPlatformSpots] = useState('5');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Get partner ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) throw new Error('Partner not found');
      setPartnerId(partner.id);

      // Load gym data
      const { data: gymData, error: gymError } = await supabase
        .from('gyms')
        .select('id, name, drop_in_price, rate_floor, rate_floor_percentage, max_platform_spots')
        .eq('id', gymId)
        .single();

      if (gymError) throw gymError;

      setGym(gymData);
      setDropInPrice(gymData.drop_in_price?.toString() || '');
      setProposedFloor(gymData.rate_floor?.toString() || '');
      setProposedPercentage(gymData.rate_floor_percentage?.toString() || '50');
      setMaxPlatformSpots(gymData.max_platform_spots?.toString() || '5');

      // Load negotiation history
      const { data: negotiationsData } = await supabase
        .from('rate_floor_negotiations')
        .select('*')
        .eq('gym_id', gymId)
        .order('submitted_at', { ascending: false })
        .limit(10);

      setNegotiations(negotiationsData || []);

    } catch (error: any) {
      console.error('Load error:', error);
      Alert.alert('Error', 'Failed to load pricing data');
    } finally {
      setLoading(false);
    }
  };

  const calculateFloorFromPercentage = (percentage: string) => {
    const pct = parseFloat(percentage);
    const dropIn = parseFloat(dropInPrice);
    if (!isNaN(pct) && !isNaN(dropIn)) {
      const floor = (dropIn * pct / 100).toFixed(2);
      setProposedFloor(floor);
    }
  };

  const calculatePercentageFromFloor = (floor: string) => {
    const floorAmount = parseFloat(floor);
    const dropIn = parseFloat(dropInPrice);
    if (!isNaN(floorAmount) && !isNaN(dropIn) && dropIn > 0) {
      const pct = ((floorAmount / dropIn) * 100).toFixed(0);
      setProposedPercentage(pct);
    }
  };

  const handleSubmitNegotiation = async () => {
    // Validation
    const dropIn = parseFloat(dropInPrice);
    const floor = parseFloat(proposedFloor);

    if (isNaN(dropIn) || dropIn <= 0) {
      Alert.alert('Error', 'Please enter a valid drop-in price');
      return;
    }

    if (isNaN(floor) || floor <= 0) {
      Alert.alert('Error', 'Please enter a valid rate floor');
      return;
    }

    if (floor > dropIn) {
      Alert.alert('Error', 'Rate floor cannot exceed drop-in price');
      return;
    }

    if (!partnerId) {
      Alert.alert('Error', 'Partner ID not found');
      return;
    }

    setSaving(true);

    try {
      // Save drop-in price and max spots to gym
      const { error: gymError } = await supabase
        .from('gyms')
        .update({
          drop_in_price: dropIn,
          max_platform_spots: parseInt(maxPlatformSpots) || 5,
        })
        .eq('id', gymId);

      if (gymError) throw gymError;

      // Create negotiation request
      const { error: negotiationError } = await supabase
        .from('rate_floor_negotiations')
        .insert({
          gym_id: gymId,
          partner_id: partnerId,
          proposed_floor: floor,
          proposed_percentage: parseInt(proposedPercentage),
          status: 'pending',
        });

      if (negotiationError) throw negotiationError;

      Alert.alert(
        'Success',
        'Your rate floor proposal has been submitted for review. You will be notified when it is processed.',
        [{ text: 'OK', onPress: () => router.back() }]
      );

    } catch (error: any) {
      console.error('Submit error:', error);
      Alert.alert('Error', error.message || 'Failed to submit proposal');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#00c853';
      case 'rejected': return '#ff3b30';
      case 'pending': return '#ff9500';
      case 'counter_offer': return '#002fff';
      default: return '#666';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return 'checkmark-circle';
      case 'rejected': return 'close-circle';
      case 'pending': return 'time';
      case 'counter_offer': return 'swap-horizontal';
      default: return 'help-circle';
    }
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
        <ThemedText style={styles.headerTitle}>SmartRate Pricing</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Venue Info */}
        {gym && (
          <View style={styles.venueCard}>
            <Ionicons name="business" size={20} color="#002fff" />
            <ThemedText style={styles.venueName}>{gym.name}</ThemedText>
          </View>
        )}

        {/* Explanation Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={24} color="#002fff" />
            <ThemedText style={styles.infoTitle}>How SmartRate Works</ThemedText>
          </View>
          <ThemedText style={styles.infoText}>
            FitPass uses dynamic pricing to optimize fill rates. You set a <ThemedText style={styles.highlight}>rate floor</ThemedText> - the minimum payout you'll accept per booking.
          </ThemedText>
          <ThemedText style={styles.infoText}>
            The platform adjusts credit costs based on demand, but <ThemedText style={styles.highlight}>always ensures your payout meets or exceeds your floor</ThemedText>.
          </ThemedText>
          <View style={styles.exampleBox}>
            <ThemedText style={styles.exampleTitle}>Example:</ThemedText>
            <ThemedText style={styles.exampleText}>Drop-in price: KES 2,500</ThemedText>
            <ThemedText style={styles.exampleText}>Your floor (50%): KES 1,250</ThemedText>
            <ThemedText style={styles.exampleText}>• Off-peak class → 4 credits (KES 800 value)</ThemedText>
            <ThemedText style={styles.exampleText}>  Platform adjusts to ensure KES 1,250 payout</ThemedText>
            <ThemedText style={styles.exampleText}>• Peak HIIT → 9 credits (KES 1,800 value)</ThemedText>
            <ThemedText style={styles.exampleText}>  You earn above your floor ✓</ThemedText>
          </View>
        </View>

        {/* Pricing Form */}
        <View style={styles.formCard}>
          <ThemedText style={styles.sectionTitle}>Set Your Pricing</ThemedText>

          {/* Drop-in Price */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Drop-in Price (KES) <ThemedText style={styles.required}>*</ThemedText>
            </ThemedText>
            <View style={styles.inputContainer}>
              <ThemedText style={styles.currencySymbol}>KES</ThemedText>
              <TextInput
                style={styles.input}
                value={dropInPrice}
                onChangeText={setDropInPrice}
                placeholder="2500"
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
                editable={!saving}
              />
            </View>
            <ThemedText style={styles.helperText}>
              Your regular walk-in price per class
            </ThemedText>
          </View>

          {/* Rate Floor - Percentage Input */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Rate Floor Percentage <ThemedText style={styles.required}>*</ThemedText>
            </ThemedText>
            <View style={styles.sliderContainer}>
              <TextInput
                style={styles.percentageInput}
                value={proposedPercentage}
                onChangeText={(text) => {
                  setProposedPercentage(text);
                  calculateFloorFromPercentage(text);
                }}
                placeholder="50"
                placeholderTextColor="#999"
                keyboardType="number-pad"
                maxLength={3}
                editable={!saving}
              />
              <ThemedText style={styles.percentSymbol}>%</ThemedText>
            </View>
            <View style={styles.percentageGuide}>
              <ThemedText style={styles.guideText}>Typical: 40-60%</ThemedText>
              <ThemedText style={styles.guideText}>Recommended: 50%</ThemedText>
            </View>
          </View>

          {/* Rate Floor - Amount */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Minimum Payout per Booking <ThemedText style={styles.required}>*</ThemedText>
            </ThemedText>
            <View style={styles.inputContainer}>
              <ThemedText style={styles.currencySymbol}>KES</ThemedText>
              <TextInput
                style={styles.input}
                value={proposedFloor}
                onChangeText={(text) => {
                  setProposedFloor(text);
                  calculatePercentageFromFloor(text);
                }}
                placeholder="1250"
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
                editable={!saving}
              />
            </View>
            <ThemedText style={styles.helperText}>
              You will never earn less than this amount per booking
            </ThemedText>
          </View>

          {/* Max Platform Spots */}
          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>
              Max Spots Available on Platform
            </ThemedText>
            <TextInput
              style={styles.spotInput}
              value={maxPlatformSpots}
              onChangeText={setMaxPlatformSpots}
              placeholder="5"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              editable={!saving}
            />
            <ThemedText style={styles.helperText}>
              Keep direct bookings protected. Typical: 3-8 spots per class
            </ThemedText>
          </View>

          {/* Calculation Summary */}
          {dropInPrice && proposedFloor && (
            <View style={styles.summaryCard}>
              <ThemedText style={styles.summaryTitle}>Your Proposal:</ThemedText>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Drop-in Price:</ThemedText>
                <ThemedText style={styles.summaryValue}>KES {dropInPrice}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Rate Floor ({proposedPercentage}%):</ThemedText>
                <ThemedText style={[styles.summaryValue, styles.highlight]}>
                  KES {proposedFloor}
                </ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Max Platform Spots:</ThemedText>
                <ThemedText style={styles.summaryValue}>{maxPlatformSpots} per class</ThemedText>
              </View>
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, saving && { opacity: 0.6 }]}
            onPress={handleSubmitNegotiation}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.submitButtonText}>
                Submit Pricing Proposal
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>

        {/* Negotiation History */}
        {negotiations.length > 0 && (
          <View style={styles.historyCard}>
            <ThemedText style={styles.sectionTitle}>Negotiation History</ThemedText>
            
            {negotiations.map((negotiation) => (
              <View key={negotiation.id} style={styles.negotiationItem}>
                <View style={styles.negotiationHeader}>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: `${getStatusColor(negotiation.status)}20` }
                  ]}>
                    <Ionicons 
                      name={getStatusIcon(negotiation.status) as any} 
                      size={16} 
                      color={getStatusColor(negotiation.status)} 
                    />
                    <ThemedText style={[
                      styles.statusText,
                      { color: getStatusColor(negotiation.status) }
                    ]}>
                      {negotiation.status.replace('_', ' ').toUpperCase()}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.negotiationDate}>
                    {new Date(negotiation.submitted_at).toLocaleDateString()}
                  </ThemedText>
                </View>

                <View style={styles.negotiationDetails}>
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>Proposed Floor:</ThemedText>
                    <ThemedText style={styles.detailValue}>
                      KES {negotiation.proposed_floor} ({negotiation.proposed_percentage}%)
                    </ThemedText>
                  </View>

                  {negotiation.platform_counter_offer && (
                    <View style={styles.detailRow}>
                      <ThemedText style={styles.detailLabel}>Counter Offer:</ThemedText>
                      <ThemedText style={[styles.detailValue, { color: '#002fff' }]}>
                        KES {negotiation.platform_counter_offer}
                      </ThemedText>
                    </View>
                  )}

                  {negotiation.notes && (
                    <View style={styles.notesContainer}>
                      <ThemedText style={styles.notesLabel}>Notes:</ThemedText>
                      <ThemedText style={styles.notesText}>{negotiation.notes}</ThemedText>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Benefits Card */}
        <View style={styles.benefitsCard}>
          <ThemedText style={styles.benefitsTitle}>Why This Works</ThemedText>
          
          <View style={styles.benefitItem}>
            <Ionicons name="checkmark-circle" size={24} color="#00c853" />
            <View style={styles.benefitContent}>
              <ThemedText style={styles.benefitTitle}>Guaranteed Minimum</ThemedText>
              <ThemedText style={styles.benefitText}>
                Never earn below your floor, regardless of credit fluctuations
              </ThemedText>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <Ionicons name="trending-up" size={24} color="#002fff" />
            <View style={styles.benefitContent}>
              <ThemedText style={styles.benefitTitle}>Dynamic Upside</ThemedText>
              <ThemedText style={styles.benefitText}>
                Earn more during peak times and high demand
              </ThemedText>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <Ionicons name="shield-checkmark" size={24} color="#ff9500" />
            <View style={styles.benefitContent}>
              <ThemedText style={styles.benefitTitle}>Protected Capacity</ThemedText>
              <ThemedText style={styles.benefitText}>
                Direct bookings unaffected - only sell unused capacity
              </ThemedText>
            </View>
          </View>
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
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#002fff',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 12,
  },
  highlight: {
    fontWeight: '700',
    color: '#002fff',
  },
  exampleBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  exampleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
    marginBottom: 4,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 20,
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    paddingLeft: 16,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#000',
  },
  spotInput: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    width: 100,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  percentageInput: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    width: 100,
    textAlign: 'center',
  },
  percentSymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#002fff',
  },
  percentageGuide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  guideText: {
    fontSize: 12,
    color: '#999',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  summaryCard: {
    backgroundColor: '#f0f5ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#d0e0ff',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  submitButton: {
    backgroundColor: '#002fff',
    paddingVertical: 18,
    borderRadius: 25,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  negotiationItem: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  negotiationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  negotiationDate: {
    fontSize: 12,
    color: '#666',
  },
  negotiationDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  notesContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: '#000',
    lineHeight: 18,
  },
  benefitsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  benefitsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  benefitText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
});