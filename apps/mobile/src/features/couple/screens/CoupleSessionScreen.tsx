import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Button, Display, IconButton, ModalCard, Overline, PillButton, Screen, Txt, useScreenPadding } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';

import { order } from '@jogae/engine';

import { coupleActions, useCoupleSession } from '../coupleStore';

/**
 * A carta e nada mais.
 *
 * O app não é o centro aqui: a conversa é. Por isso a tela não tem cronômetro, contador de acertos
 * nem nada que sugira desempenho, e **nunca avança sozinha** — quem decide quando virar a página
 * é o casal, que pode ficar meia hora na mesma pergunta.
 */
export function CoupleSessionScreen() {
  const session = useCoupleSession();
  const [saindo, setSaindo] = useState(false);
  const pad = useScreenPadding();

  useEffect(() => {
    if (session?.finished) router.replace(routes.couple.end);
  }, [session?.finished]);

  if (!session?.card) return null;
  const { card, index, settings, followUp } = session;
  const [primeiro, segundo] = order(session);
  const acao = card.kind === 'acao';
  const podeAprofundar = (card.followUps ?? []).length > 0 && !followUp;

  return (
    <Screen scroll={false}>
      <View style={{ position: 'absolute', top: pad.paddingTop, right: pad.paddingHorizontal, zIndex: 10 }} pointerEvents="box-none">
        <IconButton label="Encerrar por hoje" size={40} bg={colors.surface} onPress={() => setSaindo(true)}>
          <Txt font="body700" size={17} color={colors.muted}>
            ✕
          </Txt>
        </IconButton>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 48 }}>
        <Overline color={colors.accent}>{card.category}</Overline>
        <Txt font="body400" size={12} color={colors.muted}>
          {settings.total > 0 ? `${index} de ${settings.total}` : `${index}ª`}
        </Txt>
      </View>

      {/* `key` no índice: cada carta entra com a própria animação, em vez de trocar o texto no lugar. */}
      <Enter key={`${index}-${card.id}`} kind="in" duration={420} style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 26, gap: 14 }}>
          {acao && <Txt font="body700" size={14} color={colors.accent}>✨ Façam agora</Txt>}
          <Display size={30} lh={1.2}>
            {card.text}
          </Display>

          {followUp && (
            <View style={{ borderTopWidth: 1, borderTopColor: colors.surfaceLight, paddingTop: 14, gap: 6 }}>
              <Txt font="body700" size={13} color={colors.accent}>
                ✨ Indo um pouco além
              </Txt>
              <Display size={22} lh={1.25} color={colors.muted}>
                {followUp}
              </Display>
            </View>
          )}
        </View>

        {!acao && (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Txt font="body600" size={15}>
              {primeiro} responde primeiro
            </Txt>
            <Txt font="body400" size={13} color={colors.muted}>
              depois {segundo} · e aí conversem
            </Txt>
          </View>
        )}
      </Enter>

      <View style={{ gap: 10 }}>
        {podeAprofundar && (
          <PillButton
            label="✨ Aprofundar"
            bg={colors.surface}
            fg={colors.text}
            size={16}
            padY={14}
            onPress={() => {
              haptics.selection();
              coupleActions.deepen();
            }}
          />
        )}
        <Button
          label="Próxima →"
          onPress={() => {
            haptics.selection();
            coupleActions.next();
          }}
        />
        {/* Trocar não gasta a vez e não pede explicação: a pergunta simplesmente não coube. */}
        <PillButton label="Trocar pergunta" bg="transparent" fg={colors.muted} size={14} padY={10} onPress={coupleActions.swap} />
      </View>

      <ModalCard visible={saindo} onRequestClose={() => setSaindo(false)}>
        <Txt size={40}>❤️</Txt>
        <Display size={30} center>
          Encerrar por hoje?
        </Display>
        <Txt font="body400" size={14} lh={1.4} color={colors.muted} center>
          Vocês conversaram sobre {index} {index === 1 ? 'pergunta' : 'perguntas'}. Dá para parar aqui e ver como foi.
        </Txt>
        <Button label="Continuar conversando" height={56} onPress={() => setSaindo(false)} style={{ alignSelf: 'stretch', marginTop: 6 }} />
        <Button
          label="Encerrar"
          variant="tertiary"
          height={50}
          radius={16}
          fontSize={18}
          onPress={() => {
            setSaindo(false);
            coupleActions.end();
          }}
          style={{ alignSelf: 'stretch' }}
        />
      </ModalCard>
    </Screen>
  );
}
