import type { FreeTrialDetails, RevenueCatEntitlement, TrialPeriodUnit, TrialReminder } from './types';

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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function atLocalHour(base: Date, dayOffset: number, hour: number): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return date;
}

/**
 * Future local reminder times for a renewing free trial: an activation nudge, a reminder two days
 * before conversion, and a last-day alert. Empty when there is no active, renewing trial.
 */
export function getTrialReminders(
  entitlement: RevenueCatEntitlement | null | undefined,
  now: Date = new Date(),
): TrialReminder[] {
  if (!entitlement?.isActive || entitlement.periodType !== 'TRIAL' || !entitlement.willRenew) return [];
  const start = new Date(entitlement.latestPurchaseDate);
  const end = new Date(entitlement.expirationDate ?? Number.NaN);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  // Morning trials get a same-day nudge; later ones wait for the next morning.
  const activation = start.getHours() < 12 ? new Date(start.getTime() + 6 * HOUR) : atLocalHour(start, 1, 10);
  const midTrial = atLocalHour(end, -2, 10);
  // Morning of the last day, or the previous evening when the trial ends before mid-morning.
  const morning = atLocalHour(end, 0, 9);
  const lastDay = end.getTime() - morning.getTime() >= HOUR ? morning : atLocalHour(end, -1, 19);

  const reminders: TrialReminder[] = [];
  const candidates = [['lastDay', lastDay], ['midTrial', midTrial], ['activation', activation]] as const;
  for (const [kind, date] of candidates) {
    // Short trials drop overlapping reminders, keeping the conversion warning first.
    // Computed before filtering by `now` so re-syncs stay stable.
    const next = reminders.length ? reminders[0].date : end;
    if (date > start && date < next) reminders.unshift({ kind, date });
  }
  return reminders.filter((reminder) => reminder.date > now);
}
