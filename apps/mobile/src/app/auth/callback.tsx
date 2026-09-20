import { View } from 'react-native';

import { Spinner } from '@/core/animation/loops';
import { colors } from '@/core/theme';

/**
 * Retorno do OAuth (`jogae://auth/callback?code=…`). Quem troca o `code` pela sessão é o
 * `SupabaseAuthService`, que está esperando o navegador fechar; esta rota só existe para o
 * expo-router não mostrar "rota não encontrada" no Android enquanto isso.
 */
export default function AuthCallback() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size={32} thickness={4} />
    </View>
  );
}
