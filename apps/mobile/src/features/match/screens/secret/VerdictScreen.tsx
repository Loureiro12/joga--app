import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, Overline, Screen, Spacer, Txt, WaitingButton } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

import { MatchTopRow } from '../../components/MatchMenu';
import { roomActions } from '../../hooks/roomActions';
import { useSecretMatch } from '../../store/matchStore';

const DIFICULDADE: Record<string, string> = { facil: '🟢 Fácil', media: '🟡 Média', dificil: '🔴 Difícil' };

/**
 * A hora da verdade: uma missão por vez, em voz alta.
 *
 * O voto do grupo não é sobre gostar da missão — é sobre a história ser verdade. Quem foi pego não
 * vai a voto: já se sabe o que aconteceu, e aqui a graça é ouvir quem pegou contar como percebeu.
 */
export function VerdictScreen() {
  const match = useSecretMatch();
  if (!match?.reveal || !match.revealProgress) return null;
  const { reveal, revealProgress, isHost, me, votes, player, displayName, connectedPlayers } = match;

  const dono = player(reveal.playerId);
  const souODono = reveal.playerId === me.id;
  const jaVotei = votes?.votedIds.includes(me.id) ?? false;
  const pego = reveal.status === 'pego';
  const naoCumpriu = reveal.status === 'ativa';
  // Só vai a voto a história de quem disse ter cumprido: pego e não-cumpriu já estão decididos.
  const emVotacao = !pego && !naoCumpriu;
  const ultimo = revealProgress.index >= revealProgress.total;
  const faltam = Math.max(0, connectedPlayers.length - 1 - (votes?.votedIds.length ?? 0));

  const votar = (valid: boolean) => {
    haptics.light();
    roomActions.voteReveal(valid);
  };

  return (
    <Screen>
      <MatchTopRow>
        <Overline color={colors.accent}>🎭 Hora da verdade</Overline>
        <Overline>
          {revealProgress.index}/{revealProgress.total}
        </Overline>
      </MatchTopRow>

      <Enter kind="pop" duration={500} style={{ alignItems: 'center', gap: 10 }}>
        <Avatar name={dono?.name ?? '?'} color={dono?.color ?? colors.surface} size={72} />
        <Display size={34} center adjustsFontSizeToFit numberOfLines={1}>
          {souODono ? 'Sua missão era…' : `A missão de ${dono?.name ?? '?'}`}
        </Display>
      </Enter>

      <View style={{ backgroundColor: colors.text, borderRadius: radii.cardLg, padding: 22, gap: 10, alignItems: 'center' }}>
        <Txt font="body600" size={11} ls={1} upper color={colors.mutedOnLight}>
          {DIFICULDADE[reveal.mission.difficulty]} · {reveal.mission.category}
        </Txt>
        <Display size={26} lh={1.2} color={colors.background} center>
          {reveal.mission.text}
        </Display>
      </View>

      {pego ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 4 }}>
          <Display size={20} color={colors.danger}>
            🚨 Pego por {reveal.caughtBy ? displayName(reveal.caughtBy) : 'alguém'}
          </Display>
          <Txt font="body400" size={13} lh={1.4} color={colors.muted}>
            {reveal.caughtBy === me.id ? 'Conte para o grupo o que te fez desconfiar.' : `${reveal.caughtBy ? (player(reveal.caughtBy)?.name ?? 'Quem pegou') : 'Quem pegou'} conta o que notou.`}
          </Txt>
        </View>
      ) : naoCumpriu ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 4 }}>
          <Display size={20} color={colors.muted}>
            😶 Não cumpriu
          </Display>
          <Txt font="body400" size={13} lh={1.4} color={colors.muted}>
            A noite passou e a missão ficou para a próxima.
          </Txt>
        </View>
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 6 }}>
          <Display size={20}>{souODono ? 'Conte como você fez' : `${dono?.name ?? '?'} diz que cumpriu`}</Display>
          <Txt font="body400" size={13} lh={1.4} color={colors.muted}>
            {souODono ? 'O grupo decide se aconteceu mesmo. Vale lembrar a hora e quem estava perto.' : 'Ouça a história e decida: aconteceu mesmo, do jeito que a missão pedia?'}
          </Txt>
        </View>
      )}

      <Spacer min={8} />

      {emVotacao &&
        (souODono ? (
          <WaitingButton label={faltam > 0 ? `O grupo está decidindo (faltam ${faltam})` : 'O grupo decidiu'} />
        ) : jaVotei ? (
          <WaitingButton label={faltam > 0 ? `Voto registrado · faltam ${faltam}` : 'Voto registrado'} />
        ) : (
          <View style={{ gap: 10 }}>
            <Txt font="body600" size={13} color={colors.muted} center>
              Rolou mesmo?
            </Txt>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="👍 Rolou" variant="success" style={{ flex: 1 }} height={54} fontSize={19} onPress={() => votar(true)} />
              <Button label="👎 Sei não" variant="destructive" style={{ flex: 1 }} height={54} fontSize={19} onPress={() => votar(false)} />
            </View>
          </View>
        ))}

      {isHost ? (
        <Button
          label={ultimo ? 'Ver o resultado' : 'Próxima missão'}
          variant={emVotacao ? 'tertiary' : 'primary'}
          onPress={() => roomActions.nextReveal()}
        />
      ) : (
        <Txt font="body400" size={12} color={colors.muted} center>
          {ultimo ? 'O host fecha a noite.' : 'O host passa para a próxima.'}
        </Txt>
      )}
    </Screen>
  );
}
