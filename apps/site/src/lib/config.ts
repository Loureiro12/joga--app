/**
 * Configuração lida do ambiente. `PUBLIC_*` vai para o HTML; o resto só existe no servidor.
 * Em runtime (rotas SSR) vale `process.env`; no build, `import.meta.env`.
 */
const env = (key: string): string => (typeof process !== 'undefined' && process.env[key]) || (import.meta.env[key] as string | undefined) || '';

export const stores = {
  ios: env('PUBLIC_APP_STORE_URL'),
  android: env('PUBLIC_PLAY_STORE_URL'),
};

export const roomApiUrl = (env('ROOM_API_URL') || 'https://jogae.fly.dev').replace(/\/$/, '');
export const plausibleDomain = env('PUBLIC_PLAUSIBLE_DOMAIN');

/** Identidade do app nos arquivos .well-known. Tem que bater com apps/mobile/app.json. */
export const app = {
  iosBundleId: 'app.jogae',
  androidPackage: 'app.jogae',
  scheme: 'jogae',
  appleTeamId: env('APPLE_TEAM_ID'),
  androidFingerprints: env('ANDROID_SHA256_FINGERPRINTS')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean),
};

export const contact = {
  privacy: 'privacidade@jogae.app',
  dpo: 'dpo@jogae.app',
  deletion: 'excluir@jogae.app',
  general: 'contato@jogae.app',
};
