import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getSession, commitSession } from "~/lib/session.server";
import { getAuthorizationUrl, generateState } from "~/lib/shopify.server";

// GET /auth/install?shop=myshop.myshopify.com
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response("Missing shop parameter", { status: 400 });
  }

  // Validate shop domain format
  if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/)) {
    return new Response("Invalid shop domain", { status: 400 });
  }

  // Generate state for CSRF protection
  const state = generateState();

  // Store state in session
  const session = await getSession(request.headers.get("Cookie"));
  session.set("state", state);
  session.set("shop", shop);

  // Get authorization URL
  const authUrl = getAuthorizationUrl(shop, state);

  return redirect(authUrl, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

