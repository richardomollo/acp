import { Platform } from 'react-native';

// ─── Raw palette ──────────────────────────────────────────────────────────────

export const palette = {
  // Ink
  ink900: '#000000',
  ink700: '#111111',
  ink600: '#333333',

  // Brand blue
  blue600: '#0026cc',
  blue500: '#002fff',
  blue100: '#d0e0ff',
  blue50:  '#f0f4ff',
  blue25:  '#eef1ff',
  navy:    '#050040',

  // Neutrals
  gray450: '#666666',
  gray300: '#9ca3af',
  gray200: '#bbbbbb',

  // Surfaces & borders
  white:        '#ffffff',
  surfaceApp:   '#f5f5f7',
  surfaceMuted: '#f8f9fa',
  border:       '#e5e7eb',
  borderFaint:  '#eeeeee',
  hairline:     '#f0f0f0',

  // States
  success700: '#15803d',
  success100: '#bbf7d0',
  success50:  '#f0fdf4',
  danger600:  '#dc2626',
  danger500:  '#ef4444',
  danger50:   '#fee2e2',
  warning800: '#92400e',
  warning700: '#b45309',
  warning500: '#f59e0b',
  warning100: '#fde68a',
  warning50:  '#fffbeb',
} as const;

// ─── Semantic tokens ──────────────────────────────────────────────────────────

export const tokens = {
  textStrong:    palette.ink900,
  textBody:      palette.ink600,
  textSecondary: palette.gray450,
  textMuted:     palette.gray300,
  textLink:      palette.blue500,
  textOnDark:    palette.white,

  actionPrimary:      palette.ink900,
  actionPrimaryPress: palette.ink600,
  accent:             palette.blue500,
  focusRing:          palette.blue500,

  surface:      palette.white,
  surfaceApp:   palette.surfaceApp,
  surfaceMuted: palette.surfaceMuted,
  overlay:      'rgba(0,0,0,0.5)',
} as const;

// ─── Colors (kept for backward compat with useThemeColor) ─────────────────────

export const Colors = {
  light: {
    text:             tokens.textBody,
    background:       tokens.surface,
    tint:             palette.blue500,
    icon:             palette.gray450,
    tabIconDefault:   palette.gray300,
    tabIconSelected:  palette.ink900,
  },
  dark: {
    text:             '#ECEDEE',
    background:       '#151718',
    tint:             '#ffffff',
    icon:             '#9BA1A6',
    tabIconDefault:   '#9BA1A6',
    tabIconSelected:  '#ffffff',
  },
} as const;

// ─── Radii ────────────────────────────────────────────────────────────────────

export const radii = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  '2xl': 24,
  pill: 100,
} as const;

// ─── Spacing ──────────────────────────────────────────────────────────────────

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────

// On iOS the system font is SF Pro — no fontFamily needed.
// On Android 'sans-serif' → Roboto, 'sans-serif-medium' → Roboto Medium.
export const fontFamily = Platform.select({
  ios:     { regular: undefined, medium: undefined, semibold: undefined, bold: undefined },
  default: {
    regular:  'sans-serif',
    medium:   'sans-serif-medium',
    semibold: 'sans-serif-medium',
    bold:     'sans-serif-medium',
  },
}) as { regular: string | undefined; medium: string | undefined; semibold: string | undefined; bold: string | undefined };

export const fontWeight = {
  regular:  '400',
  medium:   '500',
  semibold: '600',
  bold:     '700',
  heavy:    '800',
  black:    '900',
} as const;

export const fontSize = {
  xs:   11,
  sm:   13,
  base: 15,
  lg:   17,
  xl:   20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 34,
} as const;

export const lineHeight = {
  tight:   1.1,
  snug:    1.25,
  normal:  1.5,
  relaxed: 1.625,
} as const;

// ─── Shadows ──────────────────────────────────────────────────────────────────

export const shadows = {
  sm: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius:  4,
    elevation:     2,
  },
  md: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius:  8,
    elevation:     4,
  },
  xl: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius:  32,
    elevation:     12,
  },
} as const;

// ─── Fonts (kept for backward compat) ─────────────────────────────────────────

export const Fonts = Platform.select({
  ios: {
    sans:    'system-ui',
    serif:   'ui-serif',
    rounded: 'ui-rounded',
    mono:    'ui-monospace',
  },
  default: {
    sans:    'normal',
    serif:   'serif',
    rounded: 'normal',
    mono:    'monospace',
  },
  web: {
    sans:    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif:   "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono:    "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
