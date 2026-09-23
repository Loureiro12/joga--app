import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { Enter } from '@/core/animation/Enter';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, IconButton, ModalCard, Overline, Screen, Txt, useScreenPadding } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

import { BurningFuse, useBombPulse } from '../components/BurningFuse';
import { useBombSound } from '../useBombSound';
import { bombActions, useBombMatch } from '../bombStore';

/** De quanto em quanto o app confere o relógio. O pavio é um instante absoluto; isto é só a checagem. */
const TICK_MS = 100;

/**
 * A tela da partida inteira: passar o celular, bomba ativa e explosão. Tudo num lugar só porque
 * navegar entre elas piscaria a tela justamente nos momentos de tensão.
 *
 * O cronômetro **nunca** aparece: a incerteza é a mecânica principal do jogo (§13).
 */
export function BombRoundScreen() {
  const match = useBombMatch();
  const [saindo, setSaindo] = useState(false);
  const pad = useScreenPadding();
  const alarmes = useRef(0);
  const shake = useSharedValue(0);
  // O pulso é teatro: sorteia o próprio ritmo e nunca olha o relógio da bomba.
  const pulso = useBombPulse();
  // O som segue a mesma regra, e recebe só o que não denuncia o tempo.
  useBombSound(match?.phase ?? 'handoff', match?.alarmCount ?? 0);

  // O relógio roda enquanto a bomba está acesa. Ao voltar do segundo plano, confere na hora:
  // o pavio é um instante absoluto, então minimizar o app não segura a explosão (§45).
  useEffect(() => {
    if (match?.phase !== 'armed') return;
    const timer = setInterval(bombActions.tick, TICK_MS);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && bombActions.tick());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [match?.phase]);

  // Susto: vibra forte e sacode a tela, sem mexer no pavio. A pessoa acha que perdeu (§38).
  useEffect(() => {
    if (!match || match.alarmCount === alarmes.current) return;
    alarmes.current = match.alarmCount;
    if (match.alarmCount > 0) {
      haptics.heavy();
      shake.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 260 }));
    }
  }, [match, shake]);

  useEffect(() => {
    if (match?.phase === 'exploded') haptics.error();
    if (match?.phase === 'finished') router.replace(routes.bomb.end);
  }, [match?.phase]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value * 14 }] }));

  if (!match) return null;
  const player = (id: string) => match.players.find((p) => p.id === id);
  const active = player(match.activeId);
  const jogou = match.history.length > 0;

  /**
   * A saída. Diferente dos outros jogos, aqui não há sala para deixar: o aparelho é do grupo.
   * Então há duas saídas de verdade — encerrar (vai para o resultado com o que já rolou) e
   * descartar. Encerrar só aparece quando já houve rodada; sem isso, não há resultado nenhum.
   */
  const menu = (
    <>
      <View style={{ position: 'absolute', top: pad.paddingTop, right: pad.paddingHorizontal, zIndex: 10 }} pointerEvents="box-none">
        <IconButton label="Sair da partida" size={40} bg={colors.overlayDarkSoft} onPress={() => setSaindo(true)}>
          <Txt font="body700" size={17} color={colors.muted}>
            ✕
          </Txt>
        </IconButton>
      </View>

      <ModalCard visible={saindo} onRequestClose={() => setSaindo(false)}>
        <Txt size={40}>💣</Txt>
        <Display size={32} center>
          Parar por aqui?
        </Display>
        <Txt font="body400" size={14} lh={1.4} color={colors.muted} center>
          {jogou
            ? `Vocês jogaram ${match.history.length} ${match.history.length === 1 ? 'rodada' : 'rodadas'}. Dá para ver o resultado do que já rolou ou largar tudo.`
            : 'A partida nem começou de verdade — ainda não há resultado para mostrar.'}
        </Txt>
        <Button label="Voltar ao jogo" height={56} onPress={() => setSaindo(false)} style={{ alignSelf: 'stretch', marginTop: 6 }} />
        {jogou && (
          <Button
            label="Encerrar e ver o resultado"
            variant="tertiary"
            height={50}
            radius={16}
            fontSize={18}
            onPress={() => {
              setSaindo(false);
              bombActions.endMatch();
            }}
            style={{ alignSelf: 'stretch' }}
          />
        )}
        <Button
          label="Descartar partida"
          variant="tertiary"
          height={50}
          radius={16}
          fontSize={18}
          textColor={colors.danger}
          onPress={() => {
            setSaindo(false);
            bombActions.leave();
            router.replace(routes.explore);
          }}
          style={{ alignSelf: 'stretch' }}
        />
      </ModalCard>
    </>
  );

  /* ------------------------------------------------ passe o celular para… */
  if (match.phase === 'handoff') {
    return (
      <Screen scroll={false}>
        {menu}
        <Overline>
          {match.settings.totalRounds ? `Rodada ${match.roundIndex} de ${match.settings.totalRounds}` : `Rodada ${match.roundIndex}`}
        </Overline>
        <Enter kind="pop" duration={500} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Txt size={40}>👉</Txt>
          <Txt font="body600" size={16} color={colors.muted}>
            Passe o celular para
          </Txt>
          <Avatar name={active?.name ?? '?'} color={active?.color ?? colors.surface} size={96} />
          <Display size={56} center adjustsFontSizeToFit numberOfLines={1}>
            {active?.name}
          </Display>
          <Txt font="body400" size={14} lh={1.4} color={colors.muted} center style={{ maxWidth: 280 }}>
            A bomba só acende quando {active?.name} tocar em começar.
          </Txt>
        </Enter>
        <Button
          label="Estou pronto 🔥"
          onPress={() => {
            haptics.light();
            bombActions.arm();
          }}
        />
      </Screen>
    );
  }

  /* ------------------------------------------------------------- explosão */
  if (match.phase === 'exploded') {
    const perdedor = player(match.loserId ?? '');
    const vidas = match.settings.mode === 'eliminacao' ? (match.lives[match.loserId ?? ''] ?? 0) : null;
    const eliminado = match.eliminated.includes(match.loserId ?? '');
    return (
      <Screen bg={colors.danger} scroll={false}>
        {menu}
        <Enter kind="pop" duration={500} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Txt size={80}>💥</Txt>
          <Display size={64} center>
            Boom!
          </Display>
          <Txt font="body600" size={15} opacity={0.85} style={{ marginTop: 8 }}>
            A bomba explodiu com
          </Txt>
          <Display size={52} center adjustsFontSizeToFit numberOfLines={1}>
            {perdedor?.name}
          </Display>
          {eliminado ? (
            <Display size={24} center>
              💀 Eliminado
            </Display>
          ) : vidas !== null ? (
            <Txt size={22}>{'❤️'.repeat(vidas) + '🖤'.repeat(Math.max(0, match.settings.lives - vidas))}</Txt>
          ) : (
            <Txt font="body600" size={16} opacity={0.85}>
              💣 {match.bombs[match.loserId ?? '']} no total
            </Txt>
          )}
        </Enter>
        <Button label="Próxima rodada" variant="onColor" onPress={bombActions.nextRound} />
        {match.settings.totalRounds === 0 && <Button label="Encerrar partida" variant="translucent" onPress={bombActions.endMatch} />}
      </Screen>
    );
  }

  /* ---------------------------------------------------------- bomba ativa */
  return (
    <Animated.View style={[{ flex: 1 }, shakeStyle]}>
      <Screen scroll={false}>
        {menu}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Overline color={colors.danger}>💣 Bomba ativa</Overline>
          {/* O ✕ ocupa o canto direito; a categoria recua para não ficar embaixo dele. */}
          <Txt font="body600" size={12} color={colors.muted} style={{ marginRight: 48 }}>
            {match.challenge?.category}
          </Txt>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
          <Animated.View style={[{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 24 }, pulso]}>
            <Display size={34} lh={1.15} center>
              {match.challenge?.text}
            </Display>
          </Animated.View>

          <BurningFuse />

          <View style={{ alignItems: 'center', gap: 6 }}>
            <Txt font="body600" size={14} color={colors.muted}>
              Está com
            </Txt>
            <Display size={44} center adjustsFontSizeToFit numberOfLines={1}>
              {active?.name}
            </Display>
          </View>
        </View>

        {/* Enorme de propósito: a pessoa está sob pressão e precisa acertar o toque sem olhar. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Passar bomba"
          onPress={() => {
            haptics.light();
            bombActions.pass();
          }}
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.primaryLight : colors.primary,
            borderRadius: radii.card,
            paddingVertical: 34,
            alignItems: 'center',
          })}
        >
          <Display size={34}>Passar bomba 💣</Display>
        </Pressable>
      </Screen>
    </Animated.View>
  );
}
