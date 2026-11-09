/**
 * O SDK do Firebase, carregado preguiçosamente.
 *
 * `require` dentro da função, e não `import` no topo, pelo mesmo motivo do SDK de anúncios: estes
 * são módulos **nativos**. Em Expo Go e em qualquer build sem os arquivos de configuração do
 * Firebase eles não existem, e avaliá-los derruba o app antes da primeira tela.
 *
 * Devolve `null` quando o módulo não está lá, e aí o serviço simulado assume. É o que mantém o
 * Expo Go funcionando como sempre funcionou.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type FirebaseSdk = {
  analytics: any;
  crashlytics: any;
  perf: any;
};

export function loadFirebaseSdk(): FirebaseSdk | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const analytics = require('@react-native-firebase/analytics').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crashlytics = require('@react-native-firebase/crashlytics').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const perf = require('@react-native-firebase/perf').default;
    if (!analytics || !crashlytics || !perf) return null;
    return { analytics, crashlytics, perf };
  } catch {
    return null;
  }
}
