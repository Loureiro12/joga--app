import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { colors } from '@/core/theme';
import { Button, Display, ErrorState, FieldError, Input, Screen, Spacer, Txt, toast } from '@/core/ui';

import { authActions } from '../useAuthActions';

/**
 * Destino do link de "Esqueci a senha" (`jogae://reset-password?code=…`).
 * O `code` (PKCE) só vale no aparelho que pediu o link e expira em 30 minutos.
 */
export function ResetPasswordScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!code) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ErrorState title="Link inválido" subtitle="Esse link de redefinição expirou ou já foi usado. Peça um novo." />
        <Button label="Pedir outro link" onPress={() => router.replace(routes.forgotPassword)} />
      </Screen>
    );
  }

  const submit = async () => {
    if (pass.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
    setLoading(true);
    try {
      await authActions.completePasswordReset(code, pass);
      toast('Senha atualizada');
    } catch {
      setError('Esse link expirou ou foi aberto em outro aparelho. Peça um novo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen gap={20}>
      <View>
        <Display size={44}>Crie uma senha nova.</Display>
        <Txt size={16} lh={1.4} color={colors.muted} style={{ marginTop: 10 }}>
          Depois de salvar você já entra direto.
        </Txt>
      </View>
      <Input
        value={pass}
        onChangeText={(v) => {
          setPass(v);
          setError(null);
        }}
        placeholder="Nova senha"
        secureTextEntry={!show}
        autoComplete="new-password"
        error={!!error}
        onSubmitEditing={submit}
        right={
          <Pressable accessibilityRole="button" onPress={() => setShow(!show)} hitSlop={8} style={{ padding: 6 }}>
            <Txt font="body600" size={12} color={colors.primaryLight}>
              {show ? 'Ocultar' : 'Mostrar'}
            </Txt>
          </Pressable>
        }
      />
      {error && <FieldError message={error} />}
      <Spacer />
      <Button label={loading ? 'Salvando' : 'Salvar senha'} disabled={!pass} loading={loading} onPress={submit} />
    </Screen>
  );
}
