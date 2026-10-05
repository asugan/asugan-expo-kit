import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ColorValue,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { defaultCycleOrder, getPreferredDefaultCycle } from './pricing';
import { PurchaseSuccessModal, type PurchaseSuccessModalProps } from './purchase-success-modal';
import type { BillingCycle, RevenueCatPaywallData, RevenueCatPaywallPlan } from './types';

/** Map your existing app theme here; the paywall does not create a theme provider. */
export type PaywallTheme = {
  background: ColorValue;
  surface: ColorValue;
  text: ColorValue;
  muted: ColorValue;
  primary: ColorValue;
  onPrimary: ColorValue;
  border: ColorValue;
  fontFamily?: string;
  headingFontFamily?: string;
  radius?: number;
};

export type PaywallFeature = { id: string; text: string; icon?: ReactNode };
export type PaywallLink = { label: string; onPress: () => void };
export type PaywallPlanCopy = { title: string; subtitle?: string; period?: string };

/** All visible copy comes from the app, including localized store billing disclosures. */
export type PaywallCopy = {
  close: string;
  loading: string;
  empty: string;
  retry: string;
  continue: string;
  premiumActive: string;
  restore: string;
  recommended: string;
  plan: (plan: RevenueCatPaywallPlan) => PaywallPlanCopy;
  purchase?: (plan: RevenueCatPaywallPlan) => string;
  /** Show the full recurring price/period, trial terms, and renewal policy here. */
  billingDisclosure: (plan: RevenueCatPaywallPlan) => string;
};

export type PaywallSuccess = Omit<PurchaseSuccessModalProps, 'visible' | 'theme'>;

export type PaywallProps = {
  title: string;
  subtitle?: string;
  logo?: ImageSourcePropType;
  logoStyle?: StyleProp<ImageStyle>;
  features: readonly PaywallFeature[];
  theme: PaywallTheme;
  copy: PaywallCopy;
  data: RevenueCatPaywallData | null;
  loading?: boolean;
  error?: string | null;
  purchasing?: boolean;
  restoring?: boolean;
  isPremium?: boolean;
  /** Explicit successful purchase/restore feedback; only shown when isPremium is true. */
  success?: PaywallSuccess | null;
  defaultCycle?: BillingCycle;
  /** Visible cycles; display always follows lifetime → yearly → monthly → weekly. */
  planOrder?: readonly BillingCycle[];
  onSelectPlan?: (plan: RevenueCatPaywallPlan) => void;
  /** Host owns async state, SDK calls, errors, analytics, and success feedback. */
  onPurchase: (plan: RevenueCatPaywallPlan) => void;
  onRestore: () => void;
  onClose?: () => void;
  onRetry?: () => void;
  terms: PaywallLink;
  privacy: PaywallLink;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Branded screen layout shared by Shadow Prompts and Wicca; no SDK or router imports. */
export function Paywall({
  title, subtitle, logo, logoStyle, features, theme, copy, data,
  loading = false, error, purchasing = false, restoring = false, isPremium = false, success,
  defaultCycle = 'oneTime', planOrder = defaultCycleOrder,
  onSelectPlan, onPurchase, onRestore, onClose, onRetry,
  terms, privacy, footer, style,
}: PaywallProps): ReactNode {
  const [chosenCycle, setChosenCycle] = useState<BillingCycle | null>(null);
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.3;
  const busy = purchasing || restoring;
  const plans = defaultCycleOrder.filter((cycle) => planOrder.includes(cycle)).flatMap((cycle) => {
    const plan = data?.isConfigured ? data.plans[cycle] : undefined;
    return plan ? [plan] : [];
  });
  const availableCycles = plans.map((plan) => plan.cycle);
  const recommendedCycle = availableCycles[0];
  const selectedCycle = chosenCycle && availableCycles.includes(chosenCycle) ? chosenCycle
    : getPreferredDefaultCycle(availableCycles, defaultCycle);
  const selectedPlan = plans.find((plan) => plan.cycle === selectedCycle);
  const canPurchase = Boolean(selectedPlan && !loading && !error && !busy && !isPremium);
  const canRestore = Boolean(data?.isConfigured && !loading && !busy);
  const purchaseLabel = isPremium ? copy.premiumActive
    : selectedPlan && copy.purchase ? copy.purchase(selectedPlan) : copy.continue;
  const text = { color: theme.text, fontFamily: theme.fontFamily };
  const mutedText = { color: theme.muted, fontFamily: theme.fontFamily };
  const radius = { borderRadius: theme.radius ?? 18, borderCurve: 'continuous' as const };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }, style]}>
      {onClose ? (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.close}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => { if (!busy) onClose(); }}
            style={({ pressed }) => [styles.close, { backgroundColor: theme.surface },
              busy && styles.disabled, pressed && styles.pressed]}
          >
            <Text accessible={false} style={[styles.closeText, text]}>×</Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {logo ? <Image source={logo} accessible={false} resizeMode="contain"
            style={[styles.logo, radius, logoStyle]} /> : null}
          <Text accessibilityRole="header" style={[styles.title, text,
            { fontFamily: theme.headingFontFamily ?? theme.fontFamily }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, mutedText]}>{subtitle}</Text> : null}
        </View>

        {features.length > 0 ? (
          <View style={styles.features}>
            {features.map((feature) => (
              <View key={feature.id} style={styles.feature}>
                <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.featureIcon}>
                  {feature.icon ?? <Text style={[styles.body, { color: theme.primary }]}>✓</Text>}
                </View>
                <Text style={[styles.body, styles.featureText, text]}>{feature.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.status} accessibilityLiveRegion="polite">
            <ActivityIndicator color={theme.primary} accessibilityLabel={copy.loading} />
            <Text style={[styles.body, mutedText]}>{copy.loading}</Text>
          </View>
        ) : error ? (
          <View style={styles.status}>
            <Text selectable accessibilityRole="alert" style={[styles.body, text]}>{error}</Text>
            {onRetry ? (
              <Pressable accessibilityRole="button" accessibilityLabel={copy.retry}
                accessibilityState={{ disabled: busy }} disabled={busy}
                onPress={() => { if (!busy) onRetry(); }}
                style={({ pressed }) => [styles.link, busy && styles.disabled, pressed && styles.pressed]}>
                <Text style={[styles.body, { color: theme.primary, fontFamily: theme.fontFamily }]}>{copy.retry}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : plans.length === 0 ? (
          <Text selectable style={[styles.statusText, mutedText]}>{copy.empty}</Text>
        ) : (
          <View accessibilityRole="radiogroup" style={styles.plans}>
            {plans.map((plan) => {
              const selected = plan.cycle === selectedCycle;
              const labels = copy.plan(plan);
              const badge = plan.cycle === recommendedCycle ? copy.recommended : undefined;
              const disabled = busy || isPremium;
              return (
                <Pressable key={plan.cycle} accessibilityRole="radio"
                  accessibilityLabel={[labels.title, plan.price, labels.period, labels.subtitle, badge]
                    .filter(Boolean).join(', ')}
                  accessibilityState={{ checked: selected, disabled }} disabled={disabled}
                  onPress={() => {
                    if (disabled) return;
                    setChosenCycle(plan.cycle);
                    onSelectPlan?.(plan);
                  }}
                  style={({ pressed }) => [styles.plan, radius,
                    { backgroundColor: theme.surface, borderColor: selected ? theme.primary : theme.border },
                    badge && { marginTop: 12 * fontScale },
                    disabled && styles.disabled, pressed && styles.pressed]}>
                  {badge ? (
                    <View pointerEvents="none" style={[styles.badge, { backgroundColor: theme.primary }]}>
                      <Text style={[styles.badgeText, { color: theme.onPrimary, fontFamily: theme.fontFamily }]}>{badge}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.planBody, compact && styles.planBodyCompact]}>
                    <View style={styles.planName}>
                      <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.muted }]}>
                        {selected ? <View style={[styles.radioDot, { backgroundColor: theme.primary }]} /> : null}
                      </View>
                      <View style={styles.planLabels}>
                        <Text style={[styles.planTitle, text]}>{labels.title}</Text>
                        {labels.subtitle ? <Text style={[styles.caption, mutedText]}>{labels.subtitle}</Text> : null}
                      </View>
                    </View>
                    <View style={[styles.priceBlock, compact && styles.priceBlockCompact]}>
                      <Text selectable style={[styles.price, text]}>{plan.price}</Text>
                      {labels.period ? <Text style={[styles.caption, mutedText]}>{labels.period}</Text> : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.actions}>
          {selectedPlan && !loading && !error ? (
            <Text selectable style={[styles.disclosure, mutedText]}>{copy.billingDisclosure(selectedPlan)}</Text>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={purchaseLabel}
            accessibilityState={{ disabled: !canPurchase, busy: purchasing }} disabled={!canPurchase}
            onPress={() => { if (canPurchase && selectedPlan) onPurchase(selectedPlan); }}
            style={({ pressed }) => [styles.purchase, radius, { backgroundColor: theme.primary },
              !canPurchase && styles.disabled, pressed && styles.pressed]}>
            {purchasing ? <ActivityIndicator color={theme.onPrimary} /> : null}
            <Text style={[styles.purchaseText, { color: theme.onPrimary, fontFamily: theme.fontFamily }]}>{purchaseLabel}</Text>
          </Pressable>
          <View style={styles.legal}>
            <Pressable accessibilityRole="button" accessibilityLabel={copy.restore}
              accessibilityState={{ disabled: !canRestore, busy: restoring }} disabled={!canRestore}
              onPress={() => { if (canRestore) onRestore(); }}
              style={({ pressed }) => [styles.link, !canRestore && styles.disabled, pressed && styles.pressed]}>
              {restoring ? <ActivityIndicator color={theme.muted} /> : null}
              <Text style={[styles.caption, mutedText]}>{copy.restore}</Text>
            </Pressable>
            {[terms, privacy].map((link, index) => (
              <Pressable key={index} accessibilityRole="link" accessibilityLabel={link.label}
                onPress={link.onPress} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
                <Text style={[styles.caption, mutedText]}>{link.label}</Text>
              </Pressable>
            ))}
          </View>
          {footer}
        </View>
      </ScrollView>
      {success ? <PurchaseSuccessModal {...success} visible={isPremium} theme={theme} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 52, paddingHorizontal: 20, alignItems: 'flex-end', justifyContent: 'center' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 28 },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 20, paddingBottom: 28, gap: 24 },
  hero: { alignItems: 'center', gap: 12 },
  logo: { width: 72, height: 72 },
  title: { fontSize: 34, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 24 },
  caption: { fontSize: 13, lineHeight: 20 },
  features: { gap: 12 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 28, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1 },
  status: { alignItems: 'center', gap: 12 },
  statusText: { fontSize: 16, textAlign: 'center' },
  plans: { gap: 12 },
  plan: { minHeight: 82, borderWidth: 2, padding: 16 },
  planBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planBodyCompact: { flexDirection: 'column', alignItems: 'stretch' },
  planName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  planLabels: { flex: 1, gap: 4 },
  planTitle: { maxWidth: '100%', fontSize: 17, fontWeight: '700' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  badge: { position: 'absolute', top: 0, right: 16, transform: [{ translateY: '-50%' }],
    maxWidth: '80%', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  priceBlock: { maxWidth: '50%', alignItems: 'flex-end', gap: 4 },
  priceBlockCompact: { maxWidth: '100%', alignItems: 'flex-start', paddingStart: 36 },
  price: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actions: { gap: 12 },
  disclosure: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  purchase: { minHeight: 60, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  purchaseText: { flexShrink: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  legal: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 },
  link: { minHeight: 44, maxWidth: '100%', paddingHorizontal: 4, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
