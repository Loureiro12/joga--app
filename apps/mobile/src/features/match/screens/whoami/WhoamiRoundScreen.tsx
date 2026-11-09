import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { colors, radii } from '@/core/theme';
import { Avatar, Button, Display, Input, Overline, Screen, Txt } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

import { roomActions } from '../../hooks/roomActions';
import { useWhoamiMatch } from '../../store/matchStore';

/**
 * Quem Sou Eu?: a rodada e a revelação, na mesma tela.
 *
 * Elas não são telas diferentes porque a lista de identidades continua ali nas duas — o que muda
 * é só a sua deixar de ser segredo. Navegar entre as duas faria a lista piscar sem motivo.
 *
 * ## O que esta tela NÃO faz
 *
 * Não coleta resposta. O grupo responde "sim / não / talvez / não sei" **em voz alta**, como numa
 * mesa de verdade — é a mesma escolha do Impostor, em que as pistas são faladas e o app só conta
 * o tempo. Por isso aqui não há botão de responder, nem campo de digitar a pergunta: na sua vez
 * você fala, e o celular serve para três coisas só — mostrar quem os outros são, pedir dica e
 * arriscar o palpite.
 */
export function WhoamiRoundScreen() {
  const match = useWhoamiMatch();
  const [palpite, setPalpite] = useState('');
  const [erro, setErro] = useState(false);
  const errosAntes = useRef(0);

  // O erro é informação do servidor, não da tela: ele chega como um `misses` que subiu.
  const meusErros = match?.mine?.misses ?? 0;
  useEffect(() => {
    if (meusErros > errosAntes.current) {
      setErro(true);
      haptics.error();
      const limpar = setTimeout(() => setErro(false), 2200);
      errosAntes.current = meusErros;
      return () => clearTimeout(limpar);
    }
    errosAntes.current = meusErros;
  }, [meusErros]);

  if (!match) return null;
  const { visibleIdentities, mine, turnId, reveal, roundIndex, totalRounds, isHost, me, player, displayName, settings } = match;

  const minhaVez = turnId === me.id;
  const daVez = turnId ? displayName(turnId) : null;

  /* ─────────────────────────── revelação ─────────────────────────── */

  if (reveal) {
    const acertaram = reveal.filter((l) => l.found).length;
    return (
      <Screen>
        <Overline>
          Rodada {roundIndex}
          {totalRounds ? ` de ${totalRounds}` : ''}
        </Overline>
        <Display size={40}>Identidades reveladas!</Display>
        <Txt font="body400" size={15} color={colors.muted}>
          {acertaram === reveal.length
            ? 'Todo mundo descobriu.'
            : acertaram === 0
              ? 'Ninguém descobriu desta vez.'
              : `${acertaram} de ${reveal.length} descobriram.`}
        </Txt>

        <View style={{ gap: 10 }}>
          {reveal.map((linha) => (
            <View
              key={linha.playerId}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                borderRadius: radii.list,
                backgroundColor: linha.playerId === me.id ? colors.surfaceLight : colors.surface,
                borderWidth: linha.playerId === me.id ? 1 : 0,
                borderColor: colors.primary,
              }}
            >
              <Txt size={30}>{linha.identity.emoji}</Txt>
              <View style={{ flex: 1 }}>
                <Txt font="body600" size={16}>
                  {linha.identity.name}
                </Txt>
                <Txt font="body400" size={13} color={colors.muted}>
                  {displayName(linha.playerId)}
                  {linha.hintsUsed > 0 ? ` · ${linha.hintsUsed} dica${linha.hintsUsed > 1 ? 's' : ''}` : ''}
                  {linha.misses > 0 ? ` · ${linha.misses} erro${linha.misses > 1 ? 's' : ''}` : ''}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt size={18}>{linha.found ? '✅' : '❌'}</Txt>
                <Txt font="body600" size={13} color={linha.points >= 0 ? colors.success : colors.danger}>
                  {linha.points > 0 ? '+' : ''}
                  {linha.points}
                </Txt>
              </View>
            </View>
          ))}
        </View>
        {isHost ? (
          <Button label={totalRounds && roundIndex >= totalRounds ? 'Ver o placar final' : 'Próxima rodada'} onPress={roomActions.nextRound} />
        ) : (
          <Txt font="body400" size={14} color={colors.muted} center>
            Esperando {displayName(match.room.hostId)} seguir.
          </Txt>
        )}
      </Screen>
    );
  }

  /* ─────────────────────────── a rodada ─────────────────────────── */

  const enviar = () => {
    const limpo = palpite.trim();
    if (!limpo) return;
    setPalpite('');
    roomActions.guessIdentity(limpo);
  };

  return (
    <Screen>
      <Overline>
        Rodada {roundIndex}
        {totalRounds ? ` de ${totalRounds}` : ''}
      </Overline>

      {/* De quem é a vez. É a única coisa que o app precisa dizer durante a conversa. */}
      {mine?.found ? (
        <>
          <Display size={34}>Você descobriu! 🎉</Display>
          <Txt font="body600" size={18} color={colors.success}>
            {mine.emoji} {mine.name}
          </Txt>
          <Txt font="body400" size={14} color={colors.muted}>
            Continue respondendo às perguntas dos outros — sem contar o que você já sabe.
          </Txt>
        </>
      ) : minhaVez ? (
        <>
          <Display size={34}>Sua vez 🎯</Display>
          <Txt font="body400" size={15} color={colors.muted} lh={1.35}>
            Pergunte em voz alta. O grupo só pode responder sim, não, talvez ou não sei.
          </Txt>
        </>
      ) : (
        <>
          <Display size={34}>Vez de {daVez ?? '—'}</Display>
          <Txt font="body400" size={15} color={colors.muted} lh={1.35}>
            Responda em voz alta: sim, não, talvez ou não sei. Nada além disso.
          </Txt>
        </>
      )}

      {/* O quadro: quem cada um é. A sua é a única que não aparece. */}
      <Txt font="body600" size={14} color={colors.muted} style={{ marginBottom: 10 }}>
        QUEM CADA UM É
      </Txt>
      <View style={{ gap: 8 }}>
        {visibleIdentities.map((outro) => (
          <View
            key={outro.playerId}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 12,
              borderRadius: radii.list,
              backgroundColor: colors.surface,
              opacity: outro.found ? 0.55 : 1,
            }}
          >
            <Avatar name={player(outro.playerId)?.name ?? '?'} color={player(outro.playerId)?.color ?? colors.primary} size={28} />
            <View style={{ flex: 1 }}>
              <Txt font="body400" size={12} color={colors.muted}>
                {outro.playerId === turnId ? '🎯 ' : ''}
                {displayName(outro.playerId).toUpperCase()}
              </Txt>
              <Txt font="body600" size={17}>
                {outro.emoji} {outro.name}
              </Txt>
            </View>
            {outro.found ? <Txt size={16}>✅</Txt> : null}
          </View>
        ))}

        {/* A sua, em segredo. O nome não está no celular: ele nem sai do servidor. */}
        <View style={{ padding: 14, borderRadius: radii.list, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed' }}>
          <Txt font="body400" size={12} color={colors.muted}>
            VOCÊ
          </Txt>
          <Txt font="body600" size={17}>
            🕵️ Sua identidade é secreta
          </Txt>
          {mine && mine.hints.length > 0 ? (
            <>
              {mine.hints.map((dica, i) => (
                <Txt key={i} font="body400" size={14} color={colors.text} lh={1.35} style={{ marginTop: 4 }}>
                  💡 {dica}
                </Txt>
              ))}
            </>
          ) : null}
        </View>
      </View>

      {/* Só quem está na vez age. Fora dela, o celular é só o quadro acima. */}
      {minhaVez && !mine?.found ? (
        <View style={{ gap: 10 }}>
          <Input
            placeholder="Acho que sou…"
            value={palpite}
            onChangeText={(t) => {
              setPalpite(t);
              setErro(false);
            }}
            onSubmitEditing={enviar}
            returnKeyType="send"
            maxLength={60}
          />
          {erro ? (
            <Txt font="body600" size={14} color={colors.danger}>
              Não é isso. Você perdeu a vez — e {Math.abs(10)} pontos.
            </Txt>
          ) : null}
          <Button label="🎯 É esse o meu palpite" onPress={enviar} disabled={!palpite.trim()} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {settings.hints && (mine?.hintsLeft ?? 0) > 0 ? (
              <Button label={`💡 Dica (${mine!.hintsLeft})`} variant="translucent" onPress={roomActions.takeHint} style={{ flex: 1 }} />
            ) : null}
            <Button label="Passar a vez" variant="translucent" onPress={roomActions.passTurn} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}

      {isHost ? (
        <>
          <Button label="Encerrar a rodada" variant="secondary" onPress={roomActions.endRound} />
        </>
      ) : null}
    </Screen>
  );
}
