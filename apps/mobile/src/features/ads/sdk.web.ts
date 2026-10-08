/**
 * O SDK de anúncios na web: nada.
 *
 * `react-native-google-mobile-ads` chama `TurboModuleRegistry.getEnforcing(...)` **no topo do
 * módulo**. Basta ele ser avaliado onde não há ponte nativa para a página inteira morrer com
 * "__fbBatchedBridgeConfig is not set" — tela branca, antes de qualquer tela aparecer.
 *
 * O Metro escolhe este arquivo no lugar de `sdk.ts` quando a plataforma é web, então o pacote
 * nunca entra no bundle do navegador. É a mesma proteção que o harness do navegador depende.
 */
export const loadAdsSdk = (): unknown => null;
