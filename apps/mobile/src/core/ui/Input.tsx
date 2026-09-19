import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { Shake } from '@/core/animation/loops';
import { colors, fonts, radii } from '@/core/theme';

import { Txt } from './Txt';

type Props = TextInputProps & {
  error?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  height?: number;
};

/** Input 56 alto, raio 16, borda 2: surfaceLight → primaryLight (foco) → danger (erro). */
export function Input({ error, left, right, height = 56, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primaryLight : colors.surfaceLight;
  return (
    <View
      style={{
        height,
        borderRadius: radii.input,
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {left}
      <TextInput
        placeholderTextColor={colors.muted}
        selectionColor={colors.primaryLight}
        autoCapitalize="none"
        autoCorrect={false}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.body500, fontSize: 16, padding: 0 },
          // remove o outline padrão no web
          { outlineWidth: 0 } as object,
          style,
        ]}
      />
      {right}
    </View>
  );
}

/** Mensagem de erro 13 vermelha com ícone "!" e shake. */
export function FieldError({ message, size = 13 }: { message: string; size?: number }) {
  return (
    <Shake trigger={message} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: colors.danger,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Txt font="body700" size={12}>
          !
        </Txt>
      </View>
      <Txt font="body600" size={size} color={colors.danger} style={{ flex: 1 }} accessibilityLiveRegion="polite">
        {message}
      </Txt>
    </Shake>
  );
}
