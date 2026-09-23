import type { ImpostorRoundResult, Player, PlayerId, TallyEntry } from '../types';

/**
 * Regras puras do Impostor (sem I/O, sem timers) — reutilizáveis pelo mock hoje
 * e por uma edge function/servidor amanhã. Jogos novos ganham um módulo irmão deste.
 */

type Word = { word: string; emoji: string };

/**
 * Uma palavra por rodada. Critério para acrescentar: substantivo concreto que qualquer grupo
 * brasileiro reconheça e consiga descrever sem dizer o nome — é isso que dá pista ao impostor.
 * Sem nomes de pessoas reais (envelhecem) e sem palavra repetida entre categorias (`usedWords`
 * é único por partida: repetida em duas listas, ela sumiria da segunda).
 * O emoji só acompanha a palavra para quem é inocente; o impostor não recebe nenhum dos dois.
 */
const WORD_BANK: Record<string, Word[]> = {
  Comidas: [
    { word: 'Pizza', emoji: '🍕' },
    { word: 'Sushi', emoji: '🍣' },
    { word: 'Brigadeiro', emoji: '🍫' },
    { word: 'Churrasco', emoji: '🥩' },
    { word: 'Pastel', emoji: '🥟' },
    { word: 'Açaí', emoji: '🍇' },
    { word: 'Coxinha', emoji: '🍗' },
    { word: 'Feijoada', emoji: '🍲' },
    { word: 'Sorvete', emoji: '🍦' },
    { word: 'Pipoca', emoji: '🍿' },
    { word: 'Lasanha', emoji: '🍝' },
    { word: 'Hambúrguer', emoji: '🍔' },
    { word: 'Tapioca', emoji: '🫓' },
    { word: 'Pão de queijo', emoji: '🧀' },
    { word: 'Strogonoff', emoji: '🍛' },
    { word: 'Farofa', emoji: '🌾' },
    { word: 'Cuscuz', emoji: '🌽' },
    { word: 'Bolo de cenoura', emoji: '🥕' },
    { word: 'Pudim', emoji: '🍮' },
    { word: 'Paçoca', emoji: '🥜' },
    { word: 'Empada', emoji: '🥧' },
    { word: 'Esfiha', emoji: '🥙' },
    { word: 'Misto quente', emoji: '🥪' },
    { word: 'Canjica', emoji: '🥥' },
    { word: 'Pamonha', emoji: '🫔' },
    { word: 'Guaraná', emoji: '🥤' },
    { word: 'Caipirinha', emoji: '🍹' },
    { word: 'Panetone', emoji: '🎄' },
    { word: 'Milkshake', emoji: '🥛' },
    { word: 'Salada de frutas', emoji: '🍓' },
  ],
  Filmes: [
    { word: 'Titanic', emoji: '🚢' },
    { word: 'Shrek', emoji: '🧅' },
    { word: 'Matrix', emoji: '🕶️' },
    { word: 'Rei Leão', emoji: '🦁' },
    { word: 'Tropa de Elite', emoji: '🚔' },
    { word: 'Harry Potter', emoji: '🧙' },
    { word: 'Procurando Nemo', emoji: '🐠' },
    { word: 'Vingadores', emoji: '🦸' },
    { word: 'Cidade de Deus', emoji: '🎥' },
    { word: 'Jurassic Park', emoji: '🦖' },
    { word: 'Star Wars', emoji: '⭐' },
    { word: 'Toy Story', emoji: '🤠' },
    { word: 'Frozen', emoji: '❄️' },
    { word: 'Senhor dos Anéis', emoji: '💍' },
    { word: 'De Volta para o Futuro', emoji: '⏰' },
    { word: 'Homem-Aranha', emoji: '🕷️' },
    { word: 'Batman', emoji: '🦇' },
    { word: 'Pantera Negra', emoji: '🐆' },
    { word: 'Up: Altas Aventuras', emoji: '🎈' },
    { word: 'Divertida Mente', emoji: '😊' },
    { word: 'O Auto da Compadecida', emoji: '🌵' },
    { word: 'Minha Mãe é uma Peça', emoji: '👜' },
    { word: 'Carros', emoji: '🏎️' },
    { word: 'Piratas do Caribe', emoji: '🏴‍☠️' },
    { word: 'Rocky', emoji: '🥊' },
    { word: 'O Poderoso Chefão', emoji: '🎩' },
    { word: 'Coringa', emoji: '🃏' },
    { word: 'Avatar', emoji: '💙' },
    { word: 'Velozes e Furiosos', emoji: '🏁' },
    { word: 'Moana', emoji: '🌊' },
  ],
  Futebol: [
    { word: 'Pênalti', emoji: '🥅' },
    { word: 'Goleiro', emoji: '🧤' },
    { word: 'Maracanã', emoji: '🏟️' },
    { word: 'Escanteio', emoji: '🚩' },
    { word: 'Cartão vermelho', emoji: '🟥' },
    { word: 'Copa do Mundo', emoji: '🏆' },
    { word: 'Impedimento', emoji: '🙅' },
    { word: 'Bicicleta', emoji: '🚲' },
    { word: 'Técnico', emoji: '📋' },
    { word: 'Torcida', emoji: '📣' },
    { word: 'Árbitro', emoji: '⚖️' },
    { word: 'Zagueiro', emoji: '🛡️' },
    { word: 'Atacante', emoji: '🎯' },
    { word: 'Banco de reservas', emoji: '🪑' },
    { word: 'Pelada', emoji: '🏃' },
    { word: 'Chuteira', emoji: '👟' },
    { word: 'Apito', emoji: '📯' },
    { word: 'Vestiário', emoji: '🚿' },
    { word: 'Caneta', emoji: '🖊️' },
    { word: 'Contra-ataque', emoji: '⚡' },
    { word: 'Camisa 10', emoji: '🔟' },
    { word: 'Arquibancada', emoji: '🎫' },
    { word: 'Gandula', emoji: '🙋' },
    { word: 'Cabeçada', emoji: '💥' },
    { word: 'Uniforme', emoji: '👕' },
    { word: 'Narrador', emoji: '🎙️' },
    { word: 'Golaço', emoji: '💫' },
    { word: 'Prorrogação', emoji: '⏱️' },
    { word: 'Hexa', emoji: '6️⃣' },
    { word: 'Seleção', emoji: '🇧🇷' },
  ],
  Lugares: [
    { word: 'Praia', emoji: '🏖️' },
    { word: 'Paris', emoji: '🗼' },
    { word: 'Shopping', emoji: '🛍️' },
    { word: 'Aeroporto', emoji: '✈️' },
    { word: 'Academia', emoji: '🏋️' },
    { word: 'Cinema', emoji: '🎦' },
    { word: 'Hospital', emoji: '🏥' },
    { word: 'Cristo Redentor', emoji: '⛰️' },
    { word: 'Fazenda', emoji: '🐄' },
    { word: 'Escola', emoji: '🏫' },
    { word: 'Supermercado', emoji: '🛒' },
    { word: 'Praça', emoji: '🌳' },
    { word: 'Igreja', emoji: '⛪' },
    { word: 'Padaria', emoji: '🥖' },
    { word: 'Barbearia', emoji: '💈' },
    { word: 'Zoológico', emoji: '🦒' },
    { word: 'Museu', emoji: '🏛️' },
    { word: 'Biblioteca', emoji: '📚' },
    { word: 'Rodoviária', emoji: '🚌' },
    { word: 'Posto de gasolina', emoji: '⛽' },
    { word: 'Salão de beleza', emoji: '💇' },
    { word: 'Banco', emoji: '🏦' },
    { word: 'Farmácia', emoji: '💊' },
    { word: 'Cachoeira', emoji: '💦' },
    { word: 'Deserto', emoji: '🏜️' },
    { word: 'Amazônia', emoji: '🌴' },
    { word: 'Nova York', emoji: '🗽' },
    { word: 'Castelo', emoji: '🏰' },
    { word: 'Metrô', emoji: '🚇' },
    { word: 'Feira livre', emoji: '🍎' },
  ],
  Animais: [
    { word: 'Cachorro', emoji: '🐶' },
    { word: 'Gato', emoji: '🐱' },
    { word: 'Elefante', emoji: '🐘' },
    { word: 'Girafa', emoji: '🦒' },
    { word: 'Pinguim', emoji: '🐧' },
    { word: 'Tubarão', emoji: '🦈' },
    { word: 'Cobra', emoji: '🐍' },
    { word: 'Macaco', emoji: '🐒' },
    { word: 'Jacaré', emoji: '🐊' },
    { word: 'Capivara', emoji: '🦫' },
    { word: 'Preguiça', emoji: '🦥' },
    { word: 'Tucano', emoji: '🦜' },
    { word: 'Formiga', emoji: '🐜' },
    { word: 'Baleia', emoji: '🐋' },
    { word: 'Cavalo', emoji: '🐴' },
    { word: 'Galinha', emoji: '🐔' },
    { word: 'Porco', emoji: '🐷' },
    { word: 'Vaca', emoji: '🐮' },
    { word: 'Coruja', emoji: '🦉' },
    { word: 'Morcego', emoji: '🦇' },
    { word: 'Aranha', emoji: '🕷️' },
    { word: 'Golfinho', emoji: '🐬' },
    { word: 'Urso', emoji: '🐻' },
    { word: 'Zebra', emoji: '🦓' },
    { word: 'Camelo', emoji: '🐫' },
    { word: 'Pavão', emoji: '🦚' },
    { word: 'Caranguejo', emoji: '🦀' },
    { word: 'Abelha', emoji: '🐝' },
    { word: 'Tartaruga', emoji: '🐢' },
    { word: 'Canguru', emoji: '🦘' },
  ],
  Profissões: [
    { word: 'Médico', emoji: '🩺' },
    { word: 'Professor', emoji: '👩‍🏫' },
    { word: 'Bombeiro', emoji: '🚒' },
    { word: 'Policial', emoji: '👮' },
    { word: 'Cozinheiro', emoji: '👨‍🍳' },
    { word: 'Dentista', emoji: '🦷' },
    { word: 'Motorista de app', emoji: '🚕' },
    { word: 'Cabeleireiro', emoji: '✂️' },
    { word: 'Pedreiro', emoji: '🧱' },
    { word: 'Garçom', emoji: '🍽️' },
    { word: 'Piloto', emoji: '🛫' },
    { word: 'Enfermeiro', emoji: '💉' },
    { word: 'Advogado', emoji: '📜' },
    { word: 'Jornalista', emoji: '📰' },
    { word: 'Fotógrafo', emoji: '📷' },
    { word: 'Programador', emoji: '💻' },
    { word: 'Veterinário', emoji: '🐾' },
    { word: 'Eletricista', emoji: '💡' },
    { word: 'Encanador', emoji: '🔧' },
    { word: 'Padeiro', emoji: '🥐' },
    { word: 'Caminhoneiro', emoji: '🚚' },
    { word: 'Pescador', emoji: '🎣' },
    { word: 'Astronauta', emoji: '🚀' },
    { word: 'Cantor', emoji: '🎤' },
    { word: 'Ator', emoji: '🎭' },
    { word: 'DJ', emoji: '🎧' },
    { word: 'Carteiro', emoji: '📮' },
    { word: 'Mecânico', emoji: '🔩' },
    { word: 'Arquiteto', emoji: '📐' },
    { word: 'Manicure', emoji: '💅' },
  ],
  Objetos: [
    { word: 'Guarda-chuva', emoji: '☂️' },
    { word: 'Escova de dente', emoji: '🪥' },
    { word: 'Chinelo', emoji: '🩴' },
    { word: 'Controle remoto', emoji: '📺' },
    { word: 'Geladeira', emoji: '🧊' },
    { word: 'Ventilador', emoji: '🌀' },
    { word: 'Travesseiro', emoji: '🛏️' },
    { word: 'Espelho', emoji: '🪞' },
    { word: 'Carteira', emoji: '👛' },
    { word: 'Óculos', emoji: '👓' },
    { word: 'Relógio', emoji: '⌚' },
    { word: 'Chave', emoji: '🔑' },
    { word: 'Mochila', emoji: '🎒' },
    { word: 'Carregador', emoji: '🔌' },
    { word: 'Micro-ondas', emoji: '♨️' },
    { word: 'Liquidificador', emoji: '🧃' },
    { word: 'Ferro de passar', emoji: '👔' },
    { word: 'Cortador de unha', emoji: '💅' },
    { word: 'Panela de pressão', emoji: '🍲' },
    { word: 'Rede de dormir', emoji: '🌙' },
    { word: 'Varal', emoji: '🧺' },
    { word: 'Máquina de lavar', emoji: '🫧' },
    { word: 'Secador de cabelo', emoji: '💨' },
    { word: 'Isqueiro', emoji: '🔥' },
    { word: 'Lanterna', emoji: '🔦' },
    { word: 'Balança', emoji: '⚖️' },
    { word: 'Guarda-roupa', emoji: '🚪' },
    { word: 'Vassoura', emoji: '🧹' },
    { word: 'Tesoura', emoji: '✂️' },
    { word: 'Fone de ouvido', emoji: '🎶' },
  ],
};

/** Categorias com lista própria. 'Aleatório' não entra: ele sorteia uma destas a cada rodada. */
export const IMPOSTOR_CATEGORIES = Object.keys(WORD_BANK);

/** As palavras de uma categoria. O tamanho é o teto de rodadas sem repetição. */
export const categoryWords = (category: string): string[] => (WORD_BANK[category] ?? []).map((w) => w.word);

export const IMPOSTOR_RULES = {
  /**
   * Piso técnico, não recomendação: com um jogador só não há em quem votar (ninguém vota em si
   * no Impostor) e a votação nunca fecharia. Com dois o jogo fica bobo — o inocente sabe quem é
   * o impostor e o empate sempre o inocenta — mas roda, e quem decide se vale a pena é o grupo.
   */
  minPlayers: 2,
  /** O que a tela sugere. Abaixo disso ela avisa, mas não impede. */
  recommendedPlayers: 3,
  roundSeconds: 60,
  points: { groupCatches: 200, impostorEscapes: 300, correctVoteBonus: 50 },
} as const;

const pick = <T,>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

export function shuffle<T>(list: T[], rng: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type ImpostorRound = { word: Word; category: string; impostorId: PlayerId; order: PlayerId[] };

export function createImpostorRound(
  players: Player[],
  category: string,
  usedWords: Set<string>,
  rng: () => number = Math.random,
): ImpostorRound {
  const resolved = WORD_BANK[category] ? category : pick(Object.keys(WORD_BANK), rng);
  const bank = WORD_BANK[resolved];
  const fresh = bank.filter((w) => !usedWords.has(w.word));
  const word = pick(fresh.length ? fresh : bank, rng);
  return {
    word,
    category: resolved,
    impostorId: pick(players, rng).id,
    order: shuffle(players.map((p) => p.id), rng),
  };
}

/** Apura os votos e calcula os pontos da rodada. */
export function resolveImpostorRound(
  round: ImpostorRound,
  votes: Record<PlayerId, PlayerId>,
  players: Player[],
): Omit<ImpostorRoundResult, 'stage'> {
  const counts = new Map<PlayerId, number>();
  Object.values(votes).forEach((target) => counts.set(target, (counts.get(target) ?? 0) + 1));
  const tally: TallyEntry[] = [...counts.entries()]
    .map(([playerId, n]) => ({ playerId, votes: n }))
    .sort((a, b) => b.votes - a.votes);

  const top = tally[0];
  const tiedAtTop = tally.filter((t) => t.votes === top.votes);
  // Empate no topo nunca condena o impostor: o escolhido é outro dos empatados.
  const chosenId = tiedAtTop.length > 1 ? (tiedAtTop.find((t) => t.playerId !== round.impostorId) ?? top).playerId : top.playerId;
  const caught = chosenId === round.impostorId;

  const { groupCatches, impostorEscapes, correctVoteBonus } = IMPOSTOR_RULES.points;
  const pointsDelta: Record<PlayerId, number> = {};
  for (const p of players) {
    const isImpostor = p.id === round.impostorId;
    let delta = 0;
    if (caught && !isImpostor) delta += groupCatches;
    if (!caught && isImpostor) delta += impostorEscapes;
    if (!isImpostor && votes[p.id] === round.impostorId) delta += correctVoteBonus;
    pointsDelta[p.id] = delta;
  }

  return {
    chosenId,
    impostorId: round.impostorId,
    caught,
    word: round.word.word,
    tally,
    pointsDelta,
    headline: caught ? { points: groupCatches, target: 'group' } : { points: impostorEscapes, target: round.impostorId },
  };
}

/** Voto de um bot: tende a acertar o impostor, mas erra o bastante para ter graça. */
export function botVote(voterId: PlayerId, round: ImpostorRound, players: Player[], rng: () => number = Math.random): PlayerId {
  const others = players.filter((p) => p.id !== voterId);
  if (voterId !== round.impostorId && rng() < 0.55) return round.impostorId;
  return pick(others, rng).id;
}
