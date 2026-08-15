import {
  View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, Modal, Switch, Clipboard, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { palette, fontSize, radii } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Programme = {
  id: string;
  gym_id: string;
  instructor_id: string | null;
  intro_session_id: string;
  title: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  max_participants: number;
  programme_weeks: number;
  programme_price_kes: number;
  deposit_pct: number;
  instalment_frequency_weeks: number;
  image_url: string | null;
  slug: string | null;
  is_active: boolean;
  is_draft: boolean;
  cancellation_cutoff_hours: number | null;
  no_show_grace_mins: number | null;
};

type Gym = { id: string; name: string };
type SessionOption = { id: string; gym_id: string; name: string; time: string; category: string | null; recurring: boolean };
type TrainerOption = { id: string; gym_id: string; full_name: string };

const CUTOFF_OPTIONS = [null, 0, 1, 2, 4, 12, 24, 48, 72] as const;
const NO_SHOW_OPTIONS = [null, 0, 5, 10, 15, 30] as const;
const DEPOSIT_OPTIONS = [null, 10, 20, 25, 30, 40, 50] as const;

const BLANK_FORM = {
  gym_id: '', title: '', description: '', category: '',
  duration_minutes: '60', max_participants: '20',
  programme_weeks: '12', programme_price_kes: '',
  deposit_pct: '30', instalment_frequency_weeks: '4',
  intro_session_id: '', instructor_id: '', image_url: '',
  is_active: true, is_draft: false,
  cancellation_cutoff_hours: null as number | null,
  no_show_grace_mins: null as number | null,
};

const BOOKING_BASE = 'https://activecitypass.com/gym-programmes/';

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProgrammesScreen() {
  const router = useRouter();
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [sessionOptions, setSessionOptions] = useState<SessionOption[]>([]);
  const [trainerOptions, setTrainerOptions] = useState<TrainerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [imageUploading, setImageUploading] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: partner } = await supabase.from('partners').select('id').eq('user_id', user.id).single();
    if (!partner) return;

    const { data: partnerGyms } = await supabase
      .from('partner_gyms').select('gym_id, gyms(id, name)').eq('partner_id', partner.id);
    const ids = (partnerGyms || []).map((pg: any) => pg.gym_id);
    const gymList = (partnerGyms || []).map((pg: any) => ({ id: pg.gyms?.id, name: pg.gyms?.name })).filter((g: any) => g.id);
    setGyms(gymList);

    if (ids.length === 0) { setProgrammes([]); setLoading(false); return; }

    const [{ data: progs }, { data: sessions }, { data: trainers }] = await Promise.all([
      supabase.from('gym_programmes').select('*').in('gym_id', ids).order('created_at', { ascending: false }),
      supabase.from('sessions').select('id, gym_id, name, time, category, recurring').in('gym_id', ids).order('name'),
      supabase.from('gym_trainers').select('id, gym_id, full_name').in('gym_id', ids).eq('status', 'active'),
    ]);
    setProgrammes((progs as any) || []);
    setSessionOptions((sessions as any) || []);
    setTrainerOptions((trainers as any) || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditingId(null);
    setTitleError(false);
    setForm({ ...BLANK_FORM, gym_id: gyms[0]?.id ?? '' });
    setShowModal(true);
  };

  const openEdit = (p: Programme) => {
    setEditingId(p.id);
    setTitleError(false);
    setForm({
      gym_id: p.gym_id, title: p.title, description: p.description ?? '', category: p.category ?? '',
      duration_minutes: String(p.duration_minutes), max_participants: String(p.max_participants),
      programme_weeks: String(p.programme_weeks), programme_price_kes: String(p.programme_price_kes),
      deposit_pct: String(p.deposit_pct), instalment_frequency_weeks: String(p.instalment_frequency_weeks),
      intro_session_id: p.intro_session_id, instructor_id: p.instructor_id ?? '', image_url: p.image_url ?? '',
      is_active: p.is_active, is_draft: p.is_draft,
      cancellation_cutoff_hours: p.cancellation_cutoff_hours ?? null,
      no_show_grace_mins: p.no_show_grace_mins ?? null,
    });
    setShowModal(true);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add a programme image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85, base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const { uri, base64 } = result.assets[0];
    setImageUploading(true);
    try {
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const filename = `gym-programmes/${form.gym_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
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
      setImageUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setTitleError(true); return; }
    if (!form.gym_id) { Alert.alert('Required', 'Please select a venue'); return; }
    if (!form.intro_session_id) { Alert.alert('Required', 'Please choose an intro session — an existing class customers book as a trial before committing to the programme.'); return; }
    if (!form.programme_weeks || !form.programme_price_kes) { Alert.alert('Required', 'Please set the programme length and price'); return; }
    setTitleError(false);
    setSaving(true);

    const payload: any = {
      gym_id: form.gym_id,
      instructor_id: form.instructor_id || null,
      intro_session_id: form.intro_session_id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      duration_minutes: parseInt(form.duration_minutes) || 60,
      max_participants: parseInt(form.max_participants) || 20,
      programme_weeks: parseInt(form.programme_weeks),
      programme_price_kes: parseFloat(form.programme_price_kes),
      deposit_pct: parseInt(form.deposit_pct) || 30,
      instalment_frequency_weeks: parseInt(form.instalment_frequency_weeks) || 4,
      image_url: form.image_url || null,
      is_active: form.is_active,
      is_draft: form.is_draft,
      cancellation_cutoff_hours: form.cancellation_cutoff_hours,
      no_show_grace_mins: form.no_show_grace_mins,
    };

    try {
      if (editingId) {
        const { error } = await supabase.from('gym_programmes').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('gym_programmes').insert(payload);
        if (error) throw error;
      }
      setShowModal(false);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save programme');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Programme) => {
    setProgrammes(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x));
    const { error } = await supabase.from('gym_programmes').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) {
      setProgrammes(prev => prev.map(x => x.id === p.id ? { ...x, is_active: p.is_active } : x));
      Alert.alert('Error', 'Could not update programme visibility');
    }
  };

  const deleteProgramme = (p: Programme) => {
    Alert.alert('Delete Programme', `Delete "${p.title}"? Existing enrollments are kept but the programme will no longer be bookable.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('gym_programmes').delete().eq('id', p.id);
          if (error) { Alert.alert('Error', 'Could not delete programme'); return; }
          setProgrammes(prev => prev.filter(x => x.id !== p.id));
        },
      },
    ]);
  };

  const copyLink = (slug: string) => {
    Clipboard.setString(BOOKING_BASE + slug);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  const gymSessions = sessionOptions.filter(s => s.gym_id === form.gym_id);
  const gymTrainers = trainerOptions.filter(t => t.gym_id === form.gym_id);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Programmes</ThemedText>
          <ThemedText style={styles.headerSub}>Multi-week courses with deposits and instalments</ThemedText>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNew} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={palette.white} />
          <ThemedText style={styles.addBtnText}>New</ThemedText>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={palette.ink900} /></View>
      ) : programmes.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={48} color={palette.gray200} style={{ marginBottom: 12 }} />
          <ThemedText style={styles.emptyTitle}>No programmes yet</ThemedText>
          <ThemedText style={styles.emptySub}>Create a multi-week programme — e.g. a 12-week martial arts course — with a deposit and instalment schedule.</ThemedText>
          <TouchableOpacity style={styles.emptyBtn} onPress={openNew} activeOpacity={0.85}>
            <ThemedText style={styles.emptyBtnText}>Create first programme</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {programmes.map(p => (
            <View key={p.id} style={[styles.card, !p.is_active && styles.cardInactive]}>
              {p.image_url ? (
                <Image source={{ uri: p.image_url }} style={styles.cardImage} contentFit="cover" />
              ) : null}

              <View style={styles.cardMain}>
                <View style={styles.cardLeft}>
                  <View style={styles.badgeRow}>
                    <View style={styles.programmeBadge}>
                      <Ionicons name="trophy-outline" size={11} color="#4f46e5" />
                      <ThemedText style={styles.programmeText}>{p.programme_weeks}W Programme</ThemedText>
                    </View>
                    {p.is_draft && (
                      <View style={styles.draftBadge}><ThemedText style={styles.draftBadgeText}>Draft</ThemedText></View>
                    )}
                    {!p.is_active && (
                      <View style={styles.inactiveBadge}><ThemedText style={styles.inactiveBadgeText}>Hidden</ThemedText></View>
                    )}
                  </View>

                  <ThemedText style={styles.programmeTitle}>{p.title}</ThemedText>

                  <View style={styles.metaRow}>
                    <Ionicons name="cash-outline" size={12} color={palette.gray300} />
                    <ThemedText style={styles.metaText}>KES {Number(p.programme_price_kes).toLocaleString()}</ThemedText>
                    <ThemedText style={styles.metaText}>· {p.deposit_pct}% deposit</ThemedText>
                    <ThemedText style={styles.metaText}>· every {p.instalment_frequency_weeks}w</ThemedText>
                  </View>
                </View>

                <View style={styles.switchCol}>
                  <Switch
                    value={p.is_active}
                    onValueChange={() => toggleActive(p)}
                    trackColor={{ false: palette.border, true: palette.ink900 }}
                    thumbColor={palette.white}
                  />
                  <ThemedText style={styles.switchColLabel}>{p.is_active ? 'Live' : 'Off'}</ThemedText>
                </View>
              </View>

              {p.slug ? (
                <TouchableOpacity style={styles.linkRow} onPress={() => copyLink(p.slug!)} activeOpacity={0.7}>
                  <Ionicons name="link-outline" size={13} color={palette.blue500} />
                  <ThemedText style={styles.linkText} numberOfLines={1}>activecitypass.com/gym-programmes/{p.slug}</ThemedText>
                  {copied === p.slug
                    ? <ThemedText style={styles.copiedText}>Copied!</ThemedText>
                    : <Ionicons name="copy-outline" size={13} color={palette.blue500} />}
                </TouchableOpacity>
              ) : null}

              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(p)} activeOpacity={0.7}>
                  <Ionicons name="pencil-outline" size={14} color={palette.ink600} />
                  <ThemedText style={styles.actionBtnText}>Edit</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnBlue]}
                  onPress={() => router.push(`/partner/programme-enrollments/${p.id}` as any)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="people-outline" size={14} color={palette.blue600} />
                  <ThemedText style={[styles.actionBtnText, styles.actionBtnTextBlue]}>Enrollments</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnRed]} onPress={() => deleteProgramme(p)} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={14} color={palette.danger600} />
                  <ThemedText style={[styles.actionBtnText, styles.actionBtnTextRed]}>Delete</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <ThemedText style={styles.modalCancel}>Cancel</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.modalTitle}>{editingId ? 'Edit Programme' : 'New Programme'}</ThemedText>
            <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {saving
                ? <ActivityIndicator color={palette.blue500} size="small" />
                : <ThemedText style={styles.modalSave}>Save</ThemedText>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">

            <MField label="Programme Photo">
              <TouchableOpacity style={styles.imagePicker} onPress={pickImage} disabled={imageUploading} activeOpacity={0.8}>
                {form.image_url ? (
                  <Image source={{ uri: form.image_url }} style={styles.imagePreview} contentFit="cover" />
                ) : imageUploading ? (
                  <View style={styles.imagePlaceholder}>
                    <ActivityIndicator color={palette.blue500} />
                    <ThemedText style={styles.imagePlaceholderText}>Uploading…</ThemedText>
                  </View>
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="camera-outline" size={28} color={palette.gray300} />
                    <ThemedText style={styles.imagePlaceholderText}>Add Programme Photo</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
            </MField>

            {gyms.length > 1 && (
              <MField label="Venue *">
                <View style={styles.chipGrid}>
                  {gyms.map(g => (
                    <TouchableOpacity key={g.id}
                      style={[styles.chip, form.gym_id === g.id && styles.chipActive]}
                      onPress={() => setForm(f => ({ ...f, gym_id: g.id, intro_session_id: '', instructor_id: '' }))}>
                      <ThemedText style={[styles.chipText, form.gym_id === g.id && styles.chipTextActive]}>{g.name}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </MField>
            )}

            <MField label="Title *">
              <TextInput
                style={[styles.input, titleError && styles.inputError]}
                placeholder="e.g. Martial Arts Fundamentals"
                placeholderTextColor={palette.gray300}
                value={form.title}
                onChangeText={t => { setF('title', t); if (titleError) setTitleError(false); }}
              />
              {titleError && <ThemedText style={styles.fieldError}>Please enter a title</ThemedText>}
            </MField>

            <MField label="Category">
              <TextInput style={styles.input} placeholder="e.g. Martial Arts"
                placeholderTextColor={palette.gray300} value={form.category}
                onChangeText={t => setF('category', t)} />
            </MField>

            <MField label="Intro Session *">
              <ThemedText style={styles.fieldHint}>
                An existing class at this venue customers book as a trial before committing to the full programme.
              </ThemedText>
              {gymSessions.length === 0 ? (
                <ThemedText style={styles.fieldHint}>No sessions found for this venue — create one first from the Sessions tab.</ThemedText>
              ) : (
                <View style={styles.chipGrid}>
                  {gymSessions.map(s => (
                    <TouchableOpacity key={s.id}
                      style={[styles.chip, form.intro_session_id === s.id && styles.chipActive]}
                      onPress={() => setF('intro_session_id', s.id)}>
                      <ThemedText style={[styles.chipText, form.intro_session_id === s.id && styles.chipTextActive]}>
                        {s.name}{s.recurring ? ' (recurring)' : ''}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </MField>

            {gymTrainers.length > 0 && (
              <MField label="Instructor (optional)">
                <View style={styles.chipGrid}>
                  <TouchableOpacity
                    style={[styles.chip, !form.instructor_id && styles.chipActive]}
                    onPress={() => setF('instructor_id', '')}>
                    <ThemedText style={[styles.chipText, !form.instructor_id && styles.chipTextActive]}>Unassigned</ThemedText>
                  </TouchableOpacity>
                  {gymTrainers.map(t => (
                    <TouchableOpacity key={t.id}
                      style={[styles.chip, form.instructor_id === t.id && styles.chipActive]}
                      onPress={() => setF('instructor_id', t.id)}>
                      <ThemedText style={[styles.chipText, form.instructor_id === t.id && styles.chipTextActive]}>{t.full_name}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </MField>
            )}

            <View style={styles.row}>
              <MField label="Programme weeks *" style={{ flex: 1 }}>
                <TextInput style={styles.input} placeholder="12" placeholderTextColor={palette.gray300}
                  value={form.programme_weeks} keyboardType="number-pad"
                  onChangeText={t => setF('programme_weeks', t.replace(/[^0-9]/g, ''))} />
              </MField>
              <MField label="Session duration (min)" style={{ flex: 1 }}>
                <TextInput style={styles.input} placeholder="60" placeholderTextColor={palette.gray300}
                  value={form.duration_minutes} keyboardType="number-pad"
                  onChangeText={t => setF('duration_minutes', t.replace(/[^0-9]/g, ''))} />
              </MField>
            </View>

            <View style={styles.row}>
              <MField label="Full programme price (KES) *" style={{ flex: 1 }}>
                <TextInput style={styles.input} placeholder="e.g. 24000" placeholderTextColor={palette.gray300}
                  value={form.programme_price_kes} keyboardType="decimal-pad"
                  onChangeText={t => setF('programme_price_kes', t)} />
              </MField>
              <MField label="Max participants" style={{ flex: 1 }}>
                <TextInput style={styles.input} placeholder="20" placeholderTextColor={palette.gray300}
                  value={form.max_participants} keyboardType="number-pad"
                  onChangeText={t => setF('max_participants', t.replace(/[^0-9]/g, ''))} />
              </MField>
            </View>

            <View style={styles.row}>
              <MField label="Deposit %" style={{ flex: 1 }}>
                <TextInput style={styles.input} placeholder="30" placeholderTextColor={palette.gray300}
                  value={form.deposit_pct} keyboardType="number-pad"
                  onChangeText={t => setF('deposit_pct', t.replace(/[^0-9]/g, ''))} />
              </MField>
              <MField label="Instalment every X weeks" style={{ flex: 1 }}>
                <TextInput style={styles.input} placeholder="4" placeholderTextColor={palette.gray300}
                  value={form.instalment_frequency_weeks} keyboardType="number-pad"
                  onChangeText={t => setF('instalment_frequency_weeks', t.replace(/[^0-9]/g, ''))} />
              </MField>
            </View>

            <MField label="Description (optional)">
              <TextInput style={[styles.input, styles.textarea]}
                placeholder="Describe what the programme covers…"
                placeholderTextColor={palette.gray300} value={form.description} multiline numberOfLines={4}
                textAlignVertical="top"
                onChangeText={t => setF('description', t)} />
            </MField>

            <FormSection label="Visibility" />

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.switchLabel}>Show to customers</ThemedText>
                <ThemedText style={styles.switchSub}>Toggle off to hide this programme without deleting it</ThemedText>
              </View>
              <Switch
                value={form.is_active}
                onValueChange={v => setF('is_active', v)}
                trackColor={{ false: palette.border, true: palette.ink900 }}
                thumbColor={palette.white}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.switchLabel}>Draft</ThemedText>
                <ThemedText style={styles.switchSub}>Keep as draft while you finish setting it up — hidden from customers even if active</ThemedText>
              </View>
              <Switch
                value={form.is_draft}
                onValueChange={v => setF('is_draft', v)}
                trackColor={{ false: palette.border, true: palette.ink900 }}
                thumbColor={palette.white}
              />
            </View>

            <FormSection label="Cancellation Policy" />
            <ThemedText style={styles.fieldHint}>
              Override your venue's default policy for this programme. Leave at "Venue default" to inherit.
            </ThemedText>

            <MField label="Free cancellation window">
              <View style={styles.chipGrid}>
                {CUTOFF_OPTIONS.map(h => {
                  const label = h === null ? 'Venue default' : h === 0 ? 'None' : `${h}h`;
                  const active = form.cancellation_cutoff_hours === h;
                  return (
                    <TouchableOpacity key={String(h)} style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setF('cancellation_cutoff_hours', h ?? null)}>
                      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </MField>

            <MField label="No-show grace period">
              <View style={styles.chipGrid}>
                {NO_SHOW_OPTIONS.map(m => {
                  const label = m === null ? 'Venue default' : m === 0 ? 'Immediate' : `${m} min`;
                  const active = form.no_show_grace_mins === m;
                  return (
                    <TouchableOpacity key={String(m)} style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setF('no_show_grace_mins', m ?? null)}>
                      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </MField>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnLoading]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color={palette.white} size="small" />
                : <ThemedText style={styles.saveBtnText}>{editingId ? 'Save Changes' : 'Create Programme'}</ThemedText>}
            </TouchableOpacity>

          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function MField({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ marginBottom: 18 }, style]}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      {children}
    </View>
  );
}

function FormSection({ label }: { label: string }) {
  return (
    <View style={styles.formSection}>
      <ThemedText style={styles.formSectionLabel}>{label}</ThemedText>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.surfaceApp },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 64, paddingBottom: 16,
    backgroundColor: palette.white, borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  headerTitle: { fontSize: fontSize.xl, fontWeight: '800', color: palette.ink900 },
  headerSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.ink900,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill,
  },
  addBtnText: { color: palette.white, fontSize: fontSize.sm, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.ink700, marginBottom: 8 },
  emptySub: { fontSize: fontSize.sm, color: palette.gray300, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: { backgroundColor: palette.ink900, paddingHorizontal: 24, paddingVertical: 13, borderRadius: radii.pill },
  emptyBtnText: { color: palette.white, fontWeight: '700', fontSize: fontSize.sm },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline, overflow: 'hidden',
  },
  cardInactive: { borderColor: palette.border },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  cardLeft: { flex: 1 },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  programmeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#eef2ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
  },
  programmeText: { fontSize: fontSize.xs, fontWeight: '700', color: '#4f46e5' },
  draftBadge: {
    backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
  },
  draftBadgeText: { fontSize: fontSize.xs, fontWeight: '700', color: '#92400e' },
  inactiveBadge: {
    backgroundColor: palette.surfaceApp, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
    borderWidth: 1, borderColor: palette.border,
  },
  inactiveBadgeText: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450 },

  programmeTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaText: { fontSize: fontSize.xs, color: palette.gray300 },

  cardImage: { width: '100%', height: 140 },

  switchCol: { alignItems: 'center', gap: 4, paddingTop: 2 },
  switchColLabel: { fontSize: 10, fontWeight: '600', color: palette.gray300 },

  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: palette.blue25, borderTopWidth: 1, borderTopColor: palette.blue100,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  linkText: { flex: 1, fontSize: fontSize.xs, color: palette.blue500, fontWeight: '500' },
  copiedText: { fontSize: fontSize.xs, color: palette.success700, fontWeight: '700' },

  cardActions: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: palette.hairline,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: radii.md,
    borderWidth: 1, borderColor: palette.border, backgroundColor: palette.white,
  },
  actionBtnBlue: { borderColor: palette.blue100, backgroundColor: palette.blue25 },
  actionBtnRed: { borderColor: palette.danger50, backgroundColor: palette.danger50 },
  actionBtnText: { fontSize: fontSize.xs, color: palette.ink600, fontWeight: '600' },
  actionBtnTextBlue: { color: palette.blue600 },
  actionBtnTextRed: { color: palette.danger600 },

  modal: { flex: 1, backgroundColor: palette.white },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: palette.hairline,
  },
  modalCancel: { fontSize: fontSize.base, color: palette.gray450, minWidth: 60 },
  modalTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  modalSave: { fontSize: fontSize.base, color: palette.blue500, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  modalForm: { padding: 20, paddingBottom: 60 },

  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink600, marginBottom: 8 },
  fieldHint: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 6, marginBottom: 8, lineHeight: 16 },
  fieldError: { fontSize: fontSize.xs, color: palette.danger600, marginTop: 6 },
  inputError: { borderColor: palette.danger600 },
  input: {
    borderRadius: radii.md, padding: 14, fontSize: fontSize.base, color: palette.ink900,
    borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceMuted,
  },
  textarea: { height: 110, paddingTop: 12 },

  formSection: {
    marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12,
    backgroundColor: palette.surfaceApp, borderTopWidth: 1, borderTopColor: palette.hairline,
    marginBottom: 20, marginTop: 4,
  },
  formSectionLabel: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray300, letterSpacing: 0.8 },

  saveBtn: {
    backgroundColor: palette.ink900, borderRadius: radii.pill,
    paddingVertical: 16, alignItems: 'center', marginTop: 12, marginBottom: 8,
  },
  saveBtnLoading: { opacity: 0.7 },
  saveBtnText: { color: palette.white, fontWeight: '700', fontSize: fontSize.base },

  row: { flexDirection: 'row', gap: 12 },

  imagePicker: {
    borderRadius: radii.md, overflow: 'hidden',
    borderWidth: 1.5, borderColor: palette.border, borderStyle: 'dashed',
  },
  imagePreview: { width: '100%', height: 160 },
  imagePlaceholder: {
    height: 160, alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: palette.surfaceMuted,
  },
  imagePlaceholderText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray450 },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, paddingVertical: 14,
  },
  switchLabel: { fontSize: fontSize.base, color: palette.ink900, fontWeight: '500' },
  switchSub: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 2, lineHeight: 16 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1,
    borderColor: palette.hairline, backgroundColor: palette.surfaceApp,
  },
  chipActive: { borderColor: palette.blue600, backgroundColor: '#f0f5ff' },
  chipText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray300 },
  chipTextActive: { color: palette.blue600 },
});
