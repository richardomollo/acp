import {
  View, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

export default function LogProgressScreen() {
  const router = useRouter();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();

  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [hips, setHips] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = [weight, waist, chest, hips, notes].some(v => v.trim().length > 0);

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Nothing to log', 'Enter at least one measurement or a note.');
      return;
    }
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { data: pt } = await supabase
      .from('personal_trainers').select('id').eq('user_id', user.id).single();
    if (!pt) {
      Alert.alert('Error', 'Trainer profile not found.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('client_measurements').insert({
      user_id: clientId,
      logged_by_pt_id: pt.id,
      weight_kg: weight.trim() ? Number(weight) : null,
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
        <SafeAreaView edges={['top']} style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color="#000" />
          </TouchableOpacity>
          <ThemedText style={s.headerTitle}>Log Progress</ThemedText>
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
          <ThemedText style={s.sectionLabel}>Measurements (optional)</ThemedText>

          <ThemedText style={s.label}>Weight (kg)</ThemedText>
          <TextInput
            style={s.input}
            placeholder="e.g. 68.5"
            placeholderTextColor="#9ca3af"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />

          <ThemedText style={s.label}>Waist (cm)</ThemedText>
          <TextInput
            style={s.input}
            placeholder="e.g. 80"
            placeholderTextColor="#9ca3af"
            value={waist}
            onChangeText={setWaist}
            keyboardType="decimal-pad"
          />

          <ThemedText style={s.label}>Chest (cm)</ThemedText>
          <TextInput
            style={s.input}
            placeholder="e.g. 96"
            placeholderTextColor="#9ca3af"
            value={chest}
            onChangeText={setChest}
            keyboardType="decimal-pad"
          />

          <ThemedText style={s.label}>Hips (cm)</ThemedText>
          <TextInput
            style={s.input}
            placeholder="e.g. 98"
            placeholderTextColor="#9ca3af"
            value={hips}
            onChangeText={setHips}
            keyboardType="decimal-pad"
          />

          <ThemedText style={s.label}>Note (optional)</ThemedText>
          <TextInput
            style={[s.input, s.notesInput]}
            placeholder="Observations from today's session..."
            placeholderTextColor="#9ca3af"
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
  root: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', letterSpacing: -0.3, color: '#000' },
  saveBtn: {
    backgroundColor: '#000', borderRadius: 20,
    paddingHorizontal: 20, paddingVertical: 10, minWidth: 68, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#d1d5db' },
  saveBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  content: { paddingHorizontal: 20, paddingTop: 20 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14,
  },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827',
    marginBottom: 18, backgroundColor: '#fff',
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
});
