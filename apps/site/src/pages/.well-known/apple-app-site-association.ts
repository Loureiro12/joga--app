import type { APIRoute } from 'astro';

import { app } from '../../lib/config';

// Rota de servidor (e não arquivo estático) por um motivo: este caminho NÃO tem extensão, e hospedagens
// estáticas o serviriam como `application/octet-stream`. A Apple exige `application/json`, status 200, sem redirect.
export const prerender = false;

const PATHS = ['/j/*', '/u/*'];

export const GET: APIRoute = () => {
  // Sem o Team ID o arquivo sai válido porém vazio: os links abrem o navegador em vez do app, sem erro.
  const appId = app.appleTeamId ? `${app.appleTeamId}.${app.iosBundleId}` : null;
  const body = {
    applinks: {
      apps: [],
      details: appId
        ? [
            {
              appIDs: [appId],
              components: PATHS.map((path) => ({ '/': path })),
              // Formato antigo, para iOS 12 e anteriores.
              appID: appId,
              paths: PATHS,
            },
          ]
        : [],
    },
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });
};
