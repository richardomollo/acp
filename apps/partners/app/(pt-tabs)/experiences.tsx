import {
  View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, Modal, Switch, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#000000';

const CUTOFF_OPTIONS  = [null, 0, 1, 2, 4, 12, 24, 48, 72] as const;
const DEPOSIT_OPTIONS = [null, 10, 20, 25, 30, 40, 50] as const;
const NO_SHOW_OPTIONS = [null, 0, 5, 10, 15, 30] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type Experience = {
  id: string;
  pt_id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  meeting_point: string | null;
  transport_info: string | null;
  price_kes: number;
  max_capacity: number;
  spots_left: number;
  includes: string[];
  itinerary: { time: string; activity: string; detail: string }[];
  image_url: string | null;
  category: string | null;
  is_active: boolean;
  cancellation_cutoff_hours: number | null;
  deposit_pct: number | null;
  no_show_grace_mins: number | null;
};

type ItineraryRow = { time: string; activity: string; detail: string };

const BLANK = {
  name: '', tagline: '', description: '', date: '', start_time: '', end_time: '',
  meeting_point: '', transport_info: '', price_kes: '', max_capacity: '20',
  category: '', is_active: true, image_url: '',
  includes: [''] as string[],
  itinerary: [{ time: '', activity: '', detail: '' }] as ItineraryRow[],
  cancellation_cutoff_hours: null as number | null,
  deposit_pct: null as number | null,
  no_show_grace_mins: null as number | null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0];

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });

const fmtTime = (t: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const fmtKes = (n: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n);

// ─── Field wrapper ────────────────────────────────────────────────────────────

function MField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.mfield}>
      <ThemedText style={styles.mfieldLabel}>{label}</ThemedText>
      {children}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PTExperiencesScreen() {
  const [ptId, setPtId]             = useState<string | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [filter, setFilter]         = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [form, setForm]             = useState({ ...BLANK });

  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: pt } = await supabase
        .from('personal_trainers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!pt) return;

      setPtId(pt.id);

      const { data } = await supabase
        .from('experiences')
        .select('*')
        .eq('pt_id', pt.id)
        .order('date', { ascending: false });
      setExperiences((data || []) as Experience[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Form helpers ─────────────────────────────────────────────────────────────

  function openNew() {
    setEditingId(null);
    setForm({ ...BLANK, includes: [''], itinerary: [{ time: '', activity: '', detail: '' }] });
    setShowModal(true);
  }

  function openEdit(e: Experience) {
    setEditingId(e.id);
    setForm({
      name: e.name,
      tagline: e.tagline ?? '',
      description: e.description ?? '',
      date: e.date,
      start_time: e.start_time,
      end_time: e.end_time ?? '',
      meeting_point: e.meeting_point ?? '',
      transport_info: e.transport_info ?? '',
      price_kes: String(e.price_kes),
      max_capacity: String(e.max_capacity),
      category: e.category ?? '',
      is_active: e.is_active,
      image_url: e.image_url ?? '',
      includes: e.includes?.length ? e.includes : [''],
      itinerary: e.itinerary?.length ? e.itinerary : [{ time: '', activity: '', detail: '' }],
      cancellation_cutoff_hours: e.cancellation_cutoff_hours ?? null,
      deposit_pct: e.deposit_pct ?? null,
      no_show_grace_mins: e.no_show_grace_mins ?? null,
    });
    setShowModal(true);
  }

  // ── Image upload ─────────────────────────────────────────────────────────────

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add a cover image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85, base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const { uri, base64 } = result.assets[0];
    setUploading(true);
    try {
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const filename = `experiences/pt-${ptId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const { data, error } = await supabase.storage
        .from('fitpass-images')
        .upload(filename, bytes, { contentType: mimeType, upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('fitpass-images').getPublicUrl(data.path);
      setF('image_url', urlData.publicUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message || 'Could not upload image');
    } finally {
      setUploading(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Please enter a name'); return; }
    if (!form.date) { Alert.alert('Required', 'Please set a date'); return; }
    if (!form.start_time) { Alert.alert('Required', 'Please set a start time'); return; }
    if (!ptId) return;
    setSaving(true);

    const cleanIncludes  = (form.includes as string[]).map(s => s.trim()).filter(Boolean);
    const cleanItinerary = (form.itinerary as ItineraryRow[]).filter(r => r.time.trim() || r.activity.trim());

    const payload: any = {
      pt_id: ptId,
      gym_id: null,
      name: form.name.trim(),
      tagline: form.tagline.trim() || null,
      description: form.description.trim() || null,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time.trim() || null,
      meeting_point: form.meeting_point.trim() || null,
      transport_info: form.transport_info.trim() || null,
      price_kes: parseFloat(form.price_kes) || 0,
      max_capacity: parseInt(form.max_capacity) || 20,
      spots_left: parseInt(form.max_capacity) || 20,
      includes: cleanIncludes,
      itinerary: cleanItinerary,
      image_url: form.image_url || null,
      category: form.category.trim() || null,
      is_active: form.is_active,
      cancellation_cutoff_hours: form.cancellation_cutoff_hours,
      deposit_pct: form.deposit_pct,
      no_show_grace_mins: form.no_show_grace_mins,
    };

    try {
      if (editingId) {
        const { spots_left: _s, ...upd } = payload;
        const { error } = await supabase.from('experiences').update(upd).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('experiences').insert(payload);
        if (error) throw error;
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save experience');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete / toggle ───────────────────────────────────────────────────────────

  const deleteExp = (e: Experience) => {
    Alert.alert('Delete Experience', `Delete "${e.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await supabase.from('experiences').delete().eq('id', e.id);
          setExperiences(prev => prev.filter(x => x.id !== e.id));
        },
      },
    ]);
  };

  const toggleActive = async (e: Experience) => {
    await supabase.from('experiences').update({ is_active: !e.is_active }).eq('id', e.id);
    setExperiences(prev => prev.map(x => x.id === e.id ? { ...x, is_active: !x.is_active } : x));
  };

  // ── Includes helpers ──────────────────────────────────────────────────────────

  const addInclude    = () => setF('includes', [...(form.includes as string[]), '']);
  const removeInclude = (i: number) => setF('includes', (form.includes as string[]).filter((_, idx) => idx !== i));
  const setInclude    = (i: number, v: string) => {
    const next = [...(form.includes as string[])]; next[i] = v; setF('includes', next);
  };

  // ── Itinerary helpers ─────────────────────────────────────────────────────────

  const addItinerary    = () => setF('itinerary', [...(form.itinerary as ItineraryRow[]), { time: '', activity: '', detail: '' }]);
  const removeItinerary = (i: number) => setF('itinerary', (form.itinerary as ItineraryRow[]).filter((_, idx) => idx !== i));
  const setItinerary    = (i: number, k: keyof ItineraryRow, v: string) => {
    const next = (form.itinerary as ItineraryRow[]).map((r, idx) => idx === i ? { ...r, [k]: v } : r);
    setF('itinerary', next);
  };

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const t = todayStr();
  const filtered = experiences.filter(e =>
    filter === 'upcoming' ? e.date >= t :
    filter === 'past'     ? e.date < t  : true
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Experiences</ThemedText>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Ionicons name="add" size={20} color="#fff" />
          <ThemedText style={styles.addBtnText}>New</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['upcoming', 'past', 'all'] as const).map(f => (
          <TouchableOpacity key={f} style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}>
            <ThemedText style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="sparkles-outline" size={48} color="#d1d5db" style={{ marginBottom: 12 }} />
          <ThemedText style={styles.emptyTitle}>
            {filter === 'upcoming' ? 'No upcoming experiences' : 'No experiences found'}
          </ThemedText>
          <ThemedText style={styles.emptySub}>
            Create retreats, hikes, and wellness events to sell directly to clients.
          </ThemedText>
          <TouchableOpacity style={styles.emptyBtn} onPress={openNew}>
            <ThemedText style={styles.emptyBtnText}>Create first experience</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          {filtered.map(e => (
            <View key={e.id} style={[styles.card, !e.is_active && styles.cardInactive]}>
              {e.image_url ? (
                <Image source={{ uri: e.image_url }} style={styles.cardImage} contentFit="cover" />
              ) : (
                <View style={styles.cardImagePlaceholder}>
                  <Ionicons name="sparkles" size={24} color="rgba(255,255,255,0.5)" />
                </View>
              )}
              <View style={styles.cardBody}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.cardName}>{e.name}</ThemedText>
                    {e.tagline ? <ThemedText style={styles.cardTagline}>{e.tagline}</ThemedText> : null}
                  </View>
                  <Switch
                    value={e.is_active}
                    onValueChange={() => toggleActive(e)}
                    trackColor={{ false: '#e5e7eb', true: PRIMARY }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={styles.metaRow}>
                  <Ionicons name="calendar-outline" size={12} color="#6b7280" />
                  <ThemedText style={styles.metaText}>{fmtDate(e.date)}</ThemedText>
                  <ThemedText style={styles.metaDot}>·</ThemedText>
                  <ThemedText style={styles.metaText}>{fmtTime(e.start_time)}</ThemedText>
                  {e.end_time ? <>
                    <ThemedText style={styles.metaDot}>–</ThemedText>
                    <ThemedText style={styles.metaText}>{fmtTime(e.end_time)}</ThemedText>
                  </> : null}
                </View>

                <View style={styles.metaRow}>
                  <Ionicons name="pricetag-outline" size={12} color="#6b7280" />
                  <ThemedText style={[styles.metaText, { fontWeight: '700' }]}>{fmtKes(Number(e.price_kes))}</ThemedText>
                  <ThemedText style={styles.metaDot}>·</ThemedText>
                  <ThemedText style={styles.metaText}>{e.spots_left}/{e.max_capacity} spots</ThemedText>
                </View>

                {e.meeting_point ? (
                  <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={12} color="#6b7280" />
                    <ThemedText style={styles.metaText} numberOfLines={1}>{e.meeting_point}</ThemedText>
                  </View>
                ) : null}

                {/* Cancellation policy summary */}
                {(e.cancellation_cutoff_hours != null || e.deposit_pct != null) ? (
                  <View style={styles.metaRow}>
                    <Ionicons name="shield-checkmark-outline" size={12} color="#6b7280" />
                    <ThemedText style={styles.metaText}>
                      {e.cancellation_cutoff_hours === 0
                        ? 'Non-refundable'
                        : e.cancellation_cutoff_hours != null
                        ? `Cancel ≥${e.cancellation_cutoff_hours}h before`
                        : ''}
                      {e.cancellation_cutoff_hours != null && e.deposit_pct != null ? ' · ' : ''}
                      {e.deposit_pct != null ? `${e.deposit_pct}% deposit` : ''}
                    </ThemedText>
                  </View>
                ) : null}

                {e.includes?.length > 0 ? (
                  <View style={styles.chipsRow}>
                    {e.includes.slice(0, 3).map((inc, i) => (
                      <View key={i} style={styles.chip}>
                        <ThemedText style={styles.chipText}>{inc}</ThemedText>
                      </View>
                    ))}
                    {e.includes.length > 3 ? (
                      <ThemedText style={styles.chipMore}>+{e.includes.length - 3}</ThemedText>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(e)}>
                    <Ionicons name="pencil-outline" size={14} color="#555" />
                    <ThemedText style={styles.editBtnText}>Edit</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteExp(e)}>
                    <Ionicons name="trash-outline" size={14} color="#dc2626" />
                    <ThemedText style={styles.deleteBtnText}>Delete</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ── Create / Edit Modal ──────────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <ThemedText style={styles.modalCancel}>Cancel</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.modalTitle}>
              {editingId ? 'Edit Experience' : 'New Experience'}
            </ThemedText>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color={PRIMARY} />
                : <ThemedText style={styles.modalSave}>Save</ThemedText>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">

            {/* Cover image */}
            <MField label="Cover Photo">
              <TouchableOpacity style={styles.imagePicker} onPress={pickImage} disabled={uploading}>
                {form.image_url ? (
                  <>
                    <Image source={{ uri: form.image_url }} style={styles.imagePreview} contentFit="cover" />
                    <View style={styles.imageEditBadge}>
                      <Ionicons name="camera" size={14} color="#fff" />
                    </View>
                  </>
                ) : uploading ? (
                  <View style={styles.imagePlaceholder}>
                    <ActivityIndicator color={PRIMARY} />
                    <ThemedText style={styles.imagePlaceholderText}>Uploading…</ThemedText>
                  </View>
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="image-outline" size={28} color="#9ca3af" />
                    <ThemedText style={styles.imagePlaceholderText}>Add Cover Photo</ThemedText>
                    <ThemedText style={styles.imagePlaceholderSub}>16:9 ratio recommended</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
            </MField>

            <MField label="Name *">
              <TextInput style={styles.input} placeholder="e.g. Sunrise Yoga & Hike at Karura"
                placeholderTextColor="#999" value={form.name}
                onChangeText={t => setF('name', t)} />
            </MField>

            <MField label="Tagline">
              <TextInput style={styles.input} placeholder='e.g. "The Journey Inward"'
                placeholderTextColor="#999" value={form.tagline}
                onChangeText={t => setF('tagline', t)} />
            </MField>

            <MField label="Description">
              <TextInput style={[styles.input, styles.inputMulti]} placeholder="What is this experience about?"
                placeholderTextColor="#999" value={form.description} multiline
                onChangeText={t => setF('description', t)} />
            </MField>

            <MField label="Date *">
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#999"
                value={form.date} onChangeText={t => setF('date', t)} keyboardType="numbers-and-punctuation" />
            </MField>

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <MField label="Start Time *">
                  <TextInput style={styles.input} placeholder="HH:MM" placeholderTextColor="#999"
                    value={form.start_time} onChangeText={t => setF('start_time', t)}
                    keyboardType="numbers-and-punctuation" />
                </MField>
              </View>
              <View style={{ flex: 1 }}>
                <MField label="End Time">
                  <TextInput style={styles.input} placeholder="HH:MM" placeholderTextColor="#999"
                    value={form.end_time} onChangeText={t => setF('end_time', t)}
                    keyboardType="numbers-and-punctuation" />
                </MField>
              </View>
            </View>

            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <MField label="Price (KES) *">
                  <TextInput style={styles.input} placeholder="0" placeholderTextColor="#999"
                    value={form.price_kes} onChangeText={t => setF('price_kes', t)} keyboardType="numeric" />
                </MField>
              </View>
              <View style={{ flex: 1 }}>
                <MField label="Max Capacity">
                  <TextInput style={styles.input} placeholder="20" placeholderTextColor="#999"
                    value={form.max_capacity} onChangeText={t => setF('max_capacity', t)} keyboardType="number-pad" />
                </MField>
              </View>
            </View>

            <MField label="Category">
              <TextInput style={styles.input} placeholder="e.g. Hiking, Wellness, Yoga"
                placeholderTextColor="#999" value={form.category} onChangeText={t => setF('category', t)} />
            </MField>

            <MField label="Meeting Point">
              <TextInput style={styles.input} placeholder="e.g. Shell CBD, Kenyatta Ave"
                placeholderTextColor="#999" value={form.meeting_point}
                onChangeText={t => setF('meeting_point', t)} />
            </MField>

            <MField label="Transport Info">
              <TextInput style={styles.input} placeholder="e.g. 26-seater bus, departure 5:30 AM"
                placeholderTextColor="#999" value={form.transport_info}
                onChangeText={t => setF('transport_info', t)} />
            </MField>

            {/* What's Included */}
            <MField label="What's Included">
              {(form.includes as string[]).map((inc, i) => (
                <View key={i} style={styles.dynamicRow}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="e.g. Return Transport" placeholderTextColor="#999"
                    value={inc} onChangeText={v => setInclude(i, v)} />
                  {(form.includes as string[]).length > 1 && (
                    <TouchableOpacity onPress={() => removeInclude(i)} style={styles.removeBtn}>
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={styles.addRowBtn} onPress={addInclude}>
                <Ionicons name="add-circle-outline" size={16} color={PRIMARY} />
                <ThemedText style={styles.addRowText}>Add item</ThemedText>
              </TouchableOpacity>
            </MField>

            {/* Itinerary */}
            <MField label="Itinerary">
              {(form.itinerary as ItineraryRow[]).map((row, i) => (
                <View key={i} style={styles.itineraryBlock}>
                  <View style={styles.dynamicRow}>
                    <TextInput style={[styles.input, { width: 90, marginBottom: 0 }]}
                      placeholder="5:30 AM" placeholderTextColor="#999"
                      value={row.time} onChangeText={v => setItinerary(i, 'time', v)} />
                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      placeholder="Activity" placeholderTextColor="#999"
                      value={row.activity} onChangeText={v => setItinerary(i, 'activity', v)} />
                    {(form.itinerary as ItineraryRow[]).length > 1 && (
                      <TouchableOpacity onPress={() => removeItinerary(i)} style={styles.removeBtn}>
                        <Ionicons name="close-circle" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput style={[styles.input, { marginTop: 4 }]}
                    placeholder="Details (optional)" placeholderTextColor="#999"
                    value={row.detail} onChangeText={v => setItinerary(i, 'detail', v)} />
                </View>
              ))}
              <TouchableOpacity style={styles.addRowBtn} onPress={addItinerary}>
                <Ionicons name="add-circle-outline" size={16} color={PRIMARY} />
                <ThemedText style={styles.addRowText}>Add step</ThemedText>
              </TouchableOpacity>
            </MField>

            {/* ── Cancellation Policy ──────────────────────────────────────── */}
            <View style={styles.policySectionHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#002fff" />
              <ThemedText style={styles.policySectionTitle}>Cancellation Policy</ThemedText>
            </View>
            <ThemedText style={styles.inputHint}>
              Leave at "Platform default" to use the standard policy, or override for this experience.
            </ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Free cancellation window</ThemedText>
              <View style={styles.chipGrid}>
                {CUTOFF_OPTIONS.map(h => {
                  const label = h === null ? 'Platform default' : h === 0 ? 'None' : `${h}h`;
                  const active = form.cancellation_cutoff_hours === h;
                  return (
                    <TouchableOpacity
                      key={String(h)}
                      style={[styles.policyChip, active && styles.policyChipActive]}
                      onPress={() => {
                        setF('cancellation_cutoff_hours', h ?? null);
                        if (h === 0) setF('deposit_pct', null);
                      }}
                    >
                      <ThemedText style={[styles.policyChipText, active && styles.policyChipTextActive]}>{label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {form.cancellation_cutoff_hours !== 0 && (
            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>Deposit required</ThemedText>
              <View style={styles.chipGrid}>
                {DEPOSIT_OPTIONS.map(pct => {
                  const label = pct === null ? 'Platform default' : `${pct}%`;
                  const active = form.deposit_pct === pct;
                  return (
                    <TouchableOpacity
                      key={String(pct)}
                      style={[styles.policyChip, active && styles.policyChipActive]}
                      onPress={() => setF('deposit_pct', pct ?? null)}
                    >
                      <ThemedText style={[styles.policyChipText, active && styles.policyChipTextActive]}>{label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            )}

            <View style={styles.inputGroup}>
              <ThemedText style={styles.inputLabel}>No-show grace period</ThemedText>
              <View style={styles.chipGrid}>
                {NO_SHOW_OPTIONS.map(m => {
                  const label = m === null ? 'Platform default' : m === 0 ? 'Immediate' : `${m} min`;
                  const active = form.no_show_grace_mins === m;
                  return (
                    <TouchableOpacity
                      key={String(m)}
                      style={[styles.policyChip, active && styles.policyChipActive]}
                      onPress={() => setF('no_show_grace_mins', m ?? null)}
                    >
                      <ThemedText style={[styles.policyChipText, active && styles.policyChipTextActive]}>{label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Active toggle */}
            <View style={styles.toggleRow}>
              <ThemedText style={styles.toggleLabel}>Visible to members</ThemedText>
              <Switch value={form.is_active} onValueChange={v => setF('is_active', v)}
                trackColor={{ false: '#e5e7eb', true: PRIMARY }} thumbColor="#fff" />
            </View>

          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f9fafb' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#111' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PRIMARY, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f0f0f0' },
  filterTabActive: { backgroundColor: PRIMARY },
  filterTabText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterTabTextActive: { color: '#fff' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151', textAlign: 'center', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  emptyBtn: { backgroundColor: PRIMARY, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10 },
  emptyBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  list: { padding: 16, gap: 14 },

  card: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardInactive: { opacity: 0.6 },
  cardImage: { width: '100%', height: 140 },
  cardImagePlaceholder: {
    width: '100%', height: 100,
    backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111' },
  cardTagline: { fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  metaText: { fontSize: 12, color: '#6b7280' },
  metaDot: { fontSize: 12, color: '#d1d5db' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { backgroundColor: '#ede9fe', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 11, color: '#5b21b6', fontWeight: '600' },
  chipMore: { fontSize: 11, color: '#9ca3af', paddingVertical: 3 },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, backgroundColor: '#f3f4f6', borderRadius: 10, paddingVertical: 8,
  },
  editBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  deleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, backgroundColor: '#fef2f2', borderRadius: 10, paddingVertical: 8,
  },
  deleteBtnText: { fontSize: 12, fontWeight: '600', color: '#dc2626' },

  // Modal
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalCancel: { fontSize: 15, color: '#6b7280' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  modalSave: { fontSize: 15, fontWeight: '700', color: PRIMARY },
  modalForm: { padding: 20, gap: 4, paddingBottom: 60 },

  mfield: { marginBottom: 16 },
  mfieldLabel: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },

  input: {
    backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#111', marginBottom: 0,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top', paddingTop: 11 },

  imagePicker: {
    borderWidth: 2, borderColor: '#e5e7eb', borderStyle: 'dashed',
    borderRadius: 12, overflow: 'hidden', aspectRatio: 16 / 9,
  },
  imagePreview: { width: '100%', height: '100%' },
  imageEditBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, padding: 6,
  },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  imagePlaceholderText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  imagePlaceholderSub: { fontSize: 11, color: '#9ca3af' },

  row2: { flexDirection: 'row', gap: 12 },

  dynamicRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  removeBtn: { padding: 2 },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  addRowText: { fontSize: 13, fontWeight: '600', color: PRIMARY },

  itineraryBlock: { marginBottom: 10 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 8,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },

  // Cancellation policy
  policySectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 24, marginBottom: 6,
    paddingTop: 20, borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  policySectionTitle: { fontSize: 16, fontWeight: '700', color: '#000' },
  inputHint: { fontSize: 12, color: '#9ca3af', marginBottom: 12, lineHeight: 18 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  policyChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#f8f8f8',
  },
  policyChipActive: { borderColor: '#002fff', backgroundColor: '#f0f5ff' },
  policyChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  policyChipTextActive: { color: '#002fff' },
});
