import type { APIRoute } from 'astro';

// Convites são efêmeros (/j/) ou pessoais (/u/): ficam fora dos buscadores.
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\nDisallow: /j/\nDisallow: /u/\n\nSitemap: ${new URL('/sitemap.xml', site).href}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
