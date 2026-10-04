import type { RevenueCatClient } from './types';

export async function presentRevenueCatCustomerCenter(_client: RevenueCatClient): Promise<void> {
  throw new Error('Subscription management is unavailable on this platform.');
}
