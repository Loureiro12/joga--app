import {
  DEFAULT_LIKELY_SETTINGS,
  RoomEngine,
  RoomError,
  botLikelyVote,
  botVote,
  type ConnectionState,
  type CreateRoomInput,
  type PlayerId,
  type ImpostorRound,
  type LikelySettings,
  type PlayerIdentity,
  type RoomCommand,
  type RoomSnapshot,
} from '@jogae/engine';

import { wait } from '@/core/utils/format';

import type { RoomService, RoomServiceDebug, Unsubscribe } from './RoomService';

/**
 * O pedaço do estado do Desafio Secreto que a simulação precisa ler. O mock roda o motor de
 * verdade, então dá para espiar o estado interno — é o que permite a um bot "acusar" com a lista
 * de opções na mão, coisa que um cliente real nunca poderia fazer.
 */
type SecretPeek = {
  players: Record<PlayerId, { ready: boolean; status: string; accusationsLeft: number }>;
  options: Record<PlayerId, string[]>;
  revealOrder: PlayerId[];
  revealIndex: number;
};

/** O pedaço do estado do Casal Perfeito que a simulação precisa ler para os bots jogarem. */
type PerfectPeek = {
  couples: { id: string; aId: PlayerId; bId: PlayerId }[];
  invites: Record<PlayerId, PlayerId>;
  answers: Record<PlayerId, string>;
};

/** Timings da simulação (README do handoff, "Fase 1"). Ajustáveis para testes. */
export type MockRoomConfig = {
  latencyMs: number;
  botJoinEveryMs: number;
  botVoteEveryMs: number;
  allVotedPauseMs: number;
  revealStage1Ms: number;
  revealStage2Ms: number;
  reconnectMs: number;
  reconnectTimeoutSec: number;
  /** Quando o host é um bot (você entrou como convidado). */
  botHostStartMs: number;
  botHostOpenVotingMs: number;
  botHostNextRoundMs: number;
  /** Desafio Secreto: quanto os bots "levam" para cumprir a missão e para validar a história. */
  botSecretActMs: number;
  botSecretVoteMs: number;
  /** Casal Perfeito: quanto os bots levam para escolher par e para responder. */
  botPairMs: number;
  botAnswerMs: number;
  /** Bomba em sala: quanto o bot demora para acender e para passar adiante. */
  botArmMs: number;
  botPassMs: number;
};

export const DEFAULT_MOCK_CONFIG: MockRoomConfig = {
  latencyMs: 900,
  botJoinEveryMs: 900,
  botVoteEveryMs: 1100,
  allVotedPauseMs: 900,
  revealStage1Ms: 1600,
  revealStage2Ms: 3300,
  reconnectMs: 6000,
  reconnectTimeoutSec: 30,
  botHostStartMs: 1800,
  botHostOpenVotingMs: 12000,
  botHostNextRoundMs: 9000,
  botSecretActMs: 4000,
  botSecretVoteMs: 1400,
  botPairMs: 1200,
  botAnswerMs: 1800,
  botArmMs: 1500,
  botPassMs: 3500,
};

/** Em que tempo da revelação o jogo está. Os que não revelam em tempos devolvem `'-'`. */
const stageOf = (game: RoomSnapshot['game']): 0 | 1 | 2 | '-' =>
  game.kind === 'impostor' || game.kind === 'likely' || game.kind === 'perfect' ? (game.result?.stage ?? '-') : '-';

/** Única sala "existente" no mock; qualquer outro código dá "Sala não encontrada". */
export const MOCK_JOINABLE_CODE = '4827';

const BOTS: { name: string; color: string }[] = [
  { name: 'André', color: '#7C3AED' },
  { name: 'Carol', color: '#FACC15' },
  { name: 'Lucas', color: '#22C55E' },
  { name: 'Pedro', color: '#A78BFA' },
  { name: 'João', color: '#EF4444' },
  { name: 'Bia', color: '#27272F' },
  { name: 'Rafa', color: '#FACC15' },
  { name: 'Mari', color: '#22C55E' },
  { name: 'Duda', color: '#A78BFA' },
  { name: 'Léo', color: '#EF4444' },
  { name: 'Nina', color: '#7C3AED' },
];

const botIdentity = (bot: { name: string; color: string }): PlayerIdentity => ({ id: `bot-${bot.name}`, ...bot });
const isBot = (id: PlayerId) => id.startsWith('bot-');

/**
 * Modo simulado: o MESMO `RoomEngine` que o servidor de salas executa, com bots no lugar dos
 * outros celulares. Regras, fases, migração de host e prazos são idênticos aos do servidor real;
 * o que é simulado aqui é só a presença dos outros jogadores e a queda de conexão.
 */
export class MockRoomService implements RoomService {
  private engine: RoomEngine | null = null;
  private meId: PlayerId | null = null;
  private pendingBots: PlayerIdentity[] = [];
  private connection: ConnectionState = { status: 'online' };
  private listeners = new Set<(s: RoomSnapshot | null) => void>();
  private connectionListeners = new Set<(c: ConnectionState) => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  /** Para agendar cada automação do bot-host uma vez por situação. */
  private hostPlanKey = '';
  private secretPlanKey = '';
  private bombPlanKey = '';

  constructor(private readonly config: MockRoomConfig = DEFAULT_MOCK_CONFIG) {}

  /* ------------------------------------------------------------ ciclo de vida */

  async createRoom(input: CreateRoomInput, me: PlayerIdentity): Promise<RoomSnapshot> {
    this.reset();
    const code = String(Math.floor(1000 + Math.random() * 9000));
    this.open(code, input, me, me, BOTS.slice(0, input.maxPlayers - 1).map(botIdentity));
    return this.snapshot()!;
  }

  async joinRoom(code: string, me: PlayerIdentity): Promise<RoomSnapshot> {
    await wait(this.config.latencyMs);
    if (code !== MOCK_JOINABLE_CODE) throw new RoomError('room_not_found');
    this.reset();
    const [host, second, ...rest] = BOTS.map(botIdentity);
    this.open(code, { gameId: 'impostor', category: 'Comidas', totalRounds: 5, maxPlayers: 6 }, host, me, rest.slice(0, 3), [second, me]);
    return this.snapshot()!;
  }

  async leaveRoom(): Promise<void> {
    this.reset();
    this.emit();
  }

  /* ------------------------------------------------------------------- stream */

  subscribe(listener: (s: RoomSnapshot | null) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  subscribeConnection(listener: (c: ConnectionState) => void): Unsubscribe {
    this.connectionListeners.add(listener);
    listener(this.connection);
    return () => this.connectionListeners.delete(listener);
  }

  retryConnection(): void {
    this.runReconnect(true);
  }

  /* ----------------------------------------------------------------- comandos */

  startMatch = () => this.command({ type: 'startMatch' });
  setTimerRunning = (running: boolean) => this.command({ type: 'setTimerRunning', running });
  resetTimer = () => this.command({ type: 'resetTimer' });
  openVoting = () => this.command({ type: 'openVoting' });
  nextRound = () => this.command({ type: 'nextRound' });
  playAgain = () => this.command({ type: 'playAgain' });
  endVoting = () => this.command({ type: 'endVoting' });
  skipQuestion = () => this.command({ type: 'skipQuestion' });
  endMatch = () => this.command({ type: 'endMatch' });
  missionReady = () => this.command({ type: 'missionReady' });
  missionDone = () => this.command({ type: 'missionDone' });
  accuse = (targetId: PlayerId, missionId: string) => this.command({ type: 'accuse', targetId, missionId });
  swapMission = () => this.command({ type: 'swapMission' });
  nextReveal = () => this.command({ type: 'nextReveal' });
  voteReveal = (valid: boolean) => this.command({ type: 'voteReveal', valid });
  pairWith = (targetId: PlayerId) => this.command({ type: 'pairWith', targetId });
  unpair = () => this.command({ type: 'unpair' });
  beginQuestions = () => this.command({ type: 'beginQuestions' });
  submitAnswer = (value: string) => this.command({ type: 'submitAnswer', value });
  armBomb = () => this.command({ type: 'armBomb' });
  passBomb = () => this.command({ type: 'passBomb' });
  useLetter = (letter: string) => this.command({ type: 'useLetter', letter });
  ackRole = () => this.command({ type: 'ackRole' });
  setPaused = (paused: boolean) => this.command({ type: 'setPaused', paused });

  async castVote(targetId: PlayerId): Promise<void> {
    await this.command({ type: 'castVote', targetId });
    // Os bots só votam depois de você, para a tela "Aguardando votos" ter o que mostrar.
    this.startBotVotes();
  }

  private async command(cmd: RoomCommand): Promise<void> {
    if (!this.engine || !this.meId) throw new RoomError('not_in_room');
    if (cmd.type === 'startMatch' && this.engine.hostId === this.meId) {
      // A partida começa com quem já entrou; os bots que ainda "estavam chegando" desistem.
      this.clearInterval('botJoins');
      this.pendingBots = [];
    }
    this.engine.dispatch(this.meId, cmd);
  }

  /* -------------------------------------------------------------------- debug */

  readonly debug: RoomServiceDebug = {
    simulateConnectionDrop: ({ recover }) => this.runReconnect(recover),
    // Com migração de host, "o host saiu" não fecha a sala: o próximo jogador assume.
    simulateHostLeft: () => {
      const engine = this.engine;
      if (engine && isBot(engine.hostId)) engine.leave(engine.hostId);
    },
    simulateNotEnoughPlayers: () => {
      const engine = this.engine;
      if (!engine) return;
      this.clearInterval('botJoins');
      this.pendingBots = [];
      engine.playerIds.filter(isBot).slice(1).forEach((id) => engine.leave(id));
    },
    simulatePlayerDisconnect: () => {
      const engine = this.engine;
      const target = engine?.playerIds.find((id) => isBot(id) && id !== engine.hostId && this.snapshot()?.players.find((p) => p.id === id)?.connected);
      if (engine && target) engine.setConnected(target, false);
    },
    hostAdvance: () => {
      const engine = this.engine;
      if (!engine) return;
      const asHost = (cmd: RoomCommand) => this.tryDispatch(engine.hostId, cmd);
      if (engine.phase === 'lobby') asHost({ type: 'startMatch' });
      else if (engine.phase === 'clues') asHost({ type: 'openVoting' });
      else if (engine.phase === 'revealing') asHost({ type: 'nextRound' });
      else if (engine.phase === 'mission') asHost({ type: 'endMatch' });
      else if (engine.phase === 'verdict') asHost({ type: 'nextReveal' });
      else if (engine.phase === 'pairing') asHost({ type: 'beginQuestions' });
      else if (engine.phase === 'answering') asHost({ type: 'endMatch' });
      else if (engine.phase === 'handoff' || engine.phase === 'armed') asHost({ type: 'endMatch' });
    },
  };

  /* ------------------------------------------------------------------ interno */

  private open(code: string, input: CreateRoomInput, host: PlayerIdentity, me: PlayerIdentity, pendingBots: PlayerIdentity[], alreadyIn: PlayerIdentity[] = []) {
    this.meId = me.id;
    this.pendingBots = pendingBots;
    const { revealStage1Ms, revealStage2Ms, allVotedPauseMs } = this.config;
    this.engine = RoomEngine.create(code, input, host, {
      config: { revealStage1Ms, revealStage2Ms, allVotedPauseMs },
      onChange: () => this.onEngineChange(),
    });
    alreadyIn.forEach((p) => this.engine!.join(p));
    this.every('botJoins', this.config.botJoinEveryMs, () => {
      const bot = this.pendingBots.shift();
      if (!bot || this.engine?.phase !== 'lobby') return this.clearInterval('botJoins');
      try {
        this.engine.join(bot);
      } catch {
        this.pendingBots = [];
      }
      if (this.pendingBots.length === 0) this.clearInterval('botJoins');
    });
    this.onEngineChange();
  }

  /** Toda mudança da sala passa por aqui: avisa a UI e deixa os bots reagirem. */
  private onEngineChange() {
    this.emit();
    const engine = this.engine;
    if (!engine) return;

    // Bots confirmam o papel na hora: quem segura a fase é você.
    if (engine.phase === 'role_reveal') {
      const acked = new Set((engine.serialize().game as { ackedIds: string[] }).ackedIds);
      engine.playerIds.filter((id) => isBot(id) && !acked.has(id)).forEach((id) => this.tryDispatch(id, { type: 'ackRole' }));
    }
    if (engine.phase === 'briefing' || engine.phase === 'mission' || engine.phase === 'verdict') this.planBotSecret();
    if (engine.phase === 'pairing' || engine.phase === 'answering') this.planBotPerfect();
    if (engine.phase === 'handoff' || engine.phase === 'armed') this.planBotBomb();
    this.planBotHost();
  }

  /**
   * Os bots jogando o Desafio Secreto. Não é só enfeite: sem eles a fase de briefing nunca
   * fecharia (ela espera todos esconderem a missão) e a hora da verdade não teria votos.
   */
  private planBotSecret() {
    const engine = this.engine;
    if (!engine) return;
    const game = engine.serialize().game as unknown as SecretPeek;
    const bots = engine.playerIds.filter(isBot);

    // Sem esta chave, cada ação de bot re-armaria o plano e os bots acabariam acusando todo mundo:
    // o plano é montado uma vez por fase (e, na revelação, uma vez por missão aberta).
    const key = `${engine.phase}|${game.revealIndex}`;
    if (key === this.secretPlanKey) return;
    this.secretPlanKey = key;

    if (engine.phase === 'briefing') {
      // Escondem a missão na hora: quem segura a fase é você.
      bots.filter((id) => !game.players[id]?.ready).forEach((id) => this.tryDispatch(id, { type: 'missionReady' }));
      return;
    }

    if (engine.phase === 'mission') {
      // Dois terços cumprem a missão, e um acusa: o suficiente para a hora da verdade ter conversa.
      this.after('botSecret', this.config.botSecretActMs, () => {
        const atual = this.engine?.serialize().game as unknown as SecretPeek | undefined;
        if (!atual || this.engine?.phase !== 'mission') return;
        bots.forEach((id, i) => {
          if (i % 3 !== 2 && atual.players[id]?.status === 'ativa') this.tryDispatch(id, { type: 'missionDone' });
        });
        const acusador = bots.find((id) => atual.players[id]?.accusationsLeft > 0);
        const alvo = engine.playerIds.find((id) => id !== acusador && atual.options[id]?.length);
        if (acusador && alvo) this.tryDispatch(acusador, { type: 'accuse', targetId: alvo, missionId: atual.options[alvo][0] });
      });
      return;
    }

    // Hora da verdade: o grupo valida a história de quem está na vez, com uma pausa para dar tempo
    // de ler a tela. A chave inclui o índice, então cada revelação recebe a sua rodada de votos.
    const alvo = game.revealOrder[game.revealIndex];
    if (!alvo) return;
    this.after(`botReveal:${game.revealIndex}`, this.config.botSecretVoteMs, () => {
      if (this.engine?.phase !== 'verdict') return;
      bots.filter((id) => id !== alvo).forEach((id, i) => this.tryDispatch(id, { type: 'voteReveal', valid: i % 4 !== 3 }));
    });
  }

  /**
   * Os bots jogando o Casal Perfeito. Sem eles o pareamento nunca fecharia — ele espera TODA a
   * sala ter dupla — e a rodada nunca sairia da primeira pergunta.
   */
  private planBotPerfect() {
    const engine = this.engine;
    if (!engine) return;
    const bots = engine.playerIds.filter(isBot);

    if (engine.phase === 'pairing') {
      // Cada bot livre aceita quem o convidou; sem convite, chama outro bot livre. Assim o humano
      // sempre encontra alguém disponível para escolher.
      this.after('botPair', this.config.botPairMs, () => {
        // Relê o estado a cada bot: o convite do anterior já mudou quem está livre, e agir sobre
        // uma foto velha faria os bots se convidarem em cadeia sem nunca fechar uma dupla.
        for (const id of bots) {
          if (this.engine?.phase !== 'pairing') return;
          const atual = this.engine.serialize().game as unknown as PerfectPeek;
          const livre = (quem: PlayerId) => !atual.couples.some((c) => c.aId === quem || c.bId === quem);
          if (!livre(id)) continue;
          const convidou = Object.entries(atual.invites).find(([de, para]) => para === id && livre(de))?.[0];
          const alvo = convidou ?? bots.find((outro) => outro !== id && livre(outro) && !atual.invites[outro] && atual.invites[id] !== outro);
          if (alvo) this.tryDispatch(id, { type: 'pairWith', targetId: alvo });
        }
      });
      return;
    }

    this.after('botAnswer', this.config.botAnswerMs, () => {
      const atual = this.engine;
      if (atual?.phase !== 'answering') return;
      for (const id of bots) {
        const view = atual.snapshotFor(id).game;
        if (view.kind !== 'perfect' || !view.round || view.myAnswer) continue;
        const opcoes = view.round.options;
        this.tryDispatch(id, { type: 'submitAnswer', value: opcoes[Math.floor(Math.random() * opcoes.length)].id });
      }
    });
  }

  /**
   * Os bots jogando a Bomba-Relógio em sala. Eles pensam um pouco antes de passar: se passassem
   * na hora, a bomba nunca sobraria para ninguém e a rodada viraria um pingue-pongue.
   */
  private planBotBomb() {
    const engine = this.engine;
    if (!engine) return;
    const snap = engine.snapshotFor(engine.hostId);
    if (snap.game.kind !== 'bomb') return;
    const { activeId, alphabet } = snap.game;
    if (!isBot(activeId)) return;

    const key = `${snap.room.phase}|${activeId}|${alphabet?.used.length ?? 0}|${snap.room.roundIndex}`;
    if (key === this.bombPlanKey) return;
    this.bombPlanKey = key;

    if (snap.room.phase === 'handoff') {
      this.after('botBomb', this.config.botArmMs, () => this.tryDispatch(activeId, { type: 'armBomb' }));
      return;
    }
    this.after('botBomb', this.config.botPassMs, () => {
      if (this.engine?.phase !== 'armed') return;
      const atual = this.engine.snapshotFor(this.engine.hostId).game;
      if (atual.kind !== 'bomb' || atual.activeId !== activeId) return;
      const livre = atual.alphabet?.letters.split('').find((l) => !atual.alphabet!.used.some((u) => u.letter === l));
      this.tryDispatch(activeId, livre ? { type: 'useLetter', letter: livre } : { type: 'passBomb' });
    });
  }

  /** Quando o host é um bot, ele conduz a partida sozinho (com calma, respeitando a pausa). */
  private planBotHost() {
    const engine = this.engine;
    if (!engine || !isBot(engine.hostId)) return;
    const snap = engine.snapshotFor(engine.hostId);
    const lobbyReady = snap.room.phase === 'lobby' && this.pendingBots.length === 0;
    const stage = stageOf(snap.game);
    const key = `${engine.hostId}|${snap.room.phase}|${snap.room.roundIndex}|${stage}|${lobbyReady}`;
    if (key === this.hostPlanKey) return;
    this.hostPlanKey = key;
    this.clearTimer('botHost');
    this.clearTimer('botHostTimer');

    const host = engine.hostId;
    const { botHostStartMs, botHostOpenVotingMs, botHostNextRoundMs } = this.config;
    if (lobbyReady) this.after('botHost', botHostStartMs, () => this.tryDispatch(host, { type: 'startMatch' }));
    else if (snap.room.phase === 'clues') {
      this.after('botHostTimer', Math.min(1000, botHostOpenVotingMs / 2), () => this.tryDispatch(host, { type: 'setTimerRunning', running: true }));
      this.after('botHost', botHostOpenVotingMs, () => this.whenNotPaused(() => this.tryDispatch(host, { type: 'openVoting' })));
    } else if (snap.room.phase === 'revealing' && snap.game.kind === 'bomb') {
      // Na bomba a revelação é a explosão: o host bot dá tempo de a mesa reagir e segue.
      this.after('botHost', botHostNextRoundMs, () => this.tryDispatch(host, { type: 'nextRound' }));
    } else if (snap.room.phase === 'revealing' && stage === 2) {
      this.after('botHost', botHostNextRoundMs, () => this.whenNotPaused(() => this.tryDispatch(host, { type: 'nextRound' })));
    } else if (snap.room.phase === 'mission') {
      // Na vida real a noite acaba quando o rolê acaba; aqui, depois de os bots agirem.
      this.after('botHost', this.config.botSecretActMs + botHostNextRoundMs, () => this.tryDispatch(host, { type: 'endMatch' }));
    } else if (snap.room.phase === 'verdict') {
      this.after('botHost', botHostNextRoundMs, () => this.whenNotPaused(() => this.tryDispatch(host, { type: 'nextReveal' })));
    } else if (snap.room.phase === 'pairing' && snap.game.kind === 'perfect' && !snap.game.pairing?.waiting.length) {
      this.after('botHost', botHostStartMs, () => this.tryDispatch(host, { type: 'beginQuestions' }));
    } else if (snap.room.phase === 'revealing' && snap.game.kind === 'perfect' && snap.game.result?.stage === 2) {
      this.after('botHost', botHostNextRoundMs, () => this.whenNotPaused(() => this.tryDispatch(host, { type: 'nextRound' })));
    }
  }

  private startBotVotes() {
    this.every('botVotes', this.config.botVoteEveryMs, () => {
      const engine = this.engine;
      const state = engine?.serialize();
      if (!engine || !state || state.room.phase !== 'voting') return this.clearInterval('botVotes');
      const game = state.game as { round?: ImpostorRound | null; votes: Record<string, string>; settings?: LikelySettings };
      const voter = state.players.find((p) => isBot(p.id) && p.connected && !game.votes[p.id]);
      if (!voter) return this.clearInterval('botVotes');
      // Cada jogo tem o seu critério: no Impostor o bot tende a acusar o impostor; no outro, escolhe qualquer um.
      const targetId = game.round
        ? botVote(voter.id, game.round, state.players)
        : botLikelyVote(voter.id, state.players, game.settings ?? DEFAULT_LIKELY_SETTINGS);
      this.tryDispatch(voter.id, { type: 'castVote', targetId });
    });
  }

  /** Ações de bot nunca podem derrubar o app: se a fase mudou no meio do caminho, só ignora. */
  private tryDispatch(playerId: PlayerId, cmd: RoomCommand) {
    try {
      this.engine?.dispatch(playerId, cmd);
    } catch {
      /* fase mudou; nada a fazer */
    }
  }

  private whenNotPaused(fn: () => void) {
    if (this.snapshot()?.room.paused) this.after('botHost', 1000, () => this.whenNotPaused(fn));
    else fn();
  }

  private runReconnect(recover: boolean) {
    this.clearInterval('reconnect');
    const { reconnectTimeoutSec: timeoutSec, reconnectMs } = this.config;
    let secondsLeft = timeoutSec;
    const stopAt = timeoutSec - Math.round(reconnectMs / 1000);
    this.setConnection({ status: 'reconnecting', secondsLeft, timeoutSec });
    this.every('reconnect', 1000, () => {
      secondsLeft -= 1;
      if (secondsLeft <= stopAt) {
        this.clearInterval('reconnect');
        this.setConnection(recover ? { status: 'online' } : { status: 'failed' });
      } else {
        this.setConnection({ status: 'reconnecting', secondsLeft, timeoutSec });
      }
    });
  }

  private snapshot(): RoomSnapshot | null {
    return this.engine && this.meId && this.engine.has(this.meId) ? this.engine.snapshotFor(this.meId) : null;
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  private setConnection(c: ConnectionState) {
    this.connection = c;
    this.connectionListeners.forEach((l) => l(c));
  }

  private after(key: string, ms: number, fn: () => void) {
    this.clearTimer(key);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        fn();
      }, ms),
    );
  }

  private clearTimer(key: string) {
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
  }

  private every(key: string, ms: number, fn: () => void) {
    this.clearInterval(key);
    this.intervals.set(key, setInterval(fn, ms));
  }

  private clearInterval(key: string) {
    const i = this.intervals.get(key);
    if (i) clearInterval(i);
    this.intervals.delete(key);
  }

  private reset() {
    [...this.timers.keys()].forEach((k) => this.clearTimer(k));
    [...this.intervals.keys()].forEach((k) => this.clearInterval(k));
    this.engine?.dispose();
    this.engine = null;
    this.meId = null;
    this.pendingBots = [];
    this.hostPlanKey = '';
    this.secretPlanKey = '';
    this.bombPlanKey = '';
    this.setConnection({ status: 'online' });
  }
}
