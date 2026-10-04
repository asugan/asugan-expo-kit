# @asugan/expo-kit

Shared infrastructure for Expo apps. Initial release: **a headless RevenueCat subscription module**.
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
npm install ../asugan-skeleton/asugan-expo-kit-0.1.0.tgz
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
| `getPaywallData()` | The offering and its `yearly`, `monthly`, and `oneTime` plans. |
| `purchasePlan(cycle?)` | `{ isActive, cancelled }`; other SDK errors propagate to the caller. |
| `restorePurchases()` | Returns `true` if active access is found; configuration and SDK errors propagate to the caller. |
| `dispose()` | Removes the client's listener; the client cannot be reused. In-flight operations and cache writes may still complete. |

- Without `offeringId`, the RevenueCat `current` offering is used. If a specified ID is not found, no other offering is selected.
- `purchasePlan('monthly')` purchases only the monthly plan; it throws if that plan is unavailable.
  Without an argument, the source apps' `yearly → monthly → oneTime` fallback order is preserved.
- Standard annual/monthly/lifetime packages and custom `P1Y` / `P12M` / `P1M` periods are supported.
  Custom lifetime products must have the `NON_CONSUMABLE` product type. Weekly and consumable packages are excluded.
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

## Shared paywall helpers

`getPreferredDefaultCycle`, `calculateYearlySavingsAmount`,
`calculateYearlySavingsPercentage`, and `getFreeTrialDetails` are exported from the root entrypoint.
Compare products in the same currency when using the pricing helpers; they do not convert currencies.
Themes, screens, translations, analytics, legal links, the navbar, and a React provider were not extracted in this release.

## Security and verification

Use only RevenueCat **public SDK** keys. Secret `sk_*` keys are rejected;
never include secret API keys in a mobile bundle. Grant premium access only for an active entitlement.

`npm test` verifies native/web behavior using SDK mocks and the Node test runner;
`npm run typecheck` checks TypeScript types. Real device/store transactions have not been tested yet.
The package does not bundle production dependencies. `npm audit` reports upstream security warnings
in the development dependencies' Metro/braces chain; consuming apps should audit their own native dependencies separately.

Publishing is a separate step requiring user approval. The package has not been published;
it remains `UNLICENSED` until a licensing decision is made.
# asugan-expo-kit
