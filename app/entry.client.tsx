import { RemixBrowser, useLocation, useMatches } from "@remix-run/react";
import { startTransition, StrictMode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import * as Sentry from "@sentry/remix";

Sentry.init({
  dsn: "https://808c0fd1491e58940acad91a5c893df6@o4510838496821248.ingest.us.sentry.io/4510838504030208", 
  tracesSampleRate: 1,
  integrations: [
    Sentry.browserTracingIntegration({
      useEffect,
      useLocation,
      useMatches,
    }),
    Sentry.replayIntegration(),
  ],
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>
  );
});
