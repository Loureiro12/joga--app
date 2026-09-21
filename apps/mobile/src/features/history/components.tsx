import { View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Display, Txt } from '@/core/ui';
import { formatPoints } from '@/core/utils/format';
import { getGame } from '@/features/catalog/data/games';

import { whenLabel } from './historyDates';
import type { HistoryEntry } from './HistoryService';

export const positionLabel = (position: number) => (position === 1 ? '🥇 1º' : `${position}º`);

/** Linha de partida: compacta (Perfil: ícone 38) ou completa (Histórico: ícone 44 + pontos). */
export function HistoryRow({ entry, compact }: { entry: HistoryEntry; compact?: boolean }) {
  const game = getGame(entry.gameId);
  const icon = compact ? 38 : 44;
  const bg = game?.color === colors.surface ? colors.surfaceLight : (game?.color ?? colors.surfaceLight);
  const detail = [whenLabel(entry.endedAt), `${entry.players} jogadores`, compact ? null : entry.wordCategory].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radii.input, paddingVertical: 12, paddingHorizontal: 14 }}>
      <View style={{ width: icon, height: icon, borderRadius: compact ? 12 : 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={compact ? 18 : 20}>{game?.emoji ?? '🎲'}</Txt>
      </View>
      <View style={{ flex: 1 }}>
        <Txt font="body600" size={15} numberOfLines={1}>
          {game?.name ?? 'Jogo'}
        </Txt>
        <Txt font="body400" size={12} color={colors.muted} numberOfLines={1}>
          {detail}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Display font="display700" size={compact ? 15 : 16} color={entry.won ? colors.accent : colors.muted}>
          {positionLabel(entry.position)}
        </Display>
        {!compact && (
          <Txt size={11} color={colors.muted}>
            {formatPoints(entry.points)} pts
          </Txt>
        )}
      </View>
    </View>
  );
}
