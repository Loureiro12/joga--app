/**
 * O SDK de anúncios no celular, carregado só quando alguém pede.
 *
 * `require` e não `import`: o módulo pode não estar no build (Expo Go, ou um build sem o config
 * plugin), e nesse caso o app precisa seguir funcionando sem anúncio nenhum.
 *
 * Na web quem responde é `sdk.web.ts`, que devolve nada — ver o porquê lá.
 */
export function loadAdsSdk(): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-google-mobile-ads');
  } catch {
    return null;
  }
}
