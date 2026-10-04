import { normalizeConfig } from './config';
import type { RevenueCatClient, RevenueCatConfig } from './types';

/** Non-native fallback. Web billing is intentionally outside this package's initial scope. */
export function createRevenueCat(config: RevenueCatConfig): RevenueCatClient {
  normalizeConfig(config);
  const unavailable = async (): Promise<never> => {
    throw new Error('RevenueCat purchases are unavailable on this platform.');
  };

  return {
    init: async () => false,
    syncEntitlement: async () => false,
    getPaywallData: async () => ({ isConfigured: false, offeringIdentifier: null, plans: {} }),
    purchasePlan: unavailable,
    restorePurchases: unavailable,
    dispose: () => {},
  };
}
