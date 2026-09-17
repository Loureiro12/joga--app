import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Enter } from '@/core/animation/Enter';
import { colors, radii } from '@/core/theme';

/** Modal centralizado: `surface` raio 28 padding 26×22 sobre scrim. */
export function ModalCard({
  visible,
  children,
  scrim = colors.scrim,
  enter = 'pop',
  onRequestClose,
}: {
  visible: boolean;
  children: ReactNode;
  scrim?: string;
  enter?: 'pop' | 'in';
  onRequestClose?: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onRequestClose}>
      <View style={{ flex: 1, backgroundColor: scrim, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Enter kind={enter} duration={enter === 'pop' ? 400 : 300} style={{ width: '100%', maxWidth: 420 }}>
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: colors.surface,
              borderRadius: radii.cardLg,
              borderWidth: 1,
              borderColor: colors.surfaceLight,
              paddingVertical: 26,
              paddingHorizontal: 22,
              alignItems: 'center',
              gap: 14,
            }}
          >
            {children}
          </View>
        </Enter>
      </View>
    </Modal>
  );
}

/** Bottom sheet: `surface` raio 28 superior, handle 40×4, scrim 60%. Toque fora fecha. */
export function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityLabel="Fechar"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrimLight }]}
        />
        <Enter duration={350}>
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radii.cardLg,
              borderTopRightRadius: radii.cardLg,
              paddingTop: 12,
              paddingHorizontal: 20,
              paddingBottom: Math.max(insets.bottom + 12, 28),
              gap: 14,
            }}
          >
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.surfaceLight, alignSelf: 'center' }} />
            {children}
          </View>
        </Enter>
      </View>
    </Modal>
  );
}
