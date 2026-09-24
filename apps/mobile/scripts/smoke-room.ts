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
const until = (svc: MockRoomService, pred: (s: RoomSnapshot) => boolean, label: string, ms = 5000) =>
  new Promise<RoomSnapshot>((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout: ' + label)), ms);
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

/**
 * Casal Perfeito: o jogo em que a unidade é a dupla, não o jogador. Confere o pareamento de mão
 * dupla, o segredo da resposta até a revelação e o placar por casal.
 */
async function perfect() {
  const perfectView = (x: RoomSnapshot) => x.game as Extract<RoomSnapshot['game'], { kind: 'perfect' }>;
  const svc = new MockRoomService(fast);
  await svc.createRoom({ gameId: 'perfect', category: 'Misturado', totalRounds: 3, maxPlayers: 4, settings: { categories: [], timerSec: 20 } }, me);
  await until(svc, (x) => x.players.length >= 4, 'lobby');
  await svc.startMatch();

  let s = await until(svc, (x) => x.room.phase === 'pairing', 'pareamento');
  // Convite de mão dupla: escolher não basta, o outro precisa aceitar (§8).
  const alvo = s.players.find((p) => p.id !== 'me' && !perfectView(s).couples.some((c) => c.aId === p.id || c.bId === p.id))!;
  await svc.pairWith(alvo.id);
  s = await until(svc, (x) => perfectView(x).myCoupleId !== null, 'minha dupla');
  console.log('perfect dupla:', s.players.find((p) => p.id === alvo.id)?.name, '· casais:', perfectView(s).couples.length);

  // Ninguém fica de fora: o host só consegue começar quando toda a sala tem dupla (§9).
  s = await until(svc, (x) => perfectView(x).pairing!.waiting.length === 0, 'todos pareados');
  await svc.beginQuestions();
  s = await until(svc, (x) => x.room.phase === 'answering', 'primeira pergunta');
  const primeira = perfectView(s).round!;
  console.log('perfect pergunta 1:', primeira.prompt, '·', primeira.category, '·', primeira.type);
  if (!primeira.options.length) throw new Error('a pergunta veio sem opções');
  if (primeira.type === 'who' && primeira.options.length !== 2) throw new Error('"quem é mais" tem de ter duas opções');

  await svc.submitAnswer(primeira.options[0].id);
  s = await until(svc, (x) => perfectView(x).myAnswer !== null, 'resposta enviada');
  // O que eu marquei não pode estar no snapshot de mais ninguém: é o coração do jogo (§32).
  const fio = JSON.stringify(s);
  for (const campo of ['"answers"', '"invites"', '"aboutOf"']) {
    if (fio.includes(campo)) throw new Error('o snapshot carrega o campo interno ' + campo);
  }
  if (s.votes?.myVote) throw new Error('a resposta vazou pelo progresso da votação');

  s = await until(svc, (x) => perfectView(x).result?.stage === 2, 'revelação');
  const r = perfectView(s).result!;
  console.log('perfect rodada 1:', r.couples.map((c) => `${c.coupleId}:${c.outcome}+${c.points}`).join(' '));
  if (r.couples.length !== perfectView(s).couples.length) throw new Error('faltou casal na revelação');

  for (let i = 2; i <= 3; i++) {
    await svc.nextRound();
    s = await until(svc, (x) => x.room.phase === 'answering' && x.room.roundIndex === i, 'pergunta ' + i);
    if (perfectView(s).round!.questionId === primeira.questionId) throw new Error('a pergunta repetiu na mesma partida');
    await svc.submitAnswer(perfectView(s).round!.options[0].id);
    await until(svc, (x) => perfectView(x).result?.stage === 2, 'revelação ' + i);
  }
  // A última vale dobro (§47).
  if (perfectView(s).round!.points !== 200) throw new Error('o match final não valeu dobro');

  await svc.nextRound();
  s = await until(svc, (x) => x.room.phase === 'finished' || perfectView(x).round?.tieBreak === true, 'fim ou desempate');
  // Empate no topo: a partida não acaba sem desempate (§48) — e ele pode empatar de novo.
  for (let i = 1; perfectView(s).round?.tieBreak && i <= 4; i++) {
    console.log('perfect desempate', i, 'entre', perfectView(s).couples.length, 'casais');
    await svc.submitAnswer(perfectView(s).round!.options[0].id);
    await until(svc, (x) => perfectView(x).result?.stage === 2, 'revelação do desempate ' + i);
    await svc.nextRound();
    s = await until(svc, (x) => x.room.phase === 'finished' || perfectView(x).round?.tieBreak === true, 'fim ou novo desempate');
  }
  if (s.room.phase !== 'finished') throw new Error('a partida não fechou nem depois dos desempates');

  const resumo = perfectView(s).summary!;
  console.log('perfect fim:', resumo.standings.map((l) => `${l.matches}/${l.rounds}`).join(' '), '·', resumo.percent + '% coincidiram ·', resumo.titles.length, 'títulos');
  if (!resumo.mine) throw new Error('o resumo não trouxe o casal de quem está olhando');
  if (resumo.mine.rounds !== 3 && resumo.mine.rounds !== 4) throw new Error('o resumo perdeu rodadas: ' + resumo.mine.rounds);
  await svc.leaveRoom();
}

/**
 * Bomba-Relógio em sala: cada um no seu celular, a bomba virtual. O que mais importa aqui é o
 * que NÃO está no snapshot — o instante da explosão.
 */
async function bomb() {
  const bombView = (x: RoomSnapshot) => x.game as Extract<RoomSnapshot['game'], { kind: 'bomb' }>;
  const svc = new MockRoomService(fast);
  await svc.createRoom({ gameId: 'bomb', category: 'Aleatório', totalRounds: 2, maxPlayers: 5, settings: { variant: 'classico', mode: 'casual', minSeconds: 6, maxSeconds: 6 } }, me);
  await until(svc, (x) => x.players.length >= 4, 'lobby');
  await svc.startMatch();

  let s = await until(svc, (x) => x.room.phase === 'handoff', 'é a vez de alguém');
  console.log('bomb rodada 1:', bombView(s).challenge?.text, '· começa com', s.players.find((p) => p.id === bombView(s).activeId)?.name);

  // O pavio não trafega: sem isso, quem abrisse o WebSocket saberia o segundo da explosão.
  const fio = JSON.stringify(s);
  for (const campo of ['explodeAt', 'pendingAlarms', 'heldSince', 'heldMs', 'usedChallengeIds']) {
    if (fio.includes('"' + campo + '"')) throw new Error('o snapshot carrega o campo secreto ' + campo);
  }

  // Quem começou pode ser um bot; se for a minha vez, acendo eu. (A regra de "só quem está com
  // a bomba acende" tem teste próprio no engine — aqui o alvo é o fluxo pela rede.)
  if (bombView(s).activeId === 'me') await svc.armBomb();
  s = await until(svc, (x) => x.room.phase === 'armed', 'bomba acesa');
  if (bombView(s).activeId === 'me') await svc.passBomb();

  // Ninguém precisa mandar nada: é o servidor que faz a bomba estourar.
  s = await until(svc, (x) => bombView(x).phase === 'exploded', 'explosão', 12000);
  const perdedor = s.players.find((p) => p.id === bombView(s).loserId)?.name;
  console.log('bomb explodiu com', perdedor, '· bombas dele:', bombView(s).bombs[bombView(s).loserId!]);
  if (!bombView(s).loserId) throw new Error('explodiu sem perdedor');

  await svc.nextRound();
  s = await until(svc, (x) => x.room.phase === 'handoff' && x.room.roundIndex === 2, 'rodada 2');
  if (bombView(s).activeId === 'me') await svc.armBomb();
  s = await until(svc, (x) => x.room.phase === 'armed', 'bomba acesa 2');
  s = await until(svc, (x) => bombView(x).phase === 'exploded', 'explosão 2', 12000);
  await svc.nextRound();

  s = await until(svc, (x) => x.room.phase === 'finished', 'fim');
  const placar = bombView(s).standings!;
  console.log('bomb fim:', placar.map((l) => `${l.position}º ${l.bombs}💣`).join(' '), '·', (bombView(s).highlights ?? []).length, 'destaques');
  if (placar.length !== s.players.length) throw new Error('o placar perdeu alguém');
  await svc.leaveRoom();
}

/** Alfabeto em sala: tocar a letra é o que passa a bomba, e todo mundo vê a grade. */
async function bombAlphabet() {
  const bombView = (x: RoomSnapshot) => x.game as Extract<RoomSnapshot['game'], { kind: 'bomb' }>;
  const svc = new MockRoomService(fast);
  await svc.createRoom({ gameId: 'bomb', category: 'Aleatório', totalRounds: 1, maxPlayers: 4, settings: { variant: 'alfabeto', minSeconds: 300, maxSeconds: 300 } }, me);
  await until(svc, (x) => x.players.length >= 3, 'lobby');
  await svc.startMatch();

  let s = await until(svc, (x) => x.room.phase === 'handoff', 'vez');
  const tema = bombView(s).alphabet!;
  console.log('alfabeto:', tema.name, '·', tema.letters.length, 'letras');
  if (bombView(s).activeId === 'me') await svc.armBomb();
  s = await until(svc, (x) => x.room.phase === 'armed', 'acesa');

  // Gasta o alfabeto inteiro: com pavio de 300s, o grupo desarma antes de estourar.
  let atual: RoomSnapshot | null = s;
  const unsub = svc.subscribe((x) => (atual = x));
  for (let i = 0; i < tema.letters.length + 6; i++) {
    if (!atual || atual.room.phase !== 'armed') break;
    const v = bombView(atual);
    if (v.activeId === 'me') {
      const livre = v.alphabet!.letters.split('').find((l) => !v.alphabet!.used.some((u) => u.letter === l));
      if (livre) await svc.useLetter(livre);
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  unsub();

  s = await until(svc, (x) => bombView(x).phase === 'disarmed' || bombView(x).phase === 'exploded', 'fim da rodada', 12000);
  console.log('alfabeto rodada:', bombView(s).phase, '·', bombView(s).alphabet!.used.length, 'letras gastas');
  // O tempo de cada letra não pode ter vindo junto: somado, ele diria há quanto tempo o pavio queima.
  if (JSON.stringify(s).includes('"ms"')) throw new Error('o tempo de cada letra vazou no snapshot');
  await svc.leaveRoom();
}

host().then(guest).then(likely).then(secret).then(perfect).then(bomb).then(bombAlphabet).then(() => { console.log('SMOKE OK'); process.exit(0); }).catch((e) => { console.error('SMOKE FAIL', e); process.exit(1); });
