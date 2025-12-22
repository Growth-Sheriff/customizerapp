import type { LoaderFunctionArgs } from "@remix-run/node";
import shopify from "~/shopify.server";

// Catch-all route for Shopify auth routes
// This handles /auth/*, /auth/login, /auth/callback etc.
// For embedded apps with token exchange, this handles the bounce-back
export async function loader({ request }: LoaderFunctionArgs) {
  // This will handle OAuth start, callback, and token exchange
  await shopify.authenticate.admin(request);
  
  // If we get here without throwing, redirect to app
  return new Response(null, {
    status: 302,
    headers: { Location: "/app" },
  });
}
