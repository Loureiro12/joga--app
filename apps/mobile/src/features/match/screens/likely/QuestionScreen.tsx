import { View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Button, Display, Overline, PillButton, Screen, Txt } from '@/core/ui';

import { roomActions } from '../../hooks/roomActions';
import { useLikelyMatch } from '../../store/matchStore';

/**
 * A pergunta na tela, antes da votação. É o momento de todo mundo ler junto e reagir —
 * por isso ela não abre a votação sozinha: quem decide a hora é o host.
 */
export function QuestionScreen() {
  const match = useLikelyMatch();
  if (!match?.round) return null;
  const { round, isHost, connectedPlayers } = match;

  return (
    <Screen scroll={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Overline>
          {round.totalRounds ? `Pergunta ${round.index} de ${round.totalRounds}` : `Pergunta ${round.index}`}
        </Overline>
        <Txt font="body600" size={12} color={colors.muted}>
          {round.category}
        </Txt>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 24, gap: 10 }}>
          <Txt font="body600" size={17} color={colors.accent}>
            Quem é mais provável de…
          </Txt>
          <Display size={34} lh={1.15}>
            {round.question}
          </Display>
        </View>

        <Txt font="body400" size={14} lh={1.4} color={colors.muted} center>
          {isHost ? 'Leiam em voz alta. Quando todos entenderem, abra a votação.' : 'Já pensou em quem? Segura aí — o host abre a votação.'}
        </Txt>
      </View>

      {isHost ? (
        <View style={{ gap: 10 }}>
          <Button label={`Abrir votação (${connectedPlayers.length})`} onPress={roomActions.openVoting} />
          {/* Só dá para trocar ANTES do primeiro voto: depois seria escolher o resultado. */}
          <PillButton label="Trocar pergunta" bg={colors.surface} fg={colors.text} size={15} padY={12} onPress={roomActions.skipQuestion} />
        </View>
      ) : (
        <Txt font="body600" size={14} color={colors.muted} center>
          Aguardando o host abrir a votação…
        </Txt>
      )}
    </Screen>
  );
}
