import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the remix server.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: false, // IMPORTANT: Must be false for Shopify embedded apps
        v3_lazyRouteDiscovery: true,
      },
    }),
    tsconfigPaths(),
    sentryVitePlugin({
      org: "techify-boost-36",
      project: "javascript-remix",
      authToken: process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  server: {
    port: Number(process.env.PORT || 3000),
    allowedHosts: [host, "localhost"],
  },
  build: {
    assetsInlineLimit: 0,
    sourcemap: true
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react", "@shopify/polaris"],
  },
});