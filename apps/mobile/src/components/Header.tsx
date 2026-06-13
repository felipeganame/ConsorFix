import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../lib/colors.js';

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function MobileHeader({ title, subtitle, action }: HeaderProps): JSX.Element {
  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: COLORS.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.ink,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.ink3,
    marginTop: 1,
  },
});
