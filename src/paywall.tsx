import { Fragment, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
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
  /** Background of the selected plan card, e.g. a light primary tint; defaults to `surface`. */
  selected?: ColorValue;
};

export type PaywallFeature = { id: string; text: string; icon?: ReactNode };
export type PaywallLink = { label: string; onPress: () => void };
/** `badge` overrides the shared `recommended` badge for this card; `badgeTone: 'muted'` renders it as a quiet outline. */
/** `topBadge` is a primary pill centered on the card's top edge (e.g. "Save 34%"). */
export type PaywallPlanCopy = {
  title: string; subtitle?: string; period?: string; badge?: string; badgeTone?: 'muted'; topBadge?: string;
};
export type PaywallTrialStep = { id: string; title: string; text: string; icon?: ReactNode };
/** `eyebrow` is a small label above the title; `showLogo` keeps the logo above the trial hero. */
export type PaywallTrialTimeline = {
  title: string; subtitle?: string; eyebrow?: string; showLogo?: boolean; steps: readonly PaywallTrialStep[];
};
export type PaywallTrialNotice = { text: string; icon?: ReactNode };

/** All visible copy comes from the app, including localized store billing disclosures. */
export type PaywallCopy = {
  close: string;
  loading: string;
  empty: string;
  retry: string;
  continue: string;
  premiumActive: string;
  restore: string;
  /** Badge on the highest-priority plan; omit to show only per-plan badges. */
  recommended?: string;
  plan: (plan: RevenueCatPaywallPlan) => PaywallPlanCopy;
  purchase?: (plan: RevenueCatPaywallPlan) => string;
  /** Show the full recurring price/period, trial terms, and renewal policy here. */
  billingDisclosure: (plan: RevenueCatPaywallPlan) => string;
  /**
   * When any visible plan has a confirmed free trial, replaces the hero with a trial title,
   * subtitle and timeline (logo hidden unless `showLogo`). Receives the selected plan if it has a trial, else the first trial plan.
   */
  trialTimeline?: (plan: RevenueCatPaywallPlan) => PaywallTrialTimeline;
  /** Shown above the purchase button when the selected plan has a free trial; return null to hide. */
  trialNotice?: (plan: RevenueCatPaywallPlan) => PaywallTrialNotice | null;
};

export type PaywallSuccess = Omit<PurchaseSuccessModalProps, 'visible' | 'theme'>;

export type PaywallProps = {
  title: string;
  subtitle?: string;
  logo?: ImageSourcePropType;
  logoStyle?: StyleProp<ImageStyle>;
  /** Overrides the hero title text style (e.g. a smaller size for wide display fonts). */
  titleStyle?: StyleProp<TextStyle>;
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
  title, subtitle, logo, logoStyle, titleStyle, features, theme, copy, data,
  loading = false, error: externalError, purchasing = false, restoring = false, isPremium = false, success,
  defaultCycle = 'oneTime', planOrder = defaultCycleOrder,
  onSelectPlan, onPurchase, onRestore, onClose, onRetry,
  terms, privacy, footer, style,
}: PaywallProps): ReactNode {
  const [chosenCycle, setChosenCycle] = useState<BillingCycle | null>(null);
  const busy = purchasing || restoring;
  const error = externalError || (data && 'error' in data ? copy.empty : null);
  const plans = defaultCycleOrder.filter((cycle) => planOrder.includes(cycle)).flatMap((cycle) => {
    const plan = data?.isConfigured ? data.plans[cycle] : undefined;
    return plan ? [plan] : [];
  });
  const availableCycles = plans.map((plan) => plan.cycle);
  const recommendedCycle = availableCycles[0];
  const selectedCycle = chosenCycle && availableCycles.includes(chosenCycle) ? chosenCycle
    : getPreferredDefaultCycle(availableCycles, defaultCycle);
  const selectedPlan = plans.find((plan) => plan.cycle === selectedCycle);
  const trialPlan = selectedPlan?.hasFreeTrial ? selectedPlan : plans.find((plan) => plan.hasFreeTrial);
  const trial = trialPlan && copy.trialTimeline ? copy.trialTimeline(trialPlan) : null;
  const heroTitle = trial ? trial.title : title;
  const heroSubtitle = trial ? trial.subtitle : subtitle;
  const canPurchase = Boolean(selectedPlan && !loading && !error && !busy && !isPremium);
  const canRestore = Boolean(data?.isConfigured && !loading && !busy);
  const notice = selectedPlan?.hasFreeTrial && !loading && !error && !isPremium
    ? copy.trialNotice?.(selectedPlan) ?? null : null;
  const purchaseLabel = isPremium ? copy.premiumActive
    : selectedPlan && copy.purchase ? copy.purchase(selectedPlan) : copy.continue;
  const text = { color: theme.text, fontFamily: theme.fontFamily };
  const mutedText = { color: theme.muted, fontFamily: theme.fontFamily };
  const radius = { borderRadius: theme.radius ?? 18, borderCurve: 'continuous' as const };

  const planSection = error ? (
    <View style={styles.status}>
      <Text selectable accessibilityRole="alert" style={[styles.body, text]}>{error}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel={copy.retry}
          accessibilityState={{ disabled: busy }} disabled={busy}
          onPress={() => { if (!busy) onRetry(); }}
          hitSlop={linkHitSlop}
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
        const badge = labels.badge ?? (plan.cycle === recommendedCycle ? copy.recommended : undefined);
        const mutedBadge = Boolean(labels.badge) && labels.badgeTone === 'muted';
        const disabled = busy || isPremium;
        return (
          <Pressable key={plan.cycle} accessibilityRole="radio"
            accessibilityLabel={[labels.title, plan.price, labels.period, labels.subtitle, badge, labels.topBadge]
              .filter(Boolean).join(', ')}
            accessibilityState={{ checked: selected, disabled }} disabled={disabled}
            onPress={() => {
              if (disabled) return;
              setChosenCycle(plan.cycle);
              onSelectPlan?.(plan);
            }}
            style={({ pressed }) => [styles.plan, radius,
              { backgroundColor: selected ? theme.selected ?? theme.surface : theme.surface,
                borderColor: selected ? theme.primary : theme.border },
              labels.topBadge ? styles.planWithTopBadge : null,
              disabled && styles.disabled, pressed && styles.pressed]}>
            {labels.topBadge ? (
              <View style={styles.topBadgeRow}>
                <View style={[styles.badge, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                  <Text style={[styles.badgeText, { color: theme.onPrimary, fontFamily: theme.fontFamily }]}>
                    {labels.topBadge}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.planHeader}>
              <Text style={[styles.planTitle, text]}>{labels.title}</Text>
              {badge ? (
                <View style={[styles.badge, mutedBadge ? { borderColor: theme.border }
                  : { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                  <Text style={[styles.badgeText,
                    { color: mutedBadge ? theme.muted : theme.onPrimary, fontFamily: theme.fontFamily }]}>{badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.planDetail, mutedText]}>
              <Text selectable style={[styles.planPrice, text]}>{plan.price}</Text>
              {labels.period ?? ''}
              {labels.subtitle ? ` · ${labels.subtitle}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const actions = (
    <>
      {notice ? (
        <View style={[styles.notice, { backgroundColor: theme.surface }]}>
          {notice.icon ? (
            <View accessible={false} importantForAccessibility="no-hide-descendants">{notice.icon}</View>
          ) : null}
          <Text style={[styles.noticeText, text]}>{notice.text}</Text>
        </View>
      ) : null}
      {planSection}
      <Pressable accessibilityRole="button" accessibilityLabel={purchaseLabel}
        accessibilityState={{ disabled: !canPurchase, busy: purchasing }} disabled={!canPurchase}
        onPress={() => { if (canPurchase && selectedPlan) onPurchase(selectedPlan); }}
        style={({ pressed }) => [styles.purchase, { backgroundColor: theme.primary },
          !canPurchase && styles.disabled, pressed && styles.pressed]}>
        {purchasing ? <ActivityIndicator color={theme.onPrimary} /> : null}
        <Text style={[styles.purchaseText, { color: theme.onPrimary, fontFamily: theme.fontFamily }]}>{purchaseLabel}</Text>
      </Pressable>
      {selectedPlan && !error ? (
        <Text selectable style={[styles.disclosure, mutedText]}>{copy.billingDisclosure(selectedPlan)}</Text>
      ) : null}
      <View style={styles.legal}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.restore}
          accessibilityState={{ disabled: !canRestore, busy: restoring }} disabled={!canRestore}
          onPress={() => { if (canRestore) onRestore(); }}
          hitSlop={linkHitSlop}
          style={({ pressed }) => [styles.link, !canRestore && styles.disabled, pressed && styles.pressed]}>
          {restoring ? <ActivityIndicator color={theme.muted} /> : null}
          <Text style={[styles.caption, mutedText]}>{copy.restore}</Text>
        </Pressable>
        {[terms, privacy].map((link, index) => (
          <Fragment key={index}>
            <Text accessible={false} importantForAccessibility="no" style={[styles.caption, mutedText]}>·</Text>
            <Pressable accessibilityRole="link" accessibilityLabel={link.label}
              onPress={link.onPress} hitSlop={linkHitSlop} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
              <Text style={[styles.caption, mutedText]}>{link.label}</Text>
            </Pressable>
          </Fragment>
        ))}
      </View>
    </>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }, style]}>
      <View style={styles.main}>
        {onClose ? (
          // Floats over the content so scrolling never loses a header band; zIndex keeps it on top
          // while it stays first in screen-reader order.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.close}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => { if (!busy) onClose(); }}
            style={({ pressed }) => [styles.close,
              busy && styles.disabled, pressed && styles.pressed]}
          >
            <Text accessible={false} style={[styles.closeText, { color: theme.muted }]}>×</Text>
          </Pressable>
        ) : null}
        {loading ? (
          // Plain spinner while plans load: no logo/hero flash before the trial layout is known.
          <View style={styles.loadingScreen} accessibilityLiveRegion="polite">
            <ActivityIndicator size="large" color={theme.primary} accessibilityLabel={copy.loading} />
          </View>
        ) : (
          <ScrollView contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, onClose ? styles.contentWithClose : null]}>
            <View style={styles.hero}>
              {logo && (!trial || trial.showLogo) ? <Image source={logo} accessible={false} resizeMode="contain"
                style={[styles.logo, radius, logoStyle]} /> : null}
              {trial?.eyebrow ? <Text style={[styles.eyebrow,
                { color: theme.primary, fontFamily: theme.fontFamily }]}>{trial.eyebrow}</Text> : null}
              <Text accessibilityRole="header" style={[styles.title, text,
                { fontFamily: theme.headingFontFamily ?? theme.fontFamily }, titleStyle]}>{heroTitle}</Text>
              {heroSubtitle ? <Text style={[styles.subtitle, mutedText]}>{heroSubtitle}</Text> : null}
            </View>

            {trial ? (
              <View accessibilityRole="list" style={[styles.timeline, radius, { backgroundColor: theme.surface }]}>
                {trial.steps.map((step, index) => {
                  const last = index === trial.steps.length - 1;
                  return (
                    <View key={step.id} style={styles.step}>
                      <View style={styles.stepRail}>
                        <View accessible={false} importantForAccessibility="no-hide-descendants"
                          style={step.icon ? [styles.stepIcon, { backgroundColor: theme.primary }]
                            : [styles.stepDot, { backgroundColor: index === 0 ? theme.primary : theme.border }]}>
                          {step.icon}
                        </View>
                        {last ? null : <View style={[styles.stepLine, { backgroundColor: theme.border }]} />}
                      </View>
                      <View style={[styles.stepBody, step.icon ? styles.stepBodyIcon : null, last && styles.stepBodyLast]}>
                        <Text style={[styles.stepTitle, text]}>{step.title}</Text>
                        <Text style={[styles.stepText, mutedText]}>{step.text}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {features.length > 0 ? (
              <View style={styles.features}>
                {features.map((feature) => (
                  <View key={feature.id} style={styles.feature}>
                    <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.featureIcon}>
                      {feature.icon ?? <Text style={[styles.body, { color: theme.primary }]}>✓</Text>}
                    </View>
                    <Text style={[styles.featureText, text]}>{feature.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.actions}>{actions}</View>

            {footer}
          </ScrollView>
        )}
      </View>
      {success ? <PurchaseSuccessModal {...success} visible={isPremium} theme={theme} /> : null}
    </SafeAreaView>
  );
}

// Legal links render 32pt tall; hitSlop restores the 44pt touch target.
const linkHitSlop = { top: 6, bottom: 6 };

const styles = StyleSheet.create({
  screen: { flex: 1 },
  main: { flex: 1 },
  close: { position: 'absolute', top: 6, end: 12, zIndex: 1, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 30, lineHeight: 34, includeFontPadding: false },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 20, paddingBottom: 24, gap: 20 },
  contentWithClose: { paddingTop: 52 },
  hero: { alignItems: 'center', gap: 8 },
  logo: { width: 72, height: 72 },
  eyebrow: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 1.2, textAlign: 'center' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 24 },
  caption: { fontSize: 13, lineHeight: 18, includeFontPadding: false },
  timeline: { padding: 16 },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { width: 28, alignItems: 'center' },
  stepIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  stepLine: { flex: 1, width: 2, minHeight: 12, marginVertical: 4 },
  stepBody: { flex: 1, gap: 2, paddingBottom: 16 },
  stepBodyIcon: { paddingTop: 4 },
  stepBodyLast: { paddingBottom: 0 },
  stepTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  stepText: { fontSize: 14, lineHeight: 20 },
  features: { gap: 10 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 28, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1, fontSize: 15, lineHeight: 22 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  status: { alignItems: 'center', gap: 12 },
  statusText: { fontSize: 15, textAlign: 'center' },
  plans: { gap: 8 },
  plan: { borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  planHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  planTitle: { flexShrink: 1, fontSize: 16, lineHeight: 21, fontWeight: '700', includeFontPadding: false },
  planDetail: { fontSize: 14, lineHeight: 19, includeFontPadding: false },
  planPrice: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 1 },
  // Straddles the top border; the extra margin keeps it clear of the card above.
  planWithTopBadge: { marginTop: 8 },
  topBadgeRow: { position: 'absolute', top: -10, start: 0, end: 0, alignItems: 'center' },
  badgeText: { fontSize: 11, lineHeight: 16, fontWeight: '700', includeFontPadding: false },
  notice: { minHeight: 36, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  actions: { gap: 8 },
  disclosure: { fontSize: 12, lineHeight: 16, textAlign: 'center', includeFontPadding: false },
  purchase: { minHeight: 46, borderRadius: 999, borderCurve: 'continuous', paddingHorizontal: 20, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  purchaseText: { flexShrink: 1, fontSize: 16, fontWeight: '700', textAlign: 'center', includeFontPadding: false },
  legal: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 },
  link: { minHeight: 32, maxWidth: '100%', paddingHorizontal: 4, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
