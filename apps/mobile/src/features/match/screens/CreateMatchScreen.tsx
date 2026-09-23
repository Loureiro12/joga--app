import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { features } from '@/core/config/features';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Button, Chip, Screen, Segmented, Spacer, StackHeader, Stepper, Toggle, Txt, toast } from '@/core/ui';
import { getGame } from '@/features/catalog/data/games';
import { usePremiumStore } from '@/features/premium/premiumStore';
import { services } from '@/services';

import type { LikelyIntensity, LikelySettings, SecretContext, SecretDifficulty, SecretSettings } from '@jogae/engine';
import { SECRET_LIMITS } from '@jogae/engine';
import { roomErrorMessage } from '../hooks/roomActions';
import { getIdentity } from '../hooks/useIdentity';

/** No "Quem é Mais Provável?", `Aleatório` não é categoria: é a ausência de filtro. */
const ANY = 'Aleatório';

const INTENSITY_LABELS: Record<LikelyIntensity, { emoji: string; label: string }> = {
  leve: { emoji: '🟢', label: 'Leve' },
  moderado: { emoji: '🟡', label: 'Moderado' },
  pesado: { emoji: '🔴', label: 'Pesado' },
};

const DIFFICULTY_LABELS: Record<SecretDifficulty, { emoji: string; label: string }> = {
  facil: { emoji: '🟢', label: 'Fácil' },
  media: { emoji: '🟡', label: 'Média' },
  dificil: { emoji: '🔴', label: 'Difícil' },
};

/** Uma linha de liga/desliga, com o porquê embaixo — o host decide sem precisar adivinhar. */
function OptionRow({ title, hint, value, onToggle }: { title: string; hint: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radii.input, paddingVertical: 14, paddingHorizontal: 16 }}
    >
      <View style={{ flex: 1 }}>
        <Txt font="body600" size={15}>
          {title}
        </Txt>
        <Txt font="body400" size={12} lh={1.3} color={colors.muted} style={{ marginTop: 2 }}>
          {hint}
        </Txt>
      </View>
      <Toggle value={value} />
    </Pressable>
  );
}

/** Tela 8: Criar partida. Meta do design: começar em menos de 30 s. */
export function CreateMatchScreen() {
  const { gameId } = useLocalSearchParams<{ gameId?: string }>();
  const game = getGame(gameId) ?? getGame('impostor')!;
  const isLikely = game.engineId === 'likely';
  const isSecret = game.engineId === 'secret';
  const isPremium = usePremiumStore((s) => s.isPremium);
  const [players, setPlayers] = useState(game.defaults.players);
  const [category, setCategory] = useState(game.defaults.category);
  /** Só o "Quem é Mais Provável?" aceita várias categorias de uma vez. Vazio = todas. */
  const [categories, setCategories] = useState<string[]>([]);
  const [rounds, setRounds] = useState(game.defaults.rounds);
  const [intensities, setIntensities] = useState<LikelyIntensity[]>(['leve', 'moderado']);
  const [difficulties, setDifficulties] = useState<SecretDifficulty[]>(['facil', 'media']);
  const [accusations, setAccusations] = useState(2);
  const [allowSelfVote, setAllowSelfVote] = useState(true);
  const [openVotes, setOpenVotes] = useState(true);
  const [competitive, setCompetitive] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleCategory = (id: string) => {
    if (id === ANY) return setCategories([]);
    setCategories((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]));
  };
  const toggleDifficulty = (level: SecretDifficulty) => {
    // Sem nenhuma faixa ligada não há missão para sortear: a última não desliga.
    setDifficulties((current) => (current.includes(level) ? (current.length > 1 ? current.filter((d) => d !== level) : current) : [...current, level]));
  };
  const toggleIntensity = (level: LikelyIntensity) => {
    // Pelo menos uma intensidade tem que ficar ligada, senão não há pergunta para sortear.
    setIntensities((current) => (current.includes(level) ? (current.length > 1 ? current.filter((i) => i !== level) : current) : [...current, level]));
  };

  const settings: Partial<LikelySettings> & Partial<SecretSettings> | undefined = isLikely
    ? { categories, intensities, allowSelfVote, openVotes, competitive }
    : isSecret
      ? { context: category as SecretContext, difficulties, accusations, swaps: 1, competitive }
      : undefined;

  const create = async () => {
    setLoading(true);
    try {
      const input = { gameId: game.engineId ?? 'impostor', category: isLikely ? ANY : category, totalRounds: rounds, maxPlayers: players, settings };
      await services.room.createRoom(input, getIdentity());
      router.push(routes.match.lobby);
    } catch (e) {
      toast(roomErrorMessage(e, 'Não deu para criar a sala. Tente de novo.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const categoryResumo = isLikely
    ? categories.length === 0
      ? 'todas as categorias'
      : `${categories.length} categoria${categories.length > 1 ? 's' : ''}`
    : (game.wordCategories.find((c) => c.id === category)?.label ?? category);
  const roundsResumo = isSecret ? `${accusations} ${accusations === 1 ? 'acusação' : 'acusações'}` : rounds === 0 ? 'sem limite' : `${rounds} rodadas`;

  return (
    <Screen gap={22} header={<StackHeader title="Criar partida" onBack={() => router.back()} />}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radii.card,
          paddingVertical: 18,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Txt font="body600" size={16}>
          Jogadores
        </Txt>
        <Stepper value={players} min={game.minPlayers} max={game.maxPlayers} onChange={setPlayers} />
      </View>

      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          {isLikely ? 'Categorias' : isSecret ? 'Onde vai ser?' : 'Categoria'}
        </Txt>
        {isSecret && (
          <Txt font="body400" size={12} lh={1.3} color={colors.muted} style={{ marginTop: -6, marginBottom: 10 }}>
            Cada lugar tem missões próprias: no churrasco tem carne e fogo; na viagem, mala e roteiro.
          </Txt>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {game.wordCategories
            .filter((c) => features.premium || !c.premium)
            .map((c) => {
              const locked = !!c.premium && !isPremium;
              const selected = isLikely ? (c.id === ANY ? categories.length === 0 : categories.includes(c.id)) : c.id === category;
              return (
                <Chip
                  key={c.id}
                  emoji={c.emoji}
                  label={c.label}
                  state={locked ? 'locked' : selected ? 'selected' : 'default'}
                  onPress={() => (isLikely ? toggleCategory(c.id) : setCategory(c.id))}
                />
              );
            })}
        </View>
      </View>

      {isLikely && (
        <View>
          <Txt font="body600" size={16} style={{ marginBottom: 4 }}>
            Intensidade
          </Txt>
          <Txt font="body400" size={12} lh={1.3} color={colors.muted} style={{ marginBottom: 10 }}>
            Pesado traz perguntas mais pessoais. Ligue só se o grupo topar.
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(Object.keys(INTENSITY_LABELS) as LikelyIntensity[]).map((level) => (
              <Chip
                key={level}
                emoji={INTENSITY_LABELS[level].emoji}
                label={INTENSITY_LABELS[level].label}
                state={intensities.includes(level) ? 'selected' : 'default'}
                onPress={() => toggleIntensity(level)}
              />
            ))}
          </View>
        </View>
      )}

      {isSecret && (
        <>
          <View>
            <Txt font="body600" size={16} style={{ marginBottom: 4 }}>
              Dificuldade
            </Txt>
            <Txt font="body400" size={12} lh={1.3} color={colors.muted} style={{ marginBottom: 10 }}>
              As difíceis rendem mais história, mas é mais fácil ser pego.
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(Object.keys(DIFFICULTY_LABELS) as SecretDifficulty[]).map((level) => (
                <Chip
                  key={level}
                  emoji={DIFFICULTY_LABELS[level].emoji}
                  label={DIFFICULTY_LABELS[level].label}
                  state={difficulties.includes(level) ? 'selected' : 'default'}
                  onPress={() => toggleDifficulty(level)}
                />
              ))}
            </View>
          </View>

          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              paddingVertical: 14,
              paddingHorizontal: 20,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <View style={{ flex: 1 }}>
              <Txt font="body600" size={15}>
                Acusações por pessoa
              </Txt>
              <Txt font="body400" size={12} lh={1.3} color={colors.muted} style={{ marginTop: 2 }}>
                Poucas de propósito: com acusação de sobra, dá para chutar todo mundo.
              </Txt>
            </View>
            <Stepper value={accusations} min={SECRET_LIMITS.accusations.min} max={SECRET_LIMITS.accusations.max} onChange={setAccusations} />
          </View>

          <OptionRow
            title="Contar pontos"
            hint="Pontua quem cumpre e quem pega os outros. Desligado, é só cumpriu ou não."
            value={competitive}
            onToggle={() => setCompetitive((v) => !v)}
          />
        </>
      )}

      {!isSecret && (
      <View>
        <Txt font="body600" size={16} style={{ marginBottom: 10 }}>
          {isLikely ? 'Perguntas' : 'Rodadas'}
        </Txt>
        <Segmented
          value={rounds}
          onChange={setRounds}
          itemHeight={48}
          fontSize={24}
          font="display800"
          options={game.roundOptions.map((n) => ({ value: n, label: n === 0 ? '∞' : String(n) }))}
        />
      </View>
      )}

      {isLikely && (
        <View style={{ gap: 8 }}>
          <OptionRow
            title="Votar em si mesmo"
            hint="Às vezes a pergunta é você mesmo. E ninguém votar em si também rende."
            value={allowSelfVote}
            onToggle={() => setAllowSelfVote((v) => !v)}
          />
          <OptionRow
            title="Mostrar quem votou em quem"
            hint="Desligado, aparece só a contagem. Ligado, o grupo tem o que defender."
            value={openVotes}
            onToggle={() => setOpenVotes((v) => !v)}
          />
          <OptionRow
            title="Contar pontos"
            hint="Pontua quem adivinha a escolha da maioria. Desligado, é só pelo riso."
            value={competitive}
            onToggle={() => setCompetitive((v) => !v)}
          />
        </View>
      )}

      <Spacer />

      <Txt font="body400" size={13} color={colors.muted} center>
        {game.name} · {categoryResumo} · {roundsResumo} · até {players} jogadores
      </Txt>
      {players < game.recommendedPlayers && (
        <Txt font="body400" size={12} lh={1.35} color={colors.muted} center>
          Com menos de {game.recommendedPlayers} o jogo fica previsível — mas a sala abre do mesmo jeito.
        </Txt>
      )}
      <Button label="Criar sala" loading={loading} onPress={create} />
    </Screen>
  );
}
