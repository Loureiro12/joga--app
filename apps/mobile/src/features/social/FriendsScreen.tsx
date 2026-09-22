import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useAsync } from '@/core/hooks/useAsync';
import { routes } from '@/core/navigation/routes';
import { colors, radii } from '@/core/theme';
import { Avatar, Display, EmptyState, ErrorState, Input, Overline, PillButton, Screen, Skeleton, StackHeader, Txt, toast } from '@/core/ui';
import { getGame } from '@/features/catalog/data/games';
import { useProfileStore } from '@/features/profile/profileStore';
import { services } from '@/services';

import { useFriendInviteStore } from './friendInviteStore';
import type { Friend } from './SocialService';

/** Com a tela aberta, o "jogando agora" se atualiza sozinho nesse intervalo. */
const REFRESH_MS = 20_000;

const SearchIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2.4} strokeLinecap="round">
    <Circle cx={11} cy={11} r={7} />
    <Path d="M20 20l-4-4" />
  </Svg>
);

function FriendRow({ friend, onLongPress }: { friend: Friend; onLongPress: () => void }) {
  const playing = friend.playing;
  const gameName = playing ? (getGame(playing.gameId)?.name ?? 'Jogando') : '';
  return (
    <Pressable
      onLongPress={onLongPress}
      accessibilityHint="Segure para remover dos amigos"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radii.input, paddingVertical: 12, paddingHorizontal: 14 }}
    >
      <Avatar name={friend.name} color={friend.color} size={44} online={!!playing} />
      <View style={{ flex: 1 }}>
        <Txt font="body600" size={16}>
          {friend.name}
        </Txt>
        <Txt font="body400" size={12} color={playing ? colors.success : colors.muted} numberOfLines={1}>
          {playing ? `${gameName} · ${playing.joinable ? `sala ${playing.roomCode}` : 'partida em andamento'}` : `@${friend.username} · ${friend.gamesTogether} partidas juntos`}
        </Txt>
      </View>
      {playing?.joinable ? (
        <PillButton
          label="Entrar"
          bg={colors.primary}
          fg={colors.text}
          size={14}
          padX={13}
          padY={9}
          onPress={() => router.push({ pathname: routes.join, params: { code: playing.roomCode } })}
        />
      ) : (
        <Display font="display700" size={14} color={colors.muted}>
          {friend.trophies ? `${friend.trophies} 🏆` : '—'}
        </Display>
      )}
    </Pressable>
  );
}

/** Tela 26: Amigos. */
export function FriendsScreen() {
  const username = useProfileStore((s) => s.username);
  const inviteVersion = useFriendInviteStore((s) => s.version);
  // Amizade nova (convite aceito) recarrega a lista.
  const friends = useAsync(() => services.social.listFriends(), [inviteVersion]);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Ao voltar para a tela e a cada 20 s com ela aberta: é o que mantém o "jogando agora" atual.
  // Atualiza por baixo, sem voltar ao esqueleto de carregamento.
  const [fresh, setFresh] = useState<Friend[] | null>(null);
  const firstFocus = useRef(true);
  useEffect(() => setFresh(null), [friends.data]);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const refresh = () =>
        services.social
          .listFriends()
          .then((list) => alive && setFresh(list))
          .catch(() => {});
      if (firstFocus.current) firstFocus.current = false;
      else refresh();
      const timer = setInterval(refresh, REFRESH_MS);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, []),
  );
  const data = fresh ?? friends.data;

  const confirmRemove = (friend: Friend) =>
    Alert.alert(`Remover ${friend.name}?`, 'Vocês deixam de ser amigos dos dois lados. Dá para voltar abrindo o link de convite de novo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () =>
          services.social
            .removeFriend(friend.id)
            .then(() => {
              setFresh((data ?? []).filter((f) => f.id !== friend.id));
              toast(`${friend.name} saiu dos seus amigos`);
            })
            .catch(() => toast('Não deu para remover. Tente de novo.', 'error')),
      },
    ]);

  const copyInvite = async () => {
    const link = services.social.inviteLink(username);
    await Clipboard.setStringAsync(`https://${link}`);
    setCopied(true);
    toast(`${link} copiado`);
    setTimeout(() => setCopied(false), 2000);
  };

  const q = query.trim().toLowerCase().replace(/^@/, '');
  const match = (f: Friend) => !q || f.name.toLowerCase().includes(q) || f.username.includes(q);
  const list = data?.filter(match) ?? [];
  const online = list.filter((f) => f.playing);
  const everyone = list.filter((f) => !f.playing);

  return (
    <Screen
      header={
        <StackHeader
          onBack={() => router.back()}
          title={
            <>
              Amigos{' '}
              <Display size={20} color={colors.muted}>
                {data?.length ?? ''}
              </Display>
            </>
          }
        />
      }
    >
      <View style={{ backgroundColor: colors.primary, borderRadius: radii.card, paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1 }}>
          <Display size={24}>Convide a galera</Display>
          <Txt size={13} lh={1.35} opacity={0.85} style={{ marginTop: 4 }}>
            Quem entrar pelo seu link vira amigo na hora.
          </Txt>
        </View>
        <PillButton label={copied ? 'Copiado ✓' : 'Copiar link'} size={16} padX={16} onPress={copyInvite} />
      </View>

      <Input height={50} value={query} onChangeText={setQuery} placeholder="Buscar por nome ou @username" left={<SearchIcon />} style={{ fontSize: 15 }} />

      {friends.loading && (
        <View style={{ gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={68} radius={radii.input} />
          ))}
        </View>
      )}
      {friends.error && <ErrorState title="Não deu para carregar" subtitle="Confira a conexão e tente de novo." onRetry={friends.reload} />}
      {!friends.loading && !friends.error && list.length === 0 && (
        <EmptyState
          icon="👥"
          title={q ? 'Ninguém encontrado' : 'Nenhum amigo ainda'}
          subtitle={q ? 'Confira o nome ou o @username.' : 'Mande seu link: quem entrar por ele vira amigo na hora.'}
          ctaLabel={q ? undefined : 'Copiar link'}
          onCta={copyInvite}
        />
      )}

      {online.length > 0 && (
        <View>
          <Overline style={{ marginBottom: 8 }}>Jogando agora</Overline>
          <View style={{ gap: 8 }}>
            {online.map((f) => (
              <FriendRow key={f.id} friend={f} onLongPress={() => confirmRemove(f)} />
            ))}
          </View>
        </View>
      )}
      {everyone.length > 0 && (
        <View>
          <Overline style={{ marginBottom: 8 }}>Todos</Overline>
          <View style={{ gap: 8 }}>
            {everyone.map((f) => (
              <FriendRow key={f.id} friend={f} onLongPress={() => confirmRemove(f)} />
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}
