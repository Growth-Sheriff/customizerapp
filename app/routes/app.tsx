import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { getShopFromSession } from "~/lib/session.server";

// Layout route for /app/* routes
// Ensures user is authenticated before accessing any app routes
export async function loader({ request }: LoaderFunctionArgs) {
  const shopDomain = await getShopFromSession(request);

  if (!shopDomain) {
    // Check if this is a Shopify embedded app request
    const url = new URL(request.url);
    let shop = url.searchParams.get("shop");

    // Try to get shop from Referer header if not in URL
    if (!shop) {
      const referer = request.headers.get("Referer");
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          // Extract shop from Shopify admin URL
          // Format: https://admin.shopify.com/store/shop-name/apps/...
          const match = refererUrl.pathname.match(/\/store\/([^\/]+)\//);
          if (match) {
            shop = `${match[1]}.myshopify.com`;
          }
        } catch (e) {
          // Invalid referer URL
        }
      }
    }

    if (shop) {
      return redirect(`/auth/install?shop=${encodeURIComponent(shop)}`);
    }

    // No shop found - redirect to install page
    return redirect("/");
  }

  return json({ shop: shopDomain });
}

export default function AppLayout() {
  return <Outlet />;
}

