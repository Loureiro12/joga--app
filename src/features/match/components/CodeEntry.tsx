import { Pressable, View } from 'react-native';

import { colors } from '@/core/theme';
import { Display } from '@/core/ui';

export const CODE_LENGTH = 4;

/** Input de código: 4 caixas 84 alto, raio 20, Barlow 44, caret lilás na próxima vazia. */
export function CodeBoxes({ code, error }: { code: string; error: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }} accessibilityLabel={`Código: ${code.split('').join(' ') || 'vazio'}`}>
      {Array.from({ length: CODE_LENGTH }, (_, k) => {
        const next = k === code.length;
        const borderColor = error ? colors.danger : next ? colors.primaryLight : code[k] ? colors.primary : colors.surfaceLight;
        return (
          <View
            key={k}
            style={{ flex: 1, height: 84, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 2, borderColor, alignItems: 'center', justifyContent: 'center' }}
          >
            {code[k] ? <Display size={44}>{code[k]}</Display> : next && !error ? <View style={{ width: 2, height: 34, backgroundColor: colors.primaryLight }} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/** Teclado numérico próprio 3×4: raio 16, 56 alto, Barlow 26; ⌫ em surfaceLight; célula vazia à esquerda do 0. */
export function Keypad({ onKey, disabled }: { onKey: (key: string) => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {KEYS.map((k, i) => (
        <View key={i} style={{ width: '31.5%', flexGrow: 1 }}>
          {k === '' ? (
            <View style={{ height: 56 }} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={k === '⌫' ? 'Apagar' : k}
              disabled={disabled}
              onPress={() => onKey(k)}
              style={({ pressed }) => ({
                height: 56,
                borderRadius: 16,
                backgroundColor: pressed ? colors.primary : k === '⌫' ? colors.surfaceLight : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Display size={26} color={k === '⌫' ? colors.muted : colors.text}>
                {k}
              </Display>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
