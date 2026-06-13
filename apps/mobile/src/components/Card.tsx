import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS, RADIUS } from '../lib/colors.js';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }): JSX.Element {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: 14,
  },
  label: {
    fontSize: 11,
    color: COLORS.ink3,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
});
