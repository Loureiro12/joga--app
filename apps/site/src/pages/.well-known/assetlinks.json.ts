import type { APIRoute } from 'astro';

import { app } from '../../lib/config';

export const prerender = false;

export const GET: APIRoute = () => {
  // O fingerprint é o do Play App Signing (não o de debug). Sem ele, lista vazia: válido, mas o link abre o navegador.
  const body = app.androidFingerprints.length
    ? [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', package_name: app.androidPackage, sha256_cert_fingerprints: app.androidFingerprints },
        },
      ]
    : [];
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });
};
