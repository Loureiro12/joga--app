import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { colors, playerColors } from '@/core/theme';
import { Avatar, Button, Input, Overline, Screen, Spacer, StackHeader, Txt, toast } from '@/core/ui';
import { services } from '@/services';

import type { UsernameStatus } from '../ProfileService';
import { sanitizeUsername, useProfileStore } from '../profileStore';

const STATUS: Record<UsernameStatus | 'checking', { label: string; color: string }> = {
  too_short: { label: 'mín. 3', color: colors.danger },
  taken: { label: 'em uso', color: colors.danger },
  available: { label: 'disponível', color: colors.success },
  checking: { label: '…', color: colors.muted },
};

/** Tela 24: Editar perfil. Edita um rascunho local; só "Salvar" grava no store. */
export function EditProfileScreen() {
  const saved = useProfileStore();
  const [name, setName] = useState(saved.name);
  const [username, setUsername] = useState(saved.username);
  const [color, setColor] = useState(saved.color);
  const [status, setStatus] = useState<UsernameStatus | 'checking'>('available');

  useEffect(() => {
    if (username === saved.username) return setStatus('available');
    let alive = true;
    setStatus(username.length < 3 ? 'too_short' : 'checking');
    services.profile.checkUsername(username).then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, [username, saved.username]);

  const canSave = name.trim().length >= 2 && status === 'available';

  const save = () => {
    saved.update({ name: name.trim(), username, color });
    router.back();
    toast('Perfil atualizado');
  };

  return (
    <Screen gap={20}>
      <StackHeader title="Editar perfil" onBack={() => router.back()} />

      <View style={{ alignItems: 'center', gap: 14 }}>
        <Avatar name={name || '?'} color={color} size={110} />
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
          {playerColors.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ selected: c === color }}
              accessibilityLabel={`Cor ${c}`}
              onPress={() => setColor(c)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: 3, borderColor: c === color ? colors.text : 'transparent' }}
            />
          ))}
        </View>
        <Txt size={12} color={colors.muted}>
          Sua cor aparece no lobby, na votação e no placar.
        </Txt>
      </View>

      <View style={{ gap: 10 }}>
        <Overline>Nome</Overline>
        <Input value={name} onChangeText={setName} autoCapitalize="words" maxLength={24} accessibilityLabel="Nome" />
        <Overline style={{ marginTop: 6 }}>Username</Overline>
        <Input
          value={username}
          onChangeText={(v) => setUsername(sanitizeUsername(v))}
          maxLength={20}
          accessibilityLabel="Username"
          left={<Txt size={16} color={colors.muted} style={{ marginRight: -6 }}>@</Txt>}
          right={
            <Txt font="body600" size={12} color={STATUS[status].color}>
              {STATUS[status].label}
            </Txt>
          }
        />
      </View>

      <Spacer />
      <Button label={canSave ? 'Salvar' : name.trim().length < 2 ? 'Digite seu nome' : 'Escolha outro username'} disabled={!canSave} onPress={save} />
    </Screen>
  );
}
