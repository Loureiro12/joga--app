/**
 * Bots de desenvolvimento: entram numa sala REAL pelo WebSocket, como se fossem outros celulares.
 * Servem para testar o app com um aparelho só. Exigem o servidor com AUTH_MODE=dev ou supabase+dev.
 *
 *   npm run bots -- --code 4827            (3 bots em ws://localhost:8787/ws)
 *   npm run bots -- --code 4827 --count 5 --url ws://192.168.0.12:8787/ws
 *   npm run bots -- --host                 (um bot cria a sala e conduz; os outros entram nela)
 */
import { PROTOCOL_VERSION, type ClientMessage, type RoomSnapshot, type ServerMessage } from '@jogae/engine';
import WebSocket from 'ws';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? '') : null;
};
const url = flag('url') ?? 'ws://localhost:8787/ws';
const count = Number(flag('count') ?? 3);
const hostMode = args.includes('--host');
let code = flag('code');

if (!hostMode && !/^\d{4}$/.test(code ?? '')) {
  console.error('Uso: npm run bots -- --code 1234 [--count 3] [--url ws://host:8787/ws]   |   npm run bots -- --host');
  process.exit(1);
}

const NAMES = ['Carol', 'Lucas', 'Pedro', 'João', 'Bia', 'Rafa', 'Mari', 'Duda', 'Léo', 'Nina', 'Theo'];
const COLORS = ['#FACC15', '#22C55E', '#A78BFA', '#EF4444', '#7C3AED', '#27272F'];
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function bot(index: number, onCode?: (code: string) => void) {
  const name = NAMES[index % NAMES.length];
  const tag = `bot-${name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}-${process.pid}`;
  const me = { name, color: COLORS[index % COLORS.length] };
  let ws: WebSocket;
  let nextId = 1;
  let acted = '';
  let joinedCode: string | null = null;
  let stopped = false;
  const send = (message: ClientMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(message));
  const cmd = (c: Extract<ClientMessage, { t: 'cmd' }>['cmd']) => send({ t: 'cmd', id: nextId++, cmd: c });

  /** Reage uma vez a cada situação nova, com um atraso humano. Serve aos dois jogos. */
  function react(s: RoomSnapshot) {
    const iAmHost = s.room.hostId === s.meId;
    const game = s.game;
    // Chave do "já reagi a isto": muda quando a situação muda, e cada jogo diz o que é situação.
    const deal =
      game.kind === 'impostor'
        ? (game.round?.deal ?? 0)
        : game.kind === 'likely'
          ? (game.round?.questionId ?? '-')
          : game.kind === 'secret'
            ? (game.mine?.status ?? '-')
            : game.kind === 'perfect'
              ? `${game.round?.questionId ?? '-'}|${game.couples.length}`
              : `${game.activeId}|${game.alarmCount}`;
    const stage = game.kind === 'impostor' || game.kind === 'likely' || game.kind === 'perfect' ? (game.result?.stage ?? '-') : '-';
    const key = `${s.room.phase}|${deal}|${stage}|${iAmHost}|${s.players.filter((p) => p.connected).length}`;
    if (key === acted) return;
    acted = key;
    const later = (ms: number, fn: () => void) => setTimeout(fn, ms);
    const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

    if (game.kind === 'impostor' && s.room.phase === 'role_reveal' && !game.round!.ackedIds.includes(s.meId)) {
      later(rand(800, 2500), () => cmd({ type: 'ackRole' }));
    }
    if (s.room.phase === 'voting' && !s.votes?.myVote) {
      // No Impostor ninguém vota em si; no outro jogo os alvos vêm prontos no snapshot.
      const alvos = game.kind === 'likely' ? game.round!.targets : s.players.filter((p) => p.id !== s.meId).map((p) => p.id);
      later(rand(1500, 5000), () => cmd({ type: 'castVote', targetId: pick(alvos) }));
    }
    // Casal Perfeito: o bot procura um par livre e responde qualquer coisa. Sem isso, a fase de
    // pareamento não fecharia — ela espera TODO mundo da sala ter dupla.
    if (game.kind === 'perfect') {
      if (s.room.phase === 'pairing' && !game.myCoupleId) {
        const convidou = game.pairing?.invitedBy[0];
        const livre = convidou ?? pick(game.pairing?.waiting.filter((id) => id !== s.meId) ?? []);
        if (livre) later(rand(800, 2500), () => cmd({ type: 'pairWith', targetId: livre }));
      }
      if (s.room.phase === 'answering' && !game.myAnswer && game.round) {
        const opcoes = game.round.options;
        later(rand(1500, 4000), () => cmd({ type: 'submitAnswer', value: pick(opcoes).id }));
      }
    }

    // Bomba-Relógio: o bot acende quando a bomba cai na mão dele e passa depois de pensar um
    // pouco. Se ele passasse na hora, a bomba nunca sobraria para ninguém.
    if (game.kind === 'bomb' && game.activeId === s.meId) {
      if (s.room.phase === 'handoff') later(rand(1200, 2500), () => cmd({ type: 'armBomb' }));
      if (s.room.phase === 'armed') {
        const letra = game.alphabet?.letters.split('').find((l) => !game.alphabet!.used.some((u) => u.letter === l));
        later(rand(2000, 6000), () => cmd(letra ? { type: 'useLetter', letter: letra } : { type: 'passBomb' }));
      }
    }

    if (!iAmHost) return;
    // Bot que é (ou virou) host conduz a partida.
    if (s.room.phase === 'lobby' && s.players.filter((p) => p.connected).length >= 3) later(4000, () => cmd({ type: 'startMatch' }));
    if (s.room.phase === 'clues') {
      later(1000, () => cmd({ type: 'setTimerRunning', running: true }));
      later(15_000, () => cmd({ type: 'openVoting' }));
    }
    if (s.room.phase === 'question') later(rand(4000, 7000), () => cmd({ type: 'openVoting' }));
    // O host bot só abre as perguntas quando todo mundo já tem par.
    if (game.kind === 'perfect' && s.room.phase === 'pairing' && !game.pairing?.waiting.length) later(3000, () => cmd({ type: 'beginQuestions' }));
    if (game.kind === 'bomb' && s.room.phase === 'revealing') later(6000, () => cmd({ type: 'nextRound' }));
    if (s.room.phase === 'revealing' && (game.kind === 'impostor' || game.kind === 'likely' || game.kind === 'perfect') && game.result?.stage === 2) {
      later(9000, () => cmd({ type: 'nextRound' }));
    }

    // Desafio Secreto: o bot confirma a missão para a noite poder começar, e não faz mais nada —
    // cumprir missão é coisa de gente na mesa, não de bot.
    if (game.kind === 'secret') {
      if (s.room.phase === 'briefing' && !game.ready.includes(s.meId)) later(rand(600, 2000), () => cmd({ type: 'missionReady' }));
      if (s.room.phase === 'verdict' && iAmHost) later(12_000, () => cmd({ type: 'nextReveal' }));
    }
  }

  function connect() {
    ws = new WebSocket(url);
    ws.on('open', () => send({ t: 'hello', v: PROTOCOL_VERSION, token: `dev:${tag}` }));
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      if (message.t === 'welcome') {
        // Já estava numa sala (o servidor reiniciou ou a rede caiu): retoma, como o app faz.
        if (joinedCode) send({ t: 'resume', id: nextId++, code: joinedCode });
        else if (onCode) send({ t: 'create', id: nextId++, input: { gameId: 'impostor', category: 'Comidas', totalRounds: 3, maxPlayers: 8 }, me });
        else send({ t: 'join', id: nextId++, code: code!, me });
      } else if (message.t === 'ack' && !message.ok) {
        console.log(`[${name}] recusado: ${message.error}`);
        if (message.error === 'not_in_room') stopped = true;
      } else if (message.t === 'snapshot') {
        if (!message.snapshot) return void console.log(`[${name}] fora da sala`);
        joinedCode = message.snapshot.room.code;
        if (onCode) {
          onCode(joinedCode);
          onCode = undefined;
        }
        acted = acted && message.snapshot.players.find((p) => p.id === message.snapshot!.meId)?.connected ? acted : '';
        react(message.snapshot);
      } else if (message.t === 'bye') {
        console.log(`[${name}] servidor encerrou: ${message.reason}${message.reason === 'unauthenticated' ? ' — o servidor precisa de AUTH_MODE=dev ou supabase+dev' : ''}`);
        if (message.reason !== 'shutdown') stopped = true;
      }
    });
    ws.on('error', () => {});
    ws.on('close', () => {
      if (stopped) return void console.log(`[${name}] desconectou`);
      setTimeout(connect, 1000); // tenta voltar, como um celular que perdeu o sinal
    });
  }

  connect();
  return {
    close: () => {
      stopped = true;
      ws.close();
    },
  };
}

const sockets: { close(): void }[] = [];
const joinRest = (from: number) => {
  for (let i = from; i < count; i++) setTimeout(() => sockets.push(bot(i)), (i - from) * 700);
};

if (hostMode) {
  sockets.push(
    bot(0, (created) => {
      code = created;
      console.log(`\n  Sala criada por um bot. Entre no app com o código  ${created}\n`);
      joinRest(1);
    }),
  );
} else {
  console.log(`${count} bots entrando na sala ${code} em ${url}`);
  joinRest(0);
}

process.on('SIGINT', () => {
  sockets.forEach((s) => s.close());
  setTimeout(() => process.exit(0), 200);
});
