import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colors, radii } from '@/core/theme';
import { PillButton, Txt } from '@/core/ui';

const FRAME = 260;
const CORNER = 34;

/** Extrai o código de `https://jogae.app/j/4827`, `jogae://j/4827` ou de um "4827" puro. */
export function parseRoomCode(payload: string): string | null {
  return payload.trim().match(/(?:^|\/)(\d{4})\/?$/)?.[1] ?? null;
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const top = pos[0] === 't';
  const left = pos[1] === 'l';
  return (
    <View
      style={{
        position: 'absolute',
        width: CORNER,
        height: CORNER,
        top: top ? 22 : undefined,
        bottom: top ? undefined : 22,
        left: left ? 22 : undefined,
        right: left ? undefined : 22,
        borderColor: colors.accent,
        borderTopWidth: top ? 3 : 0,
        borderBottomWidth: top ? 0 : 3,
        borderLeftWidth: left ? 3 : 0,
        borderRightWidth: left ? 0 : 3,
        borderTopLeftRadius: top && left ? 18 : 0,
        borderTopRightRadius: top && !left ? 18 : 0,
        borderBottomLeftRadius: !top && left ? 18 : 0,
        borderBottomRightRadius: !top && !left ? 18 : 0,
      }}
    />
  );
}

/** Quadro 260 com cantos amarelos e linha de scan; câmera real via expo-camera quando há permissão. */
export function QrScanner({ onCode }: { onCode: (code: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const y = useSharedValue(30);

  useEffect(() => {
    y.value = withRepeat(withTiming(226, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [y]);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && Platform.OS !== 'web') requestPermission();
  }, [permission, requestPermission]);

  const line = useAnimatedStyle(() => ({ top: y.value }));
  const granted = !!permission?.granted;

  return (
    <View style={{ width: FRAME, height: FRAME, borderRadius: radii.cardLg, backgroundColor: colors.surface, overflow: 'hidden' }}>
      {granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            const code = parseRoomCode(data);
            if (!code || handled.current) return;
            handled.current = true;
            onCode(code);
          }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }]}>
          <Txt size={13} color={colors.muted} center>
            {permission && !permission.canAskAgain ? 'Libere a câmera nos ajustes do celular para ler o QR Code.' : 'Câmera'}
          </Txt>
          {permission?.canAskAgain && <PillButton label="Permitir câmera" size={15} padX={14} padY={9} bg={colors.surfaceLight} fg={colors.text} onPress={requestPermission} />}
        </View>
      )}
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />
      <Animated.View
        style={[
          { position: 'absolute', left: 30, right: 30, height: 2, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 1, shadowRadius: 7, shadowOffset: { width: 0, height: 0 } },
          line,
        ]}
      />
    </View>
  );
}
