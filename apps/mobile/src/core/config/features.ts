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
  /**
   * Telemetria: Firebase Analytics, Crashlytics e Performance.
   *
   * Depende de dois arquivos que vêm do console do Firebase (`google-services.json` e
   * `GoogleService-Info.plist`) e do config plugin em `app.json`. **Sem eles o build nativo
   * falha** — o plugin do Google Services é obrigatório no Gradle —, então ligar esta flag sem os
   * arquivos não é uma opção; ver `docs/firebase.md`.
   *
   * Em Expo Go e na web o módulo nativo não existe: o serviço vira o simulado, que em dev imprime
   * cada evento no terminal. É assim que se confere o que o app manda sem build nativo e sem
   * sujar o painel de verdade com dado de teste.
   *
   * O que o usuário controla em Ajustes é a coleta de **uso e desempenho**. Relatório de erro fica
   * sempre ligado enquanto esta flag estiver: ver o comentário de `features/telemetry/consent.ts`.
   */
  telemetry: true,
} as const;
