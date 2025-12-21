import type { LoaderFunctionArgs } from "@remix-run/node";
import { login } from "~/shopify.server";

// GET /auth/install?shop=myshop.myshopify.com
// This redirects to Shopify OAuth
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    throw new Response("Missing shop parameter", { status: 400 });
  }

  // Redirect to Shopify OAuth
  throw await login(request);
}

