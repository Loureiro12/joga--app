/**
 * Funcionalidades que existem no código mas ainda não vão para as lojas.
 * Desligada, a funcionalidade some da navegação inteira — nada de tela "em breve" nem botão morto.
 */
export const features = {
  /**
   * Assinatura Premium e o que depende dela (criar jogo com IA, categorias exclusivas).
   * Desligada até o passo 6 (RevenueCat): hoje a compra é simulada, e a App Store rejeita
   * compra dentro do app que não passe pelo pagamento dela. Ao religar, confira as quatro
   * entradas: Home, Perfil, Configurações e Criar partida.
   */
  premium: false,
} as const;
