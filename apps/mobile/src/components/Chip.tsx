import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS } from '../lib/colors.js';

interface ChipProps {
  label: string;
  variant?: 'default' | 'crit' | 'med' | 'conduct' | 'ok' | 'blue' | 'dark';
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

const VARIANTS: Record<NonNullable<ChipProps['variant']>, { bg: string; color: string; border: string }> = {
  default: { bg: COLORS.surface, color: COLORS.ink2, border: COLORS.line },
  crit:    { bg: COLORS.criticalBg, color: COLORS.critical, border: '#fecaca' },
  med:     { bg: COLORS.mediumBg, color: '#92400e', border: '#fed7aa' },
  conduct: { bg: COLORS.conductBg, color: COLORS.conduct, border: '#bae6fd' },
  ok:      { bg: COLORS.resolvedBg, color: COLORS.resolved, border: '#bbf7d0' },
  blue:    { bg: COLORS.blue50, color: COLORS.blue700, border: 'transparent' },
  dark:    { bg: COLORS.ink, color: '#fff', border: COLORS.ink },
};

export function Chip({ label, variant = 'default', dot, style }: ChipProps): JSX.Element {
  const v = VARIANTS[variant];
  return (
    <View style={[styles.chip, { backgroundColor: v.bg, borderColor: v.border }, style]}>
      {dot && <View style={[styles.dot, { backgroundColor: v.color }]} />}
      <Text style={[styles.label, { color: v.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
});
