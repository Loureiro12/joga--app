import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { Dice } from '@/core/illustrations';
import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, IconButton, Overline, ProgressRing, RoundProgress, Screen, Spacer, Txt, WaitingButton } from '@/core/ui';
import { formatClock } from '@/core/utils/format';
import { haptics } from '@/core/utils/haptics';

import { PauseModal } from '../components/PauseModal';
import { roomActions } from '../hooks/roomActions';
import { useRoundTimer } from '../hooks/useRoundTimer';
import { useImpostorMatch } from '../store/matchStore';

const timerColor = (sec: number) => (sec <= 10 ? colors.danger : sec <= 20 ? colors.accent : colors.primary);

/** Tela 13: Rodada + cronômetro (e o modal de pausa, tela 19). */
export function RoundScreen() {
  const match = useImpostorMatch();
  const remaining = useRoundTimer(match?.round?.timer);
  const prev = useRef(remaining);

  // Vibração no fim do tempo.
  useEffect(() => {
    if (prev.current !== undefined && prev.current > 0 && remaining === 0) haptics.error();
    prev.current = remaining;
  }, [remaining]);

  if (!match || !match.round) return null;
  const { room, round, isHost, player, displayName } = match;
  const { timer } = round;

  return (
    <Screen
      header={
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Display size={40}>
              Rodada {round.index}
              <Display size={22} color={colors.muted}>
                /{room.totalRounds}
              </Display>
            </Display>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ backgroundColor: colors.surface, borderRadius: radii.pill, paddingVertical: 8, paddingHorizontal: 10 }}>
                <Overline>{round.category}</Overline>
              </View>
              <IconButton label="Pausar partida" size={40} onPress={() => roomActions.setPaused(true)}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <View style={{ width: 4, height: 14, borderRadius: 2, backgroundColor: colors.text }} />
                  <View style={{ width: 4, height: 14, borderRadius: 2, backgroundColor: colors.text }} />
                </View>
              </IconButton>
            </View>
          </View>
          <RoundProgress total={room.totalRounds} current={round.index} />
        </View>
      }
    >
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Dice size={56} />
        <View style={{ flex: 1 }}>
          <Overline>Quem começa</Overline>
          <Display size={34} style={{ marginTop: 4 }} numberOfLines={1}>
            {displayName(round.starterId)}
          </Display>
        </View>
      </View>

      <Txt size={17} lh={1.4}>
        Dê uma pista relacionada à palavra. Uma frase, sem repetir a dos outros.
      </Txt>

      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <ProgressRing size={96} thickness={9} progress={remaining / timer.durationSec} color={timerColor(remaining)}>
          <Display size={30} tabular accessibilityLabel={`${remaining} segundos restantes`}>
            {formatClock(remaining)}
          </Display>
        </ProgressRing>
        <View style={{ flex: 1, gap: 8 }}>
          <Overline>Cronômetro da rodada</Overline>
          {isHost ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                label={timer.running && remaining > 0 ? 'Pausar' : remaining === 0 ? 'Acabou' : 'Iniciar'}
                height={44}
                radius={14}
                fontSize={18}
                disabled={remaining === 0}
                onPress={() => roomActions.setTimerRunning(!timer.running)}
                style={{ flex: 1 }}
              />
              <Button label="↺" variant="tertiary" height={44} radius={14} fontSize={18} onPress={() => roomActions.resetTimer()} style={{ width: 44, paddingHorizontal: 0 }} />
            </View>
          ) : (
            <Txt size={13} lh={1.4} color={colors.muted}>
              O host controla o tempo. Quando todos derem pistas, a votação abre sozinha.
            </Txt>
          )}
        </View>
      </View>

      <View>
        <Overline style={{ marginBottom: 10 }}>Ordem</Overline>
        <View style={{ gap: 6 }}>
          {round.order.map((id, i) => {
            const p = player(id);
            if (!p) return null;
            return (
              <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 6, opacity: i === 0 ? 1 : 0.75 }}>
                <Display size={14} color={colors.muted} style={{ width: 18 }}>
                  {i + 1}
                </Display>
                <Avatar name={p.name} color={p.color} size={34} />
                <Txt font="body600" size={16} style={{ flex: 1 }}>
                  {displayName(id)}
                </Txt>
                <Txt font="body600" size={12} color={i === 0 ? colors.accent : colors.muted}>
                  {i === 0 ? 'Agora' : i === 1 ? 'Próximo' : ''}
                </Txt>
              </View>
            );
          })}
        </View>
      </View>

      <Spacer />

      {isHost ? (
        <Button label="Todos deram pistas → Votar" variant="action" onPress={() => roomActions.openVoting()} />
      ) : (
        <WaitingButton label="Aguardando o host abrir a votação" />
      )}

      <PauseModal match={match} />
    </Screen>
  );
}
