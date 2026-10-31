// Crash and error reporting (Sentry). Off unless EXPO_PUBLIC_SENTRY_DSN is set
// at build time, and never in development. Ledger data never leaves the device
// through it: no default PII, no console or input breadcrumbs, no replay.
import { useEffect, type ComponentType } from "react";
import * as Sentry from "@sentry/react-native";
import { ErrorBoundary as RouterErrorBoundary, type ErrorBoundaryProps } from "expo-router";

import { sanitizeErrorEvent } from "./sanitize";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
const enabled = !!DSN && !__DEV__;

// beforeSend/beforeBreadcrumb only run in JS. Native crashes (and app hangs)
// are captured and sent by the native SDK on the next launch, so everything
// that could carry user data is also turned off in the options it receives
// (@sentry/react-native 8.28 forwards all but the callbacks to native init).
export const SENTRY_OPTIONS = {
  sendDefaultPii: false,
  tracesSampleRate: 0,
  profilesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  attachScreenshot: false,
  attachViewHierarchy: false,
  // No breadcrumbs at all, JS or native (iOS system/network, Android lifecycle).
  maxBreadcrumbs: 0,
  enableAutoBreadcrumbTracking: false,
  enableNetworkBreadcrumbs: false,
  enableNetworkEventBreadcrumbs: false,
  enableActivityLifecycleBreadcrumbs: false,
  enableAppLifecycleBreadcrumbs: false,
  enableSystemEventBreadcrumbs: false,
  enableAppComponentBreadcrumbs: false,
  enableCaptureFailedRequests: false,
  enableAutoSessionTracking: false,
  enableAutoPerformanceTracing: false,
  enableUserInteractionTracing: false,
  enableMetricKitRawPayload: false,
  enableLogs: false,
} satisfies Sentry.ReactNativeOptions;

if (enabled)
  Sentry.init({
    dsn: DSN,
    ...SENTRY_OPTIONS,
    beforeBreadcrumb: () => null,
    beforeSend: sanitizeErrorEvent,
  });

// The root layout takes no props.
type Root = ComponentType<Record<string, unknown>>;
export function withMonitoring(Root: Root): Root {
  return enabled ? Sentry.wrap(Root) : Root;
}

// expo-router's boundary, reporting the render error it caught.
export function ErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => {
    if (enabled) Sentry.captureException(props.error);
  }, [props.error]);
  return <RouterErrorBoundary {...props} />;
}
