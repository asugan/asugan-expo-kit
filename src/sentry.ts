import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

export type SentryConfig = Omit<Sentry.ReactNativeOptions, 'dsn' | 'integrations'> & {
  /** Missing or blank DSN disables Sentry. */
  dsn?: string;
};

/**
 * Call once at module scope, before other app modules run.
 * Register `navigationIntegration` with the navigation container to get route transactions.
 */
export function initSentry({ dsn, ...options }: SentryConfig): {
  navigationIntegration: ReturnType<typeof Sentry.reactNavigationIntegration>;
} {
  const trimmedDsn = dsn?.trim() || undefined;
  const navigationIntegration = Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: true });

  Sentry.init({
    // 20% of transactions, no Hermes profiling: full 1.0/1.0 burns quota fast.
    tracesSampleRate: 0.2,
    profilesSampleRate: 0,
    enabled: Boolean(trimmedDsn) && Platform.OS !== 'web',
    ...options,
    dsn: trimmedDsn,
    integrations: [navigationIntegration],
  });

  return { navigationIntegration };
}
