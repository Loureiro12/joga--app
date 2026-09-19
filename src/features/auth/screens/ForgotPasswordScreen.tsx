import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Enter } from '@/core/animation/Enter';
import { colors } from '@/core/theme';
import { BackButton, Button, Display, FieldError, Input, Screen, Spacer, Txt, toast } from '@/core/ui';
import { EMAIL_RE } from '@/core/utils/format';
import { services } from '@/services';

/** Tela 4: Esqueci a senha. */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    if (!EMAIL_RE.test(email)) return setError(true);
    setLoading(true);
    await services.auth.sendPasswordReset(email);
    setLoading(false);
    setSent(true);
  };

  const resend = async () => {
    await services.auth.sendPasswordReset(email);
    toast('Link reenviado');
  };

  return (
    <Screen
      gap={20}
      header={
        <BackButton onPress={() => router.back()} />
      }
    >
      {!sent ? (
        <>
          <View>
            <Display size={44}>Esqueceu a senha?</Display>
            <Txt size={16} lh={1.4} color={colors.muted} style={{ marginTop: 10 }}>
              Sem drama. Mandamos um link para você criar uma nova.
            </Txt>
          </View>
          <Input
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(false);
            }}
            placeholder="E-mail da conta"
            keyboardType="email-address"
            autoComplete="email"
            error={error}
            onSubmitEditing={send}
          />
          {error && <FieldError message="Esse e-mail não parece válido." />}
          <Spacer />
          <Button label="Enviar link" disabled={!email} loading={loading} onPress={send} />
        </>
      ) : (
        <>
          <Enter kind="pop" duration={600} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
              <Display size={44} color={colors.background}>
                ✓
              </Display>
            </View>
            <Display size={40} center>
              Link enviado
            </Display>
            <Txt size={15} lh={1.45} color={colors.muted} center style={{ maxWidth: 280 }}>
              Confira <Txt size={15}>{email}</Txt>. O link vale por 30 minutos.
            </Txt>
            <Pressable accessibilityRole="button" onPress={resend} style={{ padding: 6 }}>
              <Txt font="body600" size={14} color={colors.primaryLight}>
                Não chegou? Reenviar
              </Txt>
            </Pressable>
          </Enter>
          <Button label="Voltar para entrar" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
