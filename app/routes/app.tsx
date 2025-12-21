import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { authenticate } from "~/shopify.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

// Layout route for /app/* routes
// Ensures user is authenticated before accessing any app routes
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);

    return json({
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop: session.shop,
    });
  } catch (error) {
    // If authentication fails, the error might be a Response (redirect)
    if (error instanceof Response) {
      throw error;
    }
    // For other errors, redirect to auth
    console.error("App auth error:", error);
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    if (shop) {
      return redirect(`/auth/login?shop=${shop}`);
    }
    return redirect("/auth/login");
  }
}

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Outlet />
    </AppProvider>
  );
}

