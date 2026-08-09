import { useState } from 'react';
import { View, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { useUpdateCheck } from '@/hooks/use-update-check';
import { palette, fontSize, radii } from '@/constants/theme';

export function UpdateBanner() {
  const { updateAvailable, storeUrl } = useUpdateCheck();
  const [dismissed, setDismissed] = useState(false);
  const insets = useSafeAreaInsets();

  if (!updateAvailable || dismissed) return null;

  return (
    <View
      style={[styles.banner, { paddingTop: insets.top + 10 }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={styles.inner}>
        <View style={styles.left}>
          <Ionicons name="rocket-outline" size={18} color={palette.white} />
          <View style={styles.text}>
            <ThemedText style={styles.title}>New Update Available</ThemedText>
            <ThemedText style={styles.sub}>Fresh features are waiting — grab the latest.</ThemedText>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.updateBtn}
            onPress={() => Linking.openURL(storeUrl)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Update app now"
            accessibilityHint="Opens the app store to download the latest version"
          >
            <ThemedText style={styles.updateBtnText}>Update Now</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDismissed(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss update notification"
          >
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: palette.navy,
    paddingHorizontal: 16,
    paddingBottom: 12,
    shadowColor: palette.ink900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    flex: 1,
    gap: 1,
  },
  title: {
    color: palette.white,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  sub: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: fontSize.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  updateBtn: {
    backgroundColor: palette.blue500,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  updateBtnText: {
    color: palette.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
