import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate, login } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded");
  const host = url.searchParams.get("host");

  // If this is a Shopify embedded app request
  if (embedded === "1" || host) {
    // For embedded apps, authenticate.admin handles everything
    // including token exchange and bouncing back with session token
    await authenticate.admin(request);
    // If we get here, authentication succeeded - redirect to /app
    return redirect("/app");
  }

  // If shop param exists but not embedded, initiate OAuth
  if (shop) {
    throw await login(request);
  }

  // No Shopify parameters - show install page
  return new Response(
    `<!DOCTYPE html>
    <html>
    <head>
      <title>Upload Lift Pro - Install</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f4f6f8; }
        .container { text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 400px; }
        h1 { color: #202223; margin-bottom: 16px; }
        p { color: #6d7175; margin-bottom: 24px; }
        input { width: 100%; padding: 12px; border: 1px solid #c9cccf; border-radius: 4px; font-size: 14px; margin-bottom: 16px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #008060; color: white; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; }
        button:hover { background: #006e52; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Upload Lift Pro</h1>
        <p>Enter your Shopify store URL to install the app</p>
        <form action="/auth/install" method="GET">
          <input type="text" name="shop" placeholder="your-store.myshopify.com" required />
          <button type="submit">Install App</button>
        </form>
      </div>
    </body>
    </html>`,
    {
      headers: { "Content-Type": "text/html" },
    }
  );
}

export default function Index() {
  // This should never render due to redirects
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h1>Upload Lift Pro</h1>
      <p>Redirecting...</p>
    </div>
  );
}

