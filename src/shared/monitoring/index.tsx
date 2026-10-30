// Crash and error reporting (Sentry). Off unless EXPO_PUBLIC_SENTRY_DSN is set
// at build time, and never in development. Ledger data never leaves the device
// through it: no default PII, no console or input breadcrumbs, no replay.
import { useEffect, type ComponentType } from "react";
import * as Sentry from "@sentry/react-native";
import { ErrorBoundary as RouterErrorBoundary, type ErrorBoundaryProps } from "expo-router";

import { sanitizeErrorEvent } from "./sanitize";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
const enabled = !!DSN && !__DEV__;

if (enabled)
  Sentry.init({
    dsn: DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
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
