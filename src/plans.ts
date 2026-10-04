import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { getFreeTrialDetails } from './trial';
import type { BillingCycle, RevenueCatPaywallPlan } from './types';

function inferCycle(pkg: PurchasesPackage): BillingCycle | null {
  switch (pkg.packageType) {
    case 'ANNUAL': return 'yearly';
    case 'MONTHLY': return 'monthly';
    case 'WEEKLY': return 'weekly';
    case 'LIFETIME': return 'oneTime';
  }

  switch (pkg.product.subscriptionPeriod?.toUpperCase()) {
    case 'P1Y':
    case 'P12M': return 'yearly';
    case 'P1M': return 'monthly';
    case 'P1W': return 'weekly';
  }

  // Only known non-consumables count as lifetime; null periods can also be unknown subscriptions.
  return pkg.product.productType === 'NON_CONSUMABLE' ? 'oneTime' : null;
}

export function findPackageForCycle(offering: PurchasesOffering, cycle: BillingCycle): PurchasesPackage | null {
  const standardPackage = {
    yearly: offering.annual,
    monthly: offering.monthly,
    oneTime: offering.lifetime,
    weekly: offering.weekly,
  }[cycle];
  return standardPackage ?? offering.availablePackages.find((pkg) => inferCycle(pkg) === cycle) ?? null;
}

export function toPaywallPlan(pkg: PurchasesPackage, cycle: BillingCycle, platform: string): RevenueCatPaywallPlan {
  const product = pkg.product;
  const freePhase = product.defaultOption?.freePhase;
  const trial = cycle === 'oneTime' ? null : platform === 'android'
    ? freePhase && {
        price: freePhase.price.amountMicros,
        periodNumberOfUnits: freePhase.billingPeriod.value,
        periodUnit: freePhase.billingPeriod.unit,
        cycles: freePhase.billingCycleCount ?? 1,
      }
    : product.introPrice;

  return {
    cycle,
    productId: product.identifier,
    title: product.title,
    price: product.priceString,
    priceValue: product.price,
    pricePerMonth: product.pricePerMonthString,
    currencyCode: product.currencyCode,
    ...getFreeTrialDetails(trial),
  };
}
