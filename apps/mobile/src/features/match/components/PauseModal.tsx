import { useState } from 'react';
import { View } from 'react-native';

import { colors } from '@/core/theme';
import { Button, Display, ModalCard, Txt, toast } from '@/core/ui';
import { HowToPlaySheet } from '@/features/catalog/components/HowToPlaySheet';
import { getGame } from '@/features/catalog/data/games';

import { leaveMatch } from '../hooks/leaveMatch';
import { roomActions } from '../hooks/roomActions';
import type { MatchView } from '../store/matchStore';

/** Tela 19: Pausar / Sair. Visível enquanto `room.paused` for verdadeiro. */
export function PauseModal({ match }: { match: MatchView }) {
  const [askQuit, setAskQuit] = useState(false);
  const [rules, setRules] = useState(false);
  const { room, isHost } = match;
  const game = getGame(room.gameId);

  const resume = () => {
    setAskQuit(false);
    roomActions.setPaused(false);
  };

  const quit = async () => {
    setAskQuit(false);
    await leaveMatch();
    toast('Você saiu da partida', 'neutral');
  };

  return (
    <>
      <ModalCard visible={room.paused && !rules} onRequestClose={resume}>
        {!askQuit ? (
          <>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: colors.surfaceLight,
                flexDirection: 'row',
                gap: 6,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View style={{ width: 7, height: 24, borderRadius: 3, backgroundColor: colors.text }} />
              <View style={{ width: 7, height: 24, borderRadius: 3, backgroundColor: colors.text }} />
            </View>
            <Display size={34} center>
              Partida pausada
            </Display>
            <Txt font="body400" size={14} lh={1.4} color={colors.muted} center>
              O cronômetro parou para todos. Rodada {room.roundIndex} de {room.totalRounds}.
            </Txt>
            <Button label="Continuar" height={56} onPress={resume} style={{ alignSelf: 'stretch', marginTop: 6 }} />
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
              <Button label="Regras" variant="tertiary" height={50} radius={16} fontSize={18} onPress={() => setRules(true)} style={{ flex: 1 }} />
              <Button
                label="Sair da partida"
                variant="tertiary"
                height={50}
                radius={16}
                fontSize={18}
                onPress={() => setAskQuit(true)}
                style={{ flex: 1 }}
                textColor={colors.danger}
              />
            </View>
          </>
        ) : (
          <>
            <Txt size={40}>👋</Txt>
            <Display size={34} center>
              Sair da partida?
            </Display>
            <Txt font="body400" size={14} lh={1.4} color={colors.muted} center>
              {isHost
                ? `Você é o host: se sair, outro jogador assume e a sala ${room.code} continua sem você.`
                : 'Os outros continuam sem você. Você perde os pontos desta rodada.'}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 6 }}>
              <Button label="Ficar" variant="tertiary" height={56} fontSize={20} onPress={() => setAskQuit(false)} style={{ flex: 1 }} />
              <Button label="Sair" variant="destructive" height={56} fontSize={20} onPress={quit} style={{ flex: 1 }} />
            </View>
          </>
        )}
      </ModalCard>
      {game && <HowToPlaySheet game={game} visible={rules} onClose={() => setRules(false)} />}
    </>
  );
}
