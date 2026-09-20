import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { spacing } from '@/core/theme';
import { Chip, Display, EmptyState, Screen } from '@/core/ui';

import { GameCardCompact } from '../components/GameCards';
import { EXPLORE_FILTERS, GAMES } from '../data/games';

/** Tela 6: Explorar (tab). */
export function ExploreScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState(EXPLORE_FILTERS[0].id);

  // "Escolha o clima" na Home abre o Explorar já filtrado.
  useEffect(() => {
    if (params.filter && EXPLORE_FILTERS.some((f) => f.id === params.filter)) setFilter(params.filter);
  }, [params.filter]);

  const games = GAMES.filter((g) => g.tags.includes(filter));
  const rows: (typeof games)[] = [];
  for (let i = 0; i < games.length; i += 2) rows.push(games.slice(i, i + 2));

  return (
    <Screen
      insideTabs
      header={
        <Display size={40}>Explorar</Display>
      }
    >
      {/* A linha de chips sangra os 20 px de padding da tela. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -spacing.screenX, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: spacing.screenX, gap: spacing.chipGap }}
      >
        {EXPLORE_FILTERS.map((f) => (
          <Chip key={f.id} label={f.label} state={f.id === filter ? 'filterActive' : 'default'} onPress={() => setFilter(f.id)} />
        ))}
      </ScrollView>

      {rows.length === 0 ? (
        <EmptyState icon="🎲" title="Nada por aqui ainda" subtitle="Estamos preparando jogos novos para esse clima." ctaLabel="Ver em alta" onCta={() => setFilter(EXPLORE_FILTERS[0].id)} />
      ) : (
        <View style={{ gap: 12 }}>
          {rows.map((row) => (
            <View key={row[0].id} style={{ flexDirection: 'row', gap: 12 }}>
              {row.map((g) => (
                <GameCardCompact key={g.id} game={g} onPress={() => router.push(routes.game(g.id))} />
              ))}
              {row.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
