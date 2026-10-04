import type { FreeTrialDetails, TrialPeriodUnit } from './types';

type IntroPriceLike = {
  price?: unknown;
  periodNumberOfUnits?: unknown;
  periodUnit?: unknown;
  cycles?: unknown;
};

export function getFreeTrialDetails(introPrice: IntroPriceLike | null | undefined): FreeTrialDetails {
  const units = introPrice?.periodNumberOfUnits;
  const cycles = introPrice?.cycles ?? 1;
  const unit = typeof introPrice?.periodUnit === 'string' ? introPrice.periodUnit.toUpperCase() : '';
  if (
    introPrice?.price !== 0 ||
    typeof units !== 'number' || !Number.isSafeInteger(units) || units <= 0 ||
    typeof cycles !== 'number' || !Number.isSafeInteger(cycles) || cycles <= 0 ||
    !Number.isSafeInteger(units * cycles) ||
    !['DAY', 'WEEK', 'MONTH', 'YEAR'].includes(unit)
  ) {
    return { hasFreeTrial: false, trialPeriodNumberOfUnits: null, trialPeriodUnit: null };
  }

  return {
    hasFreeTrial: true,
    trialPeriodNumberOfUnits: units * cycles,
    trialPeriodUnit: unit as TrialPeriodUnit,
  };
}
