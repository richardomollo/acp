import { StyleSheet, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState, useEffect } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SupportOpportunity } from '@/lib/ai-assessment';
import { matchProfessionalProviders, type ProviderMatch } from '@/lib/professional-support';
import type { PrimaryGoal, PreferredActivity } from '@/lib/onboarding';

const todayIso = () => new Date().toISOString().slice(0, 10);

const fmtDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

interface OptionalField {
  key: string;
  label: string;
  unit: string | null;
  value: string;
  setValue: (v: string) => void;
}

export default function LogProgressScreen() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [measurementDate, setMeasurementDate] = useState(todayIso());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentWeight, setCurrentWeight] = useState('');
  // Personalizes the "professional assessment" CTA using ACP's own
  // already-computed support_opportunities (deterministic, from onboarding/
  // weekly-adaptation — never a new AI call here). Falls back to the
  // generic static copy when there's no current assessment yet or no
  // trainer-relevant opportunity in it.
  const [trainerSupport, setTrainerSupport] = useState<SupportOpportunity | null>(null);
  const [goal, setGoal] = useState<PrimaryGoal | null>(null);
  const [preferredActivities, setPreferredActivities] = useState<PreferredActivity[]>([]);
  // Explore support expands inline to show matched trainers — same
  // explicit-tap-only pattern as My Plan's support section, never
  // preloaded/fetched until the user actually asks.
  const [supportExpanded, setSupportExpanded] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportMatches, setSupportMatches] = useState<ProviderMatch[] | null>(null);

  useEffect(() => {
    (async () => {
      const session = await authService.getSession();
      if (!session?.user) return;
      const { data } = await supabase
        .from('fitness_profile')
        .select('ai_assessment, goal, preferred_activities')
        .eq('user_id', session.user.id)
        .maybeSingle();
      setGoal((data?.goal as PrimaryGoal) ?? null);
      setPreferredActivities((data?.preferred_activities as PreferredActivity[]) ?? []);
      const opportunities = (data?.ai_assessment as { support_opportunities?: SupportOpportunity[] } | null)?.support_opportunities;
      const pt = opportunities?.find(o => o.type === 'personal_trainer' && (o.relevance === 'high' || o.relevance === 'medium'));
      if (pt) setTrainerSupport(pt);
    })();
  }, []);

  const handleExploreSupport = async () => {
    setSupportExpanded(true);
    if (supportMatches !== null || supportLoading) return;
    setSupportLoading(true);
    try {
      const { data } = await supabase
        .from('personal_trainers')
        .select('id, full_name, professional_name, specialisations, photo_url')
        .eq('status', 'approved');
      const providers = ((data ?? []) as any[]).map(p => ({
        id: p.id, name: p.professional_name || p.full_name, specialisations: p.specialisations ?? [], photoUrl: p.photo_url ?? null,
      }));
      setSupportMatches(matchProfessionalProviders(goal, preferredActivities, false, providers));
    } catch {
      setSupportMatches([]); // fails safe — the rest of the screen is unaffected
    } finally {
      setSupportLoading(false);
    }
  };

  const [bodyFatPct, setBodyFatPct] = useState('');
  const [muscleMass, setMuscleMass] = useState('');
  const [visceralFat, setVisceralFat] = useState('');
  const [waist, setWaist] = useState('');
  const [fatMass, setFatMass] = useState('');
  const [bodyWater, setBodyWater] = useState('');
  const [neck, setNeck] = useState('');
  const [hip, setHip] = useState('');
  const [leg, setLeg] = useState('');

  // Section 5's core/secondary split, reflected in the UI grouping only
  // (validation/persistence below is unchanged for every field): body fat,
  // muscle mass and waist are the outcomes ACP Intelligence™ can actually
  // use as adaptation-relevant evidence; the rest stay available for
  // history/display but are grouped separately so the weekly check-in
  // doesn't read like a full medical intake by default.
  const coreOptionalFields: OptionalField[] = [
    { key: 'bodyFatPct', label: 'Body Fat', unit: '%', value: bodyFatPct, setValue: setBodyFatPct },
    { key: 'muscleMass', label: 'Muscle Mass', unit: 'kg', value: muscleMass, setValue: setMuscleMass },
    { key: 'waist', label: 'Waist', unit: 'cm', value: waist, setValue: setWaist },
  ];
  const moreOptionalFields: OptionalField[] = [
    { key: 'visceralFat', label: 'Visceral Fat', unit: null, value: visceralFat, setValue: setVisceralFat },
    { key: 'fatMass', label: 'Fat Mass', unit: 'kg', value: fatMass, setValue: setFatMass },
    { key: 'bodyWater', label: 'Body Water', unit: 'L', value: bodyWater, setValue: setBodyWater },
    { key: 'neck', label: 'Neck Circumference', unit: 'cm', value: neck, setValue: setNeck },
    { key: 'hip', label: 'Hip Circumference', unit: 'cm', value: hip, setValue: setHip },
    { key: 'leg', label: 'Leg Circumference', unit: 'cm', value: leg, setValue: setLeg },
  ];
  const optionalFields = [...coreOptionalFields, ...moreOptionalFields];

  const handleSave = async () => {
    const session = await authService.getSession();
    if (!session?.user) return;
    const userId = session.user.id;

    const parsedWeight = currentWeight.trim() ? Number(currentWeight) : null;
    if (parsedWeight == null) {
      Alert.alert('Error', 'Please enter your current weight.');
      return;
    }

    const parsed: Record<string, number | null> = {};
    for (const f of optionalFields) parsed[f.key] = f.value.trim() ? Number(f.value) : null;

    const allValues = [parsedWeight, ...Object.values(parsed)];
    if (allValues.some(v => v != null && (isNaN(v) || v < 0))) {
      Alert.alert('Error', 'Please enter valid positive numbers.');
      return;
    }

    try {
      setSaving(true);
      const [{ error: logError }, { error: fpError }] = await Promise.all([
        supabase.from('client_measurements').insert({
          user_id: userId,
          logged_at: new Date(measurementDate + 'T12:00:00').toISOString(),
          weight_kg: parsedWeight,
          body_fat_percentage: parsed.bodyFatPct,
          muscle_mass_kg: parsed.muscleMass,
          visceral_fat: parsed.visceralFat,
          waist_cm: parsed.waist,
          fat_mass_kg: parsed.fatMass,
          body_water_l: parsed.bodyWater,
          neck_cm: parsed.neck,
          hips_cm: parsed.hip,
          leg_cm: parsed.leg,
        }),
        // Keep the Profile tab's weight-progress card in sync — it reads
        // fitness_profile.starting_weight_kg as "current weight". Leaves
        // initial_weight_kg untouched, same snapshot-once rule as
        // Personal Details and onboarding.
        supabase.from('fitness_profile').upsert({
          user_id: userId,
          starting_weight_kg: parsedWeight,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' }),
      ]);
      if (logError) throw logError;
      if (fpError) throw fpError;

      // Observation only — never claims the plan has already changed.
      // Measurements become evidence at the next weekly review, same as
      // behavioural evidence; saving one never triggers regeneration.
      Alert.alert(
        'Progress updated',
        'ACP Intelligence™ will use your measurements alongside your activity progress at your next review.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save your progress');
    } finally {
      setSaving(false);
    }
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
          <ThemedText style={s.headerTitle}>Update Progress</ThemedText>
          <ThemedText style={s.headerSub}>Your weekly check-in</ThemedText>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={s.introBody}>
          Regular check-ins help ACP Intelligence™ understand how your body is changing alongside your plan.
        </ThemedText>

        {/* Same "Want extra support?" card language ACP Intelligence™ uses
            for trainer recommendations elsewhere (My Plan/onboarding) —
            personalized from the same deterministic support_opportunities
            evidence when it exists, generic otherwise. "Explore support"
            expands inline to real matched trainers, same explicit-tap-only
            fetch as My Plan — never a link out to another page. */}
        <View style={s.supportCard}>
          <ThemedText style={s.supportCardEyebrow}>Want extra support?</ThemedText>
          <ThemedText style={s.supportRowValue}>Professional measurements</ThemedText>
          <ThemedText style={s.supportBody}>
            {trainerSupport
              ? 'A professional can take precise, consistent measurements — useful given the barriers you mentioned. ACP Intelligence™ has suggested trainers below who can help.'
              : 'Prefer a professional assessment? Book a full body assessment session instead of logging it yourself.'}
          </ThemedText>

          {!supportExpanded ? (
            <TouchableOpacity onPress={handleExploreSupport} activeOpacity={0.7}>
              <ThemedText style={s.exploreSupportBtnText}>Explore support →</ThemedText>
            </TouchableOpacity>
          ) : supportLoading ? (
            <ActivityIndicator style={{ marginTop: 12 }} color={palette.ink700} />
          ) : supportMatches && supportMatches.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              {supportMatches.map(m => (
                <TouchableOpacity key={m.id} style={s.providerRow} onPress={() => router.push(m.navigationTarget as any)} activeOpacity={0.7}>
                  {m.photoUrl ? (
                    <Image source={{ uri: m.photoUrl }} style={s.providerAvatar} contentFit="cover" />
                  ) : (
                    <View style={[s.providerAvatar, s.providerAvatarFallback]}>
                      <Ionicons name="person-outline" size={26} color={palette.gray300} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <ThemedText style={s.providerName}>{m.name}</ThemedText>
                    {m.matchReasons.length > 0 && (
                      <ThemedText style={s.providerMeta}>Good match for: {m.matchReasons.join(' · ')}</ThemedText>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={palette.gray300} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <ThemedText style={[s.supportBody, { marginTop: 8 }]}>
              No matching professionals were found right now.
            </ThemedText>
          )}
        </View>

        <ThemedText style={s.sectionLabel}>Measurement Date</ThemedText>
        <TouchableOpacity style={s.dateCard} onPress={() => setShowDatePicker(true)}>
          <ThemedText style={s.dateCardText}>{fmtDate(measurementDate)}</ThemedText>
          <Ionicons name="calendar-outline" size={20} color={palette.blue500} />
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={new Date(measurementDate + 'T00:00:00')}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            onChange={(_e, selected) => {
              setShowDatePicker(false);
              if (selected) setMeasurementDate(selected.toISOString().slice(0, 10));
            }}
          />
        )}

        <ThemedText style={s.sectionLabel}>Current</ThemedText>
        <View style={s.fieldCard}>
          <ThemedText style={s.fieldCardLabel}>Weight:</ThemedText>
          <TextInput
            style={s.fieldCardInput}
            value={currentWeight}
            onChangeText={setCurrentWeight}
            keyboardType="decimal-pad"
            textAlign="right"
            placeholder="0.0"
            placeholderTextColor={palette.gray200}
          />
          <View style={s.unitPill}>
            <ThemedText style={s.unitPillText}>kg</ThemedText>
          </View>
        </View>

        <ThemedText style={[s.sectionLabel, { marginTop: 20 }]}>Body Composition · Optional</ThemedText>
        {coreOptionalFields.map(f => (
          <View key={f.key} style={s.fieldCard}>
            <ThemedText style={s.fieldCardLabel}>{f.label}:</ThemedText>
            <TextInput
              style={s.fieldCardInput}
              value={f.value}
              onChangeText={f.setValue}
              keyboardType="decimal-pad"
              textAlign="right"
              placeholder="0.0"
              placeholderTextColor={palette.gray200}
            />
            {f.unit && (
              <View style={s.unitPill}>
                <ThemedText style={s.unitPillText}>{f.unit}</ThemedText>
              </View>
            )}
          </View>
        ))}

        <ThemedText style={[s.sectionLabel, { marginTop: 20 }]}>More Measurements</ThemedText>
        {moreOptionalFields.map(f => (
          <View key={f.key} style={s.fieldCard}>
            <ThemedText style={s.fieldCardLabel}>{f.label}:</ThemedText>
            <TextInput
              style={s.fieldCardInput}
              value={f.value}
              onChangeText={f.setValue}
              keyboardType="decimal-pad"
              textAlign="right"
              placeholder="0.0"
              placeholderTextColor={palette.gray200}
            />
            {f.unit && (
              <View style={s.unitPill}>
                <ThemedText style={s.unitPillText}>{f.unit}</ThemedText>
              </View>
            )}
          </View>
        ))}

        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          {saving
            ? <ActivityIndicator color={palette.white} />
            : <ThemedText style={s.saveBtnText}>Save Changes</ThemedText>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  topFadeBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 460 },

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

  introBody: { fontSize: fontSize.sm, color: palette.gray450, lineHeight: 20, marginBottom: 20, marginTop: 4 },

  // "Want extra support?" — same card language as My Plan's/onboarding's
  // support section (palette.surfaceMuted card, uppercase eyebrow, bold
  // row value, ink600 body, ink700 pill-style text CTA).
  supportCard: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii['2xl'],
    padding: 20, marginBottom: 20,
  },
  supportCardEyebrow: {
    fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
  },
  supportRowValue: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink700 },
  supportBody: { fontSize: fontSize.sm, color: palette.ink600, marginTop: 6, lineHeight: 20 },
  exploreSupportBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700, marginTop: 12 },
  providerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: palette.hairline,
  },
  providerName: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink700 },
  providerMeta: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450, marginTop: 2 },
  providerAvatar: { width: 64, height: 64, borderRadius: radii.lg, flexShrink: 0 },
  providerAvatarFallback: { backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },

  sectionLabel: { fontSize: fontSize.sm, fontWeight: '700', color: palette.ink900, marginBottom: 8 },

  dateCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: 16, paddingVertical: 15, marginBottom: 12,
  },
  dateCardText: { fontSize: fontSize.base, color: palette.ink900 },

  fieldCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.border,
    paddingHorizontal: 16, paddingVertical: 15, marginBottom: 12,
  },
  fieldCardLabel: { fontSize: fontSize.base, color: palette.ink900, flexShrink: 0 },
  fieldCardInput: { flex: 1, fontSize: fontSize.base, fontWeight: '600', color: palette.ink900, padding: 0 },
  unitPill: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: palette.blue25,
    alignItems: 'center', justifyContent: 'center',
  },
  unitPillText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.blue500 },

  saveBtn: {
    marginTop: 8, backgroundColor: palette.ink900, borderRadius: radii.pill,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnText: { fontSize: fontSize.base, fontWeight: '700', color: palette.white },
});
