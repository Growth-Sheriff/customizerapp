import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import shopify from "~/shopify.server";

// GET /auth/callback?code=...&hmac=...&shop=...&state=...
// This completes the OAuth flow (for non-token-exchange flows)
export async function loader({ request }: LoaderFunctionArgs) {
  // shopify.authenticate.admin handles OAuth callback internally
  // For embedded apps with token exchange, this route may not be used
  // but we keep it for backwards compatibility

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    // Redirect to app after OAuth
    return redirect(`/app?shop=${shop}`);
  }

  return redirect("/app");
}
