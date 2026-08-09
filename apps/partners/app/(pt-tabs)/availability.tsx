import {
  View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  Switch, Modal, FlatList, TextInput, Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { palette, fontSize, radii } from '@/constants/theme';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import DatePickerModal from '../../components/DatePickerModal';

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
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close time picker"
            >
              <Ionicons name="close" size={22} color={palette.ink900} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={t => t}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[tp.option, item === current && tp.optionActive]}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.7}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: item === current }}
              >
                <ThemedText style={[tp.optionText, item === current && tp.optionTextActive]}>
                  {fmtTime(item)}
                </ThemedText>
                {item === current && <Ionicons name="checkmark" size={16} color={palette.white} />}
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

export default function AvailabilityScreen() {
  const [ptId, setPtId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [week, setWeek] = useState<DayState[]>(initWeek());

  // Blocked dates
  const [blockedDates, setBlockedDates] = useState<{ id: string; date: string; reason: string | null }[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');
  const [addingBlock, setAddingBlock] = useState(false);

  // Time picker state
  const [picker, setPicker] = useState<{
    visible: boolean; dow: number; idx: number; field: 'start_time' | 'end_time';
  }>({ visible: false, dow: 0, idx: 0, field: 'start_time' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: pt } = await supabase
      .from('personal_trainers').select('id').eq('user_id', user.id).single();
    if (!pt) return;
    setPtId(pt.id);

    const [{ data: avail }, { data: blocked }] = await Promise.all([
      supabase.from('pt_availability')
        .select('day_of_week, start_time, end_time')
        .eq('pt_id', pt.id).is('offering_id', null)
        .order('day_of_week').order('start_time'),
      supabase.from('pt_blocked_dates')
        .select('id, date, reason').eq('pt_id', pt.id).order('date'),
    ]);

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
    setBlockedDates(blocked ?? []);
    setLoading(false);
  }, []);

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
    if (!ptId) return;
    setSaving(true);
    await supabase.from('pt_availability').delete().eq('pt_id', ptId).is('offering_id', null);

    const toInsert: any[] = [];
    week.forEach((day, dow) => {
      if (!day.enabled) return;
      day.slots.forEach(slot => {
        if (slot.start_time < slot.end_time) {
          toInsert.push({ pt_id: ptId, day_of_week: dow, start_time: slot.start_time, end_time: slot.end_time });
        }
      });
    });
    if (toInsert.length > 0) await supabase.from('pt_availability').insert(toInsert);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // ── Blocked dates ─────────────────────────────────────────────────────────────

  const addBlockedDate = async () => {
    if (!ptId || !newDate) return;
    setAddingBlock(true);
    const { data, error } = await supabase
      .from('pt_blocked_dates')
      .insert({ pt_id: ptId, date: newDate, reason: newReason.trim() || null })
      .select().single();
    if (error) { Alert.alert('Error', error.message); } else if (data) {
      setBlockedDates(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)));
      setNewDate(''); setNewReason(''); setShowAddBlock(false);
    }
    setAddingBlock(false);
  };

  const deleteBlocked = (id: string) => {
    Alert.alert('Remove override', 'Remove this blocked date?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await supabase.from('pt_blocked_dates').delete().eq('id', id);
          setBlockedDates(prev => prev.filter(b => b.id !== id));
        },
      },
    ]);
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={palette.ink900} /></View>;
  }

  return (
    <View style={s.root}>
      <View style={s.headerBar}>
        <ThemedText style={s.headerTitle}>Availability</ThemedText>
        <ThemedText style={s.headerSub}>Set when clients can book sessions with you</ThemedText>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Info banner */}
        <View style={s.infoBanner} accessibilityRole="none" accessible accessibilityLabel="This is your default schedule. It applies to all sessions unless a session has its own hours set.">
          <Ionicons name="information-circle-outline" size={18} color={palette.warning800} />
          <ThemedText style={s.infoText}>
            This is your <ThemedText style={s.infoBold}>default schedule</ThemedText> — it applies to all sessions unless a session has its own hours set. To customise a specific session, tap the clock icon on any offering.
          </ThemedText>
        </View>

        {/* ── Weekly hours ─────────────────────────────────────────────────────── */}
        <View style={s.section}>
          <ThemedText style={s.sectionTitle}>Weekly hours</ThemedText>
          <ThemedText style={s.sectionSub}>Toggle days on and set available time slots</ThemedText>

          {DAYS.map((dayName, dow) => {
            const day = week[dow];
            return (
              <View key={dow} style={[s.dayRow, dow < DAYS.length - 1 && s.dayBorder]}>
                <View style={s.dayLeft}>
                  <Switch
                    value={day.enabled}
                    onValueChange={() => toggleDay(dow)}
                    trackColor={{ false: palette.border, true: palette.ink900 }}
                    thumbColor={palette.white}
                    accessibilityLabel={`${dayName} availability`}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: day.enabled }}
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
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`Start time: ${fmtTime(slot.start_time)}`}
                          >
                            <ThemedText style={s.timePillText}>{fmtTime(slot.start_time)}</ThemedText>
                          </TouchableOpacity>
                          <ThemedText style={s.slotDash}>–</ThemedText>
                          <TouchableOpacity
                            style={s.timePill}
                            onPress={() => setPicker({ visible: true, dow, idx, field: 'end_time' })}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`End time: ${fmtTime(slot.end_time)}`}
                          >
                            <ThemedText style={s.timePillText}>{fmtTime(slot.end_time)}</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => removeSlot(dow, idx)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel="Remove time slot"
                          >
                            <Ionicons name="close-circle" size={20} color={palette.gray300} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity style={s.addSlotBtn} onPress={() => addSlot(dow)} activeOpacity={0.7}>
                        <Ionicons name="add-circle-outline" size={15} color={palette.blue500} />
                        <ThemedText style={s.addSlotText}>Add slot</ThemedText>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={[s.saveBtn, saving && s.saveBtnDisabled, saved && s.saveBtnSaved]}
            onPress={save}
            disabled={saving || saved}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={saving ? 'Saving schedule' : saved ? 'Schedule saved' : 'Save schedule'}
          >
            {saving ? (
              <ActivityIndicator color={palette.white} size="small" />
            ) : saved ? (
              <View style={s.savedInner}>
                <Ionicons name="checkmark" size={16} color={palette.white} />
                <ThemedText style={s.saveBtnText}>Saved</ThemedText>
              </View>
            ) : (
              <ThemedText style={s.saveBtnText}>Save schedule</ThemedText>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Date overrides ───────────────────────────────────────────────────── */}
        <View style={s.section}>
          <ThemedText style={s.sectionTitle}>Date overrides</ThemedText>
          <ThemedText style={s.sectionSub}>Block specific dates — holidays, time off, events</ThemedText>

          {blockedDates.length === 0 && !showAddBlock && (
            <View style={s.emptyOverrides}>
              <Ionicons name="calendar-outline" size={24} color={palette.gray300} />
              <ThemedText style={s.emptyOverridesText}>No dates blocked yet</ThemedText>
            </View>
          )}

          {blockedDates.map(b => (
            <View key={b.id} style={s.blockedRow}>
              <View style={s.blockedDateIcon}>
                <Ionicons name="ban-outline" size={14} color={palette.danger600} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={s.blockedDate}>
                  {new Date(b.date + 'T00:00:00').toLocaleDateString('en-KE', {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                </ThemedText>
                {b.reason ? <ThemedText style={s.blockedReason}>{b.reason}</ThemedText> : null}
              </View>
              <TouchableOpacity
                onPress={() => deleteBlocked(b.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Remove blocked date"
              >
                <Ionicons name="trash-outline" size={16} color={palette.danger500} />
              </TouchableOpacity>
            </View>
          ))}

          {showAddBlock ? (
            <View style={s.addBlockForm}>
              <TouchableOpacity style={s.datePickerBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                <Ionicons name="calendar-outline" size={16} color={newDate ? palette.ink900 : palette.gray300} />
                <ThemedText style={[s.datePickerBtnText, newDate && s.datePickerBtnTextSet]}>
                  {newDate
                    ? new Date(newDate + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Select date'}
                </ThemedText>
                <Ionicons name="chevron-down" size={14} color={palette.gray300} />
              </TouchableOpacity>

              <TextInput
                style={s.input}
                placeholder="Reason (optional)"
                placeholderTextColor={palette.gray300}
                value={newReason}
                onChangeText={setNewReason}
              />
              <View style={s.addBlockActions}>
                <TouchableOpacity
                  style={s.cancelSmallBtn}
                  onPress={() => { setShowAddBlock(false); setNewDate(''); setNewReason(''); }}
                >
                  <ThemedText style={s.cancelSmallText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.blockBtn, (!newDate || addingBlock) && s.blockBtnDisabled]}
                  onPress={addBlockedDate}
                  disabled={!newDate || addingBlock}
                >
                  {addingBlock
                    ? <ActivityIndicator color={palette.white} size="small" />
                    : <ThemedText style={s.blockBtnText}>Block date</ThemedText>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.addOverrideBtn} onPress={() => setShowAddBlock(true)} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={16} color={palette.ink700} />
              <ThemedText style={s.addOverrideBtnText}>Add date override</ThemedText>
            </TouchableOpacity>
          )}

          <DatePickerModal
            visible={showDatePicker}
            value={newDate ? new Date(newDate + 'T00:00:00') : new Date()}
            minimumDate={new Date()}
            onConfirm={(date) => {
              setNewDate(date.toISOString().split('T')[0]);
              setShowDatePicker(false);
            }}
            onCancel={() => setShowDatePicker(false)}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Time picker modal ─────────────────────────────────────────────────── */}
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
  root: { flex: 1, backgroundColor: palette.surfaceApp },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16 },
  headerBar: {
    paddingHorizontal: 20, paddingTop: 64, paddingBottom: 16,
    backgroundColor: palette.white, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800', color: palette.ink900 },
  headerSub: { fontSize: fontSize.sm, color: palette.gray300, marginTop: 2 },

  infoBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: palette.warning50, borderWidth: 1, borderColor: palette.warning100,
    borderRadius: radii.md, padding: 14, marginBottom: 16,
  },
  infoText: { flex: 1, fontSize: fontSize.sm, color: palette.warning800, lineHeight: 18 },
  infoBold: { fontWeight: '700', fontSize: fontSize.sm, color: palette.warning800 },

  section: {
    backgroundColor: palette.white, borderRadius: radii.lg, borderWidth: 1,
    borderColor: palette.hairline, padding: 16, marginBottom: 16,
  },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, marginBottom: 2 },
  sectionSub: { fontSize: fontSize.xs, color: palette.gray300, marginBottom: 16 },

  dayRow: { paddingVertical: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dayBorder: { borderBottomWidth: 1, borderBottomColor: palette.hairline },
  dayLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 92 },
  dayName: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink900 },
  dayNameOff: { color: palette.gray300 },
  daySlots: { flex: 1, paddingTop: 4 },
  unavailable: { fontSize: fontSize.sm, color: palette.gray300 },

  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  timePill: {
    backgroundColor: palette.surfaceMuted, borderRadius: radii.sm,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: palette.border,
  },
  timePillText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink900 },
  slotDash: { color: palette.gray300, fontSize: fontSize.sm },
  addSlotBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  addSlotText: { fontSize: fontSize.sm, color: palette.blue500, fontWeight: '500' },

  saveBtn: {
    backgroundColor: palette.ink900, borderRadius: radii.pill, paddingVertical: 13,
    alignItems: 'center', marginTop: 20,
  },
  saveBtnDisabled: { backgroundColor: palette.gray300 },
  saveBtnSaved: { backgroundColor: palette.success700 },
  savedInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saveBtnText: { color: palette.white, fontWeight: '700', fontSize: fontSize.base },

  emptyOverrides: {
    alignItems: 'center', paddingVertical: 20, gap: 8,
  },
  emptyOverridesText: { fontSize: fontSize.sm, color: palette.gray300 },

  blockedRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: palette.hairline, gap: 10,
  },
  blockedDateIcon: {
    width: 28, height: 28, borderRadius: radii.sm,
    backgroundColor: palette.danger50, alignItems: 'center', justifyContent: 'center',
  },
  blockedDate: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink900 },
  blockedReason: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 2 },

  addOverrideBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 13,
    borderWidth: 1.5, borderColor: palette.border, borderRadius: radii.md,
    justifyContent: 'center', marginTop: 12,
  },
  addOverrideBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink700 },

  addBlockForm: { marginTop: 12, gap: 10 },
  input: {
    borderWidth: 1, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: fontSize.base, color: palette.ink900,
  },
  datePickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: palette.border, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 13, backgroundColor: palette.surfaceMuted,
  },
  datePickerBtnText: { flex: 1, fontSize: fontSize.base, color: palette.gray300 },
  datePickerBtnTextSet: { color: palette.ink900, fontWeight: '500' },
  addBlockActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  cancelSmallBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.pill,
    borderWidth: 1, borderColor: palette.border,
  },
  cancelSmallText: { fontSize: fontSize.sm, color: palette.gray450, fontWeight: '600' },
  blockBtn: {
    backgroundColor: palette.ink900, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radii.pill,
  },
  blockBtnDisabled: { backgroundColor: palette.gray300 },
  blockBtnText: { color: palette.white, fontWeight: '700', fontSize: fontSize.sm },
});

const tp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.white, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    maxHeight: '65%', paddingBottom: 32,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  title: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  optionActive: { backgroundColor: palette.ink900 },
  optionText: { fontSize: fontSize.base, color: palette.ink900 },
  optionTextActive: { color: palette.white, fontWeight: '700' },
});
