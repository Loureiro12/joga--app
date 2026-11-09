import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { useSettingsStore } from '@/features/settings/settingsStore';

/**
 * Efeitos sonoros do app.
 *
 * Cada som vira um player criado uma vez e reaproveitado: no tique-taque da bomba, criar um
 * player a cada batida somaria latência justamente onde o ritmo precisa ser exato.
 *
 * Respeita a chave `sound` das configurações, pelo mesmo caminho dos hápticos — quem desligou
 * o som não deve ouvir nada, nem mesmo a explosão.
 */

const FILES = {
  /** Bomba: o fundo de tensão, em duas velocidades. Tocam em laço, não em batida. */
  tensao: require('../../../assets/audio/tensao-loop.wav'),
  tensaoRapido: require('../../../assets/audio/tensao-rapido-loop.wav'),
  explosao: require('../../../assets/audio/explosao.wav'),
  tempoAcabando: require('../../../assets/audio/tempo-acabando.wav'),
  revelar: require('../../../assets/audio/revelar.wav'),
  voto: require('../../../assets/audio/voto.wav'),
  acerto: require('../../../assets/audio/acerto.wav'),
  entrou: require('../../../assets/audio/entrou.wav'),
  impostorEscapou: require('../../../assets/audio/impostor-escapou.wav'),
} as const;

export type SoundName = keyof typeof FILES;

const players = new Map<SoundName, AudioPlayer>();
let modoConfigurado = false;

/**
 * Toca no silencioso do iPhone e não interrompe música de fundo: são efeitos de um jogo de mesa,
 * não mídia. Quem está com o celular no silencioso ainda quer a explosão.
 */
async function configurarModo() {
  if (modoConfigurado) return;
  modoConfigurado = true;
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
}

function playerDe(name: SoundName): AudioPlayer | null {
  const existente = players.get(name);
  if (existente) return existente;
  try {
    const player = createAudioPlayer(FILES[name]);
    players.set(name, player);
    return player;
  } catch {
    // Som é enfeite: se o aparelho recusar, o jogo continua sem ele.
    return null;
  }
}

/** Toca um efeito do começo. Silencioso quando a pessoa desligou o som nas configurações. */
export function playSound(name: SoundName, volume = 1) {
  if (!useSettingsStore.getState().sound) return;
  void configurarModo();
  const player = playerDe(name);
  if (!player) return;
  try {
    player.volume = volume;
    // Sempre do zero: sem isso, um toque durante o som anterior não reinicia e a batida some.
    player.seekTo(0);
    player.play();
  } catch {
    /* um efeito perdido não pode derrubar a partida */
  }
}

/** Deixa os sons prontos antes de a partida começar, para o primeiro toque não engasgar. */
export function preloadSounds(names: SoundName[]) {
  void configurarModo();
  for (const name of names) playerDe(name);
}

/** Libera os players. Chamado ao sair do jogo que os usa. */
export function releaseSounds() {
  for (const name of [...fades.keys()]) pararFade(name);
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      /* já liberado */
    }
  }
  players.clear();
}

/* ------------------------------------------------------------------ laços */

/**
 * Sons que ficam tocando, como o fundo de tensão da bomba.
 *
 * Fade e crossfade existem porque o corte seco só serve num lugar: a explosão. Trocar de
 * velocidade no talho faz o jogador notar a emenda em vez da tensão, e cortar no desarme rouba
 * o alívio — ali o silêncio chegando aos poucos é parte da recompensa.
 */
const fades = new Map<SoundName, ReturnType<typeof setInterval>>();

const pararFade = (name: SoundName) => {
  const f = fades.get(name);
  if (f) clearInterval(f);
  fades.delete(name);
};

/** Leva o volume até o alvo em `ms`. Com alvo zero, pausa o som ao chegar. */
function fade(name: SoundName, para: number, ms: number) {
  const player = players.get(name);
  if (!player) return;
  pararFade(name);
  const passo = 40;
  const de = player.volume ?? 0;
  const passos = Math.max(1, Math.round(ms / passo));
  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    try {
      player.volume = de + ((para - de) * i) / passos;
      if (i >= passos) {
        pararFade(name);
        if (para === 0) player.pause();
      }
    } catch {
      pararFade(name);
    }
  }, passo);
  fades.set(name, timer);
}

/** Começa (ou recomeça) um laço do zero. */
export function playLoop(name: SoundName, volume = 1) {
  if (!useSettingsStore.getState().sound) return;
  void configurarModo();
  const player = playerDe(name);
  if (!player) return;
  try {
    pararFade(name);
    player.loop = true;
    player.volume = volume;
    player.seekTo(0);
    player.play();
  } catch {
    /* som é enfeite */
  }
}

/** Corta na hora, sem fade. É o que a explosão precisa: silêncio e estrondo. */
export function stopLoop(name: SoundName) {
  const player = players.get(name);
  pararFade(name);
  try {
    player?.pause();
  } catch {
    /* já parado */
  }
}

/** Some aos poucos. O alívio do desarme mora aqui. */
export const fadeOutLoop = (name: SoundName, ms: number) => fade(name, 0, ms);

/** Troca um laço pelo outro sem emenda audível. */
export function crossfadeLoop(de: SoundName, para: SoundName, ms: number, volume = 1) {
  if (!useSettingsStore.getState().sound) return;
  playLoop(para, 0);
  fade(para, volume, ms);
  fade(de, 0, ms);
}
