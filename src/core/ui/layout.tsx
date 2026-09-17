import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '@/core/theme';

import { PressableScale } from './PressableScale';
import { Display, Txt } from './Txt';

/** Padding de tela do design: 20 lateral, 64 topo (≈ safe area + 10), 24 rodapé. */
export function useScreenPadding() {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: Math.max(insets.top + 10, 34),
    paddingBottom: Math.max(insets.bottom + 8, spacing.screenBottom),
    paddingHorizontal: spacing.screenX,
  };
}

type ScreenProps = {
  children: ReactNode;
  /** Cor de fundo (telas coloridas: splash, onboarding, resultado…). */
  bg?: string;
  scroll?: boolean;
  gap?: number;
  /** Tabs já reservam o rodapé; evita padding duplicado. */
  insideTabs?: boolean;
  /** Remove o padding (ex.: Detalhes, com header sangrado). */
  bleed?: boolean;
  /** Conteúdo fixo no topo: fica parado enquanto o resto rola por baixo. */
  header?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Container padrão de tela. Com `scroll`, o conteúdo cresce até a altura da tela
 * (`flexGrow: 1`) para que um `<Spacer />` empurre o CTA para o rodapé.
 */
export function Screen({ children, bg = colors.background, scroll = true, gap = spacing.blockGap, insideTabs, bleed, header, style }: ScreenProps) {
  const pad = useScreenPadding();
  const padding = bleed
    ? undefined
    : { ...pad, paddingBottom: insideTabs ? spacing.screenBottom : pad.paddingBottom };

  // Com header fixo, o padding do topo vai para o header e o conteúdo começa logo abaixo dele.
  const fixedHeader = header ? (
    <View style={{ backgroundColor: bg, paddingTop: pad.paddingTop, paddingHorizontal: pad.paddingHorizontal, paddingBottom: gap / 2, zIndex: 1 }}>
      {header}
    </View>
  ) : null;
  const contentPadding = header && padding ? { ...padding, paddingTop: gap / 2 } : padding;

  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: bg }}>
        {fixedHeader}
        <View style={[{ flex: 1, gap }, contentPadding, style]}>{children}</View>
      </View>
    );
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {fixedHeader}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ flexGrow: 1, gap }, contentPadding, style]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Empurra o que vem depois para o rodapé (equivale ao `flex:1` do protótipo). */
export function Spacer({ min = 0 }: { min?: number }) {
  return <View style={{ flex: 1, minHeight: min }} />;
}

/** Botão circular 44 (voltar ←, fechar ✕) ou 40 (ícones do perfil / pausa). */
export function IconButton({
  onPress,
  label,
  children,
  size = 44,
  bg = colors.surface,
}: {
  onPress?: () => void;
  label: string;
  children: ReactNode;
  size?: number;
  bg?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: pressed ? colors.surfaceLight : bg,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      {children}
    </Pressable>
  );
}

export function BackButton({ onPress, bg, glyph = '←' }: { onPress: () => void; bg?: string; glyph?: '←' | '✕' }) {
  return (
    <IconButton onPress={onPress} label={glyph === '←' ? 'Voltar' : 'Fechar'} bg={bg}>
      <Txt size={18}>{glyph}</Txt>
    </IconButton>
  );
}

/** Header "← TÍTULO" 32 das telas de stack. */
export function StackHeader({ title, onBack, right }: { title: ReactNode; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <BackButton onPress={onBack} />
      <Display size={32} style={{ flex: 1 }}>
        {title}
      </Display>
      {right}
    </View>
  );
}

/** Card de lista (ícone 40 + título Barlow 17 + apoio 12 + acessório). */
export function ListCard({
  icon,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      pressedScale={0.98}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.surfaceLight,
        borderRadius: radii.list,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.surfaceLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Display font="display700" size={17}>
          {title}
        </Display>
        <Txt font="body400" size={12} lh={1.3} color={colors.muted} style={{ marginTop: 3 }}>
          {subtitle}
        </Txt>
      </View>
      {right}
    </PressableScale>
  );
}

/** Card de estatística (Perfil / Histórico): número Barlow 30 + rótulo 12. */
export function StatCard({ value, label, color, onPress }: { value: string; label: string; color?: string; onPress?: () => void }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 18, padding: 14, alignItems: 'center' }}
    >
      <Display size={30} color={color} lh={1.15}>
        {value}
      </Display>
      <Txt size={12} color={colors.muted} style={{ marginTop: 4 }}>
        {label}
      </Txt>
    </Pressable>
  );
}
