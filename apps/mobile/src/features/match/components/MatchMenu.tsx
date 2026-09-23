import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { colors } from '@/core/theme';
import { Button, Display, IconButton, ModalCard, Txt, toast, useScreenPadding } from '@/core/ui';
import { HowToPlaySheet } from '@/features/catalog/components/HowToPlaySheet';
import { getGameByEngine } from '@/features/catalog/data/games';

import { leaveMatch } from '../hooks/leaveMatch';
import { roomActions } from '../hooks/roomActions';
import { hasMatchToLeave } from '../matchPhase';
import { useMatch } from '../store/matchStore';

/** Pedido de abertura vindo de fora (o botão físico de voltar, no Android). */
let pedirAbertura: (() => void) | null = null;
export const openMatchMenu = () => pedirAbertura?.();

/**
 * A saída da partida, e o único menu dela.
 *
 * Fica no layout do fluxo de partida, e não em cada tela, por dois motivos: assim nenhuma tela
 * nova nasce sem saída, e o botão cai sempre no mesmo canto — quem está no meio de uma votação
 * não deveria ter de procurar onde se sai.
 *
 * Pausar é diferente de sair: a pausa vale para o grupo inteiro (o servidor congela a rodada),
 * então quando alguém pausa, o menu abre no celular de todos.
 */
export function MatchMenu() {
  const match = useMatch();
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [regras, setRegras] = useState(false);

  useEffect(() => {
    pedirAbertura = () => setAberto(true);
    return () => {
      pedirAbertura = null;
    };
  }, []);

  const pausada = Boolean(match?.room.paused);
  // Pausa de outra pessoa abre o menu aqui também: é a sala inteira que parou.
  useEffect(() => {
    if (pausada) setAberto(true);
  }, [pausada]);

  const pad = useScreenPadding();
  if (!match) return null;
  const { room, isHost } = match;
  const game = getGameByEngine(room.gameId);
  if (!hasMatchToLeave(room.phase)) return null;

  const fechar = () => {
    setConfirmando(false);
    setAberto(false);
    if (pausada) roomActions.setPaused(false);
  };

  const sair = async () => {
    setConfirmando(false);
    setAberto(false);
    await leaveMatch();
    toast('Você saiu da partida', 'neutral');
  };

  return (
    <>
      {/* Canto superior direito, discreto: presente sem disputar atenção com a rodada. */}
      <View style={{ position: 'absolute', top: pad.paddingTop, right: pad.paddingHorizontal }} pointerEvents="box-none">
        <IconButton label="Menu da partida" size={40} bg={colors.overlayDarkSoft} onPress={() => setAberto(true)}>
          <Txt font="body700" size={17} color={colors.muted}>
            ✕
          </Txt>
        </IconButton>
      </View>

      <ModalCard visible={aberto && !regras} onRequestClose={fechar}>
        {!confirmando ? (
          <>
            <Display size={34} center>
              {pausada ? 'Partida pausada' : 'Menu'}
            </Display>
            <Txt font="body400" size={14} lh={1.4} color={colors.muted} center>
              {pausada
                ? 'A rodada parou para todo mundo.'
                : `Rodada ${room.roundIndex}${room.totalRounds ? ` de ${room.totalRounds}` : ''}. Ninguém além de você vê este menu.`}
            </Txt>

            <Button label={pausada ? 'Continuar' : 'Voltar ao jogo'} height={56} onPress={fechar} style={{ alignSelf: 'stretch', marginTop: 6 }} />

            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
              {!pausada && (
                <Button label="Pausar" variant="tertiary" height={50} radius={16} fontSize={18} onPress={() => roomActions.setPaused(true)} style={{ flex: 1 }} />
              )}
              <Button label="Regras" variant="tertiary" height={50} radius={16} fontSize={18} onPress={() => setRegras(true)} style={{ flex: 1 }} />
            </View>

            <Button
              label="Sair da partida"
              variant="tertiary"
              height={50}
              radius={16}
              fontSize={18}
              onPress={() => setConfirmando(true)}
              style={{ alignSelf: 'stretch' }}
              textColor={colors.danger}
            />
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
                : 'Os outros continuam sem você, e você perde os pontos desta partida.'}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 6 }}>
              <Button label="Ficar" variant="tertiary" height={56} fontSize={20} onPress={() => setConfirmando(false)} style={{ flex: 1 }} />
              <Button label="Sair" variant="destructive" height={56} fontSize={20} onPress={sair} style={{ flex: 1 }} />
            </View>
          </>
        )}
      </ModalCard>

      {game && <HowToPlaySheet game={game} visible={regras} onClose={() => setRegras(false)} />}
    </>
  );
}
