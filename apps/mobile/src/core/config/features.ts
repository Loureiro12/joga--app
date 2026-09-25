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
   * Desligada até existir conta no AdMob com os ids do app. Ligar antes disso não é só inútil:
   * o SDK do Google **derruba o app na subida** quando o app id está ausente ou inválido.
   *
   * Para ligar: criar o app no AdMob, instalar `react-native-google-mobile-ads`, pôr o config
   * plugin com os dois ids no `app.json`, definir as variáveis `EXPO_PUBLIC_ADMOB_*` e trocar
   * este `false` por `true`. Sem SDK presente, o serviço vira um nada e o app segue funcionando.
   */
  ads: false,
} as const;
