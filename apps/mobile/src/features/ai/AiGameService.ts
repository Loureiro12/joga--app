import { wait } from '@/core/utils/format';

export type AiHint = { emoji: string; label: string };

export type AiSuggestion = {
  title: string;
  players: number;
  minutes: number;
  counts: { questions: number; challenges: number; specials: number };
};

/** Fase 2: endpoint próprio que chama um LLM e devolve um jogo montado. */
export interface AiGameService {
  suggest(prompt: string): Promise<AiSuggestion>;
}

const MOODS: { re: RegExp; emoji: string; label: string; title: string }[] = [
  { re: /engra[cç]ad|rir|risada|zoeira/i, emoji: '😂', label: 'engraçado', title: 'Caos' },
  { re: /ca[oó]tic|bagun[cç]a|loucura/i, emoji: '🔥', label: 'caótico', title: 'Loucura' },
  { re: /pol[eê]mic|treta/i, emoji: '👀', label: 'polêmico', title: 'Treta' },
  { re: /casal|casais|rom[aâ]ntic/i, emoji: '❤️', label: 'casais', title: 'Clima' },
  { re: /fam[ií]lia|crian[cç]a/i, emoji: '👨‍👩‍👧', label: 'família', title: 'Domingo' },
];

const PLACES: { re: RegExp; label: string }[] = [
  { re: /viage|viagem|estrada/i, label: 'na viagem' },
  { re: /praia/i, label: 'na praia' },
  { re: /churras/i, label: 'no churrasco' },
  { re: /bar|boteco/i, label: 'no bar' },
  { re: /festa|anivers/i, label: 'na festa' },
];

const peopleOf = (t: string) => Number(t.match(/(\d{1,2})\s*(amig|pesso|jogador|galera|primo|coleg)/i)?.[1] ?? t.match(/somos\s+(\d{1,2})/i)?.[1] ?? 0);
const minutesOf = (t: string) => Number(t.match(/(\d{1,3})\s*min/i)?.[1] ?? 0);

/** Extração local dos chips (roda a cada tecla; não precisa de rede). */
export function extractHints(prompt: string): AiHint[] {
  const hints: AiHint[] = [];
  const mood = MOODS.find((m) => m.re.test(prompt));
  if (mood) hints.push({ emoji: mood.emoji, label: mood.label });
  const people = peopleOf(prompt);
  if (people) hints.push({ emoji: '👥', label: `${people} pessoas` });
  const minutes = minutesOf(prompt);
  if (minutes) hints.push({ emoji: '⏱', label: `${minutes} min` });
  return hints;
}

export class MockAiGameService implements AiGameService {
  async suggest(prompt: string): Promise<AiSuggestion> {
    await wait(700);
    const mood = MOODS.find((m) => m.re.test(prompt));
    const place = PLACES.find((p) => p.re.test(prompt));
    const minutes = minutesOf(prompt) || 20;
    return {
      title: `${mood?.title ?? 'Rolê'} ${place?.label ?? 'da galera'}`,
      players: Math.min(12, Math.max(3, peopleOf(prompt) || 6)),
      minutes,
      counts: { questions: Math.round(minutes * 0.6), challenges: Math.round(minutes * 0.4), specials: 3 },
    };
  }
}
