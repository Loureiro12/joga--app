import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Button, Display, ModalCard, Overline, PillButton, PressableScale, Screen, Spacer, Txt, toast } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

import type { PlayerId, SecretMission } from '@jogae/engine';
import { HoldToReveal } from '../../components/HoldToReveal';
import { MatchTopRow } from '../../components/MatchMenu';
import { roomActions } from '../../hooks/roomActions';
import { useSecretMatch } from '../../store/matchStore';

/**
 * A noite. Esta é a tela mais vazia do app de propósito: depois daqui o celular vai para o bolso e
 * o jogo acontece na conversa. Ela existe para quatro gestos — rever a missão, marcar que
 * conseguiu, acusar alguém e trocar quando a missão não cabe no rolê.
 */
export function MissionScreen() {
  const match = useSecretMatch();
  const [acusando, setAcusando] = useState(false);
  const [alvo, setAlvo] = useState<PlayerId | null>(null);
  const [escolha, setEscolha] = useState<SecretMission | null>(null);

  const mine = match?.mine;
  if (!match || !mine) return null;
  const { others, isHost, accusationOptions, player } = match;
  const concluida = mine.status !== 'ativa';
  const opcoes = alvo ? (accusationOptions[alvo] ?? []) : [];

  const fechar = () => {
    setAcusando(false);
    setAlvo(null);
    setEscolha(null);
  };

  const acusar = () => {
    if (!alvo || !escolha) return;
    haptics.heavy();
    roomActions.accuse(alvo, escolha.id);
    // O resultado não aparece aqui: saber na hora entregaria a missão do outro a quem olhasse a tela.
    toast('Acusação registrada. Você saberá na hora da verdade.', 'neutral', '🚨');
    fechar();
  };

  return (
    <Screen>
      <MatchTopRow>
        <Overline color={colors.accent}>🕵️ Missão em andamento</Overline>
        <Txt font="body600" size={12} color={colors.muted}>
          🚨 {mine.accusationsLeft} {mine.accusationsLeft === 1 ? 'acusação' : 'acusações'}
        </Txt>
      </MatchTopRow>

      {mine.suspected && (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.input, padding: 14, gap: 2 }}>
          <Txt font="body600" size={14}>
            👀 Alguém já desconfiou de você
          </Txt>
          <Txt font="body400" size={12} lh={1.35} color={colors.muted}>
            Não vamos dizer quem — nem se acertou. Talvez seja hora de disfarçar melhor.
          </Txt>
        </View>
      )}

      <HoldToReveal>
        <Overline color={colors.accent}>🎯 Sua missão</Overline>
        <Display size={24} lh={1.2} center>
          {mine.mission.text}
        </Display>
        {concluida && (
          <Txt font="body600" size={13} color={colors.success}>
            ✓ Marcada como cumprida
          </Txt>
        )}
      </HoldToReveal>

      {concluida ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 4 }}>
          <Display size={18}>Registrado 🤫</Display>
          <Txt font="body400" size={13} lh={1.4} color={colors.muted}>
            Ninguém foi avisado. Continue agindo normalmente — e fique de olho nos outros.
          </Txt>
        </View>
      ) : (
        <Button
          label="🎯 Consegui"
          variant="success"
          onPress={() => {
            haptics.success();
            roomActions.missionDone();
            // Só você fica sabendo: um anúncio na tela de todos diria ao grupo o que acabou de acontecer.
            toast('Registrado. Ninguém foi avisado.', 'neutral', '🤫');
          }}
        />
      )}

      <View style={{ gap: 8 }}>
        {mine.accusationsLeft > 0 && (
          <PillButton label="🚨 Acusar alguém" bg={colors.surface} fg={colors.text} size={16} padY={14} onPress={() => setAcusando(true)} />
        )}
        {mine.swapsLeft > 0 && !concluida && (
          <PillButton label="🔄 Trocar de missão" bg="transparent" fg={colors.muted} size={14} padY={10} onPress={roomActions.swapMission} />
        )}
      </View>

      <Spacer min={12} />

      {isHost ? (
        <Button label="Encerrar · hora da verdade" variant="tertiary" height={50} radius={16} fontSize={17} onPress={roomActions.endMatch} />
      ) : (
        <Txt font="body400" size={12} color={colors.muted} center>
          O host encerra quando o rolê acabar.
        </Txt>
      )}

      <ModalCard visible={acusando} onRequestClose={fechar}>
        <Display size={28} center>
          Acusar quem?
        </Display>

        {/* Numa sala cheia são onze nomes e quatro missões: sem rolagem, o botão de acusar sairia da tela. */}
        <ScrollView style={{ alignSelf: 'stretch', maxHeight: 400 }} contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {others.map((p) => (
            <PillButton
              key={p.id}
              label={p.name}
              bg={alvo === p.id ? colors.danger : colors.surfaceLight}
              fg={colors.text}
              size={15}
              onPress={() => {
                haptics.selection();
                setAlvo(p.id);
                setEscolha(null);
              }}
            />
          ))}
        </View>

        {alvo && (
          <>
            <Txt font="body400" size={13} lh={1.4} color={colors.muted} center>
              Não basta desconfiar: diga o que acha que {player(alvo)?.name} está tentando fazer.
            </Txt>

            <View style={{ gap: 8, alignSelf: 'stretch' }}>
              {opcoes.map((m) => (
                <PressableScale
                  key={m.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: escolha?.id === m.id }}
                  pressedScale={0.98}
                  onPress={() => {
                    haptics.selection();
                    setEscolha(m);
                  }}
                  style={{
                    backgroundColor: escolha?.id === m.id ? colors.primary : colors.surfaceLight,
                    borderRadius: radii.input,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                  }}
                >
                  <Txt font="body600" size={14} lh={1.35}>
                    {m.text}
                  </Txt>
                </PressableScale>
              ))}
            </View>
          </>
        )}
        </ScrollView>

        <Txt font="body400" size={12} color={colors.muted} center>
          Errar gasta a acusação do mesmo jeito.
        </Txt>
        <Button
          label={escolha ? 'Acusar' : alvo ? 'Escolha uma missão' : 'Escolha alguém'}
          variant="destructive"
          disabled={!escolha}
          height={54}
          onPress={acusar}
          style={{ alignSelf: 'stretch' }}
        />
      </ModalCard>
    </Screen>
  );
}
