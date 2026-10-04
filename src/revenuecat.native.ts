import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesOffering } from 'react-native-purchases';

import { normalizeConfig } from './config';
import { findPackageForCycle, toPaywallPlan } from './plans';
import { defaultCycleOrder } from './pricing';
import type {
  BillingCycle,
  RevenueCatClient,
  RevenueCatConfig,
  RevenueCatPaywallData,
  RevenueCatPurchaseOutcome,
} from './types';

// RevenueCat is a process-wide SDK. Same identity can share it; conflicting configuration cannot.
let sdkConfig: { apiKey: string; appUserID?: string } | undefined;

export function createRevenueCat(input: RevenueCatConfig): RevenueCatClient {
  const config = normalizeConfig(input);
  let initialized = false;
  let disposed = false;
  let pendingCacheUpdate = Promise.resolve();

  function assertOpen(): void {
    if (disposed) throw new Error('This RevenueCat client has been disposed.');
  }

  async function updateEntitlement(customerInfo: CustomerInfo): Promise<boolean> {
    const entitlement = customerInfo.entitlements.all[config.entitlementId];
    const isActive = entitlement?.isActive === true;
    const expiresAt = entitlement?.expirationDate ?? null;
    // Preserve arrival order for asynchronous host caches, without misreporting a successful purchase.
    pendingCacheUpdate = pendingCacheUpdate
      .then(() => config.onEntitlementChange?.(isActive, expiresAt))
      .catch((error: unknown) => console.error('[expo-kit] Entitlement cache update failed:', error));
    await pendingCacheUpdate;
    return isActive;
  }

  function onCustomerInfo(customerInfo: CustomerInfo): void {
    if (!disposed) void updateEntitlement(customerInfo);
  }

  async function init(): Promise<boolean> {
    assertOpen();
    if (initialized) return true;
    const apiKey = Platform.OS === 'ios' ? config.iosApiKey
      : Platform.OS === 'android' ? config.androidApiKey : undefined;
    if (!apiKey) return false;

    if (sdkConfig && (sdkConfig.apiKey !== apiKey || sdkConfig.appUserID !== config.appUserID)) {
      throw new Error('RevenueCat is already configured with a different API key or user.');
    }
    if (!sdkConfig) {
      Purchases.configure({ apiKey, appUserID: config.appUserID });
      sdkConfig = { apiKey, appUserID: config.appUserID };
    }
    Purchases.addCustomerInfoUpdateListener(onCustomerInfo);
    initialized = true;
    return true;
  }

  async function requireConfigured(): Promise<void> {
    if (!await init()) throw new Error('RevenueCat is not configured for this build.');
  }

  async function getOffering(): Promise<PurchasesOffering | null> {
    const offerings = await Purchases.getOfferings();
    return config.offeringId ? (offerings.all[config.offeringId] ?? null) : offerings.current;
  }

  async function syncEntitlement(): Promise<boolean> {
    if (!await init()) return false;
    return updateEntitlement(await Purchases.getCustomerInfo());
  }

  async function getPaywallData(): Promise<RevenueCatPaywallData> {
    const isConfigured = await init();
    const offering = isConfigured ? await getOffering() : null;
    const plans: RevenueCatPaywallData['plans'] = {};
    if (offering) {
      for (const cycle of defaultCycleOrder) {
        const pkg = findPackageForCycle(offering, cycle);
        if (pkg) plans[cycle] = toPaywallPlan(pkg, cycle, Platform.OS);
      }
    }

    const trialPlans = Object.values(plans).filter((plan) => plan.hasFreeTrial);
    if (Platform.OS === 'ios' && trialPlans.length > 0) {
      let eligibleProductIds = new Set<string>();
      try {
        const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility(
          trialPlans.map((plan) => plan.productId),
        );
        eligibleProductIds = new Set(Object.entries(eligibility)
          .filter(([, result]) => result.status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE)
          .map(([productId]) => productId));
      } catch (error) {
        console.error('[expo-kit] Trial eligibility check failed:', error);
      }
      for (const plan of trialPlans) {
        if (!eligibleProductIds.has(plan.productId)) {
          plan.hasFreeTrial = false;
          plan.trialPeriodNumberOfUnits = null;
          plan.trialPeriodUnit = null;
        }
      }
    }

    return { isConfigured, offeringIdentifier: offering?.identifier ?? null, plans };
  }

  async function purchasePlan(cycle?: BillingCycle): Promise<RevenueCatPurchaseOutcome> {
    if (cycle !== undefined && !defaultCycleOrder.includes(cycle)) {
      throw new Error('Unsupported billing cycle.');
    }
    await requireConfigured();
    const offering = await getOffering();
    if (!offering) throw new Error('No active RevenueCat offering was found.');

    const cycles = cycle ? [cycle] : defaultCycleOrder;
    const pkg = cycles.map((candidate) => findPackageForCycle(offering, candidate)).find(Boolean);
    if (!pkg) throw new Error('No package is available for the requested billing cycle.');

    let customerInfo: CustomerInfo;
    try {
      ({ customerInfo } = await Purchases.purchasePackage(pkg));
    } catch (error) {
      if (error && typeof error === 'object') {
        const purchaseError = error as { code?: unknown; userCancelled?: unknown };
        if (purchaseError.userCancelled === true ||
          purchaseError.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
          return { isActive: false, cancelled: true };
        }
      }
      throw error;
    }
    return { isActive: await updateEntitlement(customerInfo), cancelled: false };
  }

  async function restorePurchases(): Promise<boolean> {
    await requireConfigured();
    return updateEntitlement(await Purchases.restorePurchases());
  }

  function dispose(): void {
    if (initialized && !disposed) Purchases.removeCustomerInfoUpdateListener(onCustomerInfo);
    disposed = true;
  }

  return { init, syncEntitlement, getPaywallData, purchasePlan, restorePurchases, dispose };
}
