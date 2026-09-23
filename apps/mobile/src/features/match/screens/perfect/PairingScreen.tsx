import { View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, Overline, PressableScale, Screen, Spacer, Txt, WaitingButton } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

import type { PlayerId } from '@jogae/engine';
import { MatchTopRow } from '../../components/MatchMenu';
import { roomActions } from '../../hooks/roomActions';
import { usePerfectMatch } from '../../store/matchStore';

/**
 * Formação das duplas (§7–9).
 *
 * O convite é de mão dupla de propósito: quem escolhe primeiro não define o casal de ninguém, e
 * o toque errado não vira uma dupla que não existe — basta o outro não aceitar.
 */
export function PairingScreen() {
  const match = usePerfectMatch();
  if (!match?.pairing) return null;
  const { pairing, couples, myCoupleId, isHost, me, player, displayName } = match;
  const { waiting, invited, invitedBy } = pairing;

  const livres = waiting.filter((id) => id !== me.id);
  const souLivre = !myCoupleId;
  const todosPareados = waiting.length === 0 && couples.length > 0;

  return (
    <Screen>
      <MatchTopRow>
        <Overline color={colors.primary}>💞 Formem as duplas</Overline>
        <Overline>
          {couples.length} {couples.length === 1 ? 'casal' : 'casais'}
        </Overline>
      </MatchTopRow>

      {invitedBy.length > 0 && souLivre && (
        <View style={{ backgroundColor: colors.primary, borderRadius: radii.card, padding: 16, gap: 10 }}>
          <Display size={20}>{displayName(invitedBy[0])} quer formar dupla com você</Display>
          <Button
            label="Aceitar ❤️"
            variant="onColorDark"
            height={50}
            fontSize={18}
            onPress={() => {
              haptics.success();
              roomActions.pairWith(invitedBy[0]);
            }}
          />
        </View>
      )}

      {myCoupleId ? (
        <ParFormado match={match} />
      ) : invited ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 16, gap: 8, alignItems: 'center' }}>
          <Txt size={30}>⏳</Txt>
          <Display size={20} center>
            Esperando {displayName(invited)} aceitar
          </Display>
          <Txt font="body400" size={12} color={colors.muted} center>
            Enquanto isso, dá para chamar outra pessoa.
          </Txt>
        </View>
      ) : (
        <Txt font="body400" size={14} lh={1.4} color={colors.muted}>
          Escolha quem vai jogar com você. A dupla só fecha quando a outra pessoa aceitar.
        </Txt>
      )}

      {souLivre && livres.length > 0 && (
        <View style={{ gap: 8 }}>
          <Overline>Ainda sem par</Overline>
          {livres.map((id) => (
            <Convidavel key={id} id={id} name={player(id)?.name ?? '—'} color={player(id)?.color ?? colors.surface} convidado={invited === id} />
          ))}
        </View>
      )}

      {couples.length > 0 && (
        <View style={{ gap: 8 }}>
          <Overline>Duplas prontas</Overline>
          {couples.map((c) => (
            <View
              key={c.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radii.input, paddingVertical: 12, paddingHorizontal: 14 }}
            >
              <Txt size={20}>{c.emoji}</Txt>
              <Txt font="body600" size={15} style={{ flex: 1 }}>
                {displayName(c.aId)} & {displayName(c.bId)}
              </Txt>
              <Txt font="body600" size={14} color={colors.success}>
                ✓
              </Txt>
            </View>
          ))}
        </View>
      )}

      <Spacer min={12} />

      {isHost ? (
        <>
          <Button
            label={todosPareados ? 'Começar' : waiting.length > 0 ? `Faltam ${waiting.length} sem par` : 'Formem ao menos uma dupla'}
            disabled={!todosPareados}
            onPress={roomActions.beginQuestions}
          />
          {waiting.length > 0 && (
            <Txt font="body400" size={12} lh={1.35} color={colors.muted} center>
              Todo mundo precisa de par: quem ficar de fora não teria com quem combinar resposta.
            </Txt>
          )}
        </>
      ) : (
        <WaitingButton label={todosPareados ? 'Aguardando o host começar' : 'Esperando as duplas'} />
      )}
    </Screen>
  );
}

function ParFormado({ match }: { match: NonNullable<ReturnType<typeof usePerfectMatch>> }) {
  const casal = match.couples.find((c) => c.id === match.myCoupleId);
  if (!casal) return null;
  const parceiro = casal.aId === match.me.id ? casal.bId : casal.aId;
  const p = match.player(parceiro);

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 10, alignItems: 'center' }}>
      <Txt size={30}>{casal.emoji}</Txt>
      <Display size={26} center>
        Você & {p?.name ?? '—'}
      </Display>
      <Txt font="body400" size={12} lh={1.35} color={colors.muted} center>
        A partir de agora vocês pontuam juntos. Respondam separados — não vale mostrar a tela.
      </Txt>
      <PressableScale accessibilityRole="button" onPress={roomActions.unpair} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
        <Txt font="body600" size={13} color={colors.muted}>
          Desfazer dupla
        </Txt>
      </PressableScale>
    </View>
  );
}

function Convidavel({ id, name, color, convidado }: { id: PlayerId; name: string; color: string; convidado: boolean }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Convidar ${name}`}
      pressedScale={0.98}
      onPress={() => {
        haptics.selection();
        roomActions.pairWith(id);
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: convidado ? colors.surfaceLight : colors.surface,
        borderRadius: radii.input,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <Avatar name={name} color={color} size={36} />
      <Txt font="body600" size={16} style={{ flex: 1 }}>
        {name}
      </Txt>
      <Txt font="body600" size={13} color={convidado ? colors.muted : colors.primary}>
        {convidado ? 'convidado' : 'Convidar'}
      </Txt>
    </PressableScale>
  );
}
