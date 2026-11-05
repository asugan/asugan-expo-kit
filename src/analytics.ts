// @ts-expect-error TS1479: SDK ships ESM-only .d.mts types for a CommonJS main; Metro loads the CJS build.
import { init as initAptabase, trackEvent as trackAptabaseEvent } from '@aptabase/react-native';

export type AnalyticsProperties = Record<string, string | number | boolean>;

/** Event names emitted by every app's subscription flow. Union them with app-specific events. */
export type PurchaseFunnelEvent =
  | 'premium_gate_shown'
  | 'paywall_viewed'
  | 'paywall_dismissed'
  | 'plan_selected'
  | 'purchase_started'
  | 'purchase_pending'
  | 'purchase_succeeded'
  | 'purchase_cancelled'
  | 'purchase_failed'
  | 'restore_started'
  | 'restore_succeeded'
  | 'restore_not_found'
  | 'restore_failed';

export type AnalyticsConfig = {
  /** Aptabase app key. Missing or blank keeps analytics a silent no-op. */
  appKey?: string;
  /** Self-hosted Aptabase URL. */
  host?: string;
};

export type AnalyticsClient<TEvent extends string> = {
  /** Returns whether events will be sent. Safe to call repeatedly. */
  init: () => boolean;
  trackEvent: (eventName: TEvent, properties?: AnalyticsProperties) => void;
};

// Aptabase keeps one process-wide client and replaces it on every init. Same config can share it; another cannot.
let sdkConfig: string | undefined;

// The SDK only logs (never throws) when it rejects a config, so check up front to report the truth.
// shortcut: mirrors @aptabase/react-native 0.6 validation (A-<US|EU|DEV|SH>-<id>), update if the key format changes.
function isValidConfig(appKey: string, host: string | undefined): boolean {
  const parts = appKey.split('-');
  return parts.length === 3 && ['US', 'EU', 'DEV', 'SH'].includes(parts[1]) && (parts[1] !== 'SH' || Boolean(host));
}

export function createAnalytics<TEvent extends string = string>(config: AnalyticsConfig): AnalyticsClient<TEvent> {
  const appKey = config.appKey?.trim();
  const host = config.host?.trim() || undefined;
  let state: 'idle' | 'ready' | 'disabled' = 'idle';

  function disable(reason: string, error?: unknown): false {
    state = 'disabled';
    if (__DEV__) console.warn(`[analytics] ${reason} Events are disabled.`, ...(error === undefined ? [] : [error]));
    return false;
  }

  function init(): boolean {
    if (state !== 'idle') return state === 'ready';
    if (!appKey) return disable('Aptabase app key is missing.');
    if (!isValidConfig(appKey, host)) return disable('Aptabase app key is invalid, or a self-hosted key has no host.');
    const requested = `${appKey}|${host ?? ''}`;
    if (sdkConfig !== undefined && sdkConfig !== requested) {
      return disable('Aptabase is already initialized with a different app key or host.');
    }
    try {
      // The SDK owns batching, queuing and anonymous sessions.
      if (sdkConfig === undefined) initAptabase(appKey, host ? { host } : undefined);
      sdkConfig = requested;
      state = 'ready';
      return true;
    } catch (error) {
      return disable('Aptabase initialization failed.', error);
    }
  }

  function trackEvent(eventName: TEvent, properties: AnalyticsProperties = {}): void {
    // Analytics must never interrupt purchases, navigation or saving user data.
    try {
      if (init()) trackAptabaseEvent(eventName, properties);
      else if (__DEV__) console.log(`[analytics:noop] ${eventName}`);
    } catch (error) {
      if (__DEV__) console.warn(`[analytics] Failed to track ${eventName}.`, error);
    }
  }

  return { init, trackEvent };
}
