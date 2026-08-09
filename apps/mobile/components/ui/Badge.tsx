import { View, Text, type ViewProps, StyleSheet } from 'react-native';
import { palette, radii, fontSize, fontWeight } from '@/constants/theme';

type Variant = 'accent' | 'neutral' | 'success' | 'danger' | 'ink' | 'outline';

export interface BadgeProps extends ViewProps {
  label:    string;
  variant?: Variant;
}

const variantStyles: Record<Variant, { bg: string; text: string; border?: string }> = {
  accent:  { bg: palette.blue50,       text: palette.blue500 },
  neutral: { bg: palette.hairline,     text: palette.gray450 },
  success: { bg: palette.success50,    text: palette.success700 },
  danger:  { bg: palette.danger600,    text: '#ffffff' },
  ink:     { bg: palette.ink900,       text: '#ffffff' },
  outline: { bg: 'transparent',        text: palette.gray450, border: palette.border },
};

export function Badge({ label, variant = 'accent', style, ...rest }: BadgeProps) {
  const v = variantStyles[variant];
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: v.bg },
        v.border ? { borderWidth: 1, borderColor: v.border } : undefined,
        style,
      ]}
      {...rest}
    >
      <Text style={[styles.label, { color: v.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf:      'flex-start',
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:   radii.md,
  },
  label: {
    fontSize:   fontSize.xs,
    fontWeight: fontWeight.bold,
    lineHeight: fontSize.xs * 1.4,
  },
});
