const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../dist');
const noTrial = { hasFreeTrial: false, trialPeriodNumberOfUnits: null, trialPeriodUnit: null };
const introPrice = { price: 0, periodNumberOfUnits: 7, periodUnit: 'DAY', cycles: 1 };
const info = (isActive = true) => ({
  entitlements: { all: { premium: { isActive, expirationDate: '2030-01-01T00:00:00Z' } } },
});
const pkg = (packageType, period, identifier = packageType) => ({
  identifier,
  packageType,
  product: {
    identifier,
    title: identifier,
    price: 10,
    priceString: '$10.00',
    pricePerMonthString: '$0.83',
    currencyCode: 'USD',
    subscriptionPeriod: period,
    productType: period ? 'AUTO_RENEWABLE_SUBSCRIPTION' : 'NON_CONSUMABLE',
    introPrice,
    defaultOption: null,
  },
});

function native(platform = 'ios') {
  const listeners = new Set();
  const purchased = [];
  const annual = pkg('ANNUAL', 'P1Y');
  const monthly = pkg('MONTHLY', 'P1M');
  const lifetime = pkg('LIFETIME', null);
  const weekly = pkg('WEEKLY', 'P1W');
  const offering = { identifier: 'main', annual, monthly, lifetime, weekly, availablePackages: [annual, monthly, lifetime, weekly] };
  const configurations = [];
  const sdk = {
    INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2 },
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1' },
    configure: (config) => configurations.push(config),
    addCustomerInfoUpdateListener: (listener) => listeners.add(listener),
    removeCustomerInfoUpdateListener: (listener) => listeners.delete(listener),
    getOfferings: async () => ({ current: offering, all: { main: offering } }),
    getCustomerInfo: async () => info(),
    restorePurchases: async () => info(),
    purchasePackage: async (selected) => { purchased.push(selected); return { customerInfo: info() }; },
    checkTrialOrIntroductoryPriceEligibility: async () => ({ ANNUAL: { status: 2 }, MONTHLY: { status: 1 } }),
  };
  const path = require.resolve('../dist/revenuecat.native');
  delete require.cache[path];
  const load = Module._load;
  Module._load = function (request, ...args) {
    if (request === 'react-native') return { Platform: { OS: platform } };
    if (request === 'react-native-purchases') return sdk;
    return load.call(this, request, ...args);
  };
  let createRevenueCat;
  try { ({ createRevenueCat } = require(path)); } finally { Module._load = load; }
  return { createRevenueCat, sdk, offering, configurations, purchased, listeners };
}
const config = { iosApiKey: 'appl_example', androidApiKey: 'goog_example', entitlementId: 'premium' };

test('trial duration and pricing helpers reject invalid data', () => {
  assert.deepEqual(core.getFreeTrialDetails({ ...introPrice, periodUnit: 'week', cycles: 2 }), {
    hasFreeTrial: true, trialPeriodNumberOfUnits: 14, trialPeriodUnit: 'WEEK',
  });
  for (const input of [null, {}, { ...introPrice, price: 1 }, { ...introPrice, periodUnit: 'HOUR' },
    { ...introPrice, periodNumberOfUnits: NaN }, { ...introPrice, periodNumberOfUnits: 0.5 },
    { ...introPrice, cycles: Infinity }, { ...introPrice, cycles: 0 }]) {
    assert.deepEqual(core.getFreeTrialDetails(input), noTrial);
  }
  assert.equal(core.getPreferredDefaultCycle(['monthly', 'oneTime'], 'oneTime'), 'oneTime');
  assert.equal(core.getPreferredDefaultCycle([], 'yearly'), null);
  assert.equal(core.calculateYearlySavingsAmount(10, 60), 60);
  assert.equal(core.calculateYearlySavingsPercentage(10, 60), 50);
  for (const [monthly, yearly] of [[0, 1], [-1, 1], [10, 120], [10, Infinity], [NaN, 10]]) {
    assert.equal(core.calculateYearlySavingsAmount(monthly, yearly), null);
  }
});

test('web fallback imports without native SDKs; secret keys and empty IDs rejected', async () => {
  const client = core.createRevenueCat(config);
  assert.equal(await client.init(), false);
  assert.equal(await client.syncEntitlement(), false);
  assert.deepEqual(await client.getPaywallData(), { isConfigured: false, offeringIdentifier: null, plans: {} });
  await assert.rejects(client.purchasePlan(), /unavailable/);
  await assert.rejects(client.restorePurchases(), /unavailable/);
  assert.throws(() => core.createRevenueCat({ ...config, iosApiKey: ' sk_secret ' }), /public SDK keys/);
  assert.throws(() => core.createRevenueCat({ ...config, entitlementId: ' ' }), /entitlementId/);
  assert.throws(() => core.createRevenueCat({ ...config, appUserID: '' }), /appUserID/);
});

test('native init is idempotent, shares SDK safely, cleans up only its own listener', async () => {
  const env = native();
  const client = env.createRevenueCat({ ...config, iosApiKey: ' appl_example ' });
  assert.deepEqual(await Promise.all([client.init(), client.init(), client.init()]), [true, true, true]);
  assert.equal(env.configurations.length, 1);
  assert.equal(env.listeners.size, 1);
  const sibling = env.createRevenueCat(config);
  await sibling.init();
  assert.equal(env.configurations.length, 1);
  assert.equal(env.listeners.size, 2);
  await assert.rejects(env.createRevenueCat({ ...config, iosApiKey: 'appl_other' }).init(), /different API key/);
  await assert.rejects(env.createRevenueCat({ ...config, appUserID: 'other-user' }).init(), /different API key or user/);
  client.dispose();
  client.dispose();
  assert.equal(env.listeners.size, 1);
  await assert.rejects(client.init(), /disposed/);
  sibling.dispose();
  assert.equal(env.listeners.size, 0);
});

test('configure failures can retry; missing native key never configures or restores', async () => {
  const env = native();
  const original = env.sdk.configure;
  env.sdk.configure = () => { throw new Error('native unavailable'); };
  const client = env.createRevenueCat(config);
  await assert.rejects(client.init(), /native unavailable/);
  env.sdk.configure = original;
  assert.equal(await client.init(), true);
  const missing = native('android');
  const unconfigured = missing.createRevenueCat({ ...config, androidApiKey: ' ' });
  assert.equal(await unconfigured.init(), false);
  assert.deepEqual(await unconfigured.getPaywallData(), { isConfigured: false, offeringIdentifier: null, plans: {} });
  await assert.rejects(unconfigured.restorePurchases(), /not configured/);
  assert.equal(missing.configurations.length, 0);
});

test('paywall uses exact offering, localized prices and confirmed iOS trial eligibility', async () => {
  const env = native();
  const client = env.createRevenueCat({ ...config, offeringId: 'main' });
  const data = await client.getPaywallData();
  assert.equal(data.offeringIdentifier, 'main');
  assert.equal(data.plans.yearly.price, '$10.00');
  assert.equal(data.plans.yearly.hasFreeTrial, true);
  assert.equal(data.plans.monthly.hasFreeTrial, false);
  assert.equal(data.plans.monthly.trialPeriodNumberOfUnits, null);
  assert.equal(data.plans.oneTime.hasFreeTrial, false);
  assert.deepEqual(await env.createRevenueCat({ ...config, offeringId: 'missing' }).getPaywallData(), {
    isConfigured: true, offeringIdentifier: null, plans: {},
  });
});

test('trial eligibility failures keep plans but do not promise a trial', async () => {
  const env = native();
  env.sdk.checkTrialOrIntroductoryPriceEligibility = async () => { throw new Error('offline'); };
  const log = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    const data = await env.createRevenueCat(config).getPaywallData();
    assert.equal(Object.keys(data.plans).length, 4);
    assert.equal(data.plans.yearly.hasFreeTrial, false);
    assert.equal(errors.length, 1);
  } finally { console.error = log; }
});

test('Android trials use eligible default option, not iOS introPrice', async () => {
  const env = native('android');
  env.offering.annual.product.defaultOption = {
    freePhase: { price: { amountMicros: 0 }, billingPeriod: { value: 1, unit: 'WEEK' }, billingCycleCount: 2 },
  };
  env.sdk.checkTrialOrIntroductoryPriceEligibility = () => { throw new Error('iOS-only call'); };
  const data = await env.createRevenueCat(config).getPaywallData();
  assert.equal(env.configurations[0].apiKey, 'goog_example');
  assert.equal(data.plans.yearly.trialPeriodNumberOfUnits, 2);
  assert.equal(data.plans.yearly.trialPeriodUnit, 'WEEK');
  assert.equal(data.plans.monthly.hasFreeTrial, false);
});

test('custom weekly periods supported; unknown packages never misclassified as lifetime', async () => {
  const env = native();
  env.offering.annual = env.offering.monthly = env.offering.lifetime = env.offering.weekly = null;
  const unknown = pkg('CUSTOM', null, 'unknown');
  unknown.product.productType = 'UNKNOWN';
  env.offering.availablePackages = [unknown, pkg('CUSTOM', 'P1W', 'weekly'), pkg('CUSTOM', 'P12M', 'custom-year')];
  const data = await env.createRevenueCat(config).getPaywallData();
  assert.deepEqual(Object.keys(data.plans), ['yearly', 'weekly']);
  assert.equal(data.plans.yearly.productId, 'custom-year');
  assert.equal(data.plans.weekly.productId, 'weekly');
});

test('explicit plan never silently falls back to a different purchase; default order preserved', async () => {
  const env = native();
  env.offering.monthly = null;
  env.offering.availablePackages = [env.offering.annual, env.offering.lifetime];
  const client = env.createRevenueCat(config);
  await assert.rejects(client.purchasePlan('__proto__'), /Unsupported billing cycle/);
  await assert.rejects(client.purchasePlan(null), /Unsupported billing cycle/);
  await assert.rejects(client.purchasePlan('monthly'), /requested billing cycle/);
  assert.equal(env.purchased.length, 0);
  assert.deepEqual(await client.purchasePlan(), { isActive: true, cancelled: false });
  assert.equal(env.purchased[0], env.offering.lifetime);
  await client.purchasePlan('oneTime');
  assert.equal(env.purchased[1], env.offering.lifetime);
});

test('native priority includes weekly and skips absent packages without changing explicit purchases', async () => {
  const env = native();
  const client = env.createRevenueCat(config);
  const priority = [env.offering.lifetime, env.offering.annual, env.offering.monthly, env.offering.weekly];
  const cycles = ['oneTime', 'yearly', 'monthly', 'weekly'];
  const fields = ['lifetime', 'annual', 'monthly', 'weekly'];
  for (let first = 0; first < priority.length; first++) {
    env.offering.availablePackages = priority.slice(first);
    fields.forEach((field, index) => { env.offering[field] = index >= first ? priority[index] : null; });
    const data = await client.getPaywallData();
    assert.deepEqual(Object.keys(data.plans), cycles.slice(first));
    await client.purchasePlan();
    assert.equal(env.purchased.at(-1), priority[first]);
  }
  await client.purchasePlan('weekly');
  assert.equal(env.purchased.at(-1), priority[3]);
  env.offering.weekly = null;
  env.offering.availablePackages = [];
  await assert.rejects(client.purchasePlan('weekly'), /requested billing cycle/);
  await assert.rejects(client.purchasePlan(), /requested billing cycle/);
});

test('purchase cancellation is distinct from pending entitlement and SDK errors', async () => {
  const env = native();
  const client = env.createRevenueCat(config);
  for (const error of [{ code: '1' }, { userCancelled: true }]) {
    env.sdk.purchasePackage = async () => { throw error; };
    assert.deepEqual(await client.purchasePlan('monthly'), { isActive: false, cancelled: true });
  }
  env.sdk.purchasePackage = async () => ({ customerInfo: info(false) });
  assert.deepEqual(await client.purchasePlan('monthly'), { isActive: false, cancelled: false });
  env.sdk.purchasePackage = async () => { throw new Error('store failed'); };
  await assert.rejects(client.purchasePlan(), /store failed/);
});

test('sync, restore and listener persist active, revoked and missing entitlements in order', async () => {
  const env = native();
  const updates = [];
  const client = env.createRevenueCat({ ...config, onEntitlementChange: async (...args) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    updates.push(args);
  } });
  assert.equal(await client.syncEntitlement(), true);
  env.sdk.restorePurchases = async () => info(false);
  assert.equal(await client.restorePurchases(), false);
  const listener = [...env.listeners][0];
  listener(info());
  listener({ entitlements: { all: {} } });
  env.sdk.getCustomerInfo = async () => ({ entitlements: { all: {} } });
  assert.equal(await client.syncEntitlement(), false);
  assert.deepEqual(updates.map(([active]) => active), [true, false, true, false, false]);
  assert.deepEqual(updates[3], [false, null]);
  env.sdk.restorePurchases = async () => { throw new Error('restore offline'); };
  await assert.rejects(client.restorePurchases(), /restore offline/);
  client.dispose();
});

test('host cache failure logged without turning a successful store transaction into purchase failure', async () => {
  const env = native();
  const client = env.createRevenueCat({ ...config, onEntitlementChange: () => { throw new Error('disk full'); } });
  const log = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    assert.deepEqual(await client.purchasePlan('yearly'), { isActive: true, cancelled: false });
    assert.equal(errors.length, 1);
  } finally { console.error = log; }
});

test('optional customer center stays out of core; native presenter requires initialization', async () => {
  const path = require.resolve('../dist/customer-center.native');
  const load = Module._load;
  let presented = 0;
  Module._load = function (request, ...args) {
    if (request === 'react-native-purchases-ui') return { presentCustomerCenter: async () => { presented++; } };
    return load.call(this, request, ...args);
  };
  let presentRevenueCatCustomerCenter;
  try { ({ presentRevenueCatCustomerCenter } = require(path)); } finally { Module._load = load; }
  await assert.rejects(presentRevenueCatCustomerCenter({ init: async () => false }), /not configured/);
  await presentRevenueCatCustomerCenter({ init: async () => true });
  assert.equal(presented, 1);
  const web = require('../dist/customer-center');
  await assert.rejects(web.presentRevenueCatCustomerCenter({}), /unavailable/);
});

test('Metro resolves native core and optional UI on iOS/Android, safe fallbacks on web', () => {
  const { resolve } = require('metro-resolver');
  const root = path.resolve(__dirname, '..');
  const manifest = require('../package.json');
  const context = {
    originModulePath: path.join(root, 'example', 'App.tsx'),
    allowHaste: false,
    assetExts: new Set(),
    sourceExts: ['js', 'json'],
    mainFields: ['react-native', 'browser', 'main'],
    nodeModulesPaths: [],
    extraNodeModules: { '@asugan/expo-kit': root },
    customResolverOptions: {},
    disableHierarchicalLookup: false,
    dev: true,
    doesFileExist: (file) => fs.existsSync(file) && fs.statSync(file).isFile(),
    fileSystemLookup: (file) => fs.existsSync(file)
      ? { exists: true, type: fs.statSync(file).isDirectory() ? 'd' : 'f', realPath: fs.realpathSync(file) }
      : { exists: false },
    getPackage: (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null,
    getPackageForModule: (file) => file.startsWith(root + path.sep)
      ? { rootPath: root, packageJson: manifest, packageRelativePath: path.relative(root, file) } : null,
    redirectModulePath: (file) => file,
    resolveHasteModule: () => null,
    resolveHastePackage: () => null,
    resolveAsset: () => null,
    unstable_conditionNames: ['require'],
    unstable_conditionsByPlatform: { ios: ['react-native'], android: ['react-native'], web: ['browser'] },
    unstable_enablePackageExports: true,
    unstable_incrementalResolution: false,
    unstable_logWarning: (warning) => assert.fail(warning),
  };
  for (const platform of ['ios', 'android', 'web']) {
    const ctx = { ...context, preferNativePlatform: platform !== 'web' };
    const entry = resolve(ctx, '@asugan/expo-kit', platform);
    assert.equal(entry.filePath, path.join(root, 'dist/index.js'));
    const core = resolve({ ...ctx, originModulePath: entry.filePath }, './revenuecat', platform);
    assert.equal(core.filePath, path.join(root, `dist/revenuecat${platform === 'web' ? '' : '.native'}.js`));
    const ui = resolve(ctx, '@asugan/expo-kit/customer-center', platform);
    assert.equal(ui.filePath, path.join(root, `dist/customer-center${platform === 'web' ? '' : '.native'}.js`));
    const paywall = resolve(ctx, '@asugan/expo-kit/paywall', platform);
    assert.equal(paywall.filePath, path.join(root, 'dist/paywall.js'));
    const success = resolve(ctx, '@asugan/expo-kit/purchase-success-modal', platform);
    assert.equal(success.filePath, path.join(root, 'dist/purchase-success-modal.js'));
  }
});
