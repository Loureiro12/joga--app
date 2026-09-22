import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { features } from '@/core/config/features';
import { routes } from '@/core/navigation/routes';
import { colors } from '@/core/theme';
import { Avatar, Badge, Chip, Display, ListCard, Screen, Txt } from '@/core/ui';
import { greeting } from '@/core/utils/format';
import { useProfileStore } from '@/features/profile/profileStore';

import { GameCardHero, GameCardMedium } from '../components/GameCards';
import { GAMES, MOODS } from '../data/games';

const QrIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round">
    <Path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M4 12h16" />
  </Svg>
);

/** Tela 5: Home (tab Jogar). */
export function HomeScreen() {
  const { name, color } = useProfileStore();
  const [hero, ...rest] = GAMES;
  const open = (id: string) => router.push(routes.game(id));

  return (
    <Screen
      gap={22} insideTabs
      header={
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Txt size={16} lh={1.3} color={colors.muted}>
              {greeting()} 👋
            </Txt>
            <Display size={44} ls={-0.5} style={{ marginTop: 2 }}>
              Bora jogar?
            </Display>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil" onPress={() => router.navigate(routes.profile)}>
            <Avatar name={name} color={color} size={44} />
          </Pressable>
        </View>
      }
    >
      <GameCardHero game={hero} onPress={() => open(hero.id)} />

      <View style={{ flexDirection: 'row', gap: 12 }}>
        {rest.slice(0, 2).map((g) => (
          <GameCardMedium key={g.id} game={g} onPress={() => open(g.id)} />
        ))}
      </View>

      <ListCard
        icon={<QrIcon />}
        title="Entrar em uma sala"
        subtitle="Código de 4 dígitos ou QR Code do host."
        right={<Txt size={18} color={colors.muted}>→</Txt>}
        onPress={() => router.push(routes.join)}
      />
      {features.premium && (
        <ListCard
          icon={<Txt size={18}>✨</Txt>}
          title="Criar jogo com IA"
          subtitle="Descreva o grupo e a gente monta a brincadeira."
          right={<Badge label="Premium" kind="premiumSolid" />}
          onPress={() => router.push(routes.ai)}
        />
      )}

      <View>
        <Display size={22} style={{ marginBottom: 12 }}>
          Escolha o clima
        </Display>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MOODS.map((m) => (
            <Chip
              key={m.label}
              emoji={m.emoji}
              label={m.label}
              onPress={() => router.navigate({ pathname: routes.explore, params: { filter: m.filter } })}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}
