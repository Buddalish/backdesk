export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dsn = process.env.SENTRY_DSN;
    if (dsn) {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        beforeSend(event) {
          // Strip user PII — capture errors, not who hit them.
          if (event.user) event.user = { id: event.user.id };
          // Strip query strings from request URLs (may contain tokens).
          if (event.request?.url) {
            event.request.url = event.request.url.split("?")[0];
          }
          // Drop request headers + cookies entirely (auth headers, session cookies).
          if (event.request) {
            delete event.request.headers;
            delete event.request.cookies;
          }
          return event;
        },
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const dsn = process.env.SENTRY_DSN;
    if (dsn) {
      const Sentry = await import("@sentry/nextjs");
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        beforeSend(event) {
          // Strip user PII — capture errors, not who hit them.
          if (event.user) event.user = { id: event.user.id };
          // Strip query strings from request URLs (may contain tokens).
          if (event.request?.url) {
            event.request.url = event.request.url.split("?")[0];
          }
          // Drop request headers + cookies entirely (auth headers, session cookies).
          if (event.request) {
            delete event.request.headers;
            delete event.request.cookies;
          }
          return event;
        },
      });
    }
  }
}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  errorContext: { routerKind: string; routePath: string; routeType: string },
) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(error, request, errorContext);
}
