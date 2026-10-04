import RevenueCatUI from 'react-native-purchases-ui';

import type { RevenueCatClient } from './types';

/** Optional UI peer dependency; importing the core kit never imports RevenueCatUI. */
export async function presentRevenueCatCustomerCenter(client: RevenueCatClient): Promise<void> {
  if (!await client.init()) throw new Error('RevenueCat is not configured for this build.');
  await RevenueCatUI.presentCustomerCenter();
}
