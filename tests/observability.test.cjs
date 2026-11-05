const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');

globalThis.__DEV__ = false;

function load(file, mocks) {
  const resolved = require.resolve(file);
  delete require.cache[resolved];
  const original = Module._load;
  Module._load = function (request, ...args) {
    if (request in mocks) return mocks[request];
    return original.call(this, request, ...args);
  };
  try { return require(resolved); } finally { Module._load = original; }
}

function aptabase({ initThrows = false, trackThrows = false, platform = 'ios' } = {}) {
  const inits = [];
  const events = [];
  const sdk = {
    init: (...args) => { if (initThrows) throw new Error('init failed'); inits.push(args); },
    trackEvent: (...args) => { if (trackThrows) throw new Error('track failed'); events.push(args); },
  };
  const { createAnalytics } = load('../dist/analytics', {
    '@aptabase/react-native': sdk,
    'react-native': { Platform: { OS: platform } },
  });
  return { createAnalytics, inits, events };
}

test('analytics is a no-op without an app key and never initializes the SDK', () => {
  const { createAnalytics, inits, events } = aptabase();
  for (const appKey of [undefined, '', '   ']) {
    const analytics = createAnalytics({ appKey });
    assert.equal(analytics.init(), false);
    analytics.trackEvent('paywall_viewed');
  }
  assert.deepEqual(inits, []);
  assert.deepEqual(events, []);
});

test('analytics initializes once lazily with trimmed key and optional host', () => {
  const { createAnalytics, inits, events } = aptabase();
  const analytics = createAnalytics({ appKey: ' A-EU-1 ', host: ' ' });
  analytics.trackEvent('purchase_started', { cycle: 'yearly', trial: true });
  analytics.trackEvent('purchase_succeeded');
  assert.equal(analytics.init(), true);
  assert.deepEqual(inits, [['A-EU-1', undefined]]);
  assert.deepEqual(events, [['purchase_started', { cycle: 'yearly', trial: true }], ['purchase_succeeded', {}]]);

  const selfHosted = aptabase();
  selfHosted.createAnalytics({ appKey: 'A-SH-1', host: ' https://a.example ' }).init();
  assert.deepEqual(selfHosted.inits, [['A-SH-1', { host: 'https://a.example' }]]);
});

test('analytics reports false for configs the SDK would silently reject', () => {
  const { createAnalytics, inits, events } = aptabase();
  for (const config of [{ appKey: 'not-a-key' }, { appKey: 'A-XX-1' }, { appKey: 'A-EU-1-2' }, { appKey: 'A-EU' },
    { appKey: 'A-SH-1' }, { appKey: 'A-SH-1', host: '  ' }]) {
    const analytics = createAnalytics(config);
    assert.equal(analytics.init(), false, config.appKey);
    analytics.trackEvent('paywall_viewed');
  }
  assert.deepEqual(inits, []);
  assert.deepEqual(events, []);
});

test('analytics is disabled outside iOS and Android, where the SDK would not send events', () => {
  for (const platform of ['web', 'windows']) {
    const { createAnalytics, inits, events } = aptabase({ platform });
    const analytics = createAnalytics({ appKey: 'A-EU-1' });
    assert.equal(analytics.init(), false, platform);
    analytics.trackEvent('paywall_viewed');
    assert.deepEqual(inits, []);
    assert.deepEqual(events, []);
  }
  assert.equal(aptabase({ platform: 'android' }).createAnalytics({ appKey: 'A-EU-1' }).init(), true);
});

test('analytics clients share one SDK config and reject a conflicting one', () => {
  const { createAnalytics, inits, events } = aptabase();
  const first = createAnalytics({ appKey: 'A-EU-1' });
  const same = createAnalytics({ appKey: ' A-EU-1 ' });
  const other = createAnalytics({ appKey: 'A-US-2' });
  const otherHost = createAnalytics({ appKey: 'A-EU-1', host: 'https://a.example' });
  assert.equal(first.init(), true);
  assert.equal(same.init(), true);
  assert.equal(other.init(), false);
  assert.equal(otherHost.init(), false);
  first.trackEvent('purchase_started');
  same.trackEvent('purchase_succeeded');
  other.trackEvent('purchase_failed');
  assert.deepEqual(inits, [['A-EU-1', undefined]]);
  assert.deepEqual(events.map(([name]) => name), ['purchase_started', 'purchase_succeeded']);
});

test('analytics SDK failures never reach the caller', () => {
  const failingInit = aptabase({ initThrows: true });
  const analytics = failingInit.createAnalytics({ appKey: 'A-EU-1' });
  assert.equal(analytics.init(), false);
  assert.doesNotThrow(() => analytics.trackEvent('purchase_failed'));

  const failingTrack = aptabase({ trackThrows: true });
  assert.doesNotThrow(() => failingTrack.createAnalytics({ appKey: 'A-EU-1' }).trackEvent('purchase_failed'));
});

function sentry(platform = 'ios') {
  const inits = [];
  const integration = { name: 'ReactNavigation' };
  const navigationOptions = [];
  const sdk = {
    init: (options) => inits.push(options),
    reactNavigationIntegration: (options) => { navigationOptions.push(options); return integration; },
  };
  const { initSentry } = load('../dist/sentry', {
    '@sentry/react-native': sdk,
    'react-native': { Platform: { OS: platform } },
  });
  return { initSentry, inits, integration, navigationOptions };
}

test('sentry uses shared quota defaults and navigation tracing', () => {
  const { initSentry, inits, integration, navigationOptions } = sentry();
  const result = initSentry({ dsn: ' https://key@sentry.example/1 ' });
  assert.equal(result.navigationIntegration, integration);
  assert.deepEqual(navigationOptions, [{ enableTimeToInitialDisplay: true }]);
  assert.deepEqual(inits, [{
    dsn: 'https://key@sentry.example/1',
    enabled: true,
    tracesSampleRate: 0.2,
    profilesSampleRate: 0,
    integrations: [integration],
  }]);
});

test('sentry is disabled without a DSN and on web; app options override defaults', () => {
  for (const dsn of [undefined, '', '  ']) {
    const { initSentry, inits } = sentry();
    initSentry({ dsn });
    assert.equal(inits[0].enabled, false);
    assert.equal(inits[0].dsn, undefined);
  }
  const web = sentry('web');
  web.initSentry({ dsn: 'https://key@sentry.example/1' });
  assert.equal(web.inits[0].enabled, false);

  const custom = sentry();
  custom.initSentry({ dsn: 'https://key@sentry.example/1', tracesSampleRate: 1, sendDefaultPii: false });
  assert.equal(custom.inits[0].tracesSampleRate, 1);
  assert.equal(custom.inits[0].sendDefaultPii, false);
  assert.equal(custom.inits[0].profilesSampleRate, 0);
});
