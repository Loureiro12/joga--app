import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

// Endereço público do site. Enquanto o domínio jogae.app não existe, a Vercel preenche o dela.
const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://jogae.app');

export default defineConfig({
  site,
  // Tudo é estático, menos o que declara `prerender = false`: convites (precisam do código no HTML
  // para o preview do WhatsApp) e os arquivos .well-known (precisam de Content-Type exato).
  output: 'static',
  // Na Vercel usa o adaptador dela; em qualquer outro lugar (local, Fly, VPS) vira um servidor Node.
  adapter: process.env.VERCEL ? vercel() : node({ mode: 'standalone' }),
  trailingSlash: 'never',
  server: { port: 4321 },
  devToolbar: { enabled: false },
});
