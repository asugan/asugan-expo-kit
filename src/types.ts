export type BillingCycle = 'oneTime' | 'yearly' | 'monthly' | 'weekly';
export type TrialPeriodUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

/** Subset of RevenueCat's `PurchasesEntitlementInfo` passed to `onEntitlementChange`. */
export type RevenueCatEntitlement = {
  isActive: boolean;
  willRenew: boolean;
  periodType: string;
  latestPurchaseDate: string;
  expirationDate: string | null;
};

export type TrialReminderKind = 'activation' | 'midTrial' | 'lastDay';
export type TrialReminder = { kind: TrialReminderKind; date: Date };

export type FreeTrialDetails = {
  hasFreeTrial: boolean;
  trialPeriodNumberOfUnits: number | null;
  trialPeriodUnit: TrialPeriodUnit | null;
};

export type RevenueCatPaywallPlan = FreeTrialDetails & {
  cycle: BillingCycle;
  productId: string;
  title: string;
  price: string;
  priceValue: number;
  pricePerMonth: string | null;
  currencyCode: string;
};

export type RevenueCatPaywallData = {
  isConfigured: boolean;
  offeringIdentifier: string | null;
  plans: Partial<Record<BillingCycle, RevenueCatPaywallPlan>>;
  /** Offering load failure; SDK readiness is preserved so restore stays available. */
  error?: unknown;
};

export type RevenueCatPurchaseOutcome = {
  isActive: boolean;
  cancelled: boolean;
  /** True when the store reported an already-owned product and access came from a restore, not a new charge. */
  restored?: boolean;
};

export type RevenueCatConfig = {
  iosApiKey?: string;
  androidApiKey?: string;
  entitlementId: string;
  offeringId?: string;
  /** Optional stable identity. Create a new app session before changing this. */
  appUserID?: string;
  /** Connect the host app's SQLite/cache. Persistence errors are logged, not purchase failures. */
  /** `entitlement` is the raw configured entitlement (null when missing); pass it to `getTrialReminders`. */
  onEntitlementChange?: (
    isActive: boolean,
    expiresAt: string | null,
    entitlement: RevenueCatEntitlement | null,
  ) => void | Promise<void>;
};

export type RevenueCatClient = {
  init: () => Promise<boolean>;
  syncEntitlement: () => Promise<boolean>;
  getPaywallData: () => Promise<RevenueCatPaywallData>;
  purchasePlan: (cycle?: BillingCycle) => Promise<RevenueCatPurchaseOutcome>;
  restorePurchases: () => Promise<boolean>;
  /** Removes this client's SDK listener. Does not reset the global RevenueCat SDK. */
  dispose: () => void;
};
