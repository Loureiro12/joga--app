import { sanitizeGeneratedChallenges, sanitizeGeneratedThemes, type AlphabetTheme, type BombChallenge, type BombContentRequest } from '@jogae/engine';

/**
 * De onde vêm os desafios e temas gerados por IA.
 *
 * O app **não** fala com a Anthropic. Fala com o servidor de salas, que tem a chave; qualquer
 * `EXPO_PUBLIC_*` iria dentro do bundle que a loja distribui, e uma chave no bundle é uma chave
 * publicada. Sem servidor configurado, o `Mock` devolve vazio e o jogo roda com o banco local —
 * que é o caminho normal em dev e o caminho de sempre quando a rede falha.
 */
export interface BombContentService {
  generate(request: BombContentRequest): Promise<{ challenges: BombChallenge[]; themes: AlphabetTheme[] }>;
}

export class MockBombContentService implements BombContentService {
  async generate(): Promise<{ challenges: BombChallenge[]; themes: AlphabetTheme[] }> {
    return { challenges: [], themes: [] };
  }
}

/** Quanto o app espera antes de desistir. Curto: quem está esperando é uma busca de fundo, não o grupo. */
const TIMEOUT_MS = 20_000;

/** `ws://host:8787/ws` → `http://host:8787`. É o mesmo servidor; só o protocolo e o caminho mudam. */
export function httpBaseFromWs(wsUrl: string): string {
  return wsUrl.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');
}

export class RemoteBombContentService implements BombContentService {
  constructor(
    private readonly options: {
      /** A URL do WebSocket da sala; a base HTTP é derivada dela. */
      url: string;
      getToken: () => Promise<string | null>;
    },
  ) {}

  async generate(request: BombContentRequest): Promise<{ challenges: BombChallenge[]; themes: AlphabetTheme[] }> {
    const token = await this.options.getToken();
    if (!token) return { challenges: [], themes: [] };

    const res = await fetch(`${httpBaseFromWs(this.options.url)}/api/bomb/content`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`conteúdo recusado: ${res.status}`);
    const corpo = (await res.json()) as { challenges?: unknown; themes?: unknown };

    // O servidor já passou pela portaria do motor; o app passa de novo.
    //
    // Não é desconfiança do servidor, é a mesma razão de o motor ser puro: a regra de conteúdo é
    // uma só, e quem decide o que a mesa vê é o aparelho que vai mostrar. Como o id é derivado do
    // texto, repassar pela portaria dá exatamente os mesmos ids — a conferência é de graça.
    const opcoes = { categories: request.categories, difficulties: request.difficulties };
    return {
      challenges: sanitizeGeneratedChallenges(corpo.challenges, opcoes),
      themes: sanitizeGeneratedThemes(corpo.themes, opcoes),
    };
  }
}
