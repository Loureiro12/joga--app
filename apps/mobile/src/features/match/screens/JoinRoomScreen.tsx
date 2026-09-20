import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { routes } from '@/core/navigation/routes';
import { colors } from '@/core/theme';
import { Button, FieldError, Screen, Segmented, Spacer, StackHeader, Txt, toast } from '@/core/ui';
import { haptics } from '@/core/utils/haptics';
import { services } from '@/services';

import { CODE_LENGTH, CodeBoxes, Keypad } from '../components/CodeEntry';
import { QrScanner } from '../components/QrScanner';
import { RoomError } from '@jogae/engine';
import { getIdentity } from '../hooks/useIdentity';
import { MOCK_JOINABLE_CODE } from '../services/MockRoomService';

type Tab = 'code' | 'qr';

/** Tela 10: Entrar na sala por código ou QR. Deep link `jogae.app/j/4827` chega com `?code=`. */
export function JoinRoomScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [tab, setTab] = useState<Tab>('code');
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (params.code && /^\d{4}$/.test(params.code)) setCode(params.code);
  }, [params.code]);

  const join = useCallback(async (roomCode: string) => {
    setLoading(true);
    setError(false);
    try {
      await services.room.joinRoom(roomCode, getIdentity());
      router.push(routes.match.lobby);
    } catch (e) {
      if (e instanceof RoomError && e.code === 'room_not_found') {
        haptics.error();
        setTab('code');
        setError(true);
        setCode('');
      } else {
        toast('Não deu para entrar na sala. Tente de novo.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const onKey = (k: string) => {
    if (loading) return;
    setError(false);
    setCode((c) => (k === '⌫' ? c.slice(0, -1) : c.length < CODE_LENGTH ? c + k : c));
  };

  const complete = code.length === CODE_LENGTH;

  return (
    <Screen
      gap={20}
      header={
        <StackHeader title="Entrar na sala" onBack={() => router.back()} />
      }
    >
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'code', label: 'Código' },
          { value: 'qr', label: 'QR Code' },
        ]}
      />

      {tab === 'code' ? (
        <>
          <Txt size={16} lh={1.4} color={colors.muted}>
            Peça o código de 4 dígitos ao host.
          </Txt>
          <CodeBoxes code={code} error={error} />
          {error && <FieldError size={14} message="Sala não encontrada. Confira o código com o host." />}
          <Spacer />
          <Keypad onKey={onKey} disabled={loading} />
          <Button
            label={loading ? 'Entrando' : complete ? 'Entrar na sala' : 'Digite o código'}
            disabled={!complete}
            loading={loading}
            onPress={() => join(code)}
          />
        </>
      ) : (
        <>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <QrScanner onCode={join} />
            <Txt size={16} lh={1.4} color={colors.muted} center style={{ maxWidth: 260 }}>
              {loading ? 'Entrando na sala…' : 'Aponte para o QR Code na tela do host.'}
            </Txt>
          </View>
          {__DEV__ && <Button label="Simular leitura" variant="secondary" loading={loading} onPress={() => join(MOCK_JOINABLE_CODE)} />}
        </>
      )}
    </Screen>
  );
}
