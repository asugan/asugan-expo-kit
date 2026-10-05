# @asugan/expo-kit

Shared infrastructure for Expo apps: **a headless RevenueCat subscription module, a customizable paywall screen, and a purchase success modal**.
Extracted from the `shadow-prompts` and `wicca-witchcraft` flows; existing apps were not modified.

## Installation

The package has not been published to npm yet. In this repository:

```sh
npm ci
npm test
npm pack
```

Install the generated archive in your Expo app:

```sh
npm install ../asugan-skeleton/asugan-expo-kit-0.3.0.tgz
npx expo install react-native-purchases@^9.10.3
```

RevenueCat SDK **9.x** is supported. The source apps use Expo 57, React Native 0.86.3,
and RevenueCat 9.10.3 / 9.15.2. The package does not bundle its own copies of React, Expo,
or the SDK; native dependencies are resolved in the host app through `peerDependencies`.
Real purchases and restores require an iOS/Android development build or store build.
Expo Go may use the SDK's preview/mock mode; this does not test real payments.
Web is intentionally unsupported in this initial release: imports are safe, but purchases and restores throw errors.

## App integration

Create **one client** in your app's own module. `EXPO_PUBLIC_*` values are read in the host app;
the package does not contain an `.env` file, product IDs, or a database.

```ts
// src/lib/subscriptions.ts
import { createRevenueCat } from '@asugan/expo-kit';
import { updateProAccessCache } from '@/db/repositories/subscription-repository';

export const subscriptions = createRevenueCat({
  iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  androidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  entitlementId: process.env.EXPO_PUBLIC_REVENUECAT_PRO_ENTITLEMENT || 'pro',
  offeringId: process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID,
  onEntitlementChange: updateProAccessCache,
});
```

`onEntitlementChange(isActive, expiresAt)` supports both Wicca's synchronous repository
and Shadow Prompts' asynchronous mutation. Updates are processed in order. Cache write
errors are logged; a completed store transaction is not incorrectly reported as a failed purchase.
The host app remains responsible for offline caching, expiry checks, and premium access gates.

In the root layout, after the app's database setup is complete:

```tsx
useEffect(() => {
  void subscriptions.syncEntitlement().catch((error) => {
    console.error('[subscriptions] Initial sync failed:', error);
  });
}, []);
```

In your paywall screen, manage these calls with your own loading, error, and toast states:

```ts
const data = await subscriptions.getPaywallData();
const yearly = data.plans.yearly;
// yearly?.price: the store's localized price
// yearly?.trialPeriodNumberOfUnits / trialPeriodUnit: confirmed trial duration

const result = await subscriptions.purchasePlan('yearly');
// result.cancelled: user cancellation, not an error
// !result.isActive && !result.cancelled: entitlement is not active yet; do not grant access

const restored = await subscriptions.restorePurchases();
```

### API

| Method | Result |
| --- | --- |
| `init()` | Whether the native SDK is ready. Returns `false` if the API key is missing. |
| `syncEntitlement()` | Passes the current entitlement state to the cache callback and returns whether it is active. |
| `getPaywallData()` | The offering and its `oneTime` (lifetime), `yearly`, `monthly`, and `weekly` plans. |
| `purchasePlan(cycle?)` | `{ isActive, cancelled }`; other SDK errors propagate to the caller. |
| `restorePurchases()` | Returns `true` if active access is found; configuration and SDK errors propagate to the caller. |
| `dispose()` | Removes the client's listener; the client cannot be reused. In-flight operations and cache writes may still complete. |

- Without `offeringId`, the RevenueCat `current` offering is used. If a specified ID is not found, no other offering is selected.
- `purchasePlan('monthly')` purchases only the monthly plan; it throws if that plan is unavailable.
  Without an argument, the priority is `oneTime → yearly → monthly → weekly`, skipping unavailable plans.
- Standard lifetime/annual/monthly/weekly packages and custom `P1Y` / `P12M` / `P1M` / `P1W` periods are supported.
  Custom lifetime products must have the `NON_CONSUMABLE` product type. Consumable packages are excluded.
- iOS trials are shown only when eligibility is confirmed; a failed check removes the trial claim.
  Android trials are calculated from the selected product's `defaultOption.freePhase`.
- The SDK is global: clients can share the same key and identity, but cannot reconfigure it with a different key or `appUserID`.
  Do not configure the SDK separately outside this package. Dynamic login/logout is outside this release's scope.
- Do not call `dispose()` in the root layout's effect cleanup: React Strict Mode may reuse the same client.
  A client used throughout the app's lifetime does not need to be disposed.
- Shadow Prompts' `trialPeriodNumber` is named `trialPeriodNumberOfUnits` in the shared API,
  following Wicca/SDK naming. Update the screen field during a future migration.

## Customer Center — optional

Shadow Prompts' subscription management lives in a separate entrypoint. Apps such as Wicca
that do not use it do not need to install the UI SDK. The UI SDK version must match the app's core SDK version:

```sh
# If the core SDK version is 9.15.2:
npx expo install react-native-purchases-ui@9.15.2
```

```ts
import { presentRevenueCatCustomerCenter } from '@asugan/expo-kit/customer-center';

await presentRevenueCatCustomerCenter(subscriptions);
```

## Customizable paywall

```sh
# Required only when using the Paywall component:
npx expo install react-native-safe-area-context
```

Import the screen from `@asugan/expo-kit/paywall`. It shares the source apps' layout:
optional artwork, a title, features, selectable plan cards, billing disclosure, a purchase
button, restore, and legal links. It uses React Native primitives rather than requiring
Paper, Expo UI, an icon library, or RevenueCat's UI SDK. The root entrypoint remains headless.

The host app must have a `SafeAreaProvider` at its root; Expo Router apps may already provide one.
`Paywall` handles its own safe-area edges, so do not wrap it in another `SafeAreaView`.

Inside your subscription screen, pass your existing state and handlers:

```tsx
import { Paywall } from '@asugan/expo-kit/paywall';

// `theme`, `t`, `router`, state, and handlers belong to your host screen.
<Paywall
  title={t('subscription.proPlanTitle')}
  subtitle={t('subscription.heroBody')}
  logo={require('../assets/images/icon.png')}
  theme={{
    background: theme.colors.background,
    surface: theme.colors.surface,
    text: theme.colors.onSurface,
    muted: theme.colors.onSurfaceVariant,
    primary: theme.colors.primary,
    onPrimary: theme.colors.onPrimary,
    border: theme.colors.outline,
  }}
  features={[
    { id: 'library', text: t('subscription.proFeatures.fullLibraryAccess') },
    { id: 'journal', text: t('subscription.proFeatures.unlimitedJournal') },
  ]}
  data={paywallData}
  loading={isLoading}
  purchasing={isPurchasing}
  restoring={isRestoring}
  isPremium={isPremium}
  error={errorMessage}
  defaultCycle="oneTime"
  planOrder={['oneTime', 'yearly', 'monthly', 'weekly']}
  copy={paywallCopy}
  onPurchase={(plan) => void handlePurchase(plan.cycle)}
  onRestore={() => void handleRestore()}
  onRetry={() => void loadPaywall()}
  onSelectPlan={(plan) => trackPlanSelected(plan.cycle)}
  onClose={() => router.back()}
  terms={{ label: t('subscription.terms'), onPress: openTerms }}
  privacy={{ label: t('subscription.privacy'), onPress: openPrivacy }}
/>
```

For Wicca's theme, map `surface` to `theme.colors.surface1`, `muted` to
`theme.colors.onSurfaceMuted`, and optionally set `headingFontFamily` to
`typefaces.display` imported from Wicca's `src/theme/tokens`. For Shadow Prompts, use its existing Paper theme colors as above.
Feature icons are optional React nodes, so either app can pass its existing icon components.

All strings come from the host app. This English copy example illustrates the contract;
replace it with your translations and store-specific billing disclosures:

```ts
import type { PaywallCopy } from '@asugan/expo-kit/paywall';

const paywallCopy: PaywallCopy = {
  close: 'Close paywall',
  loading: 'Loading plans…',
  empty: 'No plans are available right now.',
  retry: 'Try again',
  continue: 'Unlock premium',
  premiumActive: 'Premium active',
  restore: 'Restore purchases',
  recommended: 'Recommended',
  plan: (plan) => ({
    title: { oneTime: 'Lifetime', yearly: 'Yearly', monthly: 'Monthly', weekly: 'Weekly' }[plan.cycle],
    subtitle: plan.cycle === 'oneTime' ? 'One payment. Yours forever.'
      : plan.hasFreeTrial ? 'Free trial available' : 'Cancel anytime.',
    period: { oneTime: undefined, yearly: 'per year', monthly: 'per month', weekly: 'per week' }[plan.cycle],
  }),
  purchase: (plan) => plan.hasFreeTrial ? 'Start free trial'
    : plan.cycle === 'oneTime' ? 'Get lifetime access' : 'Unlock premium',
  billingDisclosure: (plan) => plan.cycle === 'oneTime'
    ? `${plan.price} charged once. No recurring subscription.`
    : `Standard subscription: ${plan.price} billed ${plan.cycle === 'yearly' ? 'annually' : plan.cycle === 'monthly' ? 'monthly' : 'weekly'}. Renews automatically unless cancelled.`,
};
```

Include the confirmed trial duration (`trialPeriodNumberOfUnits` / `trialPeriodUnit`)
and any introductory pricing in your billing disclosure when applicable. `hasFreeTrial`
alone does not describe every billing phase. Badge claims and translations are the host's responsibility;
the component always displays the SDK's localized `plan.price`, not a caller-supplied price string.

| Props | Purpose |
| --- | --- |
| `title`, `subtitle`, `logo`, `logoStyle` | Branding and optional artwork. |
| `theme` | Required app palette; optional `fontFamily`, `headingFontFamily`, and `radius`. |
| `features` | Stable `id`, translated `text`, and optional `icon` for each benefit. |
| `copy` | Required labels (including `recommended`), plan copy, billing disclosure, and optional plan-specific purchase label. |
| `data`, `loading`, `error`, `onRetry` | SDK paywall data and loading/error/empty/content states. |
| `defaultCycle`, `planOrder`, `onSelectPlan` | Initial preference, visible cycle filter, and optional selection analytics. |
| `purchasing`, `restoring`, `isPremium` | Controlled action states; plan selection and duplicate actions are disabled while busy. |
| `success` | Optional success modal content and close handler; shown only when `isPremium` is true. |
| `onPurchase`, `onRestore`, `onClose` | Host-owned SDK calls and navigation. Purchase receives the displayed selected plan. |
| `terms`, `privacy` | Required link labels and host-owned handlers. |
| `footer`, `style` | Optional custom footer content and root layout override. |

Fixed display priority: **lifetime (`oneTime`) → yearly → monthly → weekly**.
Unavailable plans are skipped. Selection is internal; `defaultCycle` can override the initial preference
without changing card order. `planOrder` filters visible cycles; its input order does not override priority.
Exactly one compact recommended badge floats over the card's top-right border, without adding a row inside the card.
It follows the same priority among displayed available plans, independent of the user's selection. If lifetime is absent, yearly gets the badge;
if yearly is also absent, it moves to monthly, then weekly. An empty list has no badge.
Set the translated badge label with `copy.recommended` (replaces per-plan `copy.plan(...).badge`).
If a selected plan disappears, selection falls back to the highest-priority displayed available plan,
unless an available `defaultCycle` overrides it.
Loading and errors hide plan cards and disable purchases. Restore remains available
when the SDK is configured but the offering is empty. Narrow screens and large system
text sizes stack the price below the plan label; content scrolls without truncating text.

This component does not call RevenueCat, open URLs, translate strings, or infer successful purchases.
It can display the optional `success` modal after the host confirms active access.
Set busy state before starting SDK calls, guard against duplicate requests in your host handlers,
catch purchase/restore/link errors there, and clear busy state in `finally`. Supply feedback for
cancellation, pending access, successful purchases, and restore results. Do not dismiss the
screen or grant premium access until the SDK confirms an active entitlement.

## Purchase success modal

Based on DayTracker's simple native confirmation card, with Wicca's scrollable content
for long translations and large system text. No Paper, Expo Symbols, Reanimated, or
animation dependencies are required. Presentation uses a native fade only—no scaling,
movement, or confetti. The action stays outside the content scroll area.

### Inside the paywall

Use the optional `success` prop. The existing paywall theme is reused automatically.
The screen must remain mounted while the modal is visible; navigate only after closing it.

```tsx
import { useState } from 'react';
import type { BillingCycle } from '@asugan/expo-kit';
import type { PaywallSuccess } from '@asugan/expo-kit/paywall';

// Inside your host screen; `subscriptions`, `t`, and existing state setters belong to the app.
const [success, setSuccess] = useState<PaywallSuccess | null>(null);

async function handlePurchase(cycle: BillingCycle) {
  setIsPurchasing(true);
  setErrorMessage(null);
  setSuccess(null);
  try {
    const result = await subscriptions.purchasePlan(cycle);
    if (result.cancelled) return;
    if (!result.isActive) {
      setErrorMessage(t('subscription.purchasePending'));
      return;
    }
    setIsPremium(true);
    setSuccess({
      title: t('subscription.purchaseSuccessTitle'),
      message: t('subscription.purchaseSuccessBody'),
      buttonLabel: t('common.continue'),
      onClose: () => setSuccess(null),
      // Optional: icon: <YourExistingSuccessIcon />,
    });
  } catch {
    setErrorMessage(t('subscription.purchaseFailed'));
  } finally {
    setIsPurchasing(false);
  }
}

// Add `success={success}` to the <Paywall ... /> example above.
```

Cancelled, failed, or pending purchases must not set `success`. Merely setting
`isPremium` does not open a modal; both explicit `success` content and active access
are required. For restore, populate the same prop with restored-purchase copy only
when `restorePurchases()` returns `true`. Guard against duplicate requests in your
host handlers, as with the existing paywall integration.

### Standalone use

Useful for restore feedback in Settings, matching DayTracker's reuse of its modal:

```tsx
import { PurchaseSuccessModal } from '@asugan/expo-kit/purchase-success-modal';

<PurchaseSuccessModal
  visible={showRestoreSuccess}
  theme={paywallTheme}
  title={t('subscription.restoreSuccessTitle')}
  message={t('subscription.restoreSuccessBody')}
  buttonLabel={t('common.ok')}
  onClose={() => setShowRestoreSuccess(false)}
/>
```

Props: `visible`, `theme`, `title`, `message`, `buttonLabel`, `onClose`, and optional
`icon` (a React node). The default icon is a cross-platform checkmark. All copy is
supplied by the host app; example translation keys are placeholders to map to your
own resources. Button, backdrop, Android Back, and web Escape share `onClose`.
The parent controls dismissal; no automatic navigation or timers are used.
The modal provides its own safe-area provider for its separate native window and
isolates its content for screen readers. The root SDK entrypoint remains headless.

## Shared paywall helpers

`getPreferredDefaultCycle`, `calculateYearlySavingsAmount`,
`calculateYearlySavingsPercentage`, and `getFreeTrialDetails` are exported from the root entrypoint.
Compare products in the same currency when using the pricing helpers; they do not convert currencies.
App theme providers, translations, analytics, URL handling, the navbar,
and a React provider were not extracted in this release. The optional Paywall screen accepts these app-specific values through props.

## Security and verification

Use only RevenueCat **public SDK** keys. Secret `sk_*` keys are rejected;
never include secret API keys in a mobile bundle. Grant premium access only for an active entitlement.

`npm test` verifies SDK behavior, paywall and success modal state/interaction handling, and Metro entrypoint resolution;
`npm run typecheck` checks TypeScript types. The paywall has also been previewed in a browser
with Shadow Prompts' dark and Wicca's light branding. Native device rendering and real store transactions have not been tested yet.
The package does not bundle production dependencies. `npm audit` reports upstream security warnings
in the development dependencies' Metro/braces chain; consuming apps should audit their own native dependencies separately.

Publishing is a separate step requiring user approval. The package has not been published;
it remains `UNLICENSED` until a licensing decision is made.
# asugan-expo-kit
