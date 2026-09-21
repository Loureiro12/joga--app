import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useAsync } from '@/core/hooks/useAsync';
import { routes } from '@/core/navigation/routes';
import { colors, radii, spacing } from '@/core/theme';
import { Chip, EmptyState, ErrorState, Overline, Screen, Skeleton, StackHeader, StatCard } from '@/core/ui';
import { getGame } from '@/features/catalog/data/games';
import { services } from '@/services';

import { HistoryRow } from './components';
import { periodLabel } from './historyDates';
import type { HistoryEntry } from './HistoryService';

const FILTERS = ['Todas', 'Vitórias', 'Dedução', 'Festa', 'Polêmico', 'Caótico'];

const matches = (filter: string) => (h: HistoryEntry) =>
  filter === 'Todas' || (filter === 'Vitórias' ? h.won : getGame(h.gameId)?.category === filter);

/** Tela 27: Histórico. */
export function HistoryScreen() {
  const [filter, setFilter] = useState(FILTERS[0]);
  const history = useAsync(() => services.history.list());
  const stats = useAsync(() => services.history.stats());

  const entries = history.data?.filter(matches(filter)) ?? [];
  // A lista já vem da mais recente para a mais antiga, então os grupos saem na ordem certa.
  const periods = [...new Set(entries.map((h) => periodLabel(h.endedAt)))];
  const winRate = stats.data?.matches ? `${Math.round((stats.data.wins / stats.data.matches) * 100)}%` : '–';

  return (
    <Screen
      header={
        <StackHeader title="Histórico" onBack={() => router.back()} />
      }
    >
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatCard value={String(stats.data?.matches ?? '–')} label="partidas" />
        <StatCard value={winRate} label="vitórias" color={colors.accent} />
        <StatCard value={getGame(stats.data?.favoriteGameId ?? undefined)?.emoji ?? '–'} label="favorito" />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -spacing.screenX, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: spacing.screenX, gap: spacing.chipGap }}
      >
        {FILTERS.map((f) => (
          <Chip key={f} label={f} size="sm" state={f === filter ? 'filterActive' : 'default'} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>

      {history.loading && (
        <View style={{ gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={68} radius={radii.input} />
          ))}
        </View>
      )}
      {history.error && <ErrorState title="Não deu para carregar" subtitle="Confira a conexão e tente de novo." onRetry={history.reload} />}
      {!history.loading && !history.error && entries.length === 0 && (
        <EmptyState
          icon="🎮"
          title="Nada por aqui"
          subtitle={filter === 'Todas' ? 'Suas partidas aparecem aqui depois do primeiro jogo.' : 'Nenhuma partida com esse filtro ainda.'}
          ctaLabel="Bora jogar"
          onCta={() => router.dismissTo(routes.home)}
        />
      )}

      {periods.map((period) => (
        <View key={period}>
          <Overline style={{ marginBottom: 8 }}>{period}</Overline>
          <View style={{ gap: 8 }}>
            {entries
              .filter((h) => periodLabel(h.endedAt) === period)
              .map((h) => (
                <HistoryRow key={h.id} entry={h} />
              ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
