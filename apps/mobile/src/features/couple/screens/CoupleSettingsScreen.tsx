import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Button, Chip, Display, Screen, Segmented, Spacer, StackHeader, Txt } from '@/core/ui';

import { COUPLE_CATEGORIES, COUPLE_LENGTHS, INTIMATE_CATEGORY, countCards, sanitizeCoupleSettings, type CoupleMood } from '@jogae/engine';

import { coupleActions } from '../coupleStore';

const MOODS: { value: CoupleMood; emoji: string; label: string; hint: string }[] = [
  { value: 'leve', emoji: '😊', label: 'Leve', hint: 'Perguntas divertidas e tranquilas, para rir juntos.' },
  { value: 'conectar', emoji: '❤️', label: 'Conectar', hint: 'Sentimentos, carinho e o que vocês são um para o outro.' },
  { value: 'profundo', emoji: '🧠', label: 'Profundo', hint: 'Perguntas que pedem um pouco mais de reflexão. Começa leve e vai descendo.' },
  { value: 'intimidade', emoji: '🔥', label: 'Intimidade', hint: 'Inclui atração, desejo e proximidade física, junto com as outras. Só aparece se vocês escolherem.' },
  { value: 'surpresa', emoji: '🔀', label: 'Surpresa', hint: 'Mistura os climas, menos intimidade.' },
];

const CATEGORY_EMOJI: Record<string, string> = {
  'Nosso relacionamento': '❤️',
  'Nossa história': '🕰',
  'Sobre você': '👀',
  'Amor e carinho': '🤍',
  Comunicação: '💬',
  Futuro: '🌱',
  'Vida juntos': '🏠',
  'Leve e divertido': '😂',
  Valores: '🧭',
  [INTIMATE_CATEGORY]: '🔥',
};

const LENGTH_LABEL: Record<number, string> = { 5: 'Rapidinho', 10: 'Um momento', 20: 'Sem pressa', 0: 'Livre' };

export function CoupleSettingsScreen() {
  const [mood, setMood] = useState<CoupleMood>('conectar');
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState<number>(10);

  const climaAtual = MOODS.find((m) => m.value === mood)!;
  const settings = sanitizeCoupleSettings({ mood, categories, total, names: ['a', 'b'] });
  const disponiveis = countCards(settings);
  // A categoria de intimidade só existe dentro do clima que a destrava.
  const categoriasDaVez = COUPLE_CATEGORIES.filter((c) => c !== INTIMATE_CATEGORY || mood === 'intimidade');

  const toggle = (categoria: string) =>
    setCategories((atual) => (atual.includes(categoria) ? atual.filter((c) => c !== categoria) : [...atual, categoria]));

  const começar = () => {
    coupleActions.start({ mood, categories, total });
    router.replace(routes.couple.session);
  };

  return (
    <Screen gap={22} header={<StackHeader title="Como vai ser" onBack={() => router.back()} />}>
      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          Como vocês querem conversar hoje?
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MOODS.map((m) => (
            <Chip
              key={m.value}
              emoji={m.emoji}
              label={m.label}
              state={mood === m.value ? 'selected' : 'default'}
              onPress={() => {
                setMood(m.value);
                // Sair do clima de intimidade não pode deixar a categoria marcada para trás.
                if (m.value !== 'intimidade') setCategories((c) => c.filter((x) => x !== INTIMATE_CATEGORY));
              }}
            />
          ))}
        </View>
        <Txt font="body400" size={12} lh={1.4} color={colors.muted} style={{ marginTop: 8 }}>
          {climaAtual.hint}
        </Txt>
      </View>

      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 4 }}>
          Sobre o que?
        </Txt>
        <Txt font="body400" size={12} lh={1.35} color={colors.muted} style={{ marginBottom: 10 }}>
          Sem marcar nada, vem de tudo um pouco.
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {categoriasDaVez.map((c) => (
            <Chip key={c} emoji={CATEGORY_EMOJI[c]} label={c} state={categories.includes(c) ? 'selected' : 'default'} onPress={() => toggle(c)} />
          ))}
        </View>
      </View>

      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          Quantas perguntas?
        </Txt>
        <Segmented
          value={total}
          onChange={setTotal}
          itemHeight={48}
          fontSize={22}
          font="display800"
          options={COUPLE_LENGTHS.map((n) => ({ value: n, label: n === 0 ? '∞' : String(n) }))}
        />
        <Txt font="body400" size={12} color={colors.muted} center style={{ marginTop: 8 }}>
          {LENGTH_LABEL[total]} · sem cronômetro, fiquem numa pergunta o quanto quiserem
        </Txt>
      </View>

      {/* O combinado antes de começar (§41). Curto, porque ninguém lê regra num jogo de casal. */}
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.card, padding: 18, gap: 4 }}>
        <Display size={18}>Um combinado</Display>
        <Txt font="body400" size={13} lh={1.45} color={colors.muted}>
          Qualquer pergunta pode ser pulada, sem explicar por quê. Escutar também faz parte. E não é
          sobre provar quem está certo.
        </Txt>
      </View>

      <Spacer />

      <Txt font="body400" size={13} color={colors.muted} center>
        {disponiveis} perguntas no baralho
      </Txt>
      <Button label="Começar ❤️" onPress={começar} />
    </Screen>
  );
}
