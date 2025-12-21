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
    const shop = url.searchParams.get("shop");

    if (shop) {
      return redirect(`/auth/install?shop=${shop}`);
    }

    return redirect("/");
  }

  return json({ shop: shopDomain });
}

export default function AppLayout() {
  return <Outlet />;
}

