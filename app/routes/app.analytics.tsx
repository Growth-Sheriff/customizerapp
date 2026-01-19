/**
 * Analytics Layout - Parent route for analytics pages
 * 
 * Routes:
 * - /app/analytics → app.analytics._index.tsx (Overview)
 * - /app/analytics/visitors → app.analytics.visitors.tsx
 * - /app/analytics/attribution → app.analytics.attribution.tsx
 */

import { Outlet } from "@remix-run/react";

export default function AnalyticsLayout() {
  return <Outlet />;
}

