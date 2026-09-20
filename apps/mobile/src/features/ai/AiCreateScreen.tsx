import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { routes } from '@/core/navigation/routes';
import { colors, fonts, radii } from '@/core/theme';
import { BackButton, Button, Chip, Display, Overline, Screen, Skeleton, Spacer, Txt } from '@/core/ui';
import { usePremiumStore } from '@/features/premium/premiumStore';
import { services } from '@/services';

import { extractHints, type AiSuggestion } from './AiGameService';

const EXAMPLE = 'Somos 7 amigos em uma viagem e queremos algo engraçado para jogar durante uns 20 minutos.';

/** Tela 22: Criação com IA (Premium). Sem o entitlement, cai no paywall. */
export function AiCreateScreen() {
  const isPremium = usePremiumStore((s) => s.isPremium);
  const [prompt, setPrompt] = useState(EXAMPLE);
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const hints = useMemo(() => extractHints(prompt), [prompt]);

  // Sugere de novo 600 ms depois da última tecla.
  useEffect(() => {
    if (!isPremium || prompt.trim().length < 12) {
      setSuggestion(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const s = await services.ai.suggest(prompt).catch(() => null);
      if (!alive) return;
      setSuggestion(s);
      setLoading(false);
    }, 600);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [prompt, isPremium]);

  if (!isPremium) return <Redirect href={{ pathname: routes.premium, params: { from: 'ai' } }} />;

  return (
    <Screen
      header={
        <BackButton onPress={() => router.back()} />
      }
    >
      <View>
        <Overline color={colors.primaryLight}>✨ Premium</Overline>
        <Display size={40} style={{ marginTop: 6 }}>
          Que tipo de jogo vocês querem?
        </Display>
      </View>

      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        multiline
        placeholder={EXAMPLE}
        placeholderTextColor={colors.muted}
        selectionColor={colors.primaryLight}
        accessibilityLabel="Descreva o grupo e o jogo"
        style={[
          {
            minHeight: 120,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.surfaceLight,
            borderRadius: radii.list,
            padding: 16,
            color: colors.text,
            fontFamily: fonts.body400,
            fontSize: 16,
            lineHeight: 23,
            textAlignVertical: 'top',
          },
          { outlineWidth: 0 } as object,
        ]}
      />

      {hints.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {hints.map((h) => (
            <Chip key={h.label} emoji={h.emoji} label={h.label} state="soft" size="sm" />
          ))}
        </View>
      )}

      {loading && !suggestion && <Skeleton height={190} radius={radii.card} />}

      {suggestion && (
        <Enter key={suggestion.title} style={{ opacity: loading ? 0.6 : 1 }}>
          <View style={{ backgroundColor: colors.primary, borderRadius: radii.card, padding: 20, gap: 10 }}>
            <Overline color="rgba(250,250,250,0.8)">Sugestão</Overline>
            <Display size={36}>{suggestion.title}</Display>
            <Txt size={13} opacity={0.85}>
              {suggestion.players} jogadores · ~{suggestion.minutes} minutos
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              {(
                [
                  [suggestion.counts.questions, 'perguntas'],
                  [suggestion.counts.challenges, 'desafios'],
                  [suggestion.counts.specials, 'especiais'],
                ] as const
              ).map(([n, label]) => (
                <View key={label} style={{ flex: 1, backgroundColor: colors.overlayDarkSoft, borderRadius: 14, padding: 10, alignItems: 'center' }}>
                  <Display size={24}>{n}</Display>
                  <Txt size={11} opacity={0.8}>
                    {label}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        </Enter>
      )}

      <Spacer />
      <Button label="Começar" variant="action" disabled={!suggestion} onPress={() => router.push(routes.createMatch('impostor'))} />
    </Screen>
  );
}
