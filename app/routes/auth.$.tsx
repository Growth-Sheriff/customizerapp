import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

// Catch-all route for Shopify auth routes
// This handles /auth/*, /auth/login, /auth/callback etc.
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}

