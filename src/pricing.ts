import type { BillingCycle } from './types';

export function getPreferredDefaultCycle(
  availableCycles: readonly BillingCycle[],
  recommendedCycle: BillingCycle,
): BillingCycle | null {
  return availableCycles.includes(recommendedCycle) ? recommendedCycle : (availableCycles[0] ?? null);
}

export function calculateYearlySavingsAmount(monthlyPrice: number, yearlyPrice: number): number | null {
  const annualized = monthlyPrice * 12;
  if (
    !Number.isFinite(annualized) || !Number.isFinite(yearlyPrice) ||
    monthlyPrice <= 0 || yearlyPrice <= 0 || yearlyPrice >= annualized
  ) {
    return null;
  }
  return annualized - yearlyPrice;
}

export function calculateYearlySavingsPercentage(monthlyPrice: number, yearlyPrice: number): number | null {
  const saving = calculateYearlySavingsAmount(monthlyPrice, yearlyPrice);
  return saving === null ? null : Math.round((saving / (monthlyPrice * 12)) * 100);
}
