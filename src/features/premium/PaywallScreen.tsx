import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Trophy } from '@/core/illustrations';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { BackButton, Badge, Button, CheckCircle, Display, Overline, Screen, Spacer, Txt, toast } from '@/core/ui';
import { services } from '@/services';

import { PLANS, type PlanId } from './BillingService';
import { usePremiumStore } from './premiumStore';

const PERKS: [string, string][] = [
  ['✨', 'Jogos criados com IA'],
  ['🎮', 'Todos os jogos'],
  ['🔥', 'Categorias exclusivas'],
  ['♾️', 'Partidas ilimitadas'],
  ['🎨', 'Criação de jogos personalizados'],
];

/** Tela 28: Premium (paywall). */
export function PaywallScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { isPremium, setPremium } = usePremiumStore();
  const [planId, setPlanId] = useState<PlanId>('jogae_yearly');
  const [loading, setLoading] = useState(false);
  const plan = PLANS.find((p) => p.id === planId)!;

  const close = () => (router.canGoBack() ? router.back() : router.replace(routes.profile));

  const subscribe = async () => {
    setLoading(true);
    try {
      const { premium } = await services.billing.purchase(planId);
      setPremium(premium);
      if (premium) {
        toast('Premium desbloqueado', 'trophy');
        if (from === 'ai') router.replace(routes.ai);
        else close();
      }
    } catch {
      toast('A compra não foi concluída.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen gap={20}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <BackButton glyph="✕" onPress={close} />
        <Badge label="✨ Premium" kind="premium" />
      </View>

      <View style={{ backgroundColor: colors.primary, borderRadius: radii.cardLg, padding: 24, minHeight: 250, justifyContent: 'flex-end', overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: 20, top: 18, opacity: 0.95 }}>
          <Trophy size={96} />
        </View>
        <Display size={56}>{'Desbloqueie\ntudo.'}</Display>
        <Txt size={14} opacity={0.85} style={{ marginTop: 10 }}>
          Para o grupo inteiro — só um assina.
        </Txt>
      </View>

      <View style={{ gap: 6 }}>
        {PERKS.map(([emoji, label]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 4 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={18}>{emoji}</Txt>
            </View>
            <Txt font="body600" size={16} style={{ flex: 1 }}>
              {label}
            </Txt>
            <CheckCircle size={22} />
          </View>
        ))}
      </View>

      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
        {PLANS.map((p) => {
          const selected = p.id === planId;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setPlanId(p.id)}
              style={{ flex: 1, borderRadius: radii.cardSm, paddingVertical: 18, paddingHorizontal: 16, backgroundColor: colors.surface, borderWidth: 2, borderColor: selected ? colors.accent : 'transparent', gap: 6 }}
            >
              {p.badge && (
                <View style={{ position: 'absolute', top: -10, right: 12 }}>
                  <Badge label={p.badge} kind="hot" />
                </View>
              )}
              <Overline>{p.label}</Overline>
              <Display size={34}>{p.price}</Display>
              <Txt size={12} color={colors.muted}>
                {p.caption}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <Spacer />

      {isPremium ? (
        <Button label="Você já é Premium ✓" variant="success" onPress={close} />
      ) : (
        <Button label={`Começar 7 dias grátis · ${plan.ctaSuffix}`} variant="action" loading={loading} onPress={subscribe} />
      )}
      <Txt font="body400" size={12} lh={1.4} color={colors.muted} center>
        7 dias grátis. Cancele quando quiser.
      </Txt>
    </Screen>
  );
}
