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

type Offering = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  duration_minutes: number;
  price_kes: number | null;
  max_participants: number;
  is_active: boolean;
  is_draft: boolean;
  slug: string | null;
  location_details: string | null;
  meeting_link: string | null;
  service_zones: string[];
  image_url: string | null;
  is_programme: boolean;
  programme_weeks: number | null;
  programme_price_kes: number | null;
  intro_price_kes: number | null;
  deposit_pct: number | null;
  instalment_frequency_weeks: number | null;
  cancellation_cutoff_hours: number | null;
  no_show_grace_mins: number | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_TYPES: Array<{ key: string; label: string; icon: string; hint: string }> = [
  { key: '1-on-1',     label: '1-on-1',      icon: 'person-outline',         hint: 'Dedicated slot with a single client' },
  { key: 'group',      label: 'Group',        icon: 'people-outline',         hint: 'Capacity-capped class (e.g. 8 people)' },
  { key: 'online',     label: 'Online',       icon: 'videocam-outline',       hint: 'Video call – link shared after booking' },
  { key: 'outdoor',    label: 'Outdoor',      icon: 'leaf-outline',           hint: 'Park or public space session' },
  { key: 'home-visit', label: 'Home Visit',   icon: 'home-outline',           hint: 'You travel to the client' },
  { key: 'drop-in',    label: 'Drop-in',      icon: 'business-outline',       hint: 'Operating out of a partner gym' },
];

const TYPE_MAP = Object.fromEntries(SESSION_TYPES.map(t => [t.key, t]));
const DISPLAYABLE_TYPES = SESSION_TYPES.filter(t => t.key !== 'group');

const CUTOFF_OPTIONS = [null, 0, 1, 2, 4, 12, 24, 48, 72] as const;
const NO_SHOW_OPTIONS = [null, 0, 5, 10, 15, 30] as const;
const DEPOSIT_OPTIONS = [null, 10, 20, 25, 30, 40, 50] as const;

const BLANK_FORM = {
  title: '', description: '', type: '1-on-1',
  duration_minutes: '60', price_kes: '',
  max_participants: '1', is_active: true,
  location_details: '', meeting_link: '',
  service_zones: '', image_url: '',
  is_programme: false,
  programme_weeks: '', programme_price_kes: '',
  intro_price_kes: '', deposit_pct: '30',
  instalment_frequency_weeks: '',
  cancellation_cutoff_hours: null as number | null,
  no_show_grace_mins: null as number | null,
};

const BOOKING_BASE = 'https://activecitypass.com/book/';

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PTOfferingsScreen() {
  const router = useRouter();
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [ptId, setPtId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [imageUploading, setImageUploading] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [titleError, setTitleError] = useState(false);
  const [initialForm, setInitialForm] = useState(BLANK_FORM);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: pt } = await supabase
      .from('personal_trainers').select('id').eq('user_id', user.id).single();
    if (!pt) return;
    setPtId(pt.id);
    const { data } = await supabase
      .from('pt_offerings').select('*').eq('pt_id', pt.id).order('created_at', { ascending: false });
    setOfferings((data as any) || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openNew = () => {
    setEditingId(null);
    setTitleError(false);
    setForm({ ...BLANK_FORM });
    setInitialForm({ ...BLANK_FORM });
    setShowModal(true);
  };

  const openEdit = (o: Offering) => {
    const f = {
      title: o.title,
      description: o.description ?? '',
      type: o.type,
      duration_minutes: String(o.duration_minutes),
      price_kes: o.price_kes != null ? String(o.price_kes) : '',
      max_participants: String(o.max_participants),
      is_active: o.is_active,
      location_details: o.location_details ?? '',
      meeting_link: o.meeting_link ?? '',
      service_zones: (o.service_zones ?? []).join(', '),
      image_url: o.image_url ?? '',
      is_programme: o.is_programme ?? false,
      programme_weeks: o.programme_weeks != null ? String(o.programme_weeks) : '',
      programme_price_kes: o.programme_price_kes != null ? String(o.programme_price_kes) : '',
      intro_price_kes: o.intro_price_kes != null ? String(o.intro_price_kes) : '',
      deposit_pct: o.deposit_pct != null ? String(o.deposit_pct) : '30',
      instalment_frequency_weeks: o.instalment_frequency_weeks != null ? String(o.instalment_frequency_weeks) : '',
      cancellation_cutoff_hours: o.cancellation_cutoff_hours ?? null,
      no_show_grace_mins: o.no_show_grace_mins ?? null,
    };
    setEditingId(o.id);
    setTitleError(false);
    setForm(f);
    setInitialForm(f);
    setShowModal(true);
  };

  const handleCancel = () => {
    const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
    if (isDirty) {
      Alert.alert('Discard changes?', 'You have unsaved changes.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => setShowModal(false) },
      ]);
    } else {
      setShowModal(false);
    }
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add a session image.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.85, base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const { uri, base64 } = result.assets[0];
    setImageUploading(true);
    try {
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const filename = `pt-offerings/${ptId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const { data, error } = await supabase.storage
        .from('fitpass-images')
        .upload(filename, bytes, { contentType: mimeType, upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('fitpass-images').getPublicUrl(data.path);
      setForm(f => ({ ...f, image_url: urlData.publicUrl }));
    } catch (e: any) {
      Alert.alert('Upload failed', e.message || 'Could not upload image');
    } finally {
      setImageUploading(false);
    }
  };

  const generateSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') +
    '-' + Math.random().toString(36).substring(2, 6);

  const handleSave = async () => {
    if (!form.title.trim()) { setTitleError(true); return; }
    setTitleError(false);
    if (!ptId) return;
    setSaving(true);

    const payload: any = {
      pt_id: ptId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      type: form.type,
      duration_minutes: parseInt(form.duration_minutes) || 60,
      is_active: form.is_active,
      is_draft: false,
      location_details: form.location_details.trim() || null,
      meeting_link: form.meeting_link.trim() || null,
      service_zones: form.service_zones
        ? form.service_zones.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      image_url: form.image_url || null,
      is_programme: form.is_programme,
    };

    if (form.is_programme) {
      const introKes = form.intro_price_kes ? parseFloat(form.intro_price_kes) : null;
      payload.price_kes = introKes;
      payload.max_participants = 1;
      payload.programme_weeks = form.programme_weeks ? parseInt(form.programme_weeks) : null;
      payload.programme_price_kes = form.programme_price_kes ? parseFloat(form.programme_price_kes) : null;
      payload.intro_price_kes = introKes;
      payload.deposit_pct = form.deposit_pct ? parseInt(form.deposit_pct) : null;
      payload.instalment_frequency_weeks = form.instalment_frequency_weeks ? parseInt(form.instalment_frequency_weeks) : null;
    } else {
      payload.price_kes = form.price_kes ? parseFloat(form.price_kes) : null;
      payload.max_participants = parseInt(form.max_participants) || 1;
      payload.programme_weeks = null;
      payload.programme_price_kes = null;
      payload.intro_price_kes = null;
      payload.instalment_frequency_weeks = null;
    }

    payload.cancellation_cutoff_hours = form.cancellation_cutoff_hours;
    payload.no_show_grace_mins = form.no_show_grace_mins;

    try {
      if (editingId) {
        const { error } = await supabase.from('pt_offerings').update(payload).eq('id', editingId);
        if (error) throw error;
        setOfferings(prev => prev.map(o => o.id === editingId ? { ...o, ...payload } : o));
      } else {
        const slug = generateSlug(form.title);
        const { data, error } = await supabase.from('pt_offerings')
          .insert({ ...payload, slug }).select().single();
        if (error) throw error;
        setOfferings(prev => [data as any, ...prev]);
      }
      setShowModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save offering');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (o: Offering) => {
    setOfferings(prev => prev.map(x => x.id === o.id ? { ...x, is_active: !x.is_active } : x));
    const { error } = await supabase
      .from('pt_offerings').update({ is_active: !o.is_active }).eq('id', o.id);
    if (error) {
      setOfferings(prev => prev.map(x => x.id === o.id ? { ...x, is_active: o.is_active } : x));
      Alert.alert('Error', 'Could not update offering visibility');
    }
  };

  const deleteOffering = (o: Offering) => {
    Alert.alert('Delete Offering', `Delete "${o.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('pt_offerings').delete().eq('id', o.id);
          if (error) { Alert.alert('Error', 'Could not delete offering'); return; }
          setOfferings(prev => prev.filter(x => x.id !== o.id));
        },
      },
    ]);
  };

  const copyLink = (slug: string) => {
    Clipboard.setString(BOOKING_BASE + slug);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Offerings</ThemedText>
          <ThemedText style={styles.headerSub}>Manage your sessions and programmes</ThemedText>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNew} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel="Add new offering">
          <Ionicons name="add" size={18} color={palette.white} />
          <ThemedText style={styles.addBtnText}>New</ThemedText>
        </TouchableOpacity>
      </View>

      {/* Availability info callout */}
      {!loading && !bannerDismissed && (
        <View style={styles.availBanner} accessibilityRole="none" accessible
          accessibilityLabel="Tap the clock icon on any session to set session-specific hours, or use the Availability tab for your default schedule.">
          <Ionicons name="time-outline" size={18} color={palette.warning800} />
          <ThemedText style={styles.availBannerText}>
            Tap the <ThemedText style={styles.availBannerBold}>clock icon</ThemedText> on any session to set session-specific hours, or use the <ThemedText style={styles.availBannerBold}>Availability</ThemedText> tab for your default schedule.
          </ThemedText>
          <TouchableOpacity onPress={() => setBannerDismissed(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button" accessibilityLabel="Dismiss tip">
            <Ionicons name="close" size={16} color={palette.warning800} />
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={palette.ink900} /></View>
      ) : offerings.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="list-outline" size={48} color={palette.gray200} style={{ marginBottom: 12 }} />
          <ThemedText style={styles.emptyTitle}>No offerings yet</ThemedText>
          <ThemedText style={styles.emptySub}>Create your first session so clients can book you.</ThemedText>
          <TouchableOpacity style={styles.emptyBtn} onPress={openNew} activeOpacity={0.85}>
            <ThemedText style={styles.emptyBtnText}>Create first offering</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {offerings.map(o => {
            return (
              <View key={o.id} style={[styles.card, !o.is_active && styles.cardInactive]}>

                {/* Session image */}
                {o.image_url ? (
                  <Image source={{ uri: o.image_url }} style={styles.cardImage} contentFit="cover" />
                ) : null}

                <View style={styles.cardMain}>
                  <View style={styles.cardLeft}>
                    {/* Badge row */}
                    <View style={styles.badgeRow}>
                      {o.is_programme ? (
                        <View style={styles.programmeBadge}>
                          <Ionicons name="trophy-outline" size={11} color="#4f46e5" />
                          <ThemedText style={styles.programmeText}>
                            {o.programme_weeks ? `${o.programme_weeks}W ` : ''}Programme
                          </ThemedText>
                        </View>
                      ) : o.type.split(',').filter(Boolean).map(t => {
                        const tm = TYPE_MAP[t];
                        return (
                          <View key={t} style={styles.typeBadge}>
                            <Ionicons name={tm?.icon as any ?? 'person-outline'} size={11} color={palette.blue600} />
                            <ThemedText style={styles.typeText}>{tm?.label ?? t}</ThemedText>
                          </View>
                        );
                      })}
                      {!o.is_active && (
                        <View style={styles.inactiveBadge}>
                          <ThemedText style={styles.inactiveBadgeText}>Hidden</ThemedText>
                        </View>
                      )}
                    </View>

                    <ThemedText style={styles.offeringTitle}>{o.title}</ThemedText>

                    <View style={styles.metaRow}>
                      {o.is_programme ? (
                        <>
                          <Ionicons name="calendar-outline" size={12} color={palette.gray300} />
                          <ThemedText style={styles.metaText}>{o.programme_weeks} weeks</ThemedText>
                          {o.programme_price_kes ? (
                            <ThemedText style={styles.metaText}>· KES {Number(o.programme_price_kes).toLocaleString()}</ThemedText>
                          ) : null}
                          {o.intro_price_kes != null ? (
                            <ThemedText style={styles.metaText}>
                              {o.intro_price_kes === 0 ? '· Free intro' : `· KES ${Number(o.intro_price_kes).toLocaleString()} intro`}
                            </ThemedText>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Ionicons name="time-outline" size={12} color={palette.gray300} />
                          <ThemedText style={styles.metaText}>{o.duration_minutes} min</ThemedText>
                          {o.price_kes ? (
                            <ThemedText style={styles.metaText}>· KES {o.price_kes.toLocaleString()}</ThemedText>
                          ) : null}
                          {o.max_participants > 1 ? (
                            <ThemedText style={styles.metaText}>· up to {o.max_participants} pax</ThemedText>
                          ) : null}
                        </>
                      )}
                    </View>

                    {o.location_details ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={12} color={palette.gray450} />
                        <ThemedText style={styles.infoText} numberOfLines={1}>{o.location_details}</ThemedText>
                      </View>
                    ) : null}
                    {o.meeting_link ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="videocam-outline" size={12} color={palette.gray450} />
                        <ThemedText style={styles.infoText}>Link set</ThemedText>
                      </View>
                    ) : null}
                    {o.service_zones.length > 0 ? (
                      <View style={styles.infoRow}>
                        <Ionicons name="map-outline" size={12} color={palette.gray450} />
                        <ThemedText style={styles.infoText} numberOfLines={1}>{o.service_zones.join(', ')}</ThemedText>
                      </View>
                    ) : null}
                  </View>

                  {/* Active toggle */}
                  <View style={styles.switchCol}>
                    <Switch
                      value={o.is_active}
                      onValueChange={() => toggleActive(o)}
                      trackColor={{ false: palette.border, true: palette.ink900 }}
                      thumbColor={palette.white}
                      accessibilityLabel={`${o.title} active`}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: o.is_active }}
                    />
                    <ThemedText style={styles.switchColLabel}>{o.is_active ? 'Live' : 'Off'}</ThemedText>
                  </View>
                </View>

                {/* Shareable booking link */}
                {o.slug ? (
                  <TouchableOpacity style={styles.linkRow} onPress={() => copyLink(o.slug!)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel="Copy booking link">
                    <Ionicons name="link-outline" size={13} color={palette.blue500} />
                    <ThemedText style={styles.linkText} numberOfLines={1}>
                      activecitypass.com/book/{o.slug}
                    </ThemedText>
                    {copied === o.slug
                      ? <ThemedText style={styles.copiedText}>Copied!</ThemedText>
                      : <Ionicons name="copy-outline" size={13} color={palette.blue500} />}
                  </TouchableOpacity>
                ) : null}

                {/* Actions */}
                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(o)} activeOpacity={0.7}>
                    <Ionicons name="pencil-outline" size={14} color={palette.ink600} />
                    <ThemedText style={styles.actionBtnText}>Edit</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnBlue]}
                    onPress={() => router.push({ pathname: '/pt-offering-availability', params: { offeringId: o.id, title: o.title } })}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="time-outline" size={14} color={palette.blue600} />
                    <ThemedText style={[styles.actionBtnText, styles.actionBtnTextBlue]}>Hours</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnRed]} onPress={() => deleteOffering(o)} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={14} color={palette.danger600} />
                    <ThemedText style={[styles.actionBtnText, styles.actionBtnTextRed]}>Delete</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <ThemedText style={styles.modalCancel}>Cancel</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.modalTitle}>{editingId ? 'Edit Offering' : 'New Offering'}</ThemedText>
            <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {saving
                ? <ActivityIndicator color={palette.blue500} size="small" />
                : <ThemedText style={styles.modalSave}>Save</ThemedText>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">

            {/* Session image */}
            <MField label="Session Photo">
              <TouchableOpacity style={styles.imagePicker} onPress={pickImage} disabled={imageUploading} activeOpacity={0.8}>
                {form.image_url ? (
                  <>
                    <Image source={{ uri: form.image_url }} style={styles.imagePreview} contentFit="cover" />
                    <View style={styles.imageEditBadge}>
                      <Ionicons name="camera" size={14} color={palette.white} />
                    </View>
                    <TouchableOpacity
                      style={styles.imageRemoveBtn}
                      onPress={e => { e.stopPropagation?.(); setForm(f => ({ ...f, image_url: '' })); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button" accessibilityLabel="Remove photo"
                    >
                      <Ionicons name="close" size={13} color={palette.white} />
                    </TouchableOpacity>
                  </>
                ) : imageUploading ? (
                  <View style={styles.imagePlaceholder}>
                    <ActivityIndicator color={palette.blue500} />
                    <ThemedText style={styles.imagePlaceholderText}>Uploading…</ThemedText>
                  </View>
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="camera-outline" size={28} color={palette.gray300} />
                    <ThemedText style={styles.imagePlaceholderText}>Add Session Photo</ThemedText>
                    <ThemedText style={styles.imagePlaceholderSub}>16:9 ratio recommended</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
            </MField>

            <MField label="Title *">
              <TextInput
                style={[styles.input, titleError && styles.inputError]}
                placeholder="e.g. 1-on-1 Weight Loss Session"
                placeholderTextColor={palette.gray300}
                value={form.title}
                autoFocus={!editingId}
                returnKeyType="next"
                onChangeText={t => { setForm(f => ({ ...f, title: t })); if (titleError) setTitleError(false); }}
              />
              {titleError && <ThemedText style={styles.fieldError}>Please enter a title</ThemedText>}
            </MField>

            {/* ── Programme ─────────────────────────────────────────────────── */}
            <FormSection label="Programme" />

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.switchLabel}>Multi-week Programme</ThemedText>
                <ThemedText style={styles.switchSub}>
                  Enable for structured programmes with deposits and instalments
                </ThemedText>
              </View>
              <Switch
                value={form.is_programme}
                onValueChange={v => setForm(f => ({
                  ...f,
                  is_programme: v,
                  type: !v && f.type.includes(',') ? f.type.split(',')[0] : f.type,
                }))}
                trackColor={{ false: palette.border, true: palette.navy }}
                thumbColor={palette.white}
                accessibilityRole="switch"
                accessibilityLabel="Multi-week programme"
                accessibilityState={{ checked: form.is_programme }}
              />
            </View>

            {form.is_programme && (
              <View style={styles.programmeSection}>
                <View style={styles.row}>
                  <MField label="Programme weeks" style={{ flex: 1 }}>
                    <TextInput style={[styles.input, styles.inputOnTint]} placeholder="12" placeholderTextColor={palette.gray300}
                      value={form.programme_weeks} keyboardType="number-pad"
                      onChangeText={t => setForm(f => ({ ...f, programme_weeks: t.replace(/[^0-9]/g, '') }))} />
                  </MField>
                  <MField label="Deposit %" style={{ flex: 1 }}>
                    <TextInput style={[styles.input, styles.inputOnTint]} placeholder="30" placeholderTextColor={palette.gray300}
                      value={form.deposit_pct} keyboardType="number-pad"
                      onChangeText={t => setForm(f => ({ ...f, deposit_pct: t.replace(/[^0-9]/g, '') }))} />
                  </MField>
                </View>
                <MField label="Session duration (min)">
                  <TextInput style={[styles.input, styles.inputOnTint]} placeholder="60" placeholderTextColor={palette.gray300}
                    value={form.duration_minutes} keyboardType="number-pad"
                    onChangeText={t => setForm(f => ({ ...f, duration_minutes: t.replace(/[^0-9]/g, '') }))} />
                  <ThemedText style={styles.fieldHint}>Length of each individual session in this programme.</ThemedText>
                </MField>
                <MField label="Full programme price (KES)">
                  <TextInput style={[styles.input, styles.inputOnTint]} placeholder="e.g. 45000" placeholderTextColor={palette.gray300}
                    value={form.programme_price_kes} keyboardType="decimal-pad"
                    onChangeText={t => setForm(f => ({ ...f, programme_price_kes: t }))} />
                </MField>
                <MField label="Intro session price (KES)">
                  <TextInput style={[styles.input, styles.inputOnTint]} placeholder="e.g. 2500" placeholderTextColor={palette.gray300}
                    value={form.intro_price_kes} keyboardType="decimal-pad"
                    onChangeText={t => setForm(f => ({ ...f, intro_price_kes: t }))} />
                  <ThemedText style={styles.fieldHint}>Enter 0 for a free intro session.</ThemedText>
                </MField>
                <MField label="Instalment every X weeks (optional)" style={{ marginBottom: 0 }}>
                  <TextInput style={[styles.input, styles.inputOnTint]} placeholder="e.g. 4" placeholderTextColor={palette.gray300}
                    value={form.instalment_frequency_weeks} keyboardType="number-pad"
                    onChangeText={t => setForm(f => ({ ...f, instalment_frequency_weeks: t.replace(/[^0-9]/g, '') }))} />
                  <ThemedText style={styles.fieldHint}>
                    Leave blank if the client pays the remaining balance in one go.
                  </ThemedText>
                </MField>
              </View>
            )}

            {/* ── Session Type ───────────────────────────────────────────────── */}
            <FormSection label={form.is_programme ? 'Session Formats' : 'Session Type'} />

            <MField label={form.is_programme ? 'Formats (select all that apply)' : 'Type *'}>
              <View style={styles.typeGrid}>
                {DISPLAYABLE_TYPES.map(t => {
                  const selectedTypes = form.type.split(',').filter(Boolean);
                  const isSelected = selectedTypes.includes(t.key);
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.typeCard, isSelected && styles.typeCardActive]}
                      onPress={() => {
                        if (form.is_programme) {
                          const next = isSelected
                            ? selectedTypes.filter(x => x !== t.key)
                            : [...selectedTypes, t.key];
                          setForm(f => ({ ...f, type: next.join(',') }));
                        } else {
                          setForm(f => ({
                            ...f, type: t.key,
                            max_participants: t.key === '1-on-1' || t.key === 'online' ? '1' : f.max_participants,
                          }));
                        }
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Ionicons
                        name={t.icon as any}
                        size={18}
                        color={isSelected ? palette.white : palette.ink600}
                      />
                      <ThemedText style={[styles.typeCardLabel, isSelected && styles.typeCardLabelActive]}>
                        {t.label}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <ThemedText style={styles.typeHint}>
                {form.is_programme
                  ? 'Select all session formats included in this programme.'
                  : (TYPE_MAP[form.type]?.hint ?? '')}
              </ThemedText>
            </MField>

            {/* Type-specific fields */}
            {form.type === 'online' && (
              <MField label="Meeting Link (optional)">
                <TextInput style={styles.input} placeholder="https://meet.google.com/…"
                  placeholderTextColor={palette.gray300} value={form.meeting_link}
                  onChangeText={t => setForm(f => ({ ...f, meeting_link: t }))}
                  keyboardType="url" autoCapitalize="none" />
                <ThemedText style={styles.fieldHint}>
                  Shared with the client after you confirm the booking.
                </ThemedText>
              </MField>
            )}

            {(form.type === 'outdoor' || form.type === 'drop-in') && (
              <MField label={form.type === 'outdoor' ? 'Location *' : 'Venue / Address *'}>
                <TextInput style={styles.input}
                  placeholder={form.type === 'outdoor' ? 'e.g. Karura Forest, Nairobi' : 'e.g. Gym 360, Westlands'}
                  placeholderTextColor={palette.gray300} value={form.location_details}
                  onChangeText={t => setForm(f => ({ ...f, location_details: t }))} />
              </MField>
            )}

            {form.type === 'home-visit' && (
              <MField label="Service Areas">
                <TextInput style={styles.input}
                  placeholder="e.g. Westlands, Kilimani, Karen"
                  placeholderTextColor={palette.gray300} value={form.service_zones}
                  onChangeText={t => setForm(f => ({ ...f, service_zones: t }))} />
                <ThemedText style={styles.fieldHint}>
                  Comma-separated areas you travel to. Clients provide their exact address when booking.
                </ThemedText>
              </MField>
            )}

            {form.type === 'group' && (
              <MField label="Venue / Location">
                <TextInput style={styles.input} placeholder="e.g. Studio, Rooftop Garden…"
                  placeholderTextColor={palette.gray300} value={form.location_details}
                  onChangeText={t => setForm(f => ({ ...f, location_details: t }))} />
              </MField>
            )}

            {form.type === '1-on-1' && (
              <MField label="Preferred Venue (optional)">
                <TextInput style={styles.input} placeholder="e.g. Client's gym, Your studio…"
                  placeholderTextColor={palette.gray300} value={form.location_details}
                  onChangeText={t => setForm(f => ({ ...f, location_details: t }))} />
              </MField>
            )}

            {/* ── Schedule & Pricing ─────────────────────────────────────────── */}
            {!form.is_programme && <FormSection label="Schedule & Pricing" />}

            {!form.is_programme && (
              <View style={styles.row}>
                <MField label="Duration (min)" style={{ flex: 1 }}>
                  <TextInput style={styles.input} placeholder="60" placeholderTextColor={palette.gray300}
                    value={form.duration_minutes} keyboardType="number-pad"
                    onChangeText={t => setForm(f => ({ ...f, duration_minutes: t.replace(/[^0-9]/g, '') }))} />
                </MField>
                <MField label="Capacity" style={{ flex: 1 }}>
                  {(() => {
                    const locked = form.type === '1-on-1' || form.type === 'online';
                    return (
                      <TextInput
                        style={[styles.input, locked && styles.inputLocked]}
                        placeholder={form.type === '1-on-1' ? '1' : '8'}
                        placeholderTextColor={palette.gray300}
                        value={form.max_participants}
                        keyboardType="number-pad"
                        editable={!locked}
                        onChangeText={t => setForm(f => ({ ...f, max_participants: t.replace(/[^0-9]/g, '') }))}
                      />
                    );
                  })()}
                </MField>
              </View>
            )}

            {!form.is_programme && (
              <MField label="Price (KES)">
                <TextInput style={styles.input} placeholder="e.g. 2500" placeholderTextColor={palette.gray300}
                  value={form.price_kes} keyboardType="decimal-pad"
                  onChangeText={t => setForm(f => ({ ...f, price_kes: t }))} />
              </MField>
            )}

            {/* ── Description ───────────────────────────────────────────────── */}
            <FormSection label="Description" />

            <MField label="About this session (optional)">
              <TextInput style={[styles.input, styles.textarea]}
                placeholder="Describe what clients can expect…"
                placeholderTextColor={palette.gray300} value={form.description} multiline numberOfLines={4}
                textAlignVertical="top"
                onChangeText={t => setForm(f => ({ ...f, description: t }))} />
            </MField>

            {/* ── Visibility ────────────────────────────────────────────────── */}
            <FormSection label="Visibility" />

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.switchLabel}>Show to clients</ThemedText>
                <ThemedText style={styles.switchSub}>Toggle off to hide this offering without deleting it</ThemedText>
              </View>
              <Switch
                value={form.is_active}
                onValueChange={v => setForm(f => ({ ...f, is_active: v }))}
                trackColor={{ false: palette.border, true: palette.ink900 }}
                thumbColor={palette.white}
                accessibilityRole="switch"
                accessibilityLabel="Show to clients"
                accessibilityState={{ checked: form.is_active }}
              />
            </View>

            {/* ── Cancellation Policy Override ───────────────────────────────── */}
            <FormSection label="Cancellation Policy" />
            <ThemedText style={styles.fieldHint}>
              Override your venue's default policy for this offering. Leave at "Venue default" to inherit.
            </ThemedText>

            <MField label="Free cancellation window">
              <View style={styles.chipGrid}>
                {CUTOFF_OPTIONS.map(h => {
                  const label = h === null ? 'Venue default' : h === 0 ? 'None' : `${h}h`;
                  const active = form.cancellation_cutoff_hours === h;
                  return (
                    <TouchableOpacity
                      key={String(h)}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setForm(f => ({ ...f, cancellation_cutoff_hours: h ?? null }))}
                    >
                      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </MField>

            <MField label="Deposit required">
              <View style={styles.chipGrid}>
                {DEPOSIT_OPTIONS.map(pct => {
                  const label = pct === null ? 'Venue default' : `${pct}%`;
                  const active = form.deposit_pct === (pct === null ? '' : String(pct));
                  return (
                    <TouchableOpacity
                      key={String(pct)}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setForm(f => ({ ...f, deposit_pct: pct === null ? '' : String(pct) }))}
                    >
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
                    <TouchableOpacity
                      key={String(m)}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setForm(f => ({ ...f, no_show_grace_mins: m ?? null }))}
                    >
                      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </MField>

            {/* Bottom save */}
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnLoading]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={editingId ? 'Save changes' : 'Create offering'}
            >
              {saving
                ? <ActivityIndicator color={palette.white} size="small" />
                : <ThemedText style={styles.saveBtnText}>{editingId ? 'Save Changes' : 'Create Offering'}</ThemedText>
              }
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

  availBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: palette.warning50, borderWidth: 1, borderColor: palette.warning100,
    borderRadius: radii.md, padding: 14,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
  },
  availBannerText: { flex: 1, fontSize: fontSize.sm, color: palette.warning800, lineHeight: 18 },
  availBannerBold: { fontWeight: '700', fontSize: fontSize.sm, color: palette.warning800 },

  card: {
    backgroundColor: palette.white, borderRadius: radii.lg,
    borderWidth: 1, borderColor: palette.hairline,
    overflow: 'hidden',
  },
  cardInactive: { borderColor: palette.border },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  cardLeft: { flex: 1 },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: palette.blue25, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
  },
  typeText: { fontSize: fontSize.xs, fontWeight: '600', color: palette.blue600 },
  programmeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#eef2ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
  },
  programmeText: { fontSize: fontSize.xs, fontWeight: '700', color: '#4f46e5' },
  inactiveBadge: {
    backgroundColor: palette.surfaceApp, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
    borderWidth: 1, borderColor: palette.border,
  },
  inactiveBadgeText: { fontSize: fontSize.xs, fontWeight: '600', color: palette.gray450 },

  offeringTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaText: { fontSize: fontSize.xs, color: palette.gray300 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  infoText: { fontSize: fontSize.xs, color: palette.gray450, flex: 1 },

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

  programmeSection: {
    backgroundColor: palette.blue25, borderRadius: radii.md, padding: 14,
    marginTop: 4, marginBottom: 18, borderWidth: 1, borderColor: palette.blue100,
  },

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
  fieldHint: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 6, lineHeight: 16 },
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

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.md,
    borderWidth: 1.5, borderColor: palette.border, backgroundColor: palette.surfaceMuted,
  },
  typeCardActive: { borderColor: palette.ink900, backgroundColor: palette.ink900 },
  typeCardDisabled: { borderColor: palette.hairline, backgroundColor: palette.surfaceApp, opacity: 0.5 },
  typeCardLabel: { fontSize: fontSize.sm, fontWeight: '600', color: palette.ink600 },
  typeCardLabelActive: { color: palette.white },
  typeCardLabelDisabled: { color: palette.gray200 },
  typeHint: { fontSize: fontSize.xs, color: palette.gray300, marginTop: 8, lineHeight: 16 },

  row: { flexDirection: 'row', gap: 12 },

  imagePicker: {
    borderRadius: radii.md, overflow: 'hidden',
    borderWidth: 1.5, borderColor: palette.border, borderStyle: 'dashed',
    position: 'relative',
  },
  imagePreview: { width: '100%', height: 160 },
  imageEditBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radii.pill,
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
  },
  imageRemoveBtn: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radii.pill,
    width: 26, height: 26, alignItems: 'center', justifyContent: 'center',
  },
  inputOnTint: { backgroundColor: palette.white },
  inputLocked: { backgroundColor: palette.surfaceApp, color: palette.gray300 },
  imagePlaceholder: {
    height: 160, alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: palette.surfaceMuted,
  },
  imagePlaceholderText: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray450 },
  imagePlaceholderSub: { fontSize: fontSize.xs, color: palette.gray300 },

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
