import type { ErrorEvent } from "@sentry/react-native";

// Allow only build identifiers and stack locations. Exception messages and
// network breadcrumbs can contain pasted login links or financial input.
export function sanitizeErrorEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    release: event.release,
    dist: event.dist,
    environment: event.environment,
    level: event.level,
    exception: {
      values: event.exception?.values?.map((exception) => ({
        type: "Error",
        value: "Application error (details removed for privacy)",
        stacktrace: exception.stacktrace ? {
          frames: exception.stacktrace.frames?.map((frame) => ({
            filename: frame.filename?.split(/[?#]/)[0]?.split("/").pop(),
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        } : undefined,
      })),
    },
  };
}
