import { View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, Overline, Screen, Spacer, Txt, WaitingButton } from '@/core/ui';

import { HoldToReveal } from '../../components/HoldToReveal';
import { roomActions } from '../../hooks/roomActions';
import { useSecretMatch } from '../../store/matchStore';

const DIFICULDADE: Record<string, string> = { facil: '🟢 Fácil', media: '🟡 Média', dificil: '🔴 Difícil' };

/** As missões foram distribuídas. Cada um lê a sua escondido e confirma. */
export function BriefingScreen() {
  const match = useSecretMatch();
  const mine = match?.mine;
  if (!match || !mine) return null;
  const { ready, connectedPlayers, me } = match;
  const confirmei = ready.includes(me.id);
  // Quem falta, tirando você: o botão lá embaixo já diz o que fazer, e "esperando você" é ruído.
  const faltam = connectedPlayers.filter((p) => p.id !== me.id && !ready.includes(p.id));

  return (
    <Screen>
      <Overline color={colors.accent}>🕵️ Sua missão está pronta</Overline>
      <Txt font="body400" size={14} lh={1.4} color={colors.muted}>
        Ninguém mais vê o que está escrito aqui. Não conte, não mostre, e tente agir naturalmente.
      </Txt>

      <HoldToReveal>
        <Overline color={colors.accent}>🎯 Sua missão</Overline>
        <Display size={26} lh={1.2} center>
          {mine.mission.text}
        </Display>
        <Txt font="body600" size={13} color={colors.muted}>
          {DIFICULDADE[mine.mission.difficulty]}
        </Txt>
      </HoldToReveal>

      {!confirmei && mine.swapsLeft > 0 && (
        <Button label="Não dá para fazer aqui · trocar" variant="tertiary" height={48} radius={16} fontSize={16} onPress={roomActions.swapMission} />
      )}

      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 8 }}>
        <Overline>Prontos ({ready.length}/{connectedPlayers.length})</Overline>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {connectedPlayers.map((p) => (
            <Avatar key={p.id} name={p.name} color={p.color} size={36} style={{ opacity: ready.includes(p.id) ? 1 : 0.35 }} />
          ))}
        </View>
        {faltam.length > 0 && (
          <Txt font="body400" size={12} color={colors.muted}>
            Esperando {faltam.map((p) => p.name).join(', ')}.
          </Txt>
        )}
      </View>

      <Spacer />

      {confirmei ? <WaitingButton label="Aguardando o grupo" /> : <Button label="Entendi. Esconder missão." onPress={roomActions.missionReady} />}
    </Screen>
  );
}
