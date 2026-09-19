import { Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/core/theme';
import { Display } from '@/core/ui';

const stroke = (color: string) =>
  ({ width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

const ICONS: Record<string, (color: string) => React.ReactNode> = {
  index: (c) => (
    <Svg {...stroke(c)}>
      <Path d="M5 12l7-7 7 7v8H5z" />
    </Svg>
  ),
  explore: (c) => (
    <Svg {...stroke(c)}>
      <Rect x={3} y={3} width={8} height={8} rx={2} />
      <Rect x={13} y={3} width={8} height={8} rx={2} />
      <Rect x={3} y={13} width={8} height={8} rx={2} />
      <Rect x={13} y={13} width={8} height={8} rx={2} />
    </Svg>
  ),
  profile: (c) => (
    <Svg {...stroke(c)}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </Svg>
  ),
};

const LABELS: Record<string, string> = { index: 'Jogar', explore: 'Explorar', profile: 'Perfil' };

/** Bottom nav do design: 3 itens, ícone 24 stroke 2.2 + Barlow 12; ativo amarelo, inativo muted. */
export function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={({ state, navigation }) => (
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            alignItems: 'center',
            paddingTop: 10,
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.surface,
          }}
        >
          {state.routes.map((route, i) => {
            const active = state.index === i;
            const color = active ? colors.accent : colors.muted;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={LABELS[route.name]}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!active && !event.defaultPrevented) navigation.navigate(route.name);
                }}
                style={{ alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 18 }}
              >
                {ICONS[route.name]?.(color)}
                <Display font="display700" size={12} ls={0.6} color={color}>
                  {LABELS[route.name]}
                </Display>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
