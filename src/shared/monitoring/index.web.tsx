// Web build: no crash reporting (the Sentry SDK targets iOS/Android here).
import type { ComponentType } from "react";
export { ErrorBoundary } from "expo-router";
export const withMonitoring = (Root: ComponentType<Record<string, unknown>>) => Root;
