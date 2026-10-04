const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const React = require('react');
const { act, create } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
let dimensions = { width: 390, height: 844, fontScale: 1, scale: 3 };
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === 'react-native') return {
    ActivityIndicator: 'ActivityIndicator', Image: 'Image', Modal: 'Modal', Pressable: 'Pressable',
    ScrollView: 'ScrollView', Text: 'Text', View: 'View',
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
    useWindowDimensions: () => dimensions,
  };
  if (request === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', SafeAreaProvider: 'SafeAreaProvider' };
  return load.call(this, request, ...args);
};
let Paywall;
try { ({ Paywall } = require('../dist/paywall')); } finally { Module._load = load; }

const plan = (cycle) => ({
  cycle, productId: cycle, title: cycle, price: '$49.99', priceValue: 49.99,
  pricePerMonth: '$4.17', currencyCode: 'USD',
  hasFreeTrial: false, trialPeriodNumberOfUnits: null, trialPeriodUnit: null,
});
const yearly = plan('yearly');
const monthly = plan('monthly');
const oneTime = plan('oneTime');
const weekly = plan('weekly');
const data = { isConfigured: true, offeringIdentifier: 'main', plans: { yearly, monthly, oneTime, weekly } };
const events = [];
const props = {
  title: 'Wicca Premium', subtitle: 'Your own book of shadows',
  logo: { uri: 'https://example.com/logo.png' },
  features: [{ id: 'library', text: 'Full library access' }, { id: 'tarot', text: 'Advanced tarot', icon: 'icon-slot' }],
  theme: {
    background: '#181611', surface: '#26231C', text: '#F5F2E7', muted: '#CCC3AD',
    primary: '#D3B765', onPrimary: '#181611', border: '#514A3D', fontFamily: 'AppFont',
  },
  copy: {
    close: 'Close paywall', loading: 'Loading plans', empty: 'No plans available', retry: 'Retry plans',
    continue: 'Unlock premium', premiumActive: 'Premium active', restore: 'Restore purchases', recommended: 'Recommended',
    plan: (plan) => ({ title: plan.cycle, subtitle: 'Localized description',
      period: plan.cycle === 'yearly' ? 'per year' : '' }),
    purchase: (plan) => `Buy ${plan.cycle}`,
    billingDisclosure: (plan) => `${plan.price} ${plan.cycle}, renewal terms`,
  },
  data,
  onSelectPlan: (plan) => events.push(['select', plan.cycle]),
  onPurchase: (plan) => events.push(['purchase', plan.cycle]),
  onRestore: () => events.push(['restore']), onClose: () => events.push(['close']),
  onRetry: () => events.push(['retry']),
  terms: { label: 'Terms', onPress: () => events.push(['terms']) },
  privacy: { label: 'Privacy', onPress: () => events.push(['privacy']) },
};
const controls = (renderer, role) => renderer.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === role);
const button = (renderer, label) => controls(renderer, 'button').find((node) => node.props.accessibilityLabel === label);
const texts = (renderer) => renderer.root.findAllByType('Text').map((node) => node.props.children);
async function render(overrides = {}) {
  let renderer;
  await act(() => { renderer = create(React.createElement(Paywall, { ...props, ...overrides })); });
  return renderer;
}
async function update(renderer, overrides = {}) {
  await act(() => renderer.update(React.createElement(Paywall, { ...props, ...overrides })));
}
async function cleanup(renderer) { await act(() => renderer.unmount()); }

test('branded content, default plan, selection, purchase, restore, close, and legal links work', async () => {
  events.length = 0;
  const renderer = await render();
  assert.equal(renderer.root.findByType('SafeAreaView').props.style[1].backgroundColor, props.theme.background);
  assert.equal(renderer.root.findByType('Image').props.source, props.logo);
  assert.ok(texts(renderer).includes(props.title));
  assert.ok(texts(renderer).includes('Full library access'));
  assert.ok(texts(renderer).includes('$49.99 oneTime, renewal terms'));
  const radios = controls(renderer, 'radio');
  assert.equal(radios.length, 4);
  assert.equal(radios[0].props.accessibilityState.checked, true);
  await act(() => radios[1].props.onPress());
  assert.equal(controls(renderer, 'radio')[1].props.accessibilityState.checked, true);
  await act(() => button(renderer, 'Buy yearly').props.onPress());
  await act(() => button(renderer, 'Restore purchases').props.onPress());
  await act(() => button(renderer, 'Close paywall').props.onPress());
  for (const link of controls(renderer, 'link')) await act(() => link.props.onPress());
  assert.deepEqual(events, [['select', 'yearly'], ['purchase', 'yearly'], ['restore'], ['close'], ['terms'], ['privacy']]);
  await cleanup(renderer);
});

test('a removed selected plan falls back to an available displayed plan, never a hidden cycle', async () => {
  const renderer = await render();
  await act(() => controls(renderer, 'radio')[2].props.onPress());
  await update(renderer, { data: { ...data, plans: { yearly } }, defaultCycle: 'oneTime' });
  assert.equal(controls(renderer, 'radio').length, 1);
  assert.equal(controls(renderer, 'radio')[0].props.accessibilityState.checked, true);
  assert.equal(button(renderer, 'Buy yearly').props.disabled, false);
  await update(renderer, { planOrder: ['monthly', 'monthly'], defaultCycle: 'yearly' });
  assert.equal(controls(renderer, 'radio').length, 1);
  assert.equal(button(renderer, 'Buy monthly').props.disabled, false);
  await cleanup(renderer);
});

test('priority controls order, initial selection and one recommendation, skipping every missing plan', async () => {
  const renderer = await render();
  const order = ['oneTime', 'yearly', 'monthly', 'weekly'];
  for (let mask = 0; mask < 16; mask++) {
    const available = order.filter((_, index) => mask & (1 << index));
    const plans = Object.fromEntries(available.map((cycle) => [cycle, data.plans[cycle]]));
    await update(renderer, { data: { ...data, plans } });
    const radios = controls(renderer, 'radio');
    assert.deepEqual(radios.map((node) => node.props.accessibilityLabel.split(',')[0]), available);
    assert.equal(texts(renderer).filter((text) => text === 'Recommended').length, available.length ? 1 : 0);
    if (available.length) {
      assert.equal(radios[0].props.accessibilityState.checked, true);
      assert.ok(radios[0].props.accessibilityLabel.includes('Recommended'));
    }
  }
  await update(renderer);
  await act(() => controls(renderer, 'radio')[3].props.onPress());
  assert.equal(button(renderer, 'Buy weekly').props.disabled, false);
  assert.ok(controls(renderer, 'radio')[0].props.accessibilityLabel.includes('Recommended'));
  assert.ok(!controls(renderer, 'radio')[3].props.accessibilityLabel.includes('Recommended'));
  // Reordering or hiding cards must not recommend a lower-priority visible plan.
  const fresh = await render({ planOrder: ['weekly', 'yearly'] });
  assert.equal(button(fresh, 'Buy yearly').props.disabled, false);
  assert.ok(controls(fresh, 'radio')[1].props.accessibilityLabel.includes('Recommended'));
  await cleanup(fresh);
  await cleanup(renderer);
});

test('loading, error/retry, empty, and unconfigured states do not permit purchases', async () => {
  const renderer = await render({ data: null, loading: true });
  assert.ok(texts(renderer).includes('Loading plans'));
  assert.ok(!texts(renderer).includes('No plans available'));
  assert.equal(button(renderer, 'Unlock premium').props.disabled, true);
  assert.equal(button(renderer, 'Restore purchases').props.disabled, true);
  await update(renderer, { error: 'Store offline' });
  assert.equal(controls(renderer, 'radio').length, 0);
  assert.ok(texts(renderer).includes('Store offline'));
  const count = events.length;
  await act(() => button(renderer, 'Retry plans').props.onPress());
  assert.deepEqual(events[count], ['retry']);
  assert.equal(button(renderer, 'Buy oneTime').props.disabled, true);
  await update(renderer, { data: { ...data, plans: {} } });
  assert.ok(texts(renderer).includes('No plans available'));
  assert.equal(button(renderer, 'Unlock premium').props.disabled, true);
  // Restoring an existing entitlement must remain possible even without an offering.
  assert.equal(button(renderer, 'Restore purchases').props.disabled, false);
  await update(renderer, { data: { ...data, isConfigured: false } });
  assert.equal(controls(renderer, 'radio').length, 0);
  assert.equal(button(renderer, 'Restore purchases').props.disabled, true);
  await cleanup(renderer);
});

test('busy/premium states block actions, preserve accessible labels, and recover after failure', async () => {
  events.length = 0;
  const renderer = await render({ purchasing: true });
  const buy = button(renderer, 'Buy oneTime');
  assert.equal(buy.props.accessibilityState.busy, true);
  assert.equal(buy.props.disabled, true);
  await act(() => buy.props.onPress());
  await act(() => controls(renderer, 'radio')[1].props.onPress());
  await act(() => button(renderer, 'Restore purchases').props.onPress());
  await act(() => button(renderer, 'Close paywall').props.onPress());
  assert.deepEqual(events, []);
  await update(renderer, { restoring: true });
  assert.equal(button(renderer, 'Restore purchases').props.accessibilityState.busy, true);
  assert.equal(button(renderer, 'Buy oneTime').props.disabled, true);
  await update(renderer, { isPremium: true });
  assert.equal(button(renderer, 'Premium active').props.disabled, true);
  await update(renderer, { error: 'Purchase failed' });
  assert.ok(texts(renderer).includes('Purchase failed'));
  await update(renderer);
  assert.equal(button(renderer, 'Buy oneTime').props.disabled, false);
  await act(() => button(renderer, 'Buy oneTime').props.onPress());
  assert.deepEqual(events, [['purchase', 'oneTime']]);
  await cleanup(renderer);
});

test('success modal requires explicit success and active access, and supports every close path', async () => {
  const renderer = await render({ isPremium: true });
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  let closed = 0;
  const success = {
    title: 'Premium unlocked', message: 'All features are now available.', buttonLabel: 'Continue',
    onClose: () => { closed++; },
  };
  await update(renderer, { success, isPremium: false });
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await update(renderer, { success, isPremium: true });
  const modal = renderer.root.findByType('Modal');
  assert.equal(modal.props.animationType, 'fade');
  assert.ok(texts(renderer).includes(success.title));
  assert.ok(texts(renderer).includes(success.message));
  assert.ok(texts(renderer).includes('✓'));
  assert.ok(renderer.root.findAllByType('View').some((node) => node.props.accessibilityViewIsModal));
  await act(() => modal.props.onRequestClose());
  await act(() => button(renderer, 'Continue').props.onPress());
  const backdrop = renderer.root.findAllByType('Pressable').find((node) => node.props.accessible === false);
  await act(() => backdrop.props.onPress());
  assert.equal(closed, 3);
  await update(renderer, { isPremium: true });
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await cleanup(renderer);
});

test('standalone modal supports restore copy, theme, custom icon and long scrollable content', async () => {
  const { PurchaseSuccessModal } = require('../dist/purchase-success-modal');
  const message = 'Long localized purchase confirmation. '.repeat(50);
  let renderer;
  const modalProps = { visible: true, theme: props.theme, title: 'Purchases restored', message,
    buttonLabel: 'Done', onClose: () => {}, icon: React.createElement('CustomIcon') };
  await act(() => { renderer = create(React.createElement(PurchaseSuccessModal, modalProps)); });
  assert.equal(renderer.root.findAllByType('CustomIcon').length, 1);
  assert.ok(texts(renderer).includes(message));
  const messageNode = renderer.root.findAllByType('Text').find((node) => node.props.children === message);
  assert.equal(messageNode.props.selectable, true);
  assert.equal(messageNode.props.numberOfLines, undefined);
  const scroll = renderer.root.findByType('ScrollView');
  assert.ok(!scroll.findAllByType('Pressable').some((node) => node.props.accessibilityLabel === 'Done'));
  const card = renderer.root.findAllByType('View').find((node) => node.props.accessibilityViewIsModal);
  assert.equal(card.props.style[1].backgroundColor, props.theme.surface);
  await act(() => renderer.update(React.createElement(PurchaseSuccessModal, { ...modalProps, visible: false })));
  assert.equal(renderer.toJSON(), null);
  await cleanup(renderer);
});

test('theme, artwork, ordering, optional slots, long text, and accessibility sizes adapt', async () => {
  dimensions = { ...dimensions, width: 320, fontScale: 2 };
  const light = { ...props.theme, background: '#FFF', text: '#111', radius: 12, headingFontFamily: 'Heading' };
  const longTitle = 'A long localized premium title '.repeat(5);
  const renderer = await render({
    title: longTitle, theme: light, defaultCycle: 'monthly', planOrder: ['yearly', 'monthly'],
    logo: undefined, subtitle: undefined, onClose: undefined,
    footer: React.createElement('Text', {}, 'Custom footer'), style: { paddingHorizontal: 4 },
  });
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  assert.equal(button(renderer, 'Close paywall'), undefined);
  assert.ok(texts(renderer).includes(longTitle));
  assert.ok(texts(renderer).includes('Custom footer'));
  assert.equal(button(renderer, 'Buy monthly').props.disabled, false);
  assert.deepEqual(renderer.root.findByType('SafeAreaView').props.style.at(-1), { paddingHorizontal: 4 });
  assert.ok(renderer.root.findAllByType('View').some((node) =>
    Array.isArray(node.props.style) && node.props.style.some((style) => style?.flexDirection === 'column')));
  await cleanup(renderer);
  dimensions = { ...dimensions, width: 390, fontScale: 1 };
});
