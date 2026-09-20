import { View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, onColor } from '@/core/theme';

import { Display, Txt } from './Txt';

export function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

type Props = {
  name: string;
  color: string;
  /** 34 / 40 / 44 / 48 / 64 / 72 / 110 / 130 */
  size?: number;
  /** Badge online verde 14 com borda da cor do fundo por trás. */
  online?: boolean;
  /** Check verde (quem já votou). */
  checked?: boolean;
  /** Cor do fundo por trás do avatar (para a borda dos badges). */
  ringColor?: string;
  /** Anel externo (ex.: resultado: 12 px translúcido). */
  halo?: { width: number; color: string };
  /** Borda sólida (avatares sobrepostos). */
  border?: { width: number; color: string };
  style?: StyleProp<ViewStyle>;
};

export function Avatar({
  name,
  color,
  size = 40,
  online,
  checked,
  ringColor = colors.surface,
  halo,
  border,
  style,
}: Props) {
  const fontSize = Math.round(size * 0.44);
  const core = (
    <View
      accessibilityLabel={name}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: border?.width,
          borderColor: border?.color,
        },
        halo ? undefined : style,
      ]}
    >
      <Display size={fontSize} color={onColor(color)} lh={1.1}>
        {initialOf(name)}
      </Display>
      {online && (
        <View
          style={{
            position: 'absolute',
            right: -2,
            bottom: -2,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: colors.success,
            borderWidth: 2,
            borderColor: ringColor,
          }}
        />
      )}
      {checked && (
        <View
          style={{
            position: 'absolute',
            right: -3,
            bottom: -3,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.success,
            borderWidth: 2,
            borderColor: ringColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt font="body700" size={9} color={colors.background}>
            ✓
          </Txt>
        </View>
      )}
    </View>
  );

  if (!halo) return core;
  return (
    <View style={[{ padding: halo.width, borderRadius: size, backgroundColor: halo.color }, style]}>{core}</View>
  );
}

/** Slot vazio: círculo tracejado. */
export function EmptyAvatar({ size = 40 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.muted,
      }}
    />
  );
}

/** Check circular (verde 24 no lobby, amarelo 26 no vote card). */
export function CheckCircle({ size = 24, color = colors.success }: { size?: number; color?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt font="body700" size={Math.round(size * 0.58)} color={colors.background}>
        ✓
      </Txt>
    </View>
  );
}
