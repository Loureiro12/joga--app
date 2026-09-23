import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { routes } from '@/core/navigation/routes';
import { Eyes } from '@/core/illustrations';
import { colors } from '@/core/theme';
import { Avatar, Button, Display, Screen, Txt } from '@/core/ui';
import { getGameByEngine } from '@/features/catalog/data/games';

import { leaveMatch } from '../hooks/leaveMatch';
import { useMatch } from '../store/matchStore';

/** Tela 21: Host saiu / Faltou gente. */
export function AbortedScreen() {
  const match = useMatch();
  if (!match) return null;
  const { room, host, others, connectedPlayers } = match;
  const game = getGameByEngine(room.gameId);
  const hostLeft = room.closedReason !== 'not_enough_players';
  const remaining = hostLeft ? others : connectedPlayers;

  return (
    <Screen>
      <Enter kind="pop" duration={600} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <Eyes width={200} variant="down" />
        <Display size={48} center>
          {hostLeft ? 'O host saiu da sala' : 'Faltou gente'}
        </Display>
        <Txt size={15} lh={1.45} color={colors.muted} center style={{ maxWidth: 290 }}>
          {hostLeft
            ? `${host?.name ?? 'O host'} encerrou a partida. Vocês podem continuar juntos em uma sala nova — o placar desta noite fica salvo.`
            : `Ficou gente de menos para continuar a partida. Chamem alguém e criem uma sala nova.`}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          {remaining.slice(0, 5).map((p) => (
            <Avatar key={p.id} name={p.name} color={p.color} size={40} border={{ width: 3, color: colors.background }} style={{ marginLeft: -8 }} />
          ))}
          <Txt size={13} color={colors.muted} style={{ marginLeft: 8 }}>
            {hostLeft ? `${remaining.length} ainda aqui` : `${remaining.length} na sala`}
          </Txt>
        </View>
      </Enter>

      <Button
        label={hostLeft ? 'Criar nova sala com eles' : 'Convidar mais amigos'}
        onPress={() => leaveMatch(hostLeft ? routes.createMatch(room.gameId) : routes.friends)}
      />
      <Button label="Voltar ao início" variant="secondary" onPress={() => leaveMatch()} />
    </Screen>
  );
}
