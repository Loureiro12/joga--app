import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { colors } from '@/core/theme';
import { Button, Chip, Screen, Segmented, Spacer, StackHeader, Txt } from '@/core/ui';

import {
  ALPHABET_CATEGORIES,
  BOMB_CATEGORIES,
  countChallenges,
  countThemes,
  DEFAULT_ALPHABET_SETTINGS,
  DEFAULT_BOMB_SETTINGS,
  type BombDifficulty,
  type BombMode,
} from '@jogae/engine';
import { bombActions, useBombRoster } from '../bombStore';

/** `Aleatório` não é categoria: é a ausência de filtro. */
const ANY = 'Aleatório';

/** As categorias do Alfabeto agrupam temas, não tipos de desafio. */
const ALPHABET_EMOJI: Record<string, string> = {
  Natureza: '🌿',
  Comida: '🍔',
  Lugares: '🌎',
  Cultura: '🎬',
  'Dia a dia': '🏠',
  Diversão: '🎉',
};

const CATEGORY_EMOJI: Record<string, string> = {
  'Conhecimentos gerais': '🌎',
  Engraçado: '😂',
  'Filmes e séries': '🎬',
  Esportes: '⚽',
  Música: '🎵',
  Comida: '🍔',
  Lugares: '🌍',
  Games: '🎮',
  Festa: '🎉',
  Caos: '👀',
};

const DIFFICULTY: { value: BombDifficulty[]; label: string }[] = [
  { value: ['facil'], label: '🟢 Fácil' },
  { value: ['facil', 'medio'], label: '🟡 Médio' },
  { value: ['facil', 'medio', 'dificil'], label: '🔴 Todas' },
];

const MODES: { value: BombMode; label: string; hint: string }[] = [
  { value: 'casual', label: 'Casual', hint: 'Sem eliminação. Cada explosão é uma bomba no seu nome; menos bombas, melhor.' },
  { value: 'eliminacao', label: 'Eliminação', hint: '3 vidas para cada um. Quem zera sai, e a partida vai até sobrar uma pessoa.' },
  { value: 'pontos', label: 'Pontos', hint: 'Ponto por passagem e por sobreviver à rodada.' },
];

export function BombSettingsScreen() {
  const { variant } = useLocalSearchParams<{ variant?: string }>();
  const alfabeto = variant === 'alfabeto';
  const padrao = alfabeto ? DEFAULT_ALPHABET_SETTINGS : DEFAULT_BOMB_SETTINGS;

  const roster = useBombRoster();
  const [categories, setCategories] = useState<string[]>([]);
  const [difficulties, setDifficulties] = useState<BombDifficulty[]>(padrao.difficulties);
  const [totalRounds, setTotalRounds] = useState(padrao.totalRounds);
  const [mode, setMode] = useState<BombMode>('casual');
  const [order, setOrder] = useState<'circular' | 'caos'>('circular');
  const [hardcore, setHardcore] = useState(false);

  const settings = {
    ...padrao,
    variant: alfabeto ? ('alfabeto' as const) : ('classico' as const),
    categories,
    difficulties,
    totalRounds,
    mode,
    order,
    lives: 3,
    letterSet: hardcore ? ('hardcore' as const) : ('normal' as const),
  };
  const disponiveis = alfabeto ? countThemes(settings) : countChallenges(settings);
  const modoAtual = MODES.find((m) => m.value === mode)!;
  const categoriasDaVez = alfabeto ? ALPHABET_CATEGORIES : BOMB_CATEGORIES;
  const emojiDe = (c: string) => (alfabeto ? ALPHABET_EMOJI[c] : CATEGORY_EMOJI[c]);

  const toggleCategory = (id: string) => {
    if (id === ANY) return setCategories([]);
    setCategories((atual) => (atual.includes(id) ? atual.filter((c) => c !== id) : [...atual, id]));
  };

  const start = () => {
    bombActions.start(settings);
    router.replace(routes.bomb.round);
  };

  return (
    <Screen gap={22} header={<StackHeader title="Como vai ser" onBack={() => router.back()} />}>
      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          Categorias
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip emoji="🎲" label={ANY} state={categories.length === 0 ? 'selected' : 'default'} onPress={() => toggleCategory(ANY)} />
          {categoriasDaVez.map((c) => (
            <Chip key={c} emoji={emojiDe(c)} label={c} state={categories.includes(c) ? 'selected' : 'default'} onPress={() => toggleCategory(c)} />
          ))}
        </View>
      </View>

      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          Dificuldade
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {DIFFICULTY.map((d) => (
            <Chip
              key={d.label}
              label={d.label}
              state={d.value.length === difficulties.length ? 'selected' : 'default'}
              onPress={() => setDifficulties(d.value)}
            />
          ))}
        </View>
      </View>

      {alfabeto && (
        <View>
          <Txt font="body600" size={16} style={{ marginBottom: 4 }}>
            Letras
          </Txt>
          <Txt font="body400" size={12} lh={1.35} color={colors.muted} style={{ marginBottom: 10 }}>
            No normal aparecem só as letras que aquele tema comporta. No hardcore vem o alfabeto
            inteiro — inclusive K, W, X e Y, e o grupo que se vire.
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip emoji="🔤" label="Normal" state={hardcore ? 'default' : 'selected'} onPress={() => setHardcore(false)} />
            <Chip emoji="🔥" label="Hardcore" state={hardcore ? 'selected' : 'default'} onPress={() => setHardcore(true)} />
          </View>
        </View>
      )}

      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          Rodadas
        </Txt>
        <Segmented
          value={totalRounds}
          onChange={setTotalRounds}
          itemHeight={48}
          fontSize={24}
          font="display800"
          options={(alfabeto ? [3, 5, 10, 0] : [5, 10, 15, 0]).map((n) => ({ value: n, label: n === 0 ? '∞' : String(n) }))}
        />
      </View>

      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          Modo
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {MODES.map((m) => (
            <Chip key={m.value} label={m.label} state={mode === m.value ? 'selected' : 'default'} onPress={() => setMode(m.value)} />
          ))}
        </View>
        <Txt font="body400" size={12} lh={1.35} color={colors.muted} style={{ marginTop: 8 }}>
          {modoAtual.hint}
        </Txt>
      </View>

      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          Ordem
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip emoji="🔄" label="Circular" state={order === 'circular' ? 'selected' : 'default'} onPress={() => setOrder('circular')} />
          <Chip emoji="🔀" label="Caos" state={order === 'caos' ? 'selected' : 'default'} onPress={() => setOrder('caos')} />
        </View>
        <Txt font="body400" size={12} lh={1.35} color={colors.muted} style={{ marginTop: 8 }}>
          {order === 'circular' ? 'A bomba segue a ordem da lista.' : 'A cada passagem o app sorteia quem recebe. Ninguém recebe duas vezes seguidas.'}
        </Txt>
      </View>

      <Spacer />

      <Txt font="body400" size={13} color={colors.muted} center>
        {roster.length} jogadores · {disponiveis} {alfabeto ? 'temas' : 'desafios'} no baralho
      </Txt>
      <Button label="Acender o pavio 🔥" onPress={start} />
    </Screen>
  );
}
