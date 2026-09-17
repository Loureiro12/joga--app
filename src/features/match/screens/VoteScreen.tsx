import { useState } from 'react';
import { View } from 'react-native';

import { colors } from '@/core/theme';
import { Button, Display, Screen, Spacer, Txt } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';
import { services } from '@/services';

import { VoteCard } from '../components/cards';
import type { PlayerId } from '../domain/types';
import { useMatch } from '../store/matchStore';

/** Tela 14: Votação. O voto só sai do aparelho ao confirmar — e não tem volta. */
export function VoteScreen() {
  const match = useMatch();
  const [target, setTarget] = useState<PlayerId | null>(null);
  if (!match) return null;
  const { others, player } = match;

  const rows: (typeof others)[] = [];
  for (let i = 0; i < others.length; i += 2) rows.push(others.slice(i, i + 2));

  return (
    <Screen>
      <View>
        <Display size={40}>Hora de votar 👀</Display>
        <Txt size={16} lh={1.4} color={colors.muted} style={{ marginTop: 6 }}>
          Quem você acha que é o impostor?
        </Txt>
      </View>

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
        label={target ? `Confirmar voto em ${player(target)?.name}` : 'Escolha alguém'}
        onPress={() => target && services.room.castVote(target)}
      />
    </Screen>
  );
}
