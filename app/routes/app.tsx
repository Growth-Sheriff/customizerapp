import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { authenticate } from "~/shopify.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

// Layout route for /app/* routes
// Uses token exchange for embedded app authentication
export async function loader({ request }: LoaderFunctionArgs) {
  // authenticate.admin handles token exchange automatically
  // It will use the session token from the request to get/refresh access token
  const { session } = await authenticate.admin(request);

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
  });
}

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Outlet />
    </AppProvider>
  );
}

