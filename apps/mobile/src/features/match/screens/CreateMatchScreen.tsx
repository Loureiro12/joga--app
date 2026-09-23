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

import type { LikelyIntensity, LikelySettings } from '@jogae/engine';
import { roomErrorMessage } from '../hooks/roomActions';
import { getIdentity } from '../hooks/useIdentity';

/** No "Quem é Mais Provável?", `Aleatório` não é categoria: é a ausência de filtro. */
const ANY = 'Aleatório';

const INTENSITY_LABELS: Record<LikelyIntensity, { emoji: string; label: string }> = {
  leve: { emoji: '🟢', label: 'Leve' },
  moderado: { emoji: '🟡', label: 'Moderado' },
  pesado: { emoji: '🔴', label: 'Pesado' },
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
  const isPremium = usePremiumStore((s) => s.isPremium);
  const [players, setPlayers] = useState(game.defaults.players);
  const [category, setCategory] = useState(game.defaults.category);
  /** Só o "Quem é Mais Provável?" aceita várias categorias de uma vez. Vazio = todas. */
  const [categories, setCategories] = useState<string[]>([]);
  const [rounds, setRounds] = useState(game.defaults.rounds);
  const [intensities, setIntensities] = useState<LikelyIntensity[]>(['leve', 'moderado']);
  const [allowSelfVote, setAllowSelfVote] = useState(true);
  const [openVotes, setOpenVotes] = useState(true);
  const [competitive, setCompetitive] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleCategory = (id: string) => {
    if (id === ANY) return setCategories([]);
    setCategories((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]));
  };
  const toggleIntensity = (level: LikelyIntensity) => {
    // Pelo menos uma intensidade tem que ficar ligada, senão não há pergunta para sortear.
    setIntensities((current) => (current.includes(level) ? (current.length > 1 ? current.filter((i) => i !== level) : current) : [...current, level]));
  };

  const settings: LikelySettings | undefined = isLikely ? { categories, intensities, allowSelfVote, openVotes, competitive } : undefined;

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

  const categoryResumo = isLikely ? (categories.length === 0 ? 'todas as categorias' : `${categories.length} categoria${categories.length > 1 ? 's' : ''}`) : category;
  const roundsResumo = rounds === 0 ? 'sem limite' : `${rounds} rodadas`;

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
          {isLikely ? 'Categorias' : 'Categoria'}
        </Txt>
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
