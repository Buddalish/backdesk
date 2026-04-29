import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      // Strip user PII — capture errors, not who hit them.
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      // Strip query strings from fetch/xhr/navigation breadcrumbs (may contain tokens).
      if (
        breadcrumb.category === "fetch" ||
        breadcrumb.category === "xhr" ||
        breadcrumb.category === "navigation"
      ) {
        if (breadcrumb.data?.url && typeof breadcrumb.data.url === "string") {
          breadcrumb.data.url = breadcrumb.data.url.split("?")[0];
        }
      }
      return breadcrumb;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
