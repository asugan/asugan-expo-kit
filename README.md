# @asugan/expo-kit

Shared infrastructure for Expo apps: **a headless RevenueCat subscription module, a customizable paywall screen, and a purchase success modal**.
Extracted from the `shadow-prompts` and `wicca-witchcraft` flows; existing apps were not modified.

## Installation

The package has not been published to npm yet. In this repository:

```sh
npm ci
npm pack
```

Install the generated archive in your Expo app:

```sh
npx expo install @asugan/expo-kit@file:../asugan-skeleton/asugan-expo-kit-0.5.0.tgz react-native-purchases@^9.10.3
```

`npm pack` runs the build and all tests through `prepack`; a failing check prevents archive generation. Version 0.4.1 adds the optional `analytics` (Aptabase) and `sentry` entrypoints. Version 0.4.2 returns a pending outcome for deferred payments. Version 0.4.3 keeps analytics disabled outside iOS and Android. Version 0.4.4 preserves restore availability after offering load errors and automatically restores already-owned purchases. Version 0.5.0 passes the raw entitlement to `onEntitlementChange`, adds `getTrialReminders`, and redesigns the paywall: an optional trial timeline (`copy.trialTimeline` with optional `eyebrow` and `showLogo`), a compact sticky footer with plans, pill purchase button, `copy.trialNotice`, billing disclosure, restore and legal links (scrolling inline on compact screens), per-plan `badge` with `badgeTone: 'muted'`, optional `copy.recommended`, a `titleStyle` prop, `theme.selected` for the selected plan card, a quiet close button, and a plain loading spinner. Version 0.5.1 drops the sticky footer: plans and actions always scroll inline after the content, and plan copy gains `topBadge`, a pill centered on the card's top edge. Version 0.5.3 shows the trial timeline only when the selected plan has a trial, so a paid plan is never presented with another plan's trial. Version 0.5.4 adds an optional `background` slot: a decorative, full-bleed layer drawn behind the paywall content.

### Local package release rules

- After changing distributable code, bump the version in `package.json` and `package-lock.json` before distributing a new archive. Never distribute different contents under the same version or reuse an old archive merely because its filename matches the current version.
- Run `npm ci` and `npm pack` from this repository. Do not bypass lifecycle scripts with `--ignore-scripts`.
- Copy the new archive into the consuming app's `vendor/` directory and install that exact file with `npx expo install @asugan/expo-kit@file:vendor/asugan-expo-kit-<version>.tgz`. Use `bunx` in Bun apps. Commit the app's archive, dependency change, and lockfile together when making a release commit.
- Verify the installed package version and test UI changes in the consuming app. Source tests do not prove that an older installed archive contains the same code.
- Keep only the current archive in this repository. Remove obsolete copies only after checking that no consuming app references those paths; do not delete other apps' vendored dependencies.

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

`onEntitlementChange(isActive, expiresAt, entitlement)` supports both Wicca's synchronous repository
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
setPaywallData(data); // Keep SDK readiness available for restore, even on an offering error.
if ('error' in data) throw data.error; // Handle reporting/localized feedback in the host's catch.
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
| `getPaywallData()` | The offering and its `oneTime` (lifetime), `yearly`, `monthly`, and `weekly` plans. Offering failures return empty plans with an `error` property and preserve `isConfigured`; initialization errors still reject. |
| `purchasePlan(cycle?)` | `{ isActive, cancelled }`; already-owned products automatically restore and return `{ isActive: true, cancelled: false, restored: true }` when the entitlement is active (report it as a restore, not a new purchase); otherwise the original SDK error propagates. Deferred payments return `{ isActive: false, cancelled: false }`. Other SDK errors, including restore failures, propagate to the caller. |
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
- On iOS, configuring the SDK also enables AdServices attribution token collection for RevenueCat's Apple Ads
  integration. It needs no ATT prompt; failures are logged and never block `init()`.
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

`background` is an optional React node drawn behind the content, edge to edge including the safe
areas (status bar, home indicator). It is non-interactive and hidden from screen readers, so use it
only for decoration such as a sky, mountains or mist layers; keep text contrast readable on top of it.
`theme.background` stays as the base color underneath. The package does not depend on an image
library, so pass your own components:

```tsx
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

<Paywall
  // ...other props
  background={(
    <>
      <Image source={require('../assets/images/paywall/sky.webp')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <Image source={require('../assets/images/paywall/mountains.webp')}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' }} contentFit="fill" />
    </>
  )}
/>
```

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
| `title`, `subtitle`, `logo`, `logoStyle`, `titleStyle` | Branding, optional artwork, and an optional hero title style override. |
| `theme` | Required app palette; optional `fontFamily`, `headingFontFamily`, `radius`, and `selected` (selected plan card background). |
| `features` | Stable `id`, translated `text`, and optional `icon` for each benefit. |
| `copy` | Required labels (including `recommended`), plan copy, billing disclosure, optional plan-specific purchase label, and optional `trialTimeline` / `trialNotice`. |
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
Each card shows the plan title with an optional inline badge, then one line: `price` + `period` · `subtitle`.
Exactly one compact recommended badge sits next to the title of one card.
It follows the same priority among displayed available plans, independent of the user's selection. If lifetime is absent, yearly gets the badge;
if yearly is also absent, it moves to monthly, then weekly. An empty list has no badge.
Set the translated badge label with `copy.recommended`. A plan's `copy.plan(...).badge` (for example a trial length) overrides it on that card; omit `copy.recommended` to show only per-plan badges.
Set `badgeTone: 'muted'` on that plan copy to render its badge as a quiet outline in muted text (for example "No trial" next to a trial plan).
Set `topBadge` (for example "Save 34%" from `calculateYearlySavingsPercentage`) to show a filled primary pill centered on the card's top edge, alongside any inline badge.
If a selected plan disappears, selection falls back to the highest-priority displayed available plan,
unless an available `defaultCycle` overrides it.
Loading and errors hide plan cards and disable purchases. Restore remains available
when the SDK is configured but the offering is empty or failed to load. Save the returned
data before handling its `error` in the host; do not reset it to `null` on offering errors.
The paywall uses `copy.empty` and `copy.retry` for offering-error feedback unless the host
supplies a localized `error` message; raw SDK errors are never shown. On large system text sizes
the badge wraps below the plan title; content scrolls without truncating text.

### Trial timeline

Optional `copy.trialTimeline(plan)` switches the hero to a "how your trial works" layout when the
selected plan has a confirmed free trial. The logo is hidden, `title`/`subtitle` are replaced by the
returned ones, and the steps render as a vertical timeline. Without trial plans, or without
`copy.trialTimeline`, or when the selected plan has no trial, the original logo hero is shown. The
function receives the selected plan, so the trial promise always matches the plan the purchase button buys.
Steps without an `icon` show a small dot (the first highlighted); the timeline sits in a surface card.
Return `showLogo: true` to keep the logo above the trial hero, and `eyebrow` for a small primary-colored
label above the title (e.g. `APP PRO`); pass it already uppercased for correct locale casing.

```tsx
trialTimeline: (plan) => {
  const days = plan.trialPeriodUnit === 'WEEK' ? plan.trialPeriodNumberOfUnits! * 7 : plan.trialPeriodNumberOfUnits!;
  return {
    title: 'How your trial works',
    subtitle: `First ${days} days free, then ${plan.price}`,
    steps: [
      { id: 'today', title: 'Today', text: 'Unlock every premium feature.', icon: <LockIcon /> },
      { id: 'reminder', title: `In ${days - 2} days`, text: "We'll remind you your trial is almost over.", icon: <BellIcon /> },
      { id: 'charge', title: `In ${days} days`, text: `You'll be charged ${plan.price}. Cancel anytime before.`, icon: <StarIcon /> },
    ],
  };
},
```

Keep the reminder step consistent with what the app actually schedules (see `getTrialReminders`),
and handle month/year trial units in your copy.

Optional `copy.trialNotice(plan)` returns `{ text, icon? }` (or `null`) for a pill shown above the
purchase button while the selected plan has a free trial, e.g. "We'll remind you before your trial ends".
It is hidden while loading, on errors, and once premium is active.

### Layout

The optional trial notice, plan cards, purchase button, billing disclosure and restore, terms and privacy
links follow the hero, timeline and features inside the scroll area, in that order, so the plans stay
directly above the purchase button. `footer` scrolls with the content, after these actions.
The close button floats over the top-right of the scrolling content instead of reserving a header row; it is
a quiet `theme.muted` × so it does not compete with the purchase button.
While `loading` is true, only a centered spinner (labelled with `copy.loading`) and the close button are shown.

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

## Trial reminders

`getTrialReminders(entitlement, now?)` returns the future local times for a three-step reminder
sequence when the entitlement is an active, renewing free trial (`periodType === 'TRIAL'`,
`willRenew === true`); otherwise it returns an empty array:

- `activation`: 6 hours after a morning start, otherwise 10:00 the next day
- `midTrial`: 10:00 two days before conversion
- `lastDay`: 09:00 on the last day, or 19:00 the evening before when the trial ends before 10:00

Short trials drop reminders that would collide, keeping the conversion warning. Reminders
that have already passed are omitted, so the result can be rescheduled on every sync.
The kit does not depend on a notification library; the host schedules and localizes them:

```ts
onEntitlementChange: (isActive, expiresAt, entitlement) => {
  updateProAccessCache(isActive, expiresAt);
  void syncTrialReminderNotifications(getTrialReminders(entitlement));
},
```

Cancel previously scheduled trial reminders before scheduling the new list. Cancellations in
store settings are only noticed on the next app launch or customer-info update.

## Analytics (Aptabase) — optional

```sh
npx expo install @aptabase/react-native@^0.6.0
```

```ts
// src/lib/analytics.ts
import { createAnalytics, type PurchaseFunnelEvent } from '@asugan/expo-kit/analytics';

type AppEvent = PurchaseFunnelEvent | 'onboarding_completed' | 'ritual_completed';

export const { init: initAnalytics, trackEvent } = createAnalytics<AppEvent>({
  appKey: process.env.EXPO_PUBLIC_APTABASE_APP_KEY,
  host: process.env.EXPO_PUBLIC_APTABASE_HOST,
});
```

A missing or invalid key, a self-hosted key without `host`, or a platform other than iOS/Android makes every call a no-op and `init()` returns `false`.
The SDK initializes lazily on the first event; SDK errors are swallowed (logged in development) so analytics never breaks a user flow.
Aptabase holds one global client: create one analytics client per app. Clients with the same key share it;
a client with a different key or host stays disabled instead of redirecting events.

## Sentry — optional

```sh
npx expo install @sentry/react-native
```

```ts
// src/lib/sentry.ts — import it first in the root layout
import { initSentry } from '@asugan/expo-kit/sentry';

export const { navigationIntegration } = initSentry({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN });
```

Defaults: `tracesSampleRate: 0.2`, `profilesSampleRate: 0`, disabled without a DSN or on web,
React Navigation tracing with time to initial display. Any other `Sentry.init` option can be passed and overrides the defaults.
Register the integration in the root layout with `navigationIntegration.registerNavigationContainer(useNavigationContainerRef())`.
The Metro config (`getSentryExpoConfig`), the `@sentry/react-native/expo` plugin, `SENTRY_AUTH_TOKEN`,
`Sentry.wrap` and `Sentry.captureException` calls stay in the app. Supported: `@sentry/react-native` 7.11+ and 8.x.

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
