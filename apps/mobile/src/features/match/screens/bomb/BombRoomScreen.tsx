import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Enter } from '@/core/animation/Enter';
import { playSound } from '@/core/audio/sounds';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, Overline, Screen, Txt, WaitingButton } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';
import { BurningFuse, useBombPulse } from '@/features/bomb/components/BurningFuse';
import { HandoffFlash } from '@/features/bomb/components/HandoffFlash';
import { LetterGrid } from '@/features/bomb/components/LetterGrid';
import { useBombSound } from '@/features/bomb/useBombSound';

import { MatchTopRow } from '../../components/MatchMenu';
import { leaveMatch } from '../../hooks/leaveMatch';
import { roomActions } from '../../hooks/roomActions';
import { useBombRoomMatch } from '../../store/matchStore';

/**
 * A Bomba-Relógio com cada um no seu celular.
 *
 * A tela é uma só, como na versão de um aparelho: navegar entre as fases piscaria justamente nos
 * momentos de tensão. O que muda é de quem é a tela — aqui **só quem está com a bomba** vê o
 * botão de passar, e o celular dele avisa com duas batidas quando a vez chega.
 *
 * Nada aqui sabe quando a bomba estoura: o pavio não trafega. A tensão é teatro, e a explosão
 * chega como qualquer outra mudança de fase, vinda do servidor.
 */
export function BombRoomScreen() {
  const match = useBombRoomMatch();
  const alarmes = useRef(0);
  const ultimoAtivo = useRef<string | null>(null);
  const [passagem, setPassagem] = useState<{ name: string; color: string; letter?: string; mine: boolean } | null>(null);
  const shake = useSharedValue(0);
  const pulso = useBombPulse();
  useBombSound(match?.phase ?? 'handoff', match?.alarmCount ?? 0);

  const minhaVez = match ? match.activeId === match.me.id : false;

  /**
   * Duas batidas quando a bomba cai na sua mão. Com o celular no bolso ou na mesa, uma batida só
   * se confundiria com notificação — e perder a vez aqui é perder a rodada.
   */
  useEffect(() => {
    if (!match) return;
    const anterior = ultimoAtivo.current;
    ultimoAtivo.current = match.activeId;
    if (anterior === match.activeId) return;
    if (minhaVez && (match.phase === 'handoff' || match.phase === 'armed')) haptics.turn();
  }, [match, minhaVez]);

  // Susto: sacode a tela e vibra forte, sem mexer no pavio.
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
  }, [match?.phase]);

  // Trocou de mão com a bomba acesa: anuncia em todas as telas.
  useEffect(() => {
    if (!match || match.phase !== 'armed') return setPassagem(null);
    const quem = match.players.find((p) => p.id === match.activeId);
    if (quem) setPassagem({ name: quem.name, color: quem.color, letter: match.alphabet?.used.at(-1)?.letter, mine: quem.id === match.me.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.activeId]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value * 14 }] }));

  if (!match) return null;
  const { phase, activeId, alphabet, challenge, isHost, displayName, player, roundIndex, totalRounds } = match;
  const active = player(activeId);
  const rodada = totalRounds ? `Rodada ${roundIndex} de ${totalRounds}` : `Rodada ${roundIndex}`;

  /* ------------------------------------------------ é a vez de… (bomba apagada) */
  if (phase === 'handoff') {
    return (
      <Screen scroll={false}>
        <MatchTopRow>
          <Overline>{rodada}</Overline>
          <Overline>{match.variant === 'alfabeto' ? '🔤 Alfabeto' : '💣 Clássico'}</Overline>
        </MatchTopRow>
        <Enter kind="pop" duration={500} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Txt size={40}>{minhaVez ? '💣' : '👀'}</Txt>
          {minhaVez ? (
            <Display size={52} center adjustsFontSizeToFit numberOfLines={2}>
              {'A bomba\né sua'}
            </Display>
          ) : (
            <>
              <Txt font="body600" size={16} color={colors.muted}>
                É a vez de
              </Txt>
              <Avatar name={active?.name ?? '?'} color={active?.color ?? colors.surface} size={96} />
              <Display size={56} center adjustsFontSizeToFit numberOfLines={1}>
                {active?.name}
              </Display>
            </>
          )}
          <Txt font="body400" size={14} lh={1.4} color={colors.muted} center style={{ maxWidth: 280 }}>
            {minhaVez ? 'Ela só acende quando você tocar em começar.' : `A bomba acende quando ${active?.name} estiver pronto.`}
          </Txt>
        </Enter>
        {minhaVez ? (
          <Button
            label="Estou pronto 🔥"
            onPress={() => {
              haptics.light();
              roomActions.armBomb();
            }}
          />
        ) : (
          <WaitingButton label={`Esperando ${active?.name ?? '…'}`} />
        )}
      </Screen>
    );
  }

  /* ----------------------------------------------------------- bomba desarmada */
  if (phase === 'disarmed') {
    const gastas = alphabet?.used.length ?? 0;
    return (
      <Screen bg={colors.success} scroll={false}>
        <Enter kind="pop" duration={600} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Txt size={72}>😮‍💨</Txt>
          <Display size={52} center>
            Bomba desarmada!
          </Display>
          <Txt font="body600" size={16} opacity={0.9} center style={{ maxWidth: 290 }}>
            Vocês gastaram as {gastas} letras de {alphabet?.name} antes de ela estourar.
          </Txt>
          <Txt font="body400" size={14} opacity={0.8} center style={{ marginTop: 6 }}>
            Ninguém perdeu esta rodada.
          </Txt>
        </Enter>
        <Avancar isHost={isHost} semLimite={!totalRounds} />
      </Screen>
    );
  }

  /* ---------------------------------------------------------------- explosão */
  if (phase === 'exploded') {
    const perdedor = player(match.loserId ?? '');
    const foiComigo = match.loserId === match.me.id;
    const vidas = match.mode === 'eliminacao' ? (match.lives[match.loserId ?? ''] ?? 0) : null;
    const eliminado = match.eliminated.includes(match.loserId ?? '');
    return (
      <Screen bg={colors.danger} scroll={false}>
        <Enter kind="pop" duration={500} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Txt size={80}>💥</Txt>
          <Display size={64} center>
            Boom!
          </Display>
          <Txt font="body600" size={15} opacity={0.85} style={{ marginTop: 8 }}>
            {foiComigo ? 'Explodiu na sua mão' : 'A bomba explodiu com'}
          </Txt>
          {!foiComigo && (
            <Display size={52} center adjustsFontSizeToFit numberOfLines={1}>
              {perdedor?.name}
            </Display>
          )}
          {eliminado ? (
            <Display size={24} center>
              💀 {foiComigo ? 'Você está fora' : 'Eliminado'}
            </Display>
          ) : vidas !== null ? (
            <Txt size={22}>{'❤️'.repeat(vidas)}</Txt>
          ) : (
            <Txt font="body600" size={16} opacity={0.85}>
              💣 {match.bombs[match.loserId ?? ''] ?? 0} no total
            </Txt>
          )}
        </Enter>
        <Avancar isHost={isHost} semLimite={!totalRounds} />
      </Screen>
    );
  }

  /* -------------------------------------------------------------------- fim */
  if (phase === 'finished') {
    const placar = match.standings ?? [];
    return (
      <Screen>
        <Overline color={colors.danger}>💣 Fim da partida</Overline>
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 12 }}>
          {placar.map((linha) => (
            <View key={linha.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt font="body600" size={14} color={colors.muted}>
                {['🥇', '🥈', '🥉'][linha.position - 1] ?? `${linha.position}º`}
              </Txt>
              <Txt font="body600" size={15} style={{ flex: 1 }}>
                {displayName(linha.playerId)}
              </Txt>
              <Txt font="body600" size={14} color={colors.muted}>
                {match.mode === 'pontos' ? `${linha.points} pts` : `💣 ${linha.bombs}`}
              </Txt>
            </View>
          ))}
        </View>

        {(match.highlights ?? []).length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(match.highlights ?? []).map((h) => (
              <View key={h.key} style={{ flexGrow: 1, flexBasis: '46%', backgroundColor: colors.surface, borderRadius: radii.card, padding: 14, gap: 2 }}>
                <Txt size={22}>{h.emoji}</Txt>
                <Txt font="body600" size={14}>
                  {h.title}
                </Txt>
                <Txt font="body600" size={13} color={colors.accent}>
                  {displayName(h.playerId)}
                </Txt>
                <Txt font="body400" size={11} lh={1.3} color={colors.muted}>
                  {h.value}
                </Txt>
              </View>
            ))}
          </View>
        )}

        {isHost ? <Button label="Jogar de novo" onPress={() => roomActions.playAgain()} /> : <WaitingButton label="Aguardando o host" />}
        <Button label="Escolher outro jogo" variant="tertiary" onPress={() => leaveMatch(routes.explore)} />
      </Screen>
    );
  }

  /* --------------------------------------------------------------- bomba ativa */
  const usadas = new Set(alphabet?.used.map((u) => u.letter) ?? []);
  const flash = passagem ? (
    <HandoffFlash name={passagem.name} color={passagem.color} letter={passagem.letter} mine={passagem.mine} onDone={() => setPassagem(null)} />
  ) : null;

  return (
    <Animated.View style={[{ flex: 1 }, shakeStyle]}>
      <Screen scroll={false}>
        <MatchTopRow>
          <Overline color={colors.danger}>💣 Bomba ativa</Overline>
          <Txt font="body600" size={12} color={colors.muted}>
            {alphabet ? `${usadas.size}/${alphabet.letters.length} letras` : challenge?.category}
          </Txt>
        </MatchTopRow>

        {alphabet ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: 14 }}>
            <Animated.View style={[{ alignItems: 'center', gap: 2 }, pulso]}>
              <Txt size={30}>{alphabet.emoji}</Txt>
              <Display size={38} center adjustsFontSizeToFit numberOfLines={1}>
                {alphabet.name}
              </Display>
            </Animated.View>

            <ComQuem minhaVez={minhaVez} nome={active?.name} />

            {/* Todo mundo vê a grade — saber quais letras já foram é do grupo. Só a vez toca. */}
            <LetterGrid
              letters={alphabet.letters}
              used={usadas}
              readOnly={!minhaVez}
              onPick={(letra) => {
                haptics.light();
                playSound('voto');
                roomActions.useLetter(letra);
              }}
            />

            <Txt font="body400" size={12} lh={1.35} color={colors.muted} center>
              {minhaVez ? 'Fale a resposta em voz alta e toque na primeira letra.' : 'Aguarde a sua vez — o celular vibra duas vezes.'}
            </Txt>
          </View>
        ) : (
          <>
            <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
              <Animated.View style={[{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 24 }, pulso]}>
                <Display size={34} lh={1.15} center>
                  {challenge?.text}
                </Display>
              </Animated.View>

              <BurningFuse />
              <ComQuem minhaVez={minhaVez} nome={active?.name} />
            </View>

            {minhaVez ? (
              // Enorme de propósito: a pessoa está sob pressão e precisa acertar o toque sem olhar.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Passar bomba"
                onPress={() => {
                  haptics.light();
                  playSound('voto');
                  roomActions.passBomb();
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
            ) : (
              <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, paddingVertical: 28, alignItems: 'center', gap: 4 }}>
                <Display size={22} color={colors.muted}>
                  Não é a sua vez
                </Display>
                <Txt font="body400" size={13} color={colors.muted}>
                  O celular vibra duas vezes quando for.
                </Txt>
              </View>
            )}
          </>
        )}
      </Screen>
      {flash}
    </Animated.View>
  );
}

function ComQuem({ minhaVez, nome }: { minhaVez: boolean; nome?: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Txt font="body600" size={13} color={colors.muted}>
        Está com
      </Txt>
      <Display size={minhaVez ? 40 : 30} center adjustsFontSizeToFit numberOfLines={1} color={minhaVez ? colors.danger : colors.text}>
        {minhaVez ? 'VOCÊ' : nome}
      </Display>
    </View>
  );
}

/** Depois da explosão (ou do desarme), quem conduz é o host — como nos outros jogos de sala. */
function Avancar({ isHost, semLimite }: { isHost: boolean; semLimite: boolean }) {
  if (!isHost) return <WaitingButton label="Aguardando o host" />;
  return (
    <>
      <Button label="Próxima rodada" variant="onColor" onPress={() => roomActions.nextRound()} />
      {semLimite && <Button label="Encerrar partida" variant="translucent" onPress={() => roomActions.endMatch()} />}
    </>
  );
}
