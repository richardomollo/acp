import { ReactNode } from 'react';
import { Modal, View, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { palette, radii, fontSize } from '@/constants/theme';

/**
 * Pill-shaped search trigger that opens a full-screen modal on tap — the
 * same interaction used on the Home and Discover tabs. The modal owns the
 * actual TextInput (autoFocus); callers supply the results content and the
 * live query value/handler so search logic stays screen-specific.
 */
export function SearchTrigger({ placeholder, onPress }: { placeholder: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.trigger} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="search" size={16} color={palette.gray300} />
      <ThemedText style={s.triggerPlaceholder}>{placeholder}</ThemedText>
    </TouchableOpacity>
  );
}

export function SearchModal({
  visible, query, onQueryChange, onClose, placeholder, children,
}: {
  visible: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  placeholder: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modal}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={palette.ink900} />
          </TouchableOpacity>
          <TextInput
            style={s.input}
            placeholder={placeholder}
            placeholderTextColor={palette.gray300}
            value={query}
            onChangeText={onQueryChange}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SearchResultRow({
  image, fallbackIcon, fallbackBg, name, subtitle, onPress, rounded,
}: {
  image: string | null;
  fallbackIcon: keyof typeof Ionicons.glyphMap;
  fallbackBg?: string;
  name: string;
  subtitle: string;
  onPress: () => void;
  rounded?: boolean;
}) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress}>
      {image ? (
        <Image source={{ uri: image }} style={[s.thumb, rounded && { borderRadius: 24 }]} />
      ) : (
        <View style={[s.thumb, s.thumbFallback, rounded && { borderRadius: 24 }, fallbackBg ? { backgroundColor: fallbackBg } : null]}>
          <Ionicons name={fallbackIcon} size={20} color="rgba(255,255,255,0.5)" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <ThemedText style={s.rowName} numberOfLines={1}>{name}</ThemedText>
        <ThemedText style={s.rowSub} numberOfLines={1}>{subtitle}</ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={palette.gray300} />
    </TouchableOpacity>
  );
}

export function SearchEmpty({ query }: { query: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name="search-outline" size={40} color={palette.gray300} />
      <ThemedText style={s.emptyText}>No results for &quot;{query}&quot;</ThemedText>
    </View>
  );
}

const s = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.surfaceMuted, borderRadius: radii.xl, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: palette.borderFaint },
  triggerPlaceholder: { fontSize: fontSize.base, color: palette.gray300, flex: 1 },

  modal: { flex: 1, backgroundColor: palette.white },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.hairline, gap: 10 },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 42, backgroundColor: palette.surfaceMuted, borderRadius: radii.xl, paddingHorizontal: 16, fontSize: fontSize.base, color: palette.ink900, borderWidth: 1, borderColor: palette.borderFaint },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 14, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  thumb: { width: 48, height: 48, borderRadius: 10 },
  thumbFallback: { backgroundColor: palette.navy, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900, letterSpacing: -0.2 },
  rowSub: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: fontSize.base, color: palette.gray300, textAlign: 'center' },
});
