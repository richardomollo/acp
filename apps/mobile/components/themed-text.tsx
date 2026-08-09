import { StyleSheet, Text, type TextProps } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { fontSize, fontWeight, tokens } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
    | 'default'
    | 'title'
    | 'defaultSemiBold'
    | 'subtitle'
    | 'link'
    // DS additions
    | 'body'
    | 'bodyStrong'
    | 'label'
    | 'caption'
    | 'overline'
    | 'display';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        styles[type] ?? styles.default,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  // ── Legacy presets (unchanged so existing code keeps working) ──────────────
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  link: {
    fontSize: 16,
    lineHeight: 30,
    color: tokens.textLink,
  },

  // ── DS type scale ──────────────────────────────────────────────────────────
  display: {
    fontSize: fontSize['4xl'],
    fontWeight: fontWeight.black,
    lineHeight: fontSize['4xl'] * 1.1,
    letterSpacing: -0.5,
    color: tokens.textStrong,
  },
  body: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.base * 1.5,
    color: tokens.textBody,
  },
  bodyStrong: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.base * 1.5,
    color: tokens.textStrong,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: fontSize.sm * 1.4,
    color: tokens.textSecondary,
  },
  caption: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.xs * 1.5,
    color: tokens.textMuted,
  },
  overline: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.textSecondary,
  },
});
