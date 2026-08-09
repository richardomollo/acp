import { View, type ViewProps, StyleSheet } from 'react-native';
import { palette, radii, shadows } from '@/constants/theme';

type Radius = 'lg' | 'xl' | '2xl';

export interface CardProps extends ViewProps {
  elevated?: boolean;
  radius?:   Radius;
}

const radiusMap: Record<Radius, number> = {
  lg:   radii.lg,
  xl:   radii.xl,
  '2xl': radii['2xl'],
};

export function Card({ elevated, radius = 'lg', style, ...rest }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        { borderRadius: radiusMap[radius] },
        elevated && shadows.md,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: palette.white,
    borderWidth:     1,
    borderColor:     palette.borderFaint,
    overflow:        'hidden',
  },
});
