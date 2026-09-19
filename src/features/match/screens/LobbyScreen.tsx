import * as Clipboard from 'expo-clipboard';
import { Pressable, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors, radii } from '@/core/theme';
import { Avatar, Button, Chip, Display, Overline, Screen, Spacer, Txt, WaitingButton, toast } from '@/core/ui';
import { plural } from '@/core/utils/format';
import { getGame } from '@/features/catalog/data/games';
import { services } from '@/services';

import { PlayerCard, WaitingSlot } from '../components/cards';
import { IMPOSTOR_RULES } from '../games/impostor';
import { leaveMatch } from '../hooks/leaveMatch';
import { useMatch } from '../store/matchStore';

export const roomLink = (code: string) => `https://jogae.app/j/${code}`;

/** Telas 9 e 11: Lobby do host e do convidado. */
export function LobbyScreen() {
  const match = useMatch();
  if (!match) return null;
  const { room, players, me, host, isHost, connectedPlayers } = match;
  const game = getGame(room.gameId);
  const connected = connectedPlayers.length;
  const canStart = connected >= IMPOSTOR_RULES.minPlayers;
  const others = players.filter((p) => p.id !== me.id);

  const copy = async () => {
    await Clipboard.setStringAsync(room.code);
    toast('Código copiado');
  };
  const share = () =>
    Share.share({ message: `Entra na minha sala do Jogaê! Código ${room.code} · ${roomLink(room.code)}` }).catch(() => {});

  return (
    <Screen
      header={
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Display size={32}>{isHost ? 'Sala criada 🎉' : 'Você entrou 🎉'}</Display>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => leaveMatch()}>
            <Txt font="body600" size={14} color={colors.muted}>
              {isHost ? 'Fechar' : 'Sair da sala'}
            </Txt>
          </Pressable>
        </View>
      }
    >
      {isHost ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.cardLg, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <View style={{ flex: 1 }}>
            <Overline>Código da sala</Overline>
            <Display size={72} ls={6} color={colors.accent} style={{ marginTop: 6 }} accessibilityLabel={`Código ${room.code.split('').join(' ')}`}>
              {room.code}
            </Display>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Chip label="Copiar" state="soft" size="sm" onPress={copy} />
              <Chip label="Compartilhar" state="soft" size="sm" onPress={share} />
            </View>
          </View>
          <View style={{ width: 96, height: 96, borderRadius: 14, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' }}>
            <QRCode value={roomLink(room.code)} size={80} color={colors.background} backgroundColor={colors.text} />
          </View>
        </View>
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.list, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {host && <Avatar name={host.name} color={host.color} size={44} />}
          <View style={{ flex: 1 }}>
            <Txt font="body600" size={15}>
              Sala do {host?.name ?? 'host'}
            </Txt>
            <Txt font="body400" size={12} color={colors.muted}>
              {game?.name} · {room.category} · {room.totalRounds} rodadas
            </Txt>
          </View>
          <Display size={26} ls={2} color={colors.accent}>
            {room.code}
          </Display>
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Display size={20}>
          {connected} {plural(connected, 'jogador conectado', 'jogadores conectados')}
        </Display>
        <Txt size={13} color={colors.muted}>
          de {room.maxPlayers}
        </Txt>
      </View>

      <View style={{ gap: 8 }}>
        <PlayerCard player={me} label="Você" badge={isHost ? 'host' : 'you'} highlight />
        {others.map((p) => (
          <PlayerCard key={p.id} player={p} badge={p.isHost ? 'host' : undefined} />
        ))}
        {players.length < room.maxPlayers && <WaitingSlot />}
      </View>

      <Spacer />

      {isHost ? (
        <>
          <Button
            label={canStart ? 'Começar partida' : `Mínimo ${IMPOSTOR_RULES.minPlayers} jogadores`}
            disabled={!canStart}
            onPress={() => services.room.startMatch()}
          />
          <Txt font="body400" size={12} color={colors.muted} center>
            Só o host pode iniciar
          </Txt>
        </>
      ) : (
        <WaitingButton label="Aguardando o host começar" />
      )}
    </Screen>
  );
}
