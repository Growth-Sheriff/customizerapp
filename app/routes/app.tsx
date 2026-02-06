import type { LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRouteError } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { authenticate } from "~/shopify.server";
import { AppFrame } from "~/components/AppFrame";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import prisma from "~/lib/prisma.server";
import { useAppBridgeNavigation } from "~/hooks/useAppBridgeNavigation";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

// Layout route for /app/* routes
// Uses token exchange for embedded app authentication
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  // Get shop data for navigation badges
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  let pendingUploads = 0;
  let pendingQueue = 0;

  if (shop) {
    // Count pending uploads (needs review)
    pendingUploads = await prisma.upload.count({
      where: { 
        shopId: shop.id, 
        status: { in: ["uploaded", "needs_review"] }
      },
    });

    // Count pending queue items
    pendingQueue = await prisma.upload.count({
      where: { 
        shopId: shop.id, 
        status: "needs_review"
      },
    });
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    pendingUploads,
    pendingQueue,
  });
}

export default function AppLayout() {
  const { apiKey, shop, pendingUploads, pendingQueue } = useLoaderData<typeof loader>();
  
  // Sync Remix navigation with Shopify Admin history
  useAppBridgeNavigation();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <AppFrame 
        shop={shop} 
        pendingUploads={pendingUploads}
        pendingQueue={pendingQueue}
      />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};