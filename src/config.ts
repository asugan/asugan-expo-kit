import type { RevenueCatConfig } from './types';

export function normalizeConfig(config: RevenueCatConfig): RevenueCatConfig {
  const entitlementId = config.entitlementId?.trim();
  if (!entitlementId) {
    throw new Error('RevenueCat entitlementId is required.');
  }

  const iosApiKey = config.iosApiKey?.trim();
  const androidApiKey = config.androidApiKey?.trim();
  if ([iosApiKey, androidApiKey].some((key) => key?.startsWith('sk_'))) {
    throw new Error('Use RevenueCat public SDK keys, never secret API keys.');
  }

  const appUserID = config.appUserID?.trim();
  if (config.appUserID !== undefined && !appUserID) {
    throw new Error('RevenueCat appUserID must not be empty.');
  }

  return {
    ...config,
    entitlementId,
    iosApiKey,
    androidApiKey,
    appUserID,
    offeringId: config.offeringId?.trim() || undefined,
  };
}
