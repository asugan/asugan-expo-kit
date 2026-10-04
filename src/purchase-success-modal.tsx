import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import type { PaywallTheme } from './paywall';

export type PurchaseSuccessModalProps = {
  /** Show only after the host confirms an active entitlement, not merely a completed store transaction. */
  visible: boolean;
  theme: PaywallTheme;
  title: string;
  message: string;
  buttonLabel: string;
  onClose: () => void;
  icon?: ReactNode;
};

/** DayTracker's single-action success card, with Wicca's scrollable content for large text. */
export function PurchaseSuccessModal({
  visible, theme, title, message, buttonLabel, onClose, icon,
}: PurchaseSuccessModalProps): ReactNode {
  if (!visible) return null;
  const radius = theme.radius ?? 24;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent
      onRequestClose={onClose}>
      <SafeAreaProvider style={styles.screen}>
        <Pressable accessible={false} importantForAccessibility="no-hide-descendants"
          onPress={onClose} style={[StyleSheet.absoluteFill, styles.backdrop]} />
        <SafeAreaView pointerEvents="box-none" style={styles.screen}>
          <View pointerEvents="box-none" style={styles.overlay}>
            <View accessibilityViewIsModal style={[styles.card, {
              backgroundColor: theme.surface, borderColor: theme.border,
              borderRadius: radius, borderCurve: 'continuous',
            }]}>
              <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
                contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}>
                <View accessible={false} importantForAccessibility="no-hide-descendants"
                  style={[styles.icon, { backgroundColor: theme.background, borderColor: theme.primary }]}>
                  {icon ?? <Text style={[styles.check, { color: theme.primary }]}>✓</Text>}
                </View>
                <Text accessibilityRole="header" style={[styles.title, {
                  color: theme.text, fontFamily: theme.headingFontFamily ?? theme.fontFamily,
                }]}>{title}</Text>
                <Text selectable style={[styles.message, {
                  color: theme.muted, fontFamily: theme.fontFamily,
                }]}>{message}</Text>
              </ScrollView>
              <Pressable accessibilityRole="button" accessibilityLabel={buttonLabel} onPress={onClose}
                style={({ pressed }) => [styles.button, {
                  backgroundColor: theme.primary, borderRadius: theme.radius ?? 16, borderCurve: 'continuous',
                }, pressed && styles.pressed]}>
                <Text style={[styles.buttonText, { color: theme.onPrimary, fontFamily: theme.fontFamily }]}>{buttonLabel}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.58)' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, maxHeight: '100%', borderWidth: 1, padding: 24, gap: 20 },
  scroll: { flexShrink: 1 },
  content: { alignItems: 'center', gap: 16 },
  icon: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: 32, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 23, textAlign: 'center' },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
