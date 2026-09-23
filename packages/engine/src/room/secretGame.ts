import { MISSIONS } from '../games/secret-missions';
import {
  SECRET_CONTEXTS,
  SECRET_POINTS,
  sanitizeSecretSettings,
  type SecretHighlight,
  type SecretMission,
  type SecretPlayerState,
  type SecretReveal,
  type SecretSettings,
} from '../games/secret-types';
import { RoomError, type GameView, type PlayerId, type VoteProgress } from '../types';

import type { GameCtx, GameRules } from './GameRules';

/**
 * Desafio Secreto: cada um recebe uma missão escondida e tenta cumpri-la durante a noite, sem
 * ninguém perceber.
 *
 * O que separa este jogo de todos os outros: **ele roda por trás de uma festa**, por horas, com o
 * app fechado. Isso tem duas consequências que moldam o código:
 *
 * - Os prazos de sala precisam ser outros (`roomConfig`). Com o padrão, quem guardasse o celular
 *   seria removido em 30 segundos e a sala morreria em 10 minutos.
 * - **Nada é anunciado na hora.** Quando alguém marca "consegui", ninguém é avisado — senão o
 *   grupo saberia que algo acabou de acontecer e deduziria a missão pelo que viu (§23).
 */

export type SecretState = {
  settings: SecretSettings;
  players: Record<PlayerId, SecretPlayerState>;
  /** Ids das missões distribuídas, por jogador. A missão em si vem do banco. */
  missionOf: Record<PlayerId, string>;
  /**
   * As opções que aparecem ao acusar cada alvo: a missão verdadeira e três falsas.
   *
   * Sorteadas de uma vez, no começo, e nunca mais. Se fossem geradas a cada acusação, daria para
   * abrir a tela várias vezes e cruzar as listas até isolar a verdadeira — o palpite deixaria de
   * ser palpite.
   */
  options: Record<PlayerId, string[]>;
  /** A ordem em que as missões são abertas na hora da verdade, e onde estamos nela. */
  revealOrder: PlayerId[];
  revealIndex: number;
};

const novoJogador = (settings: SecretSettings): SecretPlayerState => ({
  missionId: '',
  status: 'ativa',
  completedAt: null,
  caughtAt: null,
  caughtBy: null,
  ready: false,
  accusationsLeft: settings.accusations,
  swapsLeft: settings.swaps,
  rightAccusations: 0,
  wrongAccusations: 0,
  timesAccused: 0,
  votesFor: [],
  votesAgainst: [],
});

const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];
const missionById = (id: string): SecretMission | undefined => MISSIONS.find((m) => m.id === id);

function elegiveis(settings: SecretSettings): SecretMission[] {
  const filtradas = MISSIONS.filter((m) => m.contexts.includes(settings.context) && settings.difficulties.includes(m.difficulty));
  // Configuração impossível: cai no banco inteiro em vez de deixar alguém sem missão.
  return filtradas.length ? filtradas : MISSIONS;
}

/**
 * Tudo que poderia acontecer neste lugar, sem olhar a dificuldade escolhida.
 *
 * As opções de acusação saem daqui, e não de `elegiveis`: a dificuldade não aparece na lista, e
 * respeitá-la reduziria demais o baralho de onde saem as três falsas.
 */
const doContexto = (settings: SecretSettings): SecretMission[] => {
  const filtradas = MISSIONS.filter((m) => m.contexts.includes(settings.context));
  return filtradas.length ? filtradas : MISSIONS;
};

/** Quantas missões existem para uma configuração. */
export const countMissions = (settings: SecretSettings): number => elegiveis(settings).length;

/** A missão só existe onde o grupo está — churrasqueira, mala, placar. */
const doLugar = (m: SecretMission) => m.contexts.length < SECRET_CONTEXTS.length;

/**
 * Distribui uma missão por pessoa, **equilibrando a dificuldade** (§21): sortear livre deixaria
 * um com a fácil e outro com a impossível, e aí a comparação do fim não diz nada.
 *
 * A cada faixa, a primeira missão sorteada é do lugar, quando houver. A maioria do banco é de
 * conversa e serve em qualquer canto; sem esta preferência, as poucas missões que falam da
 * churrasqueira ou do roteiro quase nunca sairiam, e escolher onde vai ser não mudaria a noite.
 * Só a primeira: se fossem todas, a festa inteira giraria em torno do mesmo assunto.
 */
function distribuir(ids: PlayerId[], settings: SecretSettings, rng: () => number): Record<PlayerId, string> {
  const baralho = elegiveis(settings);
  const porDificuldade = settings.difficulties.map((d) => baralho.filter((m) => m.difficulty === d)).filter((lista) => lista.length > 0);
  const usadas = new Set<string>();
  const faixasServidas = new Set<number>();
  const out: Record<PlayerId, string> = {};

  ids.forEach((id, i) => {
    // Percorre as faixas em rodízio: com 5 pessoas e 2 faixas, ninguém fica sozinho na difícil.
    const indiceFaixa = porDificuldade.length ? i % porDificuldade.length : -1;
    const faixa = indiceFaixa >= 0 ? porDificuldade[indiceFaixa] : baralho;
    const livres = faixa.filter((m) => !usadas.has(m.id));

    const daFesta = faixasServidas.has(indiceFaixa) ? [] : livres.filter(doLugar);
    if (daFesta.length) faixasServidas.add(indiceFaixa);

    const escolhida = pick(daFesta.length ? daFesta : livres.length ? livres : baralho.filter((m) => !usadas.has(m.id)).concat(baralho), rng);
    usadas.add(escolhida.id);
    out[id] = escolhida.id;
  });
  return out;
}

/**
 * As quatro opções de acusação de um alvo: a verdadeira mais três falsas.
 *
 * As falsas têm de ser do mesmo tipo da verdadeira. Como o sorteio prefere as missões do lugar,
 * elas quase não sobram — e uma lista com três missões de conversa e uma sobre a churrasqueira
 * responderia sozinha qual é a verdadeira. Por isso o filtro é o tipo, e as já distribuídas só
 * ficam de fora enquanto houver de onde escolher.
 */
function montarOpcoes(missionId: string, distribuidas: Set<string>, settings: SecretSettings, rng: () => number): string[] {
  const verdadeira = missionById(missionId);
  const mesmoTipo = doContexto(settings).filter((m) => m.id !== missionId && (!verdadeira || doLugar(m) === doLugar(verdadeira)));
  const inéditas = mesmoTipo.filter((m) => !distribuidas.has(m.id));
  const banco = inéditas.length >= 3 ? inéditas : mesmoTipo;
  const falsas: string[] = [];
  for (let guard = 0; guard < 50 && falsas.length < 3 && banco.length; guard++) {
    const candidata = pick(banco, rng).id;
    if (!falsas.includes(candidata)) falsas.push(candidata);
  }
  const todas = [missionId, ...falsas];
  // Embaralha, senão a verdadeira seria sempre a primeira da lista.
  for (let i = todas.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [todas[i], todas[j]] = [todas[j], todas[i]];
  }
  return todas;
}

export const secretGame: GameRules<SecretState> = {
  id: 'secret',
  minPlayers: 3,
  recommendedPlayers: 5,
  maxPlayers: 12,
  hostCommands: new Set(['startMatch', 'endMatch', 'nextReveal', 'playAgain']),

  /**
   * Prazos esticados para o jogo caber numa festa: ninguém fica com o app aberto por horas.
   * A vaga aguenta a noite inteira, e a sala sobrevive ao grupo inteiro guardar o celular.
   */
  roomConfig: { graceMs: 6 * 60 * 60_000, idleRoomMs: 6 * 60 * 60_000 },

  initial(input) {
    // O que vem do host é entrada de rede: passa pelo sanitizador antes de virar regra.
    return { settings: sanitizeSecretSettings(input.settings), players: {}, missionOf: {}, options: {}, revealOrder: [], revealIndex: 0 };
  },

  hydrate(state) {
    return Object.assign({ players: {}, missionOf: {}, options: {}, revealOrder: [], revealIndex: 0 }, state, {
      settings: sanitizeSecretSettings(state.settings),
    });
  },

  startMatch(s, ctx) {
    const ids = ctx.players.map((p) => p.id);
    s.missionOf = distribuir(ids, s.settings, ctx.rng);
    const distribuidas = new Set(Object.values(s.missionOf));
    s.players = Object.fromEntries(ids.map((id) => [id, { ...novoJogador(s.settings), missionId: s.missionOf[id] }]));
    s.options = Object.fromEntries(ids.map((id) => [id, montarOpcoes(s.missionOf[id], distribuidas, s.settings, ctx.rng)]));
    s.revealOrder = [];
    s.revealIndex = 0;
    ctx.room.phase = 'briefing';
    ctx.room.roundIndex = 1;
  },

  dispatch(s, ctx, playerId, command) {
    const eu = s.players[playerId];
    const phase = ctx.room.phase;

    switch (command.type) {
      case 'missionReady': {
        if (phase !== 'briefing' || !eu) throw new RoomError('invalid_phase');
        eu.ready = true;
        // A noite começa quando todos os conectados já esconderam a própria missão.
        if (ctx.players.every((p) => !p.connected || s.players[p.id]?.ready)) ctx.room.phase = 'mission';
        return;
      }

      case 'missionDone': {
        if (phase !== 'mission' || !eu) throw new RoomError('invalid_phase');
        // Quem já foi pego não "desconclui" a missão marcando depois.
        if (eu.status !== 'ativa') return;
        eu.status = 'concluida';
        eu.completedAt = ctx.now;
        return;
      }

      case 'swapMission': {
        if (phase !== 'briefing' && phase !== 'mission') throw new RoomError('invalid_phase');
        if (!eu || eu.swapsLeft <= 0 || eu.status !== 'ativa') throw new RoomError('bad_request');
        const emUso = new Set(Object.values(s.missionOf));
        const livres = elegiveis(s.settings).filter((m) => !emUso.has(m.id));
        if (!livres.length) throw new RoomError('bad_request');
        const nova = pick(livres, ctx.rng);
        s.missionOf[playerId] = nova.id;
        eu.missionId = nova.id;
        eu.swapsLeft -= 1;
        // A missão mudou: as opções de acusação também, senão a antiga entregaria a troca.
        s.options[playerId] = montarOpcoes(nova.id, new Set(Object.values(s.missionOf)), s.settings, ctx.rng);
        return;
      }

      case 'accuse': {
        if (phase !== 'mission' || !eu) throw new RoomError('invalid_phase');
        const alvo = s.players[command.targetId];
        if (!alvo || command.targetId === playerId) throw new RoomError('bad_request');
        if (eu.accusationsLeft <= 0) throw new RoomError('bad_request');
        // Só vale palpitar entre as opções daquele alvo: chute livre não teria como ser julgado.
        if (!s.options[command.targetId]?.includes(command.missionId)) throw new RoomError('bad_request');

        eu.accusationsLeft -= 1;
        alvo.timesAccused += 1;

        // Quem já registrou a conclusão chegou primeiro: a acusação vem tarde (§32).
        const tardia = alvo.status !== 'ativa';
        const acertou = !tardia && command.missionId === alvo.missionId;

        if (acertou) {
          alvo.status = 'pego';
          alvo.caughtAt = ctx.now;
          alvo.caughtBy = playerId;
          eu.rightAccusations += 1;
        } else {
          eu.wrongAccusations += 1;
        }
        return;
      }

      case 'endMatch': {
        if (phase !== 'mission' && phase !== 'briefing') throw new RoomError('invalid_phase');
        abrirVerdade(s, ctx);
        return;
      }

      case 'voteReveal': {
        if (phase !== 'verdict' || !eu) throw new RoomError('invalid_phase');
        const alvo = s.revealOrder[s.revealIndex];
        // Ninguém vota na própria história, e só vale votar uma vez.
        if (!alvo || alvo === playerId) throw new RoomError('bad_request');
        const dono = s.players[alvo];
        if (!dono || dono.votesFor.includes(playerId) || dono.votesAgainst.includes(playerId)) return;
        (command.valid ? dono.votesFor : dono.votesAgainst).push(playerId);
        return;
      }

      case 'nextReveal': {
        if (phase !== 'verdict') throw new RoomError('invalid_phase');
        fecharVoto(s);
        if (s.revealIndex >= s.revealOrder.length - 1) ctx.room.phase = 'finished';
        else s.revealIndex += 1;
        return;
      }

      default:
        throw new RoomError('bad_request');
    }
  },

  step() {
    // Nada corre sozinho: a noite acaba quando o host disser.
    return false;
  },

  recheck(s, ctx) {
    // Quem caiu deixa de ser esperado no briefing, senão a noite não começa.
    if (ctx.room.phase !== 'briefing') return;
    const presentes = ctx.players.filter((p) => p.connected);
    if (presentes.length > 0 && presentes.every((p) => s.players[p.id]?.ready)) ctx.room.phase = 'mission';
  },

  playerRemoved(s, ctx, playerId) {
    delete s.players[playerId];
    delete s.missionOf[playerId];
    delete s.options[playerId];
    s.revealOrder = s.revealOrder.filter((id) => id !== playerId);
    s.revealIndex = Math.min(s.revealIndex, Math.max(0, s.revealOrder.length - 1));
    this.recheck(s, ctx);
  },

  reset(s) {
    Object.assign(s, { players: {}, missionOf: {}, options: {}, revealOrder: [], revealIndex: 0 });
  },

  deadlines() {
    return [];
  },

  viewFor(s, ctx, playerId): GameView {
    const eu = s.players[playerId];
    const minhaMissao = eu ? missionById(eu.missionId) : undefined;
    const fase = ctx.room.phase;

    return {
      kind: 'secret',
      context: s.settings.context,
      competitive: s.settings.competitive,
      /** A própria missão, e só ela: nenhum snapshot carrega a missão de outra pessoa. */
      mine:
        eu && minhaMissao
          ? {
              mission: minhaMissao,
              status: eu.status,
              accusationsLeft: eu.accusationsLeft,
              swapsLeft: eu.swapsLeft,
              // Basta saber que alguém desconfiou; quem foi fica em segredo (§34).
              suspected: eu.timesAccused > 0,
            }
          : null,
      ready: ctx.players.filter((p) => s.players[p.id]?.ready).map((p) => p.id),
      /** Só aparece quando este jogador vai acusar alguém — nunca antes. */
      accusationOptions:
        fase === 'mission'
          ? Object.fromEntries(
              Object.entries(s.options)
                .filter(([id]) => id !== playerId)
                .map(([id, ids]) => [id, ids.map((m) => missionById(m)).filter((m): m is SecretMission => Boolean(m))]),
            )
          : {},
      reveal: fase === 'verdict' ? revealAtual(s) : null,
      revealProgress: fase === 'verdict' ? { index: s.revealIndex + 1, total: s.revealOrder.length } : null,
      summary: fase === 'finished' ? resumo(s) : null,
    };
  },

  voteProgress(s, ctx): VoteProgress | null {
    // Na hora da verdade, "votos" são as validações da história de quem está na vez.
    if (ctx.room.phase !== 'verdict') return null;
    const alvo = s.revealOrder[s.revealIndex];
    const dono = alvo ? s.players[alvo] : undefined;
    if (!dono) return null;
    return {
      votedIds: [...dono.votesFor, ...dono.votesAgainst],
      total: Math.max(0, ctx.players.filter((p) => p.connected).length - 1),
      myVote: null,
    };
  },

  recordExtras() {
    return { impostorsCaught: 0, perPlayer: {} };
  },
};

/** Fecha a noite e monta a ordem da revelação. */
function abrirVerdade(s: SecretState, ctx: GameCtx): void {
  // Quem foi pego abre a fila: é a revelação mais divertida, e aquece o grupo para as outras.
  const ids = ctx.players.map((p) => p.id).filter((id) => s.players[id]);
  s.revealOrder = [...ids].sort((a, b) => Number(s.players[b].status === 'pego') - Number(s.players[a].status === 'pego'));
  s.revealIndex = 0;
  ctx.room.phase = 'verdict';
}

/** Aplica o voto do grupo na história de quem está na vez. Empate valida (§42). */
function fecharVoto(s: SecretState): void {
  const alvo = s.revealOrder[s.revealIndex];
  const dono = alvo ? s.players[alvo] : undefined;
  if (!dono || dono.status === 'pego') return;
  if (dono.status !== 'concluida') return;
  dono.status = dono.votesAgainst.length > dono.votesFor.length ? 'rejeitada' : 'validada';
}

function revealAtual(s: SecretState): SecretReveal | null {
  const alvo = s.revealOrder[s.revealIndex];
  const dono = alvo ? s.players[alvo] : undefined;
  const mission = dono ? missionById(dono.missionId) : undefined;
  if (!dono || !mission) return null;
  return {
    playerId: alvo,
    mission,
    status: dono.status,
    caughtBy: dono.caughtBy,
    votesFor: dono.votesFor.length,
    votesAgainst: dono.votesAgainst.length,
  };
}

/** Pontos de um jogador. Só conta missão validada; pega ou rejeitada não vale. */
export function scoreOf(state: SecretState, playerId: PlayerId): number {
  const p = state.players[playerId];
  if (!p) return 0;
  const mission = missionById(p.missionId);
  let total = 0;
  if (p.status === 'validada' && mission) {
    total += SECRET_POINTS[mission.difficulty];
    // Passar a noite inteira sem levantar suspeita vale à parte (§46).
    if (p.timesAccused === 0) total += SECRET_POINTS.ghost;
  }
  total += p.rightAccusations * SECRET_POINTS.rightAccusation;
  total += p.wrongAccusations * SECRET_POINTS.wrongAccusation;
  return total;
}

function resumo(s: SecretState) {
  const ids = Object.keys(s.players);
  const linhas = ids
    .map((id) => ({ playerId: id, status: s.players[id].status, points: scoreOf(s, id), caughtBy: s.players[id].caughtBy }))
    .sort((a, b) => (s.settings.competitive ? b.points - a.points : Number(b.status === 'validada') - Number(a.status === 'validada')));
  return { players: linhas, highlights: highlightsOf(s) };
}

/** Os títulos do fim. Só entram os que têm base — ninguém vira detetive com zero acusações. */
export function highlightsOf(s: SecretState): SecretHighlight[] {
  const ids = Object.keys(s.players);
  const out: SecretHighlight[] = [];
  const p = (id: PlayerId) => s.players[id];

  const fantasmas = ids.filter((id) => p(id).status === 'validada' && p(id).timesAccused === 0);
  if (fantasmas.length) out.push({ key: 'fantasma', emoji: '🥷', title: 'Fantasma', playerId: fantasmas[0], value: 'Cumpriu sem levantar suspeita' });

  const detetive = [...ids].sort((a, b) => p(b).rightAccusations - p(a).rightAccusations)[0];
  if (detetive && p(detetive).rightAccusations > 0) {
    out.push({ key: 'detetive', emoji: '🕵️', title: 'Detetive', playerId: detetive, value: `${p(detetive).rightAccusations} acusação certeira` });
  }

  const suspeito = [...ids].sort((a, b) => p(b).timesAccused - p(a).timesAccused)[0];
  if (suspeito && p(suspeito).timesAccused > 1) {
    out.push({ key: 'suspeito', emoji: '👀', title: 'Suspeito demais', playerId: suspeito, value: `Foi acusado ${p(suspeito).timesAccused}×` });
  }

  const araque = [...ids].sort((a, b) => p(b).wrongAccusations - p(a).wrongAccusations)[0];
  if (araque && p(araque).wrongAccusations > 1 && p(araque).rightAccusations === 0) {
    out.push({ key: 'araque', emoji: '🤡', title: 'Detetive de araque', playerId: araque, value: `Errou ${p(araque).wrongAccusations} acusações` });
  }
  return out;
}
