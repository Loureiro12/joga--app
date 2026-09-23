/**
 * Teste de fumaça do contrato RoomService: joga uma partida inteira como host e como convidado
 * contra o MockRoomService com timers acelerados. Rode com `npm run smoke:room`.
 * Serve também de checklist para a implementação real (Supabase/Firebase).
 */
import { MockRoomService, DEFAULT_MOCK_CONFIG } from '../src/features/match/services/MockRoomService';
import type { RoomSnapshot } from '@jogae/engine';

/** Estes scripts jogam Impostor: estreita a parte do jogo no snapshot. */
const view = (s: RoomSnapshot | null) => s!.game as Extract<RoomSnapshot['game'], { kind: 'impostor' }>;

const fast = Object.fromEntries(Object.entries(DEFAULT_MOCK_CONFIG).map(([k, v]) => [k, k.endsWith('Sec') ? v : Math.max(5, Math.round((v as number) / 100))])) as typeof DEFAULT_MOCK_CONFIG;
const until = (svc: MockRoomService, pred: (s: RoomSnapshot) => boolean, label: string) =>
  new Promise<RoomSnapshot>((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout: ' + label)), 5000);
    let un: (() => void) | undefined; let done = false;
    un = svc.subscribe((s) => { if (!done && s && pred(s)) { done = true; clearTimeout(t); setTimeout(() => un?.(), 0); res(s); } });
  });
const me = { id: 'me', name: 'Vini', color: '#FACC15' };

async function host() {
  const svc = new MockRoomService(fast);
  await svc.createRoom({ gameId: 'impostor', category: 'Aleatório', totalRounds: 3, maxPlayers: 5 }, me);
  let s = await until(svc, (x) => x.players.length === 5, 'lobby full');
  console.log('host lobby', s.room.code, s.players.map((p) => p.name).join(','));
  await svc.startMatch();
  for (let r = 1; r <= 3; r++) {
    s = await until(svc, (x) => x.room.phase === 'role_reveal' && x.room.roundIndex === r, 'reveal ' + r);
    console.log(' round', r, 'secret', JSON.stringify(view(s).secret), 'starter', view(s).round?.starterId);
    await svc.ackRole();
    await svc.setTimerRunning(true); await svc.setPaused(true); await svc.setPaused(false);
    await svc.openVoting();
    s = await until(svc, (x) => x.room.phase === 'voting', 'voting');
    await svc.castVote(s.players.find((p) => p.id !== 'me')!.id);
    s = await until(svc, (x) => view(x).result?.stage === 2, 'stage2');
    console.log('  caught', view(s).result!.caught, 'tally', JSON.stringify(view(s).result!.tally), 'votes', s.votes?.votedIds.length + '/' + s.votes?.total);
    await svc.nextRound();
  }
  s = await until(svc, (x) => x.room.phase === 'finished', 'finished');
  console.log('host finished', JSON.stringify(view(s).summary), s.scores.map((x) => `${x.playerId}:${x.points}`).join(' '));
  await svc.playAgain();
  s = await until(svc, (x) => x.room.phase === 'lobby', 'again');
  console.log('play again ok, scores reset:', s.scores.every((x) => x.points === 0));
  await svc.leaveRoom();
}

async function guest() {
  const svc = new MockRoomService(fast);
  await svc.joinRoom('0000', me).then(() => console.log('BUG: joined bad code'), (e) => console.log('bad code →', e.code));
  await svc.joinRoom('4827', me);
  try { await svc.startMatch(); console.log('BUG: guest started'); } catch (e: any) { console.log('guest startMatch →', e.code); }
  let s = await until(svc, (x) => x.room.phase === 'role_reveal', 'guest reveal');
  console.log('guest: host bot started, players', s.players.length);
  await svc.ackRole();
  s = await until(svc, (x) => x.room.phase === 'voting', 'guest voting (bot host)');
  await svc.castVote(s.room.hostId);
  await until(svc, (x) => view(x).result?.stage === 2, 'guest result');
  s = await until(svc, (x) => x.room.roundIndex === 2, 'guest round 2 (bot host)');
  console.log('guest: bot host advanced to round', s.room.roundIndex);
    const oldHost = s.room.hostId;
  svc.debug.simulateHostLeft();
  s = await until(svc, (x) => x.room.hostId !== oldHost, 'host migrou');
  const newHost = s.players.find((p) => p.isHost)!;
  console.log('host saiu → novo host:', newHost.name, '| fase:', s.room.phase, '| antigo ainda na sala:', s.players.some((p) => p.id === oldHost));
  if (s.room.phase === 'closed' || s.players.some((p) => p.id === oldHost)) throw new Error('migração de host falhou');
  await svc.leaveRoom();
}

/** Quem é Mais Provável: mesma sala, outro jogo — confere que o motor conduz os dois. */
async function likely() {
  const likelyView = (x: RoomSnapshot) => x.game as Extract<RoomSnapshot['game'], { kind: 'likely' }>;
  const svc = new MockRoomService(fast);
  await svc.createRoom({ gameId: 'likely', category: 'Aleatório', totalRounds: 2, maxPlayers: 6, settings: { competitive: true } }, me);
  let s = await until(svc, (x) => x.players.length >= 3, 'lobby');
  await svc.startMatch();

  s = await until(svc, (x) => x.room.phase === 'question', 'pergunta');
  const primeira = likelyView(s).round!;
  console.log('likely pergunta 1:', primeira.question, '·', primeira.category, '·', primeira.intensity);
  if (!primeira.question.endsWith('?')) throw new Error('pergunta malformada');
  if (!primeira.targets.includes('me')) throw new Error('votar em si mesmo deveria ser o padrão');

  await svc.openVoting();
  s = await until(svc, (x) => x.room.phase === 'voting', 'votação');
  await svc.castVote(s.players.find((p) => p.id !== 'me')!.id);
  s = await until(svc, (x) => likelyView(x).result?.stage === 2, 'resultado');
  const r = likelyView(s).result!;
  console.log('likely resultado:', r.winnerIds.length > 1 ? 'empate' : 'vencedor', r.winnerIds.join('&'), '·', r.totalVotes + '/' + r.eligibleCount, 'votos');

  await svc.nextRound();
  s = await until(svc, (x) => x.room.phase === 'question' && x.room.roundIndex === 2, 'pergunta 2');
  if (likelyView(s).round!.questionId === primeira.questionId) throw new Error('a pergunta repetiu na mesma partida');

  await svc.openVoting();
  s = await until(svc, (x) => x.room.phase === 'voting', 'votação 2');
  await svc.castVote('me');
  await until(svc, (x) => likelyView(x).result?.stage === 2, 'resultado 2');
  await svc.nextRound();
  s = await until(svc, (x) => x.room.phase === 'finished', 'fim');
  const summary = likelyView(s).summary!;
  console.log('likely fim:', summary.questions, 'perguntas ·', summary.votes, 'votos ·', summary.unanimities, 'unânimes ·', summary.highlights.length, 'destaques');
  if (summary.questions !== 2) throw new Error('resumo não fechou a partida');
  await svc.leaveRoom();
}

/**
 * Desafio Secreto: o jogo que não tem rodada. Confere o fluxo inteiro (briefing → noite →
 * hora da verdade) e, principalmente, que a missão de um jogador nunca chega no celular do outro.
 */
async function secret() {
  const secretView = (x: RoomSnapshot) => x.game as Extract<RoomSnapshot['game'], { kind: 'secret' }>;
  const svc = new MockRoomService(fast);
  await svc.createRoom({ gameId: 'secret', category: 'festa', totalRounds: 0, maxPlayers: 6, settings: { context: 'festa', difficulties: ['facil', 'media'], accusations: 2, swaps: 1, competitive: true } }, me);
  let s = await until(svc, (x) => x.players.length >= 4, 'lobby');
  await svc.startMatch();

  s = await until(svc, (x) => x.room.phase === 'briefing', 'briefing');
  const minha = secretView(s).mine!;
  console.log('secret missão:', minha.mission.text, '·', minha.mission.difficulty);
  if (!minha.mission.contexts.includes('festa')) throw new Error('missão sorteada fora do contexto pedido');

  // O snapshot é o que chega pelo fio: a missão dos outros não pode estar nele em lugar nenhum.
  const fio = JSON.stringify(s);
  for (const campo of ['missionOf', 'options', 'caughtAt', 'completedAt']) {
    if (fio.includes('"' + campo + '"')) throw new Error('o snapshot carrega o campo interno ' + campo);
  }

  await svc.missionReady();
  s = await until(svc, (x) => x.room.phase === 'mission', 'noite');
  // Na noite, e só nela, aparecem as quatro opções por alvo — nunca a missão verdadeira marcada.
  const opcoes = secretView(s).accusationOptions;
  const alvo = Object.keys(opcoes)[0];
  if (!alvo || opcoes[alvo].length !== 4) throw new Error('as opções de acusação não vieram em quatro');
  if (opcoes['me']) throw new Error('o app recebeu as opções da própria missão');
  await svc.missionDone();
  await svc.accuse(alvo, opcoes[alvo][0].id);

  s = await until(svc, (x) => secretView(x).mine!.accusationsLeft === 1, 'acusação gasta');
  // Dá tempo de os bots cumprirem as missões e acusarem: sem isso a hora da verdade fica vazia.
  await new Promise((r) => setTimeout(r, 200));
  await svc.endMatch();
  s = await until(svc, (x) => x.room.phase === 'verdict', 'hora da verdade');
  console.log('secret revelação 1:', s.players.find((p) => p.id === secretView(s).reveal!.playerId)?.name, '·', secretView(s).reveal!.status);

  const total = secretView(s).revealProgress!.total;
  for (let i = 1; i <= total; i++) {
    s = await until(svc, (x) => x.room.phase !== 'verdict' || secretView(x).revealProgress!.index === i, 'revelação ' + i);
    if (s.room.phase !== 'verdict') break;
    const dono = secretView(s).reveal!.playerId;
    if (dono !== 'me') await svc.voteReveal(true);
    // O grupo inteiro vota antes de virar a página — é o que valida (ou não) a história.
    if (secretView(s).reveal!.status === 'concluida') {
      await until(svc, (x) => (x.votes?.votedIds.length ?? 0) >= (x.votes?.total ?? 0), 'votos da revelação ' + i);
    }
    await svc.nextReveal();
  }

  s = await until(svc, (x) => x.room.phase === 'finished', 'fim da noite');
  const resumo = secretView(s).summary!;
  console.log('secret fim:', resumo.players.length, 'missões ·', resumo.players.filter((p) => p.status === 'validada').length, 'validadas ·', resumo.highlights.length, 'destaques');
  if (resumo.players.length !== s.players.length) throw new Error('o resumo perdeu alguém');
  // Quem foi pego ou não depende do sorteio; o que não pode variar é o grupo ter julgado todo mundo:
  // ninguém pode acabar a noite em "concluida", que é o estado de quem ainda espera validação.
  if (resumo.players.some((p) => p.status === 'concluida')) throw new Error('alguém ficou sem julgamento na hora da verdade');
  if (resumo.players.find((p) => p.playerId === 'me')!.status === 'concluida') throw new Error('a sua missão não foi julgada');
  await svc.leaveRoom();
}

host().then(guest).then(likely).then(secret).then(() => { console.log('SMOKE OK'); process.exit(0); }).catch((e) => { console.error('SMOKE FAIL', e); process.exit(1); });
