import * as Sentry from "@sentry/remix";

Sentry.init({
    dsn: "https://808c0fd1491e58940acad91a5c893df6@o4510838496821248.ingest.us.sentry.io/4510838504030208",
    tracesSampleRate: 1,
    // Enable logs to be sent to Sentry
    enableLogs: true,
    integrations: [
        // send console.log, console.warn, and console.error calls as logs to Sentry
        Sentry.consoleIntegration({ levels: ["log", "warn", "error"] }),
    ]
});