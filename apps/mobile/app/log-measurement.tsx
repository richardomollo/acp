import {
  StyleSheet, View, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter, Stack } from 'expo-router';
import { palette, radii, fontSize } from '@/constants/theme';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authService } from '@/services/auth';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LogMeasurementScreen() {
  const router = useRouter();

  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [hips, setHips] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = weight.trim().length > 0 && !isNaN(Number(weight));

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Weight required', 'Enter your current weight to log this entry.');
      return;
    }
    setSaving(true);
    const session = await authService.getSession();
    if (!session?.user.id) {
      Alert.alert('Sign in required', 'Please sign in to log your progress.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('client_measurements').insert({
      user_id: session.user.id,
      weight_kg: Number(weight),
      waist_cm: waist.trim() ? Number(waist) : null,
      chest_cm: chest.trim() ? Number(chest) : null,
      hips_cm: hips.trim() ? Number(hips) : null,
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.root}>
        <Stack.Screen options={{ headerShown: false }} />

        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>Log Measurement</ThemedText>
          <TouchableOpacity
            style={[s.saveBtn, (!canSave || saving) && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <ThemedText style={s.saveBtnText}>Save</ThemedText>
            }
          </TouchableOpacity>
        </SafeAreaView>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <ThemedText style={s.label}>Weight (kg)</ThemedText>
          <TextInput
            style={s.input}
            placeholder="e.g. 68.5"
            placeholderTextColor={palette.gray300}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />

          <ThemedText style={s.sectionLabel}>Measurements (optional)</ThemedText>

          <ThemedText style={s.label}>Waist (cm)</ThemedText>
          <TextInput
            style={s.input}
            placeholder="e.g. 80"
            placeholderTextColor={palette.gray300}
            value={waist}
            onChangeText={setWaist}
            keyboardType="decimal-pad"
          />

          <ThemedText style={s.label}>Chest (cm)</ThemedText>
          <TextInput
            style={s.input}
            placeholder="e.g. 96"
            placeholderTextColor={palette.gray300}
            value={chest}
            onChangeText={setChest}
            keyboardType="decimal-pad"
          />

          <ThemedText style={s.label}>Hips (cm)</ThemedText>
          <TextInput
            style={s.input}
            placeholder="e.g. 98"
            placeholderTextColor={palette.gray300}
            value={hips}
            onChangeText={setHips}
            keyboardType="decimal-pad"
          />

          <ThemedText style={s.label}>Notes (optional)</ThemedText>
          <TextInput
            style={[s.input, s.notesInput]}
            placeholder="How are you feeling about your progress?"
            placeholderTextColor={palette.gray300}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', letterSpacing: -0.3, color: palette.ink900 },
  saveBtn: {
    backgroundColor: palette.blue500, borderRadius: radii.pill,
    paddingHorizontal: 20, paddingVertical: 10, minWidth: 68, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: palette.gray300 },
  saveBtnText: { fontSize: fontSize.sm, fontWeight: '800', color: '#fff' },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: palette.gray300,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 14,
  },
  label: { fontSize: 13, fontWeight: '700', color: palette.ink700, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: palette.ink900,
    marginBottom: 18, backgroundColor: palette.white,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
});
