import { useRouter } from 'expo-router';
import { 
  StyleSheet, 
  TouchableOpacity, 
  View, 
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
  Switch
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface PayoutInfo {
  id: string;
  partner_id: string;
  payment_method: 'mpesa' | 'bank_transfer' | 'airtel_money' | null;
  
  // M-Pesa
  mpesa_phone: string | null;
  mpesa_name: string | null;
  
  // Airtel Money
  airtel_phone: string | null;
  airtel_name: string | null;
  
  // Bank
  bank_name: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  branch_name: string | null;
  branch_code: string | null;
  
  // Settings
  minimum_payout: number;
  auto_payout: boolean;
  payout_schedule: 'weekly' | 'biweekly' | 'monthly' | null;
  
  // Tax
  kra_pin: string | null;
  
  created_at: string;
  updated_at: string;
}

const PAYMENT_METHODS = [
  { value: 'mpesa', label: 'M-Pesa', icon: 'phone-portrait-outline', color: '#00A86B' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: 'business-outline', color: '#002fff' },
  { value: 'airtel_money', label: 'Airtel Money', icon: 'phone-portrait-outline', color: '#FF0000' },
];

const KENYAN_BANKS = [
  'KCB Bank',
  'Equity Bank',
  'Cooperative Bank',
  'NCBA Bank',
  'Standard Chartered',
  'Barclays Bank',
  'Stanbic Bank',
  'I&M Bank',
  'Diamond Trust Bank',
  'Family Bank',
  'Sidian Bank',
  'ABC Bank',
  'Bank of Africa',
  'Prime Bank',
  'Gulf African Bank',
  'Other',
];

const PAYOUT_SCHEDULES = [
  { value: 'weekly', label: 'Weekly', description: 'Every Monday' },
  { value: 'biweekly', label: 'Bi-weekly', description: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly', description: '1st of month' },
];

export default function PayoutInformationScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payoutInfo, setPayoutInfo] = useState<PayoutInfo | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showBankPicker, setShowBankPicker] = useState(false);
  
  // Edit form
  const [editForm, setEditForm] = useState({
    payment_method: 'mpesa' as 'mpesa' | 'bank_transfer' | 'airtel_money',
    mpesa_phone: '',
    mpesa_name: '',
    airtel_phone: '',
    airtel_name: '',
    bank_name: '',
    account_holder_name: '',
    account_number: '',
    branch_name: '',
    branch_code: '',
    minimum_payout: 500,
    auto_payout: true,
    payout_schedule: 'monthly' as 'weekly' | 'biweekly' | 'monthly',
    kra_pin: '',
  });

  // Stats
  const [stats, setStats] = useState({
    pending_balance: 0,
    available_balance: 0,
    total_payouts: 0,
    next_payout_date: '',
  });

  useEffect(() => {
    loadPayoutInfo();
  }, []);

  const loadPayoutInfo = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/partner-login');
        return;
      }

      // Get partner
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) return;

      // Get payout info
      const { data: payoutData, error } = await supabase
        .from('payout_information')
        .select('*')
        .eq('partner_id', partner.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (payoutData) {
        setPayoutInfo(payoutData);
        setEditForm({
          payment_method: payoutData.payment_method || 'mpesa',
          mpesa_phone: payoutData.mpesa_phone || '',
          mpesa_name: payoutData.mpesa_name || '',
          airtel_phone: payoutData.airtel_phone || '',
          airtel_name: payoutData.airtel_name || '',
          bank_name: payoutData.bank_name || '',
          account_holder_name: payoutData.account_holder_name || '',
          account_number: payoutData.account_number || '',
          branch_name: payoutData.branch_name || '',
          branch_code: payoutData.branch_code || '',
          minimum_payout: payoutData.minimum_payout || 500,
          auto_payout: payoutData.auto_payout ?? true,
          payout_schedule: payoutData.payout_schedule || 'monthly',
          kra_pin: payoutData.kra_pin || '',
        });
      } else {
        setEditMode(true);
      }

      // Get payout stats (placeholder)
      setStats({
        pending_balance: 0,
        available_balance: 0,
        total_payouts: 0,
        next_payout_date: 'Not scheduled',
      });

    } catch (error: any) {
      console.error('Load payout info error:', error);
      Alert.alert('Error', 'Failed to load payout information');
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneNumber = (phone: string) => {
    // Remove any non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Format: 0712 345 678 or +254 712 345 678
    if (digits.startsWith('254')) {
      return `+254 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
    } else if (digits.startsWith('0')) {
      return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    }
    return phone;
  };

  const validatePhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 10 && digits.startsWith('0') || 
           digits.length === 12 && digits.startsWith('254');
  };

  const handleSave = async () => {
    // Validation
    if (editForm.payment_method === 'mpesa') {
      if (!editForm.mpesa_phone.trim() || !editForm.mpesa_name.trim()) {
        Alert.alert('Error', 'Please enter M-Pesa phone number and name');
        return;
      }
      if (!validatePhoneNumber(editForm.mpesa_phone)) {
        Alert.alert('Error', 'Please enter a valid M-Pesa phone number (e.g., 0712345678)');
        return;
      }
    } else if (editForm.payment_method === 'airtel_money') {
      if (!editForm.airtel_phone.trim() || !editForm.airtel_name.trim()) {
        Alert.alert('Error', 'Please enter Airtel Money phone number and name');
        return;
      }
      if (!validatePhoneNumber(editForm.airtel_phone)) {
        Alert.alert('Error', 'Please enter a valid Airtel phone number (e.g., 0712345678)');
        return;
      }
    } else if (editForm.payment_method === 'bank_transfer') {
      if (!editForm.bank_name.trim() || !editForm.account_holder_name.trim() || !editForm.account_number.trim()) {
        Alert.alert('Error', 'Please fill in all required bank details');
        return;
      }
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!partner) return;

      const payoutData = {
        partner_id: partner.id,
        payment_method: editForm.payment_method,
        mpesa_phone: editForm.mpesa_phone.trim() || null,
        mpesa_name: editForm.mpesa_name.trim() || null,
        airtel_phone: editForm.airtel_phone.trim() || null,
        airtel_name: editForm.airtel_name.trim() || null,
        bank_name: editForm.bank_name.trim() || null,
        account_holder_name: editForm.account_holder_name.trim() || null,
        account_number: editForm.account_number.trim() || null,
        branch_name: editForm.branch_name.trim() || null,
        branch_code: editForm.branch_code.trim() || null,
        minimum_payout: editForm.minimum_payout,
        auto_payout: editForm.auto_payout,
        payout_schedule: editForm.payout_schedule,
        kra_pin: editForm.kra_pin.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (payoutInfo) {
        const { error } = await supabase
          .from('payout_information')
          .update(payoutData)
          .eq('id', payoutInfo.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('payout_information')
          .insert([{ ...payoutData, created_at: new Date().toISOString() }]);

        if (error) throw error;
      }

      Alert.alert('Success', 'Payout information saved successfully');
      setEditMode(false);
      loadPayoutInfo();

    } catch (error: any) {
      console.error('Save payout info error:', error);
      Alert.alert('Error', error.message || 'Failed to save payout information');
    } finally {
      setSaving(false);
    }
  };

  const maskPhoneNumber = (phone: string) => {
    if (!phone) return '';
    const formatted = formatPhoneNumber(phone);
    const parts = formatted.split(' ');
    if (parts.length >= 3) {
      return `${parts[0]} *** *** ${parts[parts.length - 1]}`;
    }
    return phone;
  };

  const maskAccountNumber = (accountNumber: string) => {
    if (!accountNumber) return '';
    const visible = accountNumber.slice(-4);
    return `****${visible}`;
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
        <ThemedText style={styles.headerTitle}>Payout Information</ThemedText>
        {!editMode && payoutInfo && (
          <TouchableOpacity onPress={() => setEditMode(true)}>
            <Ionicons name="create-outline" size={24} color="#002fff" />
          </TouchableOpacity>
        )}
        {!payoutInfo && <View style={styles.placeholder} />}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <ThemedText style={styles.balanceTitle}>Your Balance</ThemedText>
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <ThemedText style={styles.balanceLabel}>Available</ThemedText>
              <ThemedText style={styles.balanceValue}>
                KES {stats.available_balance.toLocaleString()}
              </ThemedText>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceItem}>
              <ThemedText style={styles.balanceLabel}>Pending</ThemedText>
              <ThemedText style={[styles.balanceValue, { color: '#ff9500' }]}>
                KES {stats.pending_balance.toLocaleString()}
              </ThemedText>
            </View>
          </View>
          {stats.next_payout_date && (
            <View style={styles.nextPayoutInfo}>
              <Ionicons name="calendar-outline" size={16} color="#666" />
              <ThemedText style={styles.nextPayoutText}>
                Next payout: {stats.next_payout_date}
              </ThemedText>
            </View>
          )}
        </View>

        {editMode ? (
          /* EDIT MODE */
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Payout Details</ThemedText>

            {/* Payment Method Selection */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Payment Method *</ThemedText>
              <View style={styles.methodGrid}>
                {PAYMENT_METHODS.map((method) => (
                  <TouchableOpacity
                    key={method.value}
                    style={[
                      styles.methodButton,
                      editForm.payment_method === method.value && styles.methodButtonActive,
                      editForm.payment_method === method.value && { borderColor: method.color }
                    ]}
                    onPress={() => setEditForm({ ...editForm, payment_method: method.value as any })}
                  >
                    <Ionicons 
                      name={method.icon as any} 
                      size={24} 
                      color={editForm.payment_method === method.value ? method.color : '#666'} 
                    />
                    <ThemedText style={[
                      styles.methodLabel,
                      editForm.payment_method === method.value && { color: method.color }
                    ]}>
                      {method.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* M-Pesa Fields */}
            {editForm.payment_method === 'mpesa' && (
              <>
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>M-Pesa Phone Number *</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={editForm.mpesa_phone}
                    onChangeText={(text) => setEditForm({ ...editForm, mpesa_phone: text })}
                    placeholder="0712 345 678"
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                  />
                  <ThemedText style={styles.inputHint}>
                    Enter the M-Pesa number registered for receiving payments
                  </ThemedText>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>M-Pesa Account Name *</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={editForm.mpesa_name}
                    onChangeText={(text) => setEditForm({ ...editForm, mpesa_name: text })}
                    placeholder="Full name as registered with Safaricom"
                    placeholderTextColor="#999"
                  />
                </View>
              </>
            )}

            {/* Airtel Money Fields */}
            {editForm.payment_method === 'airtel_money' && (
              <>
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Airtel Money Phone Number *</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={editForm.airtel_phone}
                    onChangeText={(text) => setEditForm({ ...editForm, airtel_phone: text })}
                    placeholder="0733 456 789"
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                  />
                  <ThemedText style={styles.inputHint}>
                    Enter the Airtel Money number for receiving payments
                  </ThemedText>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Airtel Account Name *</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={editForm.airtel_name}
                    onChangeText={(text) => setEditForm({ ...editForm, airtel_name: text })}
                    placeholder="Full name as registered with Airtel"
                    placeholderTextColor="#999"
                  />
                </View>
              </>
            )}

            {/* Bank Transfer Fields */}
            {editForm.payment_method === 'bank_transfer' && (
              <>
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Bank Name *</ThemedText>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowBankPicker(!showBankPicker)}
                  >
                    <ThemedText style={styles.pickerText}>
                      {editForm.bank_name || 'Select your bank'}
                    </ThemedText>
                    <Ionicons name="chevron-down" size={20} color="#666" />
                  </TouchableOpacity>
                  
                  {showBankPicker && (
                    <View style={styles.pickerList}>
                      <ScrollView style={styles.pickerScroll}>
                        {KENYAN_BANKS.map((bank) => (
                          <TouchableOpacity
                            key={bank}
                            style={styles.pickerItem}
                            onPress={() => {
                              setEditForm({ ...editForm, bank_name: bank });
                              setShowBankPicker(false);
                            }}
                          >
                            <ThemedText style={styles.pickerItemText}>{bank}</ThemedText>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Account Holder Name *</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={editForm.account_holder_name}
                    onChangeText={(text) => setEditForm({ ...editForm, account_holder_name: text })}
                    placeholder="Full name on account"
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Account Number *</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={editForm.account_number}
                    onChangeText={(text) => setEditForm({ ...editForm, account_number: text })}
                    placeholder="Account number"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                    secureTextEntry
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Branch Name</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={editForm.branch_name}
                    onChangeText={(text) => setEditForm({ ...editForm, branch_name: text })}
                    placeholder="e.g., Westlands Branch"
                    placeholderTextColor="#999"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Branch Code</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={editForm.branch_code}
                    onChangeText={(text) => setEditForm({ ...editForm, branch_code: text })}
                    placeholder="Branch code"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                  />
                </View>
              </>
            )}

            {/* KRA PIN */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>KRA PIN (Optional)</ThemedText>
              <TextInput
                style={styles.input}
                value={editForm.kra_pin}
                onChangeText={(text) => setEditForm({ ...editForm, kra_pin: text.toUpperCase() })}
                placeholder="A000000000A"
                placeholderTextColor="#999"
                autoCapitalize="characters"
              />
              <ThemedText style={styles.inputHint}>
                For tax reporting purposes
              </ThemedText>
            </View>

            {/* Payout Settings */}
            <View style={styles.divider} />
            <ThemedText style={styles.sectionTitle}>Payout Settings</ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Minimum Payout Amount</ThemedText>
              <View style={styles.currencyInput}>
                <ThemedText style={styles.currencySymbol}>KES</ThemedText>
                <TextInput
                  style={styles.currencyField}
                  value={editForm.minimum_payout.toString()}
                  onChangeText={(text) => setEditForm({ ...editForm, minimum_payout: parseInt(text) || 0 })}
                  placeholder="500"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                />
              </View>
              <ThemedText style={styles.inputHint}>
                Minimum amount before automatic payout
              </ThemedText>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Payout Schedule</ThemedText>
              <View style={styles.scheduleGrid}>
                {PAYOUT_SCHEDULES.map((schedule) => (
                  <TouchableOpacity
                    key={schedule.value}
                    style={[
                      styles.scheduleButton,
                      editForm.payout_schedule === schedule.value && styles.scheduleButtonActive
                    ]}
                    onPress={() => setEditForm({ ...editForm, payout_schedule: schedule.value as any })}
                  >
                    <ThemedText style={[
                      styles.scheduleLabel,
                      editForm.payout_schedule === schedule.value && styles.scheduleLabelActive
                    ]}>
                      {schedule.label}
                    </ThemedText>
                    <ThemedText style={styles.scheduleDescription}>
                      {schedule.description}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <ThemedText style={styles.toggleLabel}>Automatic Payouts</ThemedText>
                <ThemedText style={styles.toggleDescription}>
                  Automatically send funds on schedule when minimum is reached
                </ThemedText>
              </View>
              <Switch
                value={editForm.auto_payout}
                onValueChange={(value) => setEditForm({ ...editForm, auto_payout: value })}
                trackColor={{ false: '#e0e0e0', true: '#00A86B' }}
                thumbColor="#fff"
              />
            </View>

            {/* Save Buttons */}
            <View style={styles.editActions}>
              {payoutInfo && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditMode(false);
                    loadPayoutInfo();
                  }}
                >
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveButton, saving && { opacity: 0.6 }, !payoutInfo && { flex: 1 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ThemedText style={styles.saveButtonText}>
                    {payoutInfo ? 'Save Changes' : 'Add Payout Information'}
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* VIEW MODE */
          payoutInfo && (
            <View style={styles.section}>
              <ThemedText style={styles.sectionTitle}>Payout Details</ThemedText>

              <View style={styles.infoList}>
                <View style={styles.infoItem}>
                  <Ionicons name="card-outline" size={20} color="#666" />
                  <View style={styles.infoContent}>
                    <ThemedText style={styles.infoLabel}>Payment Method</ThemedText>
                    <ThemedText style={styles.infoValue}>
                      {PAYMENT_METHODS.find(m => m.value === payoutInfo.payment_method)?.label || 'Not set'}
                    </ThemedText>
                  </View>
                </View>

                {payoutInfo.payment_method === 'mpesa' && (
                  <>
                    {payoutInfo.mpesa_phone && (
                      <View style={styles.infoItem}>
                        <Ionicons name="phone-portrait-outline" size={20} color="#00A86B" />
                        <View style={styles.infoContent}>
                          <ThemedText style={styles.infoLabel}>M-Pesa Number</ThemedText>
                          <ThemedText style={styles.infoValue}>
                            {maskPhoneNumber(payoutInfo.mpesa_phone)}
                          </ThemedText>
                        </View>
                      </View>
                    )}
                    {payoutInfo.mpesa_name && (
                      <View style={styles.infoItem}>
                        <Ionicons name="person-outline" size={20} color="#666" />
                        <View style={styles.infoContent}>
                          <ThemedText style={styles.infoLabel}>Account Name</ThemedText>
                          <ThemedText style={styles.infoValue}>{payoutInfo.mpesa_name}</ThemedText>
                        </View>
                      </View>
                    )}
                  </>
                )}

                {payoutInfo.payment_method === 'airtel_money' && (
                  <>
                    {payoutInfo.airtel_phone && (
                      <View style={styles.infoItem}>
                        <Ionicons name="phone-portrait-outline" size={20} color="#FF0000" />
                        <View style={styles.infoContent}>
                          <ThemedText style={styles.infoLabel}>Airtel Number</ThemedText>
                          <ThemedText style={styles.infoValue}>
                            {maskPhoneNumber(payoutInfo.airtel_phone)}
                          </ThemedText>
                        </View>
                      </View>
                    )}
                    {payoutInfo.airtel_name && (
                      <View style={styles.infoItem}>
                        <Ionicons name="person-outline" size={20} color="#666" />
                        <View style={styles.infoContent}>
                          <ThemedText style={styles.infoLabel}>Account Name</ThemedText>
                          <ThemedText style={styles.infoValue}>{payoutInfo.airtel_name}</ThemedText>
                        </View>
                      </View>
                    )}
                  </>
                )}

                {payoutInfo.payment_method === 'bank_transfer' && (
                  <>
                    {payoutInfo.bank_name && (
                      <View style={styles.infoItem}>
                        <Ionicons name="business-outline" size={20} color="#666" />
                        <View style={styles.infoContent}>
                          <ThemedText style={styles.infoLabel}>Bank Name</ThemedText>
                          <ThemedText style={styles.infoValue}>{payoutInfo.bank_name}</ThemedText>
                        </View>
                      </View>
                    )}
                    {payoutInfo.account_holder_name && (
                      <View style={styles.infoItem}>
                        <Ionicons name="person-outline" size={20} color="#666" />
                        <View style={styles.infoContent}>
                          <ThemedText style={styles.infoLabel}>Account Holder</ThemedText>
                          <ThemedText style={styles.infoValue}>{payoutInfo.account_holder_name}</ThemedText>
                        </View>
                      </View>
                    )}
                    {payoutInfo.account_number && (
                      <View style={styles.infoItem}>
                        <Ionicons name="keypad-outline" size={20} color="#666" />
                        <View style={styles.infoContent}>
                          <ThemedText style={styles.infoLabel}>Account Number</ThemedText>
                          <ThemedText style={styles.infoValue}>
                            {maskAccountNumber(payoutInfo.account_number)}
                          </ThemedText>
                        </View>
                      </View>
                    )}
                    {payoutInfo.branch_name && (
                      <View style={styles.infoItem}>
                        <Ionicons name="location-outline" size={20} color="#666" />
                        <View style={styles.infoContent}>
                          <ThemedText style={styles.infoLabel}>Branch</ThemedText>
                          <ThemedText style={styles.infoValue}>{payoutInfo.branch_name}</ThemedText>
                        </View>
                      </View>
                    )}
                  </>
                )}

                <View style={styles.divider} />

                <View style={styles.infoItem}>
                  <Ionicons name="cash-outline" size={20} color="#666" />
                  <View style={styles.infoContent}>
                    <ThemedText style={styles.infoLabel}>Minimum Payout</ThemedText>
                    <ThemedText style={styles.infoValue}>
                      KES {payoutInfo.minimum_payout.toLocaleString()}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.infoItem}>
                  <Ionicons name="calendar-outline" size={20} color="#666" />
                  <View style={styles.infoContent}>
                    <ThemedText style={styles.infoLabel}>Payout Schedule</ThemedText>
                    <ThemedText style={styles.infoValue}>
                      {PAYOUT_SCHEDULES.find(s => s.value === payoutInfo.payout_schedule)?.label || 'Not set'}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.infoItem}>
                  <Ionicons name="sync-outline" size={20} color="#666" />
                  <View style={styles.infoContent}>
                    <ThemedText style={styles.infoLabel}>Automatic Payouts</ThemedText>
                    <ThemedText style={styles.infoValue}>
                      {payoutInfo.auto_payout ? 'Enabled' : 'Disabled'}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </View>
          )
        )}

        {/* Security Note */}
        {!editMode && (
          <View style={styles.securityNote}>
            <Ionicons name="shield-checkmark" size={20} color="#00c853" />
            <ThemedText style={styles.securityText}>
              Your payout information is encrypted and secure
            </ThemedText>
          </View>
        )}
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
  balanceCard: {
    backgroundColor: '#fff',
    padding: 24,
    marginBottom: 12,
  },
  balanceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceItem: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#00c853',
  },
  balanceDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 20,
  },
  nextPayoutInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f5ff',
    padding: 12,
    borderRadius: 8,
  },
  nextPayoutText: {
    fontSize: 13,
    color: '#002fff',
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
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
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#000',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  methodGrid: {
    gap: 12,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  methodButtonActive: {
    backgroundColor: '#f0f5ff',
  },
  methodLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  pickerText: {
    fontSize: 16,
    color: '#000',
  },
  pickerList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 8,
    maxHeight: 200,
  },
  pickerScroll: {
    maxHeight: 200,
  },
  pickerItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pickerItemText: {
    fontSize: 15,
    color: '#000',
  },
  currencyInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingLeft: 16,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  currencyField: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: '#000',
  },
  scheduleGrid: {
    gap: 12,
  },
  scheduleButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  scheduleButtonActive: {
    borderColor: '#002fff',
    backgroundColor: '#f0f5ff',
  },
  scheduleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#666',
    marginBottom: 4,
  },
  scheduleLabelActive: {
    color: '#002fff',
  },
  scheduleDescription: {
    fontSize: 12,
    color: '#999',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 13,
    color: '#666',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 16,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
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
    backgroundColor: '#000000',
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
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
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e8f5e9',
    padding: 16,
    marginTop: 12,
    marginHorizontal: 20,
    borderRadius: 12,
  },
  securityText: {
    flex: 1,
    fontSize: 13,
    color: '#00c853',
    fontWeight: '600',
  },
});