import {
  View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  Switch, Modal, FlatList,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { palette, fontSize, radii } from '@/constants/theme';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type TimeSlot = { start_time: string; end_time: string };
type DayState = { enabled: boolean; slots: TimeSlot[] };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULT_SLOT: TimeSlot = { start_time: '08:00', end_time: '17:00' };

const TIME_OPTIONS: string[] = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return opts;
})();

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const d = new Date(); d.setHours(h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function initWeek(): DayState[] {
  return DAYS.map(() => ({ enabled: false, slots: [] }));
}

// ─── Time Picker Modal ────────────────────────────────────────────────────────

function TimePicker({
  visible, current, minTime, onSelect, onClose,
}: {
  visible: boolean; current: string; minTime?: string;
  onSelect: (t: string) => void; onClose: () => void;
}) {
  const options = minTime ? TIME_OPTIONS.filter(t => t > minTime) : TIME_OPTIONS;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={tp.overlay}>
        <View style={tp.sheet}>
          <View style={tp.header}>
            <ThemedText style={tp.title}>Select time</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#000" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={t => t}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[tp.option, item === current && tp.optionActive]}
                onPress={() => { onSelect(item); onClose(); }}
              >
                <ThemedText style={[tp.optionText, item === current && tp.optionTextActive]}>
                  {fmtTime(item)}
                </ThemedText>
                {item === current && <Ionicons name="checkmark" size={16} color="#fff" />}
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PTOfferingAvailabilityScreen() {
  const router = useRouter();
  const { offeringId, title } = useLocalSearchParams<{ offeringId: string; title: string }>();

  const [ptId, setPtId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [week, setWeek] = useState<DayState[]>(initWeek());

  const [picker, setPicker] = useState<{
    visible: boolean; dow: number; idx: number; field: 'start_time' | 'end_time';
  }>({ visible: false, dow: 0, idx: 0, field: 'start_time' });

  const load = useCallback(async () => {
    if (!offeringId) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: pt } = await supabase
      .from('personal_trainers').select('id').eq('user_id', user.id).single();
    if (!pt) return;
    setPtId(pt.id);

    const { data: avail } = await supabase
      .from('pt_availability')
      .select('day_of_week, start_time, end_time')
      .eq('pt_id', pt.id)
      .eq('offering_id', offeringId)
      .order('day_of_week').order('start_time');

    const w = initWeek();
    for (const row of avail ?? []) {
      const dow = row.day_of_week as number;
      w[dow].enabled = true;
      w[dow].slots.push({
        start_time: row.start_time.slice(0, 5),
        end_time: row.end_time.slice(0, 5),
      });
    }
    setWeek(w);
    setLoading(false);
  }, [offeringId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Week helpers ──────────────────────────────────────────────────────────────

  const toggleDay = (dow: number) => {
    setWeek(prev => prev.map((d, i) => {
      if (i !== dow) return d;
      return d.enabled ? { enabled: false, slots: [] } : { enabled: true, slots: [{ ...DEFAULT_SLOT }] };
    }));
  };

  const addSlot = (dow: number) => {
    setWeek(prev => prev.map((d, i) => {
      if (i !== dow) return d;
      const last = d.slots[d.slots.length - 1];
      return { ...d, slots: [...d.slots, { start_time: last?.end_time ?? '08:00', end_time: '18:00' }] };
    }));
  };

  const removeSlot = (dow: number, idx: number) => {
    setWeek(prev => prev.map((d, i) => {
      if (i !== dow) return d;
      const slots = d.slots.filter((_, si) => si !== idx);
      return { ...d, slots, enabled: slots.length > 0 };
    }));
  };

  const updateSlot = (dow: number, idx: number, field: 'start_time' | 'end_time', value: string) => {
    setWeek(prev => prev.map((d, i) => {
      if (i !== dow) return d;
      const slots = d.slots.map((s, si) => si === idx ? { ...s, [field]: value } : s);
      return { ...d, slots };
    }));
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!ptId || !offeringId) return;
    setSaving(true);
    await supabase.from('pt_availability').delete().eq('pt_id', ptId).eq('offering_id', offeringId);

    const toInsert: any[] = [];
    week.forEach((day, dow) => {
      if (!day.enabled) return;
      day.slots.forEach(slot => {
        if (slot.start_time < slot.end_time) {
          toInsert.push({
            pt_id: ptId,
            offering_id: offeringId,
            day_of_week: dow,
            start_time: slot.start_time,
            end_time: slot.end_time,
          });
        }
      });
    });
    if (toInsert.length > 0) await supabase.from('pt_availability').insert(toInsert);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#000" /></View>;
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={s.headerTitles}>
          <ThemedText style={s.headerTitle} numberOfLines={1}>{title ?? 'Session'}</ThemedText>
          <ThemedText style={s.headerSub}>Availability</ThemedText>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Info banner */}
        <View style={s.infoBanner} accessibilityRole="none" accessible accessibilityLabel="This is a session-specific schedule. It overrides your default schedule when set.">
          <Ionicons name="information-circle-outline" size={18} color={palette.blue600} />
          <ThemedText style={s.infoText}>
            These hours apply <ThemedText style={s.infoBold}>only to this session</ThemedText>. When set, they override your default schedule for this session type. Leave all days off to fall back to your default.
          </ThemedText>
        </View>

        {/* Weekly hours */}
        <View style={s.section}>
          <ThemedText style={s.sectionTitle}>Weekly hours</ThemedText>
          <ThemedText style={s.sectionSub}>Days and times clients can book this session</ThemedText>

          {DAYS.map((dayName, dow) => {
            const day = week[dow];
            return (
              <View key={dow} style={[s.dayRow, dow < DAYS.length - 1 && s.dayBorder]}>
                <View style={s.dayLeft}>
                  <Switch
                    value={day.enabled}
                    onValueChange={() => toggleDay(dow)}
                    trackColor={{ false: '#e5e7eb', true: '#000' }}
                    thumbColor="#fff"
                  />
                  <ThemedText style={[s.dayName, !day.enabled && s.dayNameOff]}>
                    {dayName.slice(0, 3)}
                  </ThemedText>
                </View>

                <View style={s.daySlots}>
                  {!day.enabled ? (
                    <ThemedText style={s.unavailable}>Unavailable</ThemedText>
                  ) : (
                    <>
                      {day.slots.map((slot, idx) => (
                        <View key={idx} style={s.slotRow}>
                          <TouchableOpacity
                            style={s.timePill}
                            onPress={() => setPicker({ visible: true, dow, idx, field: 'start_time' })}
                          >
                            <ThemedText style={s.timePillText}>{fmtTime(slot.start_time)}</ThemedText>
                          </TouchableOpacity>
                          <ThemedText style={s.slotDash}>–</ThemedText>
                          <TouchableOpacity
                            style={s.timePill}
                            onPress={() => setPicker({ visible: true, dow, idx, field: 'end_time' })}
                          >
                            <ThemedText style={s.timePillText}>{fmtTime(slot.end_time)}</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeSlot(dow, idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="close-circle" size={18} color="#d1d5db" />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity style={s.addSlotBtn} onPress={() => addSlot(dow)}>
                        <Ionicons name="add-circle-outline" size={14} color="#6b7280" />
                        <ThemedText style={s.addSlotText}>Add slot</ThemedText>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={[s.saveBtn, saving && s.saveBtnDisabled]}
            onPress={save} disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <ThemedText style={s.saveBtnText}>{saved ? '✓ Saved' : 'Save schedule'}</ThemedText>
            }
          </TouchableOpacity>
        </View>

        <ThemedText style={s.footerHint}>
          Need to block a specific date? Manage date overrides from the Availability tab — they apply across all session types.
        </ThemedText>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Time picker modal */}
      <TimePicker
        visible={picker.visible}
        current={picker.field === 'start_time'
          ? week[picker.dow]?.slots[picker.idx]?.start_time ?? '08:00'
          : week[picker.dow]?.slots[picker.idx]?.end_time ?? '17:00'
        }
        minTime={picker.field === 'end_time'
          ? week[picker.dow]?.slots[picker.idx]?.start_time
          : undefined
        }
        onSelect={v => updateSlot(picker.dow, picker.idx, picker.field, v)}
        onClose={() => setPicker(p => ({ ...p, visible: false }))}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingTop: 60, paddingBottom: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 12,
  },
  headerTitles: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#000' },
  headerSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  infoBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: palette.blue50, borderWidth: 1, borderColor: palette.blue100,
    borderRadius: radii.md, padding: 14, marginBottom: 16,
  },
  infoText: { flex: 1, fontSize: fontSize.sm, color: palette.blue600, lineHeight: 18 },
  infoBold: { fontWeight: '700', fontSize: fontSize.sm, color: palette.blue600 },

  section: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
    borderColor: '#f0f0f0', padding: 16, marginBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 2 },
  sectionSub: { fontSize: 12, color: '#9ca3af', marginBottom: 16 },

  dayRow: { paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dayBorder: { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  dayLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 80 },
  dayName: { fontSize: 14, fontWeight: '600', color: '#111' },
  dayNameOff: { color: '#9ca3af' },
  daySlots: { flex: 1 },
  unavailable: { fontSize: 13, color: '#d1d5db', paddingTop: 4 },

  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  timePill: {
    backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  timePillText: { fontSize: 13, fontWeight: '600', color: '#111' },
  slotDash: { color: '#9ca3af', fontSize: 14 },
  addSlotBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  addSlotText: { fontSize: 12, color: '#6b7280' },

  saveBtn: {
    backgroundColor: '#000', borderRadius: 24, paddingVertical: 13,
    alignItems: 'center', marginTop: 20,
  },
  saveBtnDisabled: { backgroundColor: '#9ca3af' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  footerHint: { fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
});

const tp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '65%', paddingBottom: 32,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#000' },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f9f9f9',
  },
  optionActive: { backgroundColor: '#000' },
  optionText: { fontSize: 15, color: '#000' },
  optionTextActive: { color: '#fff', fontWeight: '700' },
});
