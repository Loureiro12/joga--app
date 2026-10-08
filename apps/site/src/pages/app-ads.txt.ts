import type { APIRoute } from 'astro';

import { adsTxtRecords } from '../lib/config';

/**
 * `app-ads.txt` — quem pode vender o espaço publicitário do Jogaê.
 *
 * O padrão (IAB) existe para cortar fraude: sem este arquivo, qualquer um pode se passar pelo
 * app num leilão, e por isso boa parte dos compradores simplesmente **não dá lance** em
 * inventário não declarado. Na prática, sem ele o anúncio até aparece — mas pagando muito menos.
 *
 * O rastreador do Google não descobre este arquivo sozinho: ele lê o **site do desenvolvedor**
 * declarado na ficha da App Store e do Google Play e procura `/app-ads.txt` na raiz daquele
 * domínio. Se a ficha apontar para outro endereço, este arquivo nunca é lido.
 *
 * É público por natureza — é feito para ser rastreado. Nada aqui é segredo.
 */
export const GET: APIRoute = () =>
  // Sai pré-renderizado no build: o conteúdo é o mesmo para todo mundo e não muda entre deploys.
  new Response(`${adsTxtRecords.join('\n')}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
