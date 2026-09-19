import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { Enter } from '@/core/animation/Enter';
import { colors, shadows } from '@/core/theme';

import { Txt } from './Txt';

export type ToastTone = 'success' | 'error' | 'trophy' | 'neutral';

type ToastData = { id: number; message: string; tone: ToastTone; icon?: string };

type ToastState = {
  current: ToastData | null;
  show: (message: string, tone?: ToastTone, icon?: string) => void;
  hide: () => void;
};

const DURATION_MS = 2200;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (message, tone = 'success', icon) => {
    clearTimeout(timer);
    set({ current: { id: nextId++, message, tone, icon } });
    timer = setTimeout(() => set({ current: null }), DURATION_MS);
  },
  hide: () => {
    clearTimeout(timer);
    set({ current: null });
  },
}));

/** Atalho imperativo: `toast('Perfil atualizado')`. */
export const toast = (message: string, tone?: ToastTone, icon?: string) =>
  useToastStore.getState().show(message, tone, icon);

const TONES: Record<ToastTone, { bg: string; fg: string; icon: string }> = {
  success: { bg: colors.success, fg: colors.background, icon: '✓' },
  error: { bg: colors.danger, fg: colors.text, icon: '!' },
  trophy: { bg: colors.primary, fg: colors.text, icon: '🏆' },
  neutral: { bg: colors.surfaceLight, fg: colors.text, icon: '👋' },
};

/** Montado uma única vez no layout raiz; fica acima de qualquer tela. */
export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const insets = useSafeAreaInsets();
  if (!current) return null;
  const tone = TONES[current.tone];
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, top: Math.max(insets.top + 4, 24), zIndex: 100 }}>
      <Enter key={current.id} duration={350}>
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: colors.text,
              borderRadius: 16,
              paddingVertical: 12,
              paddingHorizontal: 14,
            },
            shadows.toast,
          ]}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: tone.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt font="body700" size={14} color={tone.fg}>
              {current.icon ?? tone.icon}
            </Txt>
          </View>
          <Txt font="body600" size={15} color={colors.background} style={{ flex: 1 }}>
            {current.message}
          </Txt>
        </View>
      </Enter>
    </View>
  );
}
