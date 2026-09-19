import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { Enter } from '@/core/animation/Enter';
import { Eyes } from '@/core/illustrations';
import { colors, radii } from '@/core/theme';
import { Button, Display, Overline, Screen, Txt } from '@/core/ui';
import { services } from '@/services';

import { HoldToRevealButton, SecretCard } from '../components/SecretReveal';
import { useMatch } from '../store/matchStore';

/** Tela 12: Revelação do papel (secret card → palavra | impostor). */
export function RevealScreen() {
  const match = useMatch();
  const [revealed, setRevealed] = useState(false);
  // O CTA nasce onde o dedo está segurando: só aceita toque 600 ms depois de revelar.
  const [armed, setArmed] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!revealed) return setArmed(false);
    const t = setTimeout(() => setArmed(true), 600);
    return () => clearTimeout(t);
  }, [revealed]);

  // Privacidade: se o app perder o foco com o papel à mostra, esconde de novo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        progress.value = 0;
        setRevealed(false);
      }
    });
    return () => sub.remove();
  }, [progress]);

  if (!match || !match.secret) return null;
  const { room, secret, round } = match;
  const category = round?.category ?? room.category;
  const impostor = secret.role === 'impostor';

  return (
    <Screen scroll={false} bg={revealed && impostor ? colors.impostorBg : colors.background}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Overline>
          Rodada {room.roundIndex} · {category}
        </Overline>
        <Overline>Só você vê isso</Overline>
      </View>

      {!revealed ? (
        <>
          <Display size={40}>{'Seu papel\nestá pronto.'}</Display>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <SecretCard progress={progress} />
          </View>
          <HoldToRevealButton progress={progress} onComplete={() => setRevealed(true)} />
        </>
      ) : (
        <>
          <Enter kind="pop" duration={600} style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
            {secret.role === 'word' ? (
              <>
                <View style={{ borderRadius: radii.cardLg, backgroundColor: colors.text, paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center', gap: 10 }}>
                  <Txt font="body600" size={12} ls={1} upper color={colors.mutedOnLight}>
                    Sua palavra
                  </Txt>
                  <Txt size={64} lh={1.15}>
                    {secret.emoji}
                  </Txt>
                  <Display size={64} color={colors.background} center adjustsFontSizeToFit numberOfLines={2}>
                    {secret.word}
                  </Display>
                  <Txt size={14} color={colors.mutedOnLight}>
                    Categoria: {category}
                  </Txt>
                </View>
                <Display size={26} lh={1.1} center>
                  Não deixe o impostor descobrir.
                </Display>
              </>
            ) : (
              <>
                <View
                  style={{
                    borderRadius: radii.cardLg,
                    backgroundColor: colors.background,
                    borderWidth: 2,
                    borderColor: colors.danger,
                    paddingVertical: 36,
                    paddingHorizontal: 24,
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <Eyes width={170} variant="danger" />
                  <Display size={48} color={colors.danger} center>
                    {'Você é o\nimpostor'}
                  </Display>
                </View>
                <Display size={26} lh={1.1} center>
                  Descubra a palavra sem ser descoberto.
                </Display>
              </>
            )}
          </Enter>
          <Button label="Entendi, esconder" onPress={() => armed && services.room.ackRole()} />
        </>
      )}
    </Screen>
  );
}
