import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

// GET /auth/callback?code=...&hmac=...&shop=...&state=...
// This completes the OAuth flow
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.callback(request);

  // This won't be reached as authenticate.callback redirects
  return new Response("Authentication complete", { status: 200 });
}

