import {
  TextInput,
  View,
  Text,
  StyleSheet,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { palette, radii, fontSize, fontWeight, tokens } from '@/constants/theme';

// ── Input ─────────────────────────────────────────────────────────────────────

export interface InputProps extends TextInputProps {
  variant?: 'default' | 'filled';
  invalid?: boolean;
}

export function Input({ variant = 'default', invalid, style, ...rest }: InputProps) {
  return (
    <TextInput
      placeholderTextColor={palette.gray200}
      style={[
        styles.input,
        variant === 'filled' ? styles.inputFilled : styles.inputDefault,
        invalid ? styles.inputInvalid : styles.inputValid,
        style,
      ]}
      {...rest}
    />
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

export interface FieldProps extends ViewProps {
  label?:    string;
  helper?:   string;
  error?:    string;
  children:  React.ReactNode;
}

export function Field({ label, helper, error, children, style, ...rest }: FieldProps) {
  return (
    <View style={[styles.field, style]} {...rest}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {children}
      {(error || helper) ? (
        <Text style={[styles.fieldHint, error ? styles.fieldError : styles.fieldHelper]}>
          {error ?? helper}
        </Text>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  input: {
    width:          '100%',
    fontSize:       fontSize.base,
    color:          tokens.textStrong,
    paddingHorizontal: 16,
    paddingVertical:   13,
    borderRadius:   radii.md,
    borderWidth:    1.5,
  },
  inputDefault: {
    backgroundColor: palette.white,
  },
  inputFilled: {
    backgroundColor: palette.surfaceMuted,
  },
  inputValid: {
    borderColor: palette.border,
  },
  inputInvalid: {
    borderColor: palette.danger500,
  },

  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize:      fontSize.xs,
    fontWeight:    fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color:         tokens.textSecondary,
  },
  fieldHint: {
    fontSize:   fontSize.xs,
    lineHeight: fontSize.xs * 1.5,
  },
  fieldHelper: {
    color: tokens.textMuted,
  },
  fieldError: {
    color: palette.danger600,
  },
});
