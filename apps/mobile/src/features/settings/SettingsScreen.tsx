import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Badge, Button, Display, ModalCard, Overline, Screen, Spacer, StackHeader, Toggle, Txt, toast } from '@/core/ui';
import { useSessionStore } from '@/features/auth/sessionStore';
import { authActions } from '@/features/auth/useAuthActions';
import { usePremiumStore } from '@/features/premium/premiumStore';
import { useProfileStore } from '@/features/profile/profileStore';

import { useSettingsStore, type SettingKey } from './settingsStore';

const TOGGLES: { key: SettingKey; emoji: string; title: string; detail: string }[] = [
  { key: 'sound', emoji: '🔊', title: 'Sons', detail: 'Efeitos nas revelações e votações' },
  { key: 'vibe', emoji: '📳', title: 'Vibração', detail: 'Ao revelar o papel e no fim do tempo' },
  { key: 'keepAwake', emoji: '💡', title: 'Tela sempre acesa', detail: 'Durante a partida' },
  { key: 'notif', emoji: '🔔', title: 'Notificações', detail: 'Quando um amigo cria uma sala' },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Overline style={{ marginBottom: 8 }}>{title}</Overline>
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.list, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

function Row({ emoji, title, detail, right, onPress, last, a11y }: { emoji: string; title: string; detail?: string; right: ReactNode; onPress?: () => void; last?: boolean; a11y?: object }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      {...a11y}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.surfaceLight }}
    >
      <Txt size={18} center style={{ width: 26 }}>
        {emoji}
      </Txt>
      <View style={{ flex: 1 }}>
        <Txt font="body600" size={15}>
          {title}
        </Txt>
        {!!detail && (
          <Txt font="body400" size={12} color={colors.muted}>
            {detail}
          </Txt>
        )}
      </View>
      {right}
    </Pressable>
  );
}

const Chevron = () => <Txt color={colors.muted}>›</Txt>;

/** Tela 25: Configurações. */
export function SettingsScreen() {
  const settings = useSettingsStore();
  const username = useProfileStore((s) => s.username);
  const isPremium = usePremiumStore((s) => s.isPremium);
  const isGuest = useSessionStore((s) => s.user?.isGuest ?? false);
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const soon = () => toast('Em breve', 'neutral', '🚧');

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await authActions.deleteAccount();
      toast('Conta excluída', 'neutral');
    } catch {
      toast('Não deu para excluir a conta. Tente de novo.', 'error');
      setDeleting(false);
    }
  };

  return (
    <Screen
      gap={20}
      header={
        <StackHeader title="Configurações" onBack={() => router.back()} />
      }
    >
      <Group title="Partida">
        {TOGGLES.map((t, i) => (
          <Row
            key={t.key}
            emoji={t.emoji}
            title={t.title}
            detail={t.detail}
            last={i === TOGGLES.length - 1}
            onPress={() => settings.toggle(t.key)}
            a11y={{ accessibilityRole: 'switch', accessibilityState: { checked: settings[t.key] } }}
            right={<Toggle value={settings[t.key]} />}
          />
        ))}
      </Group>

      <Group title="Conta">
        <Row emoji="🌎" title="Idioma" onPress={soon} right={<Txt size={14} color={colors.muted}>Português (BR) ›</Txt>} />
        <Row emoji="✨" title="Assinatura" onPress={() => router.push(routes.premium)} right={<Badge label={isPremium ? 'Premium' : 'Grátis'} kind={isPremium ? 'premium' : 'category'} />} />
        <Row emoji="🔒" title="Privacidade e termos" onPress={soon} right={<Chevron />} />
        <Row emoji="💬" title="Ajuda e feedback" onPress={soon} right={<Chevron />} last />
      </Group>

      <Spacer />
      {/* Convidado vai ao login SEM sair: o cadastro converte o convidado em conta e mantém o histórico. */}
      {isGuest && <Button label="Criar conta e salvar progresso" height={56} fontSize={20} onPress={() => router.push(routes.login)} />}
      <Button label="Sair da conta" variant="destructiveText" height={56} fontSize={20} onPress={authActions.signOut} />
      <Pressable accessibilityRole="button" onPress={() => setAskDelete(true)} style={{ alignSelf: 'center', padding: 6 }}>
        <Txt font="body600" size={13} color={colors.muted}>
          Excluir conta
        </Txt>
      </Pressable>
      <Txt font="body400" size={12} color={colors.mutedDark} center>
        Jogaê v{Constants.expoConfig?.version ?? '1.0'} · @{username}
      </Txt>

      <ModalCard visible={askDelete} onRequestClose={() => !deleting && setAskDelete(false)}>
        <Txt size={40}>🗑️</Txt>
        <Display size={34} center>
          Excluir conta?
        </Display>
        <Txt font="body400" size={14} lh={1.4} color={colors.muted} center>
          Isso apaga seu perfil, histórico e amigos para sempre. Não dá para desfazer.
          {isPremium ? ' A assinatura continua ativa na loja até você cancelar por lá.' : ''}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 6 }}>
          <Button label="Cancelar" variant="tertiary" height={56} fontSize={20} disabled={deleting} onPress={() => setAskDelete(false)} style={{ flex: 1 }} />
          <Button label={deleting ? 'Excluindo' : 'Excluir'} variant="destructive" height={56} fontSize={20} loading={deleting} onPress={deleteAccount} style={{ flex: 1 }} />
        </View>
      </ModalCard>
    </Screen>
  );
}
