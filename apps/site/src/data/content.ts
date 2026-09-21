/** Textos da landing, copiados do handoff (`site_handoff_jogae/Jogae - Site.dc.html`). */

export const steps = [
  { k: '1', bg: '#7C3AED', fg: '#FAFAFA', title: 'Escolha o jogo', text: 'Impostor, Quem é mais provável?, Desafio secreto e mais. Ou diga o clima da noite e deixe o app sugerir.' },
  { k: '2', bg: '#FACC15', fg: '#0F0F13', title: 'Crie a sala', text: 'Número de jogadores, categoria e quantas rodadas. Sai um código de 4 dígitos e um QR Code.' },
  { k: '3', bg: '#22C55E', fg: '#0F0F13', title: 'Joguem', text: 'O app distribui os papéis secretos, controla o tempo, abre a votação e revela o resultado com suspense.' },
];

export const games = [
  { name: 'Impostor', category: 'Dedução', emoji: '👀', bg: '#7C3AED', fg: '#FAFAFA', text: 'Todo mundo sabe a palavra. Menos um.', meta: '3–12 · 10–20 min' },
  { name: 'Quem é mais provável?', category: 'Polêmico', emoji: '👉', bg: '#FACC15', fg: '#0F0F13', text: 'Descubra o que seus amigos realmente pensam.', meta: '3+ · 10 min' },
  { name: 'Desafio secreto', category: 'Festa', emoji: '🕵️', bg: '#22C55E', fg: '#0F0F13', text: 'Complete sua missão sem ninguém perceber.', meta: '3+ · 20 min' },
  { name: 'Bomba-relógio', category: 'Caótico', emoji: '💣', bg: '#EF4444', fg: '#FAFAFA', text: 'Responda rápido e passe adiante antes do estouro.', meta: '4+ · 15 min' },
  { name: 'Verdade ou mito', category: 'Rápido', emoji: '⚡', bg: '#A78BFA', fg: '#0F0F13', text: 'Cinco minutos, uma resposta certa por vez.', meta: '2+ · 5 min' },
  { name: 'Casal perfeito', category: 'Casais', emoji: '❤️', bg: '#19191F', fg: '#FAFAFA', text: 'Quem conhece mesmo quem?', meta: '2–8 · 20 min' },
];

export const perks = ['Jogos criados com IA', 'Todos os jogos', 'Categorias exclusivas', 'Partidas ilimitadas'];

/**
 * Premium ainda não existe no app (apps/mobile/src/core/config/features.ts): anunciar preço e "7 dias grátis"
 * de algo que não dá para comprar é propaganda enganosa. Religue junto com o app.
 */
export const premiumEnabled = false;

export const faq = [
  { q: 'Preciso que todo mundo instale o app?', a: 'Sim, cada pessoa joga no próprio celular — é assim que os papéis ficam secretos. A entrada é rápida: código de 4 dígitos ou QR, sem cadastro obrigatório.' },
  { q: 'Funciona sem internet?', a: 'Não. Os celulares se falam por uma sala online, então todos precisam de conexão — Wi-Fi da casa ou dados móveis. Se alguém cair, o app guarda a vaga por 30 segundos.' },
  { q: 'Quantas pessoas podem jogar?', a: 'De 3 a 12, dependendo do jogo. O Impostor fica melhor entre 5 e 8.' },
  { q: 'É pago?', a: premiumEnabled ? 'Não. Os jogos principais são gratuitos e sem anúncio durante a partida. O Premium libera jogos criados com IA, categorias exclusivas e partidas ilimitadas.' : 'Não. O Jogaê é gratuito e não mostra anúncio durante a partida.' },
  { q: 'Dá para jogar com crianças?', a: 'Dá. O clima 👨‍👩‍👧 Família usa perguntas leves. Outros climas, como 👀 Polêmico, são pensados para adultos.' },
];

export const navLinks = [
  { label: 'Como funciona', href: '/#como-funciona' },
  { label: 'Jogos', href: '/#jogos' },
  ...(premiumEnabled ? [{ label: 'Premium', href: '/#premium' }] : []),
  { label: 'Dúvidas', href: '/#duvidas' },
];

export const footerLinks = [
  { label: 'Privacidade', href: '/privacidade' },
  { label: 'Termos', href: '/termos' },
  { label: 'Excluir conta', href: '/excluir-conta' },
];
