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
  /**
   * Anúncios (AdMob).
   *
   * Os ids do app vivem no config plugin em `app.json` — o SDK do Google **derruba o app na
   * subida** sem eles, e é por isso que a flag só pode estar ligada com o plugin configurado.
   *
   * Em Expo Go e na web o módulo nativo não existe: o serviço vira um nada e o app roda normal,
   * sem anúncio. Em desenvolvimento, os ids de teste do Google são forçados — um clique seu num
   * anúncio de verdade conta como clique inválido e o AdMob suspende a conta.
   */
  ads: true,
} as const;
