import { StyleSheet, Text, TouchableOpacity, type TouchableOpacityProps, ActivityIndicator } from 'react-native';
import { palette, radii, fontSize, fontWeight, tokens } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger';
type Size    = 'sm' | 'md' | 'lg';

export interface ButtonProps extends TouchableOpacityProps {
  variant?:  Variant;
  size?:     Size;
  label:     string;
  loading?:  boolean;
  block?:    boolean;
}

export function Button({
  variant  = 'primary',
  size     = 'md',
  label,
  loading  = false,
  block    = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={isDisabled}
      style={[
        styles.base,
        styles[`size_${size}`],
        styles[`variant_${variant}`],
        block && styles.block,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#fff' : palette.ink900}
        />
      ) : (
        <Text
          style={[
            styles.label,
            styles[`label_${size}`],
            styles[`labelColor_${variant}`],
            isDisabled && styles.labelDisabled,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   radii.pill,
    borderWidth:    1.5,
    borderColor:    'transparent',
  },
  block: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },

  // ── Sizes ──────────────────────────────────────────────────────────────────
  size_sm: { paddingHorizontal: 18, paddingVertical:  9 },
  size_md: { paddingHorizontal: 24, paddingVertical: 13 },
  size_lg: { paddingHorizontal: 30, paddingVertical: 16 },

  // ── Variants ───────────────────────────────────────────────────────────────
  variant_primary:   { backgroundColor: palette.ink900, borderColor: palette.ink900 },
  variant_secondary: { backgroundColor: 'transparent',  borderColor: palette.ink900 },
  variant_ghost:     { backgroundColor: 'transparent',  borderColor: 'transparent' },
  variant_subtle:    { backgroundColor: palette.surfaceMuted, borderColor: palette.border },
  variant_danger:    { backgroundColor: 'transparent',  borderColor: palette.danger50 },

  // ── Label base ─────────────────────────────────────────────────────────────
  label: {
    fontWeight: fontWeight.bold,
    letterSpacing: -0.1,
  },
  label_sm: { fontSize: fontSize.sm },
  label_md: { fontSize: fontSize.base },
  label_lg: { fontSize: fontSize.lg },

  // ── Label colors ───────────────────────────────────────────────────────────
  labelColor_primary:   { color: '#ffffff' },
  labelColor_secondary: { color: palette.ink900 },
  labelColor_ghost:     { color: palette.blue500 },
  labelColor_subtle:    { color: palette.ink600 },
  labelColor_danger:    { color: palette.danger600 },
  labelDisabled:        {},
});
