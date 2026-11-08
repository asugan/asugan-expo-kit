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

test('trial timeline replaces the hero copy only when a plan has a trial and copy is provided', async () => {
  const trialYearly = { ...yearly, hasFreeTrial: true, trialPeriodNumberOfUnits: 7, trialPeriodUnit: 'DAY' };
  const seen = [];
  const trialTimeline = (plan) => {
    seen.push(plan.cycle);
    return {
      title: 'How your trial works', subtitle: `7 days free, then ${plan.price}`,
      steps: [
        { id: 'today', title: 'Today', text: 'Unlock everything' },
        { id: 'remind', title: 'In 5 days', text: 'We remind you', icon: 'bell-icon' },
        { id: 'charge', title: 'In 7 days', text: `You are charged ${plan.price}` },
      ],
    };
  };
  const trialData = { ...data, plans: { ...data.plans, yearly: trialYearly } };

  // Selected lifetime has no trial: timeline describes the first trial plan and replaces the logo.
  const renderer = await render({ data: trialData, copy: { ...props.copy, trialTimeline } });
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  assert.ok(texts(renderer).includes('How your trial works'));
  assert.ok(!texts(renderer).includes(props.title));
  assert.ok(!texts(renderer).includes(props.subtitle));
  assert.ok(texts(renderer).includes('You are charged $49.99'));
  // Steps without an icon render a plain dot; the provided icon is kept.
  assert.ok(![1, 2, 3].some((number) => texts(renderer).includes(number)));
  assert.equal(renderer.root.findAll((node) => node.props.children === 'bell-icon').length > 0, true);
  assert.deepEqual([...new Set(seen)], ['yearly']);
  await cleanup(renderer);

  // No trial plans, or no timeline copy: the original logo hero is unchanged.
  for (const overrides of [{ copy: { ...props.copy, trialTimeline } }, { data: trialData }]) {
    const plain = await render(overrides);
    assert.ok(texts(plain).includes(props.title));
    assert.ok(texts(plain).includes(props.subtitle));
    assert.ok(!texts(plain).includes('How your trial works'));
    assert.equal(plain.root.findByType('Image').props.source, props.logo);
    await cleanup(plain);
  }

  // Opt-in: keep the logo and show an eyebrow above the trial title.
  const branded = await render({ data: trialData, copy: { ...props.copy,
    trialTimeline: (plan) => ({ ...trialTimeline(plan), eyebrow: 'APP PRO', showLogo: true }) } });
  assert.equal(branded.root.findByType('Image').props.source, props.logo);
  assert.ok(texts(branded).includes('APP PRO'));
  assert.ok(texts(branded).includes('How your trial works'));
  await cleanup(branded);

  // titleStyle is applied to the hero title.
  const styled = await render({ titleStyle: { fontSize: 20 } });
  const heading = styled.root.findAll((node) => node.props.accessibilityRole === 'header')[0];
  assert.deepEqual(heading.props.style.at(-1), { fontSize: 20 });
  await cleanup(styled);

  // theme.selected tints only the selected plan card.
  const tinted = await render({ theme: { ...props.theme, selected: '#3A3020' } });
  const cardColors = controls(tinted, 'radio').map((node) => {
    const style = typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
    return style[2].backgroundColor;
  });
  assert.deepEqual(cardColors, ['#3A3020', props.theme.surface, props.theme.surface, props.theme.surface]);
  await cleanup(tinted);
});

test('purchase button and legal links stay outside the scroll area; trial notice follows the selected plan', async () => {
  const trialYearly = { ...yearly, hasFreeTrial: true, trialPeriodNumberOfUnits: 7, trialPeriodUnit: 'DAY' };
  const trialNotice = (plan) => ({ text: `Reminder for ${plan.cycle}`, icon: 'bell-icon' });
  const renderer = await render({
    data: { ...data, plans: { ...data.plans, yearly: trialYearly } },
    copy: { ...props.copy, trialNotice },
  });
  const scroll = renderer.root.findByType('ScrollView');
  assert.equal(scroll.findAll((node) => node.props.accessibilityLabel === 'Buy oneTime').length, 0);
  assert.ok(button(renderer, 'Buy oneTime'));
  for (const label of ['Close paywall', 'Restore purchases', 'Terms', 'Privacy']) {
    assert.equal(scroll.findAll((node) => node.props.accessibilityLabel === label).length, 0);
    assert.equal(renderer.root.findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === label).length, 1);
  }
  // Lifetime is selected and has no trial: no notice.
  assert.ok(!texts(renderer).includes('Reminder for yearly'));
  await act(() => controls(renderer, 'radio')[1].props.onPress());
  assert.ok(texts(renderer).includes('Reminder for yearly'));
  // Hidden once premium is active, or when the host returns null.
  await update(renderer, { data: { ...data, plans: { yearly: trialYearly } }, copy: { ...props.copy, trialNotice }, isPremium: true });
  assert.ok(!texts(renderer).includes('Reminder for yearly'));
  await update(renderer, { data: { ...data, plans: { yearly: trialYearly } }, copy: { ...props.copy, trialNotice: () => null } });
  assert.ok(!texts(renderer).includes('Reminder for yearly'));
  await cleanup(renderer);
});

test('plans and actions sit in the sticky footer on roomy screens and scroll inline on short or zoomed ones', async () => {
  const radiosInScroll = (renderer) => renderer.root.findByType('ScrollView')
    .findAll((node) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio').length;
  const buyInScroll = (renderer) => renderer.root.findByType('ScrollView')
    .findAll((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Buy oneTime').length;
  // Common ~700pt Android phones (window height minus status bar) still get footer plans.
  for (const height of [844, 667, 640]) {
    dimensions = { ...dimensions, height };
    const renderer = await render();
    assert.equal(controls(renderer, 'radio').length, 4);
    assert.equal(radiosInScroll(renderer), 0);
    assert.equal(buyInScroll(renderer), 0);
    await cleanup(renderer);
  }
  dimensions = { width: 390, height: 844, fontScale: 1, scale: 3 };
  for (const next of [{ height: 560 }, { fontScale: 2 }, { width: 320 }]) {
    dimensions = { ...dimensions, ...next };
    const small = await render();
    assert.equal(radiosInScroll(small), 4);
    // No sticky footer: the purchase button, disclosure and legal links follow the plans in the scroll.
    assert.equal(buyInScroll(small), 1);
    assert.ok(small.root.findByType('ScrollView').findAllByType('Text')
      .some((node) => node.props.children === '$49.99 oneTime, renewal terms'));
    await cleanup(small);
    dimensions = { width: 390, height: 844, fontScale: 1, scale: 3 };
  }
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
    await update(renderer, { data: { ...data, plans }, planOrder: [...order].reverse() });
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
  assert.deepEqual(controls(renderer, 'radio').map((node) => node.props.accessibilityLabel.split(',')[0]), order);
  assert.ok(controls(renderer, 'radio')[0].props.accessibilityLabel.includes('Recommended'));
  assert.ok(!controls(renderer, 'radio')[3].props.accessibilityLabel.includes('Recommended'));
  // Host order only filters cards; priority still controls their display order.
  const fresh = await render({ planOrder: ['weekly', 'yearly', 'yearly'] });
  assert.equal(button(fresh, 'Buy yearly').props.disabled, false);
  assert.deepEqual(controls(fresh, 'radio').map((node) => node.props.accessibilityLabel.split(',')[0]), ['yearly', 'weekly']);
  assert.ok(controls(fresh, 'radio')[0].props.accessibilityLabel.includes('Recommended'));
  await cleanup(fresh);
  await cleanup(renderer);
});

test('recommendation is an inline pill next to the plan title; price line combines price, period and subtitle', async () => {
  const renderer = await render({ data: { ...data, plans: { monthly, yearly } }, planOrder: ['monthly', 'yearly'] });
  const card = controls(renderer, 'radio').find((node) => node.props.accessibilityLabel.startsWith('yearly,'));
  const title = card.findAllByType('Text').find((node) => node.props.children === 'yearly');
  const badge = card.findAllByType('Text').find((node) => node.props.children === 'Recommended');
  // Compare identity as a boolean: failures must not dump the entire React Fiber graph.
  assert.ok(badge.parent.parent === title.parent, 'badge must share the title row');
  const row = title.parent.props.style;
  assert.equal(row.flexDirection, 'row');
  assert.equal(row.flexWrap, 'wrap');
  assert.equal(badge.parent.props.style[0].position, undefined);
  const priceLine = card.findAllByType('Text').find((node) => Array.isArray(node.props.children)
    && node.props.children.includes(' · Localized description'));
  assert.ok(priceLine, 'price, period and subtitle share one line');
  assert.ok(priceLine.findAllByType('Text').some((node) => node.props.children === '$49.99'));
  assert.ok(priceLine.props.children.includes('per year'));
  // A per-plan badge replaces the shared recommendation; without `recommended` only per-plan badges show.
  await update(renderer, {
    data: { ...data, plans: { monthly, yearly } },
    copy: { ...props.copy, recommended: undefined,
      plan: (plan) => ({ title: plan.cycle, badge: plan.cycle === 'monthly' ? '3 days free' : undefined }) },
  });
  assert.ok(texts(renderer).includes('3 days free'));
  assert.ok(!texts(renderer).includes('Recommended'));
  assert.ok(controls(renderer, 'radio').find((node) => node.props.accessibilityLabel.startsWith('monthly,'))
    .props.accessibilityLabel.endsWith('3 days free'));
  // A muted per-plan badge is an outline in muted text, not a filled primary pill.
  await update(renderer, {
    data: { ...data, plans: { monthly, yearly } },
    copy: { ...props.copy, recommended: undefined,
      plan: (plan) => ({ title: plan.cycle, badge: plan.cycle === 'monthly' ? 'No trial' : undefined, badgeTone: 'muted' }) },
  });
  const muted = renderer.root.findAllByType('Text').find((node) => node.props.children === 'No trial');
  assert.equal(muted.props.style[1].color, props.theme.muted);
  assert.equal(muted.parent.props.style[1].backgroundColor, undefined);
  await cleanup(renderer);
});

test('loading, error/retry, empty, and unconfigured states do not permit purchases', async () => {
  // Loading shows only a spinner and the close button: no logo hero, plans, or actions.
  const renderer = await render({ loading: true });
  const spinner = renderer.root.findAllByType('ActivityIndicator');
  assert.equal(spinner.length, 1);
  assert.equal(spinner[0].props.accessibilityLabel, 'Loading plans');
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  assert.equal(renderer.root.findAllByType('ScrollView').length, 0);
  assert.ok(!texts(renderer).includes(props.title));
  assert.equal(button(renderer, 'Unlock premium'), undefined);
  assert.equal(button(renderer, 'Restore purchases'), undefined);
  assert.ok(button(renderer, 'Close paywall'));
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

test('offering errors show localized retry feedback without disabling restore', async () => {
  events.length = 0;
  const failed = { ...data, plans: {}, error: new Error('Internal SDK details') };
  const renderer = await render({ data: failed });
  assert.ok(texts(renderer).includes('No plans available'));
  assert.ok(!texts(renderer).includes('Internal SDK details'));
  assert.equal(controls(renderer, 'radio').length, 0);
  assert.equal(button(renderer, 'Unlock premium').props.disabled, true);
  assert.equal(button(renderer, 'Restore purchases').props.disabled, false);
  await act(() => button(renderer, 'Retry plans').props.onPress());
  await act(() => button(renderer, 'Restore purchases').props.onPress());
  assert.deepEqual(events, [['retry'], ['restore']]);
  await update(renderer, { data: failed, error: 'Localized store error' });
  assert.ok(texts(renderer).includes('Localized store error'));
  await update(renderer, { data: { ...data, error: failed.error } });
  assert.equal(controls(renderer, 'radio').length, 0);
  assert.equal(button(renderer, 'Buy oneTime').props.disabled, true);
  await update(renderer);
  assert.equal(button(renderer, 'Buy oneTime').props.disabled, false);
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
  // Large text keeps plans in the scroll area so the sticky footer cannot outgrow the screen.
  assert.equal(renderer.root.findByType('ScrollView').findAll((node) =>
    node.type === 'Pressable' && node.props.accessibilityRole === 'radio').length, 2);
  await cleanup(renderer);
  dimensions = { ...dimensions, width: 390, fontScale: 1 };
});
