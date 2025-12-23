/**
 * Products Layout Route
 * This is a layout route for all /app/products/* routes
 * Simply renders the Outlet for child routes
 */

import { Outlet } from "@remix-run/react";

export default function ProductsLayout() {
  return <Outlet />;
}
