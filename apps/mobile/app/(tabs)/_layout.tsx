import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/lib/auth-ctx.js';
import { COLORS } from '../../src/lib/colors.js';

interface TabIconProps {
  glyph: string;
  color: string;
  primary?: boolean;
}

function TabIcon({ glyph, color, primary }: TabIconProps): JSX.Element {
  if (primary) {
    return (
      <View style={styles.primary}>
        <Text style={styles.primaryGlyph}>{glyph}</Text>
      </View>
    );
  }
  return (
    <View style={styles.icon}>
      <Text style={{ fontSize: 18, color }}>{glyph}</Text>
    </View>
  );
}

export default function TabsLayout(): JSX.Element {
  const { user, loading } = useAuth();
  if (loading) return <></>;
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.blue700,
        tabBarInactiveTintColor: COLORS.ink3,
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderTopColor: COLORS.line,
          height: 76,
          paddingTop: 8,
          paddingBottom: 22,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Comunidad',
          tabBarLabel: 'Comunidad',
          tabBarIcon: ({ color }) => <TabIcon glyph="◫" color={color} />,
        }}
      />
      <Tabs.Screen
        name="nuevo"
        options={{
          title: 'Reportar',
          tabBarLabel: '',
          tabBarIcon: ({ color }) => <TabIcon glyph="+" color={color} primary />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color }) => <TabIcon glyph="◉" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center' },
  primary: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.blue700,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -18,
    shadowColor: COLORS.blue700, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  primaryGlyph: { color: 'white', fontSize: 30, fontWeight: '600', lineHeight: 32 },
});
