import { useState } from 'react';
import { View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Button, Display, Screen, Spacer, Txt } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

import type { PlayerId } from '@jogae/engine';
import { VoteCard } from '../../components/cards';
import { roomActions } from '../../hooks/roomActions';
import { useLikelyMatch } from '../../store/matchStore';

/**
 * Votação. Quem pode receber voto vem pronto do servidor (`round.targets`), porque depende de
 * uma opção do host — votar em si mesmo. O voto só sai ao confirmar, e depois não muda.
 */
export function LikelyVoteScreen() {
  const match = useLikelyMatch();
  const [target, setTarget] = useState<PlayerId | null>(null);
  if (!match?.round) return null;
  const { round, players, me, player } = match;

  // Inclui quem está sem sinal: a pergunta é sobre a pessoa, não sobre a conexão dela.
  const candidatos = round.targets.map((id) => players.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const rows: (typeof candidatos)[] = [];
  for (let i = 0; i < candidatos.length; i += 2) rows.push(candidatos.slice(i, i + 2));

  return (
    <Screen
      header={
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 6 }}>
          <Txt font="body600" size={14} color={colors.accent}>
            Quem é mais provável de…
          </Txt>
          <Display size={26} lh={1.15}>
            {round.question}
          </Display>
        </View>
      }
    >
      <View accessibilityRole="radiogroup" style={{ gap: 12 }}>
        {rows.map((row) => (
          <View key={row[0].id} style={{ flexDirection: 'row', gap: 12 }}>
            {row.map((p) => (
              <VoteCard
                key={p.id}
                player={p}
                selected={target === p.id}
                onPress={() => {
                  haptics.selection();
                  setTarget(p.id);
                }}
              />
            ))}
            {row.length === 1 && <View style={{ flex: 1 }} />}
          </View>
        ))}
      </View>

      <Spacer />

      <Button
        variant="action"
        disabled={!target}
        label={target ? `Confirmar voto em ${target === me.id ? 'você mesmo' : player(target)?.name}` : 'Escolha alguém'}
        onPress={() => target && roomActions.castVote(target)}
      />
    </Screen>
  );
}
