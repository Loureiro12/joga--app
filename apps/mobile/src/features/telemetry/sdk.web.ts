/**
 * O SDK do Firebase na web: nada.
 *
 * Os pacotes `@react-native-firebase/*` chamam a ponte nativa no topo do módulo. Basta um deles
 * ser avaliado no navegador para a página morrer com tela branca antes de qualquer tela aparecer —
 * exatamente o que aconteceu com o SDK de anúncios.
 *
 * O Metro escolhe este arquivo no lugar de `sdk.ts` quando a plataforma é web, então nenhum
 * pacote nativo entra no bundle do navegador. O harness de navegador do projeto depende disso.
 */
import type { FirebaseSdk } from './sdk';

export const loadFirebaseSdk = (): FirebaseSdk | null => null;
