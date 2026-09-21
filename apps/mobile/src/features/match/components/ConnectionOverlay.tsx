import { Pressable, View } from 'react-native';

import { Spinner } from '@/core/animation/loops';
import { colors } from '@/core/theme';
import { Button, Display, ModalCard, Txt } from '@/core/ui';
import { services } from '@/services';

import { leaveMatch } from '../hooks/leaveMatch';
import { useConnection, useSnapshot } from '../store/matchStore';

/** Tela 20: overlay "Reconectando…" / "Sem conexão", dirigido pelo estado de conexão do RoomService. */
export function ConnectionOverlay() {
  const connection = useConnection();
  const code = useSnapshot()?.room.code ?? '';
  if (connection.status === 'online') return null;

  return (
    <ModalCard visible scrim={colors.scrimOffline} enter="in">
      {connection.status === 'reconnecting' ? (
        <>
          <Spinner size={64} thickness={4} />
          <Display size={32} center>
            Reconectando…
          </Display>
          <Txt font="body400" size={14} lh={1.4} color={colors.muted} center>
            Sua vaga e seus pontos estão guardados. A partida espera até {connection.secondsLeft}s.
          </Txt>
          <View style={{ alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: colors.surfaceLight, overflow: 'hidden', marginTop: 4 }}>
            <View
              style={{
                height: '100%',
                backgroundColor: colors.accent,
                width: `${Math.min(100, ((connection.timeoutSec - connection.secondsLeft) / connection.timeoutSec) * 100)}%`,
              }}
            />
          </View>
        </>
      ) : (
        <>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.danger,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Display size={32}>!</Display>
          </View>
          <Display size={32} center>
            Sem conexão
          </Display>
          <Txt font="body400" size={14} lh={1.4} color={colors.muted} center>
            Não conseguimos voltar para a sala {code}. Confira o Wi-Fi ou os dados móveis.
          </Txt>
          <Button label="Tentar de novo" height={56} onPress={() => services.room.retryConnection()} style={{ alignSelf: 'stretch', marginTop: 6 }} />
          <Pressable accessibilityRole="button" onPress={() => leaveMatch()} style={{ padding: 6 }}>
            <Txt font="body600" size={14} color={colors.muted}>
              Sair da partida
            </Txt>
          </Pressable>
        </>
      )}
    </ModalCard>
  );
}
