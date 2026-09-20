import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useAsync } from '@/core/hooks/useAsync';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Avatar, Chip, Display, IconButton, PillButton, PressableScale, Screen, Skeleton, StatCard, Txt } from '@/core/ui';
import { HistoryRow } from '@/features/history/components';
import { usePremiumStore } from '@/features/premium/premiumStore';
import { services } from '@/services';

import { useProfileStore } from '../profileStore';

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: colors.text, strokeWidth: 2.2, strokeLinecap: 'round' } as const;

const PencilIcon = () => (
  <Svg {...iconProps} strokeLinejoin="round">
    <Path d="M4 20h4l10-10-4-4L4 16z" />
    <Path d="M13 7l4 4" />
  </Svg>
);

const GearIcon = () => (
  <Svg {...iconProps}>
    <Circle cx={12} cy={12} r={3} />
    <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
  </Svg>
);

const ACHIEVEMENTS = [
  { label: '🕵️ Mestre do disfarce', featured: false },
  { label: '🔥 10 partidas', featured: false },
  { label: '👑 Rei do grupo', featured: true },
];

/** Tela 23: Perfil (tab). */
export function ProfileScreen() {
  const { name, username, color } = useProfileStore();
  const isPremium = usePremiumStore((s) => s.isPremium);
  const stats = useAsync(() => services.history.stats());
  const recent = useAsync(() => services.history.list());

  return (
    <Screen
      gap={20} insideTabs
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Avatar name={name} color={color} size={72} />
          <View style={{ flex: 1 }}>
            <Display size={30} numberOfLines={1}>
              {name}
            </Display>
            <Txt size={14} color={colors.muted} style={{ marginTop: 4 }}>
              @{username}
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <IconButton label="Editar perfil" size={40} onPress={() => router.push(routes.editProfile)}>
              <PencilIcon />
            </IconButton>
            <IconButton label="Configurações" size={40} onPress={() => router.push(routes.settings)}>
              <GearIcon />
            </IconButton>
          </View>
        </View>
      }
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatCard value={String(stats.data?.matches ?? '–')} label="🎮 partidas" onPress={() => router.push(routes.history)} />
        <StatCard value={String(stats.data?.wins ?? '–')} label="🏆 vitórias" color={colors.accent} />
        <StatCard value={String(stats.data?.friends ?? '–')} label="👥 amigos" onPress={() => router.push(routes.friends)} />
      </View>

      <View>
        <Display size={20} style={{ marginBottom: 10 }}>
          Conquistas
        </Display>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ACHIEVEMENTS.map((a) => (
            <Chip key={a.label} label={a.label} size="sm" state={a.featured ? 'selected' : 'default'} />
          ))}
        </View>
      </View>

      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <Display size={20}>Partidas recentes</Display>
          <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push(routes.history)}>
            <Txt font="body600" size={13} color={colors.primaryLight}>
              Ver todas
            </Txt>
          </Pressable>
        </View>
        <View style={{ gap: 8 }}>
          {recent.loading
            ? [0, 1, 2].map((i) => <Skeleton key={i} height={62} radius={radii.input} />)
            : recent.data?.slice(0, 3).map((h) => <HistoryRow key={h.id} entry={h} compact />)}
        </View>
      </View>

      {!isPremium && (
        <PressableScale
          accessibilityRole="button"
          pressedScale={0.98}
          onPress={() => router.push(routes.premium)}
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, borderRadius: radii.list, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <View style={{ flex: 1 }}>
            <Display size={20}>Desbloqueie tudo.</Display>
            <Txt font="body400" size={12} lh={1.3} color={colors.muted} style={{ marginTop: 4 }}>
              Jogos com IA, categorias exclusivas, partidas ilimitadas.
            </Txt>
          </View>
          <PillButton label="Premium" bg={colors.accent} size={15} padX={14} padY={10} onPress={() => router.push(routes.premium)} />
        </PressableScale>
      )}
    </Screen>
  );
}
