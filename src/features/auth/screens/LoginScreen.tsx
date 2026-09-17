import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { LogoLockup } from '@/core/illustrations';
import { routes } from '@/core/navigation/routes';
import { colors } from '@/core/theme';
import { Avatar, Button, Display, FieldError, Input, PressableScale, Screen, Segmented, Spacer, Txt } from '@/core/ui';
import { EMAIL_RE } from '@/core/utils/format';

import { authActions } from '../useAuthActions';

type Tab = 'login' | 'signup';

function ProviderButton({ label, light, icon, onPress }: { label: string; light?: boolean; icon: React.ReactNode; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={{
        height: 56,
        borderRadius: 18,
        backgroundColor: light ? colors.text : colors.surface,
        borderWidth: light ? 0 : 1,
        borderColor: colors.surfaceLight,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      {icon}
      <Txt font="body600" size={16} color={light ? colors.background : colors.text}>
        {label}
      </Txt>
    </PressableScale>
  );
}

const GoogleIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path
      fill="#EA4335"
      d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12S6.6 21.7 12 21.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"
    />
  </Svg>
);

const AppleIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill={colors.text}>
    <Path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8-.7 0-1.9-.8-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.2 1.8 2.4 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.7-1-2.7-4zM14.2 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" />
  </Svg>
);

/** Tela 3: Login / Cadastro. */
export function LoginScreen() {
  const [tab, setTab] = useState<Tab>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signup = tab === 'signup';
  const ready = email.length > 0 && pass.length > 0 && (!signup || name.length > 0);
  // Qualquer digitação limpa o erro.
  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setError(null);
  };

  const submit = async () => {
    if (signup && name.trim().length < 2) return setError('Digite seu nome (pelo menos 2 letras).');
    if (!EMAIL_RE.test(email)) return setError('E-mail inválido. Confira e tente de novo.');
    if (pass.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
    setLoading(true);
    try {
      await (signup ? authActions.signUp(name, email, pass) : authActions.signIn(email, pass));
    } catch {
      setError(signup ? 'Não deu para criar a conta. Tente de novo.' : 'E-mail ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen gap={20}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <LogoLockup />
        <Pressable accessibilityRole="button" onPress={authActions.guest} hitSlop={8} style={{ padding: 8 }}>
          <Txt font="body600" size={14} color={colors.muted}>
            Entrar como convidado
          </Txt>
        </Pressable>
      </View>

      <Segmented
        value={tab}
        onChange={(t) => {
          setTab(t);
          setError(null);
        }}
        options={[
          { value: 'login', label: 'Entrar' },
          { value: 'signup', label: 'Criar conta' },
        ]}
      />

      <Display size={44}>{signup ? 'Crie sua conta em segundos.' : 'Bom te ver de novo.'}</Display>

      <View style={{ gap: 10 }}>
        <ProviderButton light label="Continuar com Google" icon={<GoogleIcon />} onPress={() => authActions.provider('google')} />
        <ProviderButton label="Continuar com Apple" icon={<AppleIcon />} onPress={() => authActions.provider('apple')} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.surfaceLight }} />
        <Txt size={12} color={colors.muted}>
          ou com e-mail
        </Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.surfaceLight }} />
      </View>

      <View style={{ gap: 10 }}>
        {signup && (
          <Input
            value={name}
            onChangeText={edit(setName)}
            placeholder="Seu nome"
            autoCapitalize="words"
            autoComplete="name"
            error={!!error}
            left={<Avatar name={name || '?'} color={colors.accent} size={40} style={{ marginLeft: -6 }} />}
          />
        )}
        <Input
          value={email}
          onChangeText={edit(setEmail)}
          placeholder="E-mail"
          keyboardType="email-address"
          autoComplete="email"
          error={!!error}
        />
        <Input
          value={pass}
          onChangeText={edit(setPass)}
          placeholder="Senha"
          secureTextEntry={!showPass}
          autoComplete={signup ? 'new-password' : 'current-password'}
          error={!!error}
          onSubmitEditing={submit}
          right={
            <Pressable accessibilityRole="button" onPress={() => setShowPass(!showPass)} hitSlop={8} style={{ padding: 6 }}>
              <Txt font="body600" size={12} color={colors.primaryLight}>
                {showPass ? 'Ocultar' : 'Mostrar'}
              </Txt>
            </Pressable>
          }
        />
        {error && <FieldError message={error} />}
        {!signup && (
          <Pressable accessibilityRole="link" onPress={() => router.push(routes.forgotPassword)} style={{ alignSelf: 'flex-end', paddingVertical: 2, paddingHorizontal: 4 }}>
            <Txt font="body600" size={13} color={colors.primaryLight}>
              Esqueci a senha
            </Txt>
          </Pressable>
        )}
      </View>

      <Spacer />

      <Button
        label={loading ? (signup ? 'Criando conta' : 'Entrando') : signup ? 'Criar conta' : 'Entrar'}
        disabled={!ready}
        loading={loading}
        onPress={submit}
      />
      {signup && (
        <Txt font="body400" size={12} lh={1.4} color={colors.muted} center>
          Ao criar conta você aceita os <Txt font="body400" size={12} color={colors.primaryLight}>Termos</Txt> e a{' '}
          <Txt font="body400" size={12} color={colors.primaryLight}>Privacidade</Txt>.
        </Txt>
      )}
    </Screen>
  );
}
