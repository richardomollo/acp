import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useCallback } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { GOAL_OPTIONS } from '@/lib/onboarding';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
}

interface HealthGoalProfile {
  dateOfBirth: string | null;       // ISO date (yyyy-mm-dd)
  biologicalSex: string | null;
  heightCm: number | null;
  hoursWorkingPerWeek: number | null;
  hoursExercisingPerWeek: number | null;
  goal: string | null;
  initialWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  targetDate: string | null;        // ISO date (yyyy-mm-dd)
}

const EMPTY_HEALTH: HealthGoalProfile = {
  dateOfBirth: null, biologicalSex: null, heightCm: null,
  hoursWorkingPerWeek: null, hoursExercisingPerWeek: null,
  goal: null, initialWeightKg: null, currentWeightKg: null, targetWeightKg: null, targetDate: null,
};

const SEX_OPTIONS = [
  { key: 'female', label: 'Female' },
  { key: 'male', label: 'Male' },
  { key: 'other', label: 'Other' },
];

const fmtDate = (iso: string | null) => {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function PersonalDetailsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const [health, setHealth] = useState<HealthGoalProfile>(EMPTY_HEALTH);
  const [editingHealth, setEditingHealth] = useState(false);
  const [savingHealth, setSavingHealth] = useState(false);
  const [dob, setDob] = useState<string | null>(null);
  const [sex, setSex] = useState<string | null>(null);
  const [heightCm, setHeightCm] = useState('');
  const [goal, setGoal] = useState<string | null>(null);
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [hoursWorking, setHoursWorking] = useState('');
  const [hoursExercising, setHoursExercising] = useState('');
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showTargetDatePicker, setShowTargetDatePicker] = useState(false);

  const applyHealth = (h: HealthGoalProfile) => {
    setHealth(h);
    setDob(h.dateOfBirth);
    setSex(h.biologicalSex);
    setHeightCm(h.heightCm != null ? String(h.heightCm) : '');
    setGoal(h.goal);
    setCurrentWeight(h.currentWeightKg != null ? String(h.currentWeightKg) : '');
    setTargetWeight(h.targetWeightKg != null ? String(h.targetWeightKg) : '');
    setTargetDate(h.targetDate);
    setHoursWorking(h.hoursWorkingPerWeek != null ? String(h.hoursWorkingPerWeek) : '');
    setHoursExercising(h.hoursExercisingPerWeek != null ? String(h.hoursExercisingPerWeek) : '');
  };

  const load = useCallback(async () => {
    setLoading(true);
    const session = await authService.getSession();
    if (!session?.user) { setLoading(false); return; }

    const [{ data }, { data: hp }, { data: fp }] = await Promise.all([
      supabase.from('users').select('id, email, name, phone').eq('id', session.user.id).maybeSingle(),
      supabase.from('health_profile').select('date_of_birth, biological_sex, height_cm, hours_working_per_week, hours_exercising_per_week').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('fitness_profile').select('goal, initial_weight_kg, starting_weight_kg, goal_weight_kg, goal_target_date').eq('user_id', session.user.id).maybeSingle(),
    ]);

    const profile = data ?? {
      id: session.user.id,
      email: session.user.email || '',
      name: session.user.user_metadata?.full_name || 'User',
      phone: null,
    };
    setUser(profile);
    setEditName(profile.name || '');
    setEditPhone(profile.phone || '');

    applyHealth({
      dateOfBirth: hp?.date_of_birth ?? null,
      biologicalSex: hp?.biological_sex ?? null,
      heightCm: hp?.height_cm ?? null,
      hoursWorkingPerWeek: hp?.hours_working_per_week ?? null,
      hoursExercisingPerWeek: hp?.hours_exercising_per_week ?? null,
      goal: fp?.goal ?? null,
      initialWeightKg: fp?.initial_weight_kg ?? null,
      currentWeightKg: fp?.starting_weight_kg ?? null,
      targetWeightKg: fp?.goal_weight_kg ?? null,
      targetDate: fp?.goal_target_date ?? null,
    });

    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSaveHealth = async () => {
    const session = await authService.getSession();
    if (!session?.user) return;
    const userId = session.user.id;

    const parsedHeight = heightCm.trim() ? Number(heightCm) : null;
    const parsedCurrentWeight = currentWeight.trim() ? Number(currentWeight) : null;
    const parsedTargetWeight = targetWeight.trim() ? Number(targetWeight) : null;
    const parsedHoursWorking = hoursWorking.trim() ? Number(hoursWorking) : null;
    const parsedHoursExercising = hoursExercising.trim() ? Number(hoursExercising) : null;

    if ([parsedHeight, parsedCurrentWeight, parsedTargetWeight, parsedHoursWorking, parsedHoursExercising].some(v => v != null && (isNaN(v) || v < 0))) {
      Alert.alert('Error', 'Please enter valid positive numbers.');
      return;
    }
    if (goal === 'lose_weight' && parsedCurrentWeight != null && parsedTargetWeight != null && parsedTargetWeight > parsedCurrentWeight) {
      Alert.alert('Error', 'Target weight should not be greater than your current weight for a weight-loss goal.');
      return;
    }

    // Snapshot the starting point for progress tracking exactly once — the
    // first time a current weight is ever saved. Never touched again after
    // that, so "Update Progress" on the Profile tab moves starting_weight_kg
    // without dragging this reference point along with it.
    const initialWeightKg = health.initialWeightKg ?? parsedCurrentWeight;

    try {
      setSavingHealth(true);
      const [{ error: hpError }, { error: fpError }] = await Promise.all([
        supabase.from('health_profile').upsert({
          user_id: userId,
          date_of_birth: dob,
          biological_sex: sex,
          height_cm: parsedHeight,
          hours_working_per_week: parsedHoursWorking,
          hours_exercising_per_week: parsedHoursExercising,
        }, { onConflict: 'user_id' }),
        supabase.from('fitness_profile').upsert({
          user_id: userId,
          goal,
          goals: goal ? [goal] : [],
          initial_weight_kg: initialWeightKg,
          starting_weight_kg: parsedCurrentWeight,
          goal_weight_kg: parsedTargetWeight,
          goal_target_date: targetDate,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' }),
      ]);
      if (hpError) throw hpError;
      if (fpError) throw fpError;

      applyHealth({
        dateOfBirth: dob, biologicalSex: sex, heightCm: parsedHeight,
        hoursWorkingPerWeek: parsedHoursWorking, hoursExercisingPerWeek: parsedHoursExercising,
        goal, initialWeightKg, currentWeightKg: parsedCurrentWeight, targetWeightKg: parsedTargetWeight, targetDate,
      });
      setEditingHealth(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save changes');
    } finally {
      setSavingHealth(false);
    }
  };

  const handleCancelHealthEdit = () => {
    applyHealth(health);
    setEditingHealth(false);
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      setSaving(true);
      const { error } = await supabase.from('users').update({ name: editName, phone: editPhone }).eq('id', user.id);
      if (error) throw error;
      setUser(prev => prev ? { ...prev, name: editName, phone: editPhone } : prev);
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(user?.name || '');
    setEditPhone(user?.phone || '');
    setEditing(false);
  };

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={[palette.blue100, 'rgba(208,224,255,0)']}
        style={s.topFadeBg}
        pointerEvents="none"
      />

      <SafeAreaView edges={['top']} style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={palette.ink900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={s.headerTitle}>Personal Details</ThemedText>
          <ThemedText style={s.headerSub}>Your name, email and phone number</ThemedText>
        </View>
      </SafeAreaView>

      {loading ? (
        <ActivityIndicator size="large" color={palette.blue500} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.sectionHeaderRow}>
            <ThemedText style={s.sectionTitle}>Account Details</ThemedText>
            {!editing && (
              <TouchableOpacity onPress={() => setEditing(true)} hitSlop={8}>
                <ThemedText style={s.sectionEditLink}>Edit</ThemedText>
              </TouchableOpacity>
            )}
            {editing && (
              <TouchableOpacity onPress={handleCancelEdit} hitSlop={8}>
                <ThemedText style={s.sectionEditLink}>Cancel</ThemedText>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.listCard}>
            <DetailRow label="Full Name" value={editName || undefined} editing={editing}>
              <TextInput
                style={s.rowValueInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter your name"
                placeholderTextColor={palette.gray200}
                textAlign="right"
              />
            </DetailRow>

            <DetailRow label="Email" value={user?.email || undefined} editing={false} />

            <DetailRow label="Phone Number" value={editPhone || undefined} editing={editing} isLast>
              <TextInput
                style={s.rowValueInput}
                value={editPhone}
                onChangeText={setEditPhone}
                placeholder="Enter your phone number"
                placeholderTextColor={palette.gray200}
                keyboardType="phone-pad"
                textAlign="right"
              />
            </DetailRow>
          </View>
          {editing && <ThemedText style={s.fieldHelper}>Email cannot be changed</ThemedText>}

          {editing && (
            <TouchableOpacity style={s.saveAllBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color={palette.white} />
                : <ThemedText style={s.saveAllBtnText}>Save Changes</ThemedText>}
            </TouchableOpacity>
          )}

          {/* ── Health & Fitness Profile ── */}
          <View style={[s.sectionHeaderRow, { marginTop: 24 }]}>
            <ThemedText style={s.sectionTitle}>Health &amp; Fitness Profile</ThemedText>
            {!editingHealth && (
              <TouchableOpacity onPress={() => setEditingHealth(true)} hitSlop={8}>
                <ThemedText style={s.sectionEditLink}>Edit</ThemedText>
              </TouchableOpacity>
            )}
            {editingHealth && (
              <TouchableOpacity onPress={handleCancelHealthEdit} hitSlop={8}>
                <ThemedText style={s.sectionEditLink}>Cancel</ThemedText>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.listCard}>
            {/* Date of birth */}
            <DetailRow label="Date of Birth" value={dob ? fmtDate(dob) : undefined} editing={editingHealth}>
              <TouchableOpacity style={s.rowValueBtn} onPress={() => setShowDobPicker(true)}>
                <ThemedText style={dob ? s.rowValueInput : s.rowValuePlaceholder}>
                  {dob ? fmtDate(dob) : 'Select date'}
                </ThemedText>
              </TouchableOpacity>
            </DetailRow>
            {showDobPicker && (
              <DateTimePicker
                value={dob ? new Date(dob + 'T00:00:00') : new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={(_e, selected) => {
                  setShowDobPicker(false);
                  if (selected) setDob(selected.toISOString().slice(0, 10));
                }}
              />
            )}

            {/* Sex */}
            {editingHealth ? (
              <View style={s.rowDivided}>
                <ThemedText style={s.chipSectionLabel}>Sex</ThemedText>
                <View style={s.chipRow}>
                  {SEX_OPTIONS.map(opt => {
                    const active = sex === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[s.chip, active && s.chipActive]}
                        onPress={() => setSex(opt.key)}
                      >
                        <ThemedText style={[s.chipText, active && s.chipTextActive]}>{opt.label}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <DetailRow label="Sex" value={SEX_OPTIONS.find(o => o.key === sex)?.label} editing={false} />
            )}

            {/* Height */}
            <DetailRow label="Height" value={heightCm ? `${heightCm} cm` : undefined} editing={editingHealth}>
              <TextInput
                style={s.rowValueInput}
                value={heightCm}
                onChangeText={setHeightCm}
                placeholder="e.g. 175"
                placeholderTextColor={palette.gray200}
                keyboardType="decimal-pad"
                textAlign="right"
              />
            </DetailRow>

            {/* Goal */}
            {editingHealth ? (
              <View style={s.rowDivided}>
                <ThemedText style={s.chipSectionLabel}>Goal</ThemedText>
                <View style={s.chipRow}>
                  {GOAL_OPTIONS.map(opt => {
                    const active = goal === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[s.chip, active && s.chipActive]}
                        onPress={() => setGoal(opt.key)}
                      >
                        <ThemedText style={[s.chipText, active && s.chipTextActive]}>{opt.label}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <DetailRow label="Goal" value={GOAL_OPTIONS.find(o => o.key === goal)?.label} editing={false} />
            )}

            {/* Current weight */}
            <DetailRow label="Current Weight" value={currentWeight ? `${currentWeight} kg` : undefined} editing={editingHealth}>
              <TextInput
                style={s.rowValueInput}
                value={currentWeight}
                onChangeText={setCurrentWeight}
                placeholder="e.g. 80"
                placeholderTextColor={palette.gray200}
                keyboardType="decimal-pad"
                textAlign="right"
              />
            </DetailRow>

            {/* Target weight */}
            <DetailRow label="Target Weight" value={targetWeight ? `${targetWeight} kg` : undefined} editing={editingHealth}>
              <TextInput
                style={s.rowValueInput}
                value={targetWeight}
                onChangeText={setTargetWeight}
                placeholder="e.g. 72"
                placeholderTextColor={palette.gray200}
                keyboardType="decimal-pad"
                textAlign="right"
              />
            </DetailRow>

            {/* Period */}
            <DetailRow label="Period" value={targetDate ? fmtDate(targetDate) : undefined} editing={editingHealth}>
              <TouchableOpacity style={s.rowValueBtn} onPress={() => setShowTargetDatePicker(true)}>
                <ThemedText style={targetDate ? s.rowValueInput : s.rowValuePlaceholder}>
                  {targetDate ? fmtDate(targetDate) : 'Select date'}
                </ThemedText>
              </TouchableOpacity>
            </DetailRow>
            {showTargetDatePicker && (
              <DateTimePicker
                value={targetDate ? new Date(targetDate + 'T00:00:00') : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                onChange={(_e, selected) => {
                  setShowTargetDatePicker(false);
                  if (selected) setTargetDate(selected.toISOString().slice(0, 10));
                }}
              />
            )}

            {/* Activity level */}
            <DetailRow
              label="Activity Level"
              value={(hoursWorking || hoursExercising) ? `Work: ${hoursWorking || 0}h · Exercise: ${hoursExercising || 0}h` : undefined}
              editing={editingHealth}
              isLast
            >
              <View style={s.hoursGroup}>
                <View style={s.hoursField}>
                  <TextInput
                    style={s.hoursInput}
                    value={hoursWorking}
                    onChangeText={setHoursWorking}
                    placeholder="0"
                    placeholderTextColor={palette.gray200}
                    keyboardType="decimal-pad"
                    textAlign="right"
                  />
                  <ThemedText style={s.hoursSuffix}>h work</ThemedText>
                </View>
                <View style={s.hoursField}>
                  <TextInput
                    style={s.hoursInput}
                    value={hoursExercising}
                    onChangeText={setHoursExercising}
                    placeholder="0"
                    placeholderTextColor={palette.gray200}
                    keyboardType="decimal-pad"
                    textAlign="right"
                  />
                  <ThemedText style={s.hoursSuffix}>h sport</ThemedText>
                </View>
              </View>
            </DetailRow>
          </View>

          {editingHealth && (
            <TouchableOpacity style={s.saveAllBtn} onPress={handleSaveHealth} disabled={savingHealth} activeOpacity={0.85}>
              {savingHealth
                ? <ActivityIndicator color={palette.white} />
                : <ThemedText style={s.saveAllBtnText}>Save Changes</ThemedText>}
            </TouchableOpacity>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function DetailRow({ label, value, editing, children, isLast }: {
  label: string;
  value?: string;
  editing?: boolean;
  children?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View style={!isLast ? s.rowDivided : undefined}>
      <View style={s.row}>
        <ThemedText style={s.rowLabel}>{label}</ThemedText>
        {editing && children ? children : (
          <ThemedText style={value ? s.rowValueText : s.rowValuePlaceholder} numberOfLines={1}>
            {value || 'Not set'}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.surfaceApp },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 1 },

  content: { padding: 16 },

  fieldHelper: { fontSize: fontSize.xs, color: palette.gray200, marginTop: 8, marginBottom: 4 },

  // ── List-row style (Health & Fitness Profile) ──
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  sectionEditLink: { fontSize: fontSize.base, fontWeight: '600', color: palette.blue500 },

  listCard: {
    borderRadius: radii.lg, backgroundColor: palette.white, overflow: 'hidden',
  },
  rowDivided: { borderBottomWidth: 1, borderBottomColor: palette.hairline },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 15, gap: 12,
  },
  rowLabel: { fontSize: fontSize.base, color: palette.gray450, flexShrink: 0 },
  rowValueText: { fontSize: fontSize.base, fontWeight: '600', color: palette.ink900, flexShrink: 1, textAlign: 'right' },
  rowValuePlaceholder: { fontSize: fontSize.base, color: palette.gray200, flexShrink: 1, textAlign: 'right' },
  rowValueBtn: { flex: 1, alignItems: 'flex-end' },
  rowValueInput: {
    flex: 1, fontSize: fontSize.base, fontWeight: '600', color: palette.blue500, padding: 0,
  },

  hoursGroup: { flexDirection: 'row', gap: 14 },
  hoursField: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hoursInput: {
    fontSize: fontSize.base, fontWeight: '600', color: palette.blue500, padding: 0, width: 32,
  },
  hoursSuffix: { fontSize: fontSize.sm, color: palette.gray450 },

  saveAllBtn: {
    marginTop: 16, backgroundColor: palette.blue500, borderRadius: radii.pill,
    paddingVertical: 16, alignItems: 'center',
  },
  saveAllBtnText: { fontSize: fontSize.base, fontWeight: '700', color: palette.white },

  // Sex / Goal chip pickers (shown inline while editing)
  chipSectionLabel: {
    fontSize: fontSize.base, color: palette.gray450,
    paddingHorizontal: 16, paddingTop: 15, paddingBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 15 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill,
    borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.surfaceMuted,
  },
  chipActive: { borderColor: palette.blue500, backgroundColor: palette.blue25 },
  chipText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray450 },
  chipTextActive: { color: palette.blue500 },
});
