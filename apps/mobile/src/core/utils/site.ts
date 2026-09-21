import * as WebBrowser from 'expo-web-browser';

/**
 * Endereço público do site (jogaeapp.com.br). É ele que aparece nos links de convite e onde moram as páginas
 * legais. Enquanto o domínio não existe, aponte para o endereço provisório com EXPO_PUBLIC_SITE_URL.
 */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || 'https://jogaeapp.com.br').replace(/\/$/, '');

/** `jogaeapp.com.br` — como o link aparece para as pessoas (sem https://). */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');

export const siteLinks = {
  room: (code: string) => `${SITE_URL}/j/${code}`,
  friend: (username: string) => `${SITE_URL}/u/${username}`,
  privacy: `${SITE_URL}/privacidade`,
  terms: `${SITE_URL}/termos`,
  deleteAccount: `${SITE_URL}/excluir-conta`,
};

/** Abre uma página do site dentro do app (navegador embutido do sistema). */
export const openSite = (url: string) => WebBrowser.openBrowserAsync(url, { toolbarColor: '#0F0F13', controlsColor: '#A78BFA' }).catch(() => {});
