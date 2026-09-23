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
  tick: require('../../../assets/audio/tick.wav'),
  tock: require('../../../assets/audio/tock.wav'),
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
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      /* já liberado */
    }
  }
  players.clear();
}
