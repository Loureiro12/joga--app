import { router } from 'expo-router';
import { View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Button, Display, Overline, Screen, Txt } from '@/core/ui';

import { sessionSummary } from '@jogae/engine';

import { coupleActions, useCoupleSession } from '../coupleStore';

/**
 * O fim da sessão.
 *
 * Mostra **sobre o que** o casal conversou, e nada mais. Nenhuma porcentagem de compatibilidade,
 * nenhum "vocês concordam em 64%", nenhum conselho sobre a relação (§56): diferença de resposta
 * não é defeito, e transformar a conversa em nota estragaria o que o jogo acabou de construir.
 */
export function CoupleEndScreen() {
  const session = useCoupleSession();
  if (!session) return null;

  const resumo = sessionSummary(session);
  const [a, b] = session.settings.names;
  const maisFalado = resumo.byCategory[0];

  return (
    <Screen bg={colors.accent}>
      <Overline color="rgba(15,15,19,0.65)">Entre {a} e {b}</Overline>

      <Enter kind="pop" duration={700} style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}>
        <Txt size={56}>❤️</Txt>
        <Display size={44} color={colors.background} center>
          Valeu pelo momento
        </Display>
        <Txt font="body600" size={16} color={colors.background} style={{ opacity: 0.8 }}>
          {resumo.total} {resumo.total === 1 ? 'pergunta' : 'perguntas'} hoje
        </Txt>
      </Enter>

      {resumo.byCategory.length > 0 && (
        <View style={{ backgroundColor: colors.background, borderRadius: radii.card, padding: 18, gap: 12 }}>
          <Overline>Vocês conversaram sobre</Overline>
          {resumo.byCategory.map((linha) => (
            <View key={linha.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt font="body600" size={15} style={{ flex: 1 }}>
                {linha.category}
              </Txt>
              <Txt font="body400" size={13} color={colors.muted}>
                {linha.count} {linha.count === 1 ? 'pergunta' : 'perguntas'}
              </Txt>
            </View>
          ))}
          {maisFalado && resumo.byCategory.length > 1 && (
            <Txt font="body400" size={13} lh={1.4} color={colors.muted} style={{ marginTop: 2 }}>
              O assunto da noite foi <Txt font="body600" size={13}>{maisFalado.category.toLowerCase()}</Txt>.
            </Txt>
          )}
        </View>
      )}

      <View style={{ backgroundColor: colors.background, borderRadius: radii.card, padding: 18, gap: 6 }}>
        <Display size={20}>Ficou alguma conversa pela metade?</Display>
        <Txt font="body400" size={13} lh={1.45} color={colors.muted}>
          Não precisa terminar hoje. Voltar a uma pergunta semanas depois costuma render outra conversa.
        </Txt>
      </View>

      <Button
        label="Mais uma rodada"
        variant="onColor"
        onPress={() => {
          coupleActions.leave();
          router.replace(routes.couple.settings);
        }}
      />
      {/*
        Sem anúncio aqui, de propósito. O casal acabou de conversar sobre coisa pessoal, e a tela
        seguinte ser um anúncio destrói a confiança que este jogo inteiro depende de construir.
        `ADS_NEVER_IN` guarda a mesma decisão do lado da política, com teste.
      */}
      <Button
        label="Por hoje chega"
        variant="translucent"
        onPress={() => {
          coupleActions.reset();
          router.replace(routes.explore);
        }}
      />
    </Screen>
  );
}
