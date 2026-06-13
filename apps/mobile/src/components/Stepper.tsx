import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../lib/colors.js';

export type StepperStep = 1 | 2 | 3;

const STEPS = [
  { n: 1, title: 'Recibido', sub: 'Reporte guardado' },
  { n: 2, title: 'Validado', sub: 'Admin confirmó la categoría' },
  { n: 3, title: 'Resuelto', sub: 'Arreglo finalizado' },
] as const;

interface Props {
  current: StepperStep;
  status?: 'open' | 'discarded';
}

export function Stepper({ current, status = 'open' }: Props): JSX.Element {
  return (
    <View>
      {STEPS.map((s, i) => {
        const done = s.n < current;
        const cur = s.n === current;
        const future = s.n > current;
        const isLast = i === STEPS.length - 1;
        const ringColor = done || cur ? COLORS.blue700 : COLORS.line;
        const fillColor = done || cur ? COLORS.blue700 : COLORS.surface;
        return (
          <View key={s.n} style={[styles.row, !isLast && { paddingBottom: 14 }]}>
            {!isLast && (
              <View
                style={[
                  styles.connector,
                  { backgroundColor: done ? COLORS.blue700 : COLORS.line },
                ]}
              />
            )}
            <View
              style={[
                styles.circle,
                { backgroundColor: fillColor, borderColor: ringColor },
                cur && styles.glow,
              ]}
            >
              {done ? (
                <Text style={styles.check}>✓</Text>
              ) : cur ? (
                <View style={styles.innerDot} />
              ) : (
                <View style={styles.innerDotFuture} />
              )}
            </View>
            <View style={{ flex: 1, paddingTop: 1 }}>
              <Text style={[styles.title, future && styles.titleFuture]}>{s.title}</Text>
              <Text style={styles.sub}>{s.sub}</Text>
            </View>
          </View>
        );
      })}
      {status === 'discarded' && (
        <Text style={styles.discarded}>Ticket descartado por el administrador.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, position: 'relative' },
  connector: {
    position: 'absolute',
    left: 13,
    top: 30,
    width: 2,
    bottom: -2,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  glow: { shadowColor: COLORS.blue700, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  check: { color: 'white', fontSize: 14, fontWeight: '700' },
  innerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'white' },
  innerDotFuture: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.ink4 },
  title: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  titleFuture: { color: COLORS.ink4 },
  sub: { fontSize: 12, color: COLORS.ink3, marginTop: 1 },
  discarded: {
    color: COLORS.critical,
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
