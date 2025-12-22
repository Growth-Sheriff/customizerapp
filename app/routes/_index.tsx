import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import shopify from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Check if this looks like a Shopify request
  const shop = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded");
  const host = url.searchParams.get("host");
  const idToken = url.searchParams.get("id_token");

  // If this is a Shopify embedded app request or has Shopify params
  if (shop || embedded || host || idToken) {
    // Let authenticate.admin handle everything - OAuth, token exchange, bounce
    await shopify.authenticate.admin(request);
    // If we get here, we have a valid session
    return redirect("/app");
  }

  // No Shopify parameters - show install page
  return new Response(
    `<!DOCTYPE html>
    <html>
    <head>
      <title>Upload Lift Pro - Install</title>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f4f6f8; }
        .container { text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 400px; width: 90%; }
        h1 { color: #202223; margin-bottom: 16px; font-size: 24px; }
        p { color: #6d7175; margin-bottom: 24px; }
        input { width: 100%; padding: 12px; border: 1px solid #c9cccf; border-radius: 4px; font-size: 14px; margin-bottom: 16px; }
        button { width: 100%; padding: 12px; background: #008060; color: white; border: none; border-radius: 4px; font-size: 14px; cursor: pointer; font-weight: 500; }
        button:hover { background: #006e52; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Upload Lift Pro</h1>
        <p>Enter your Shopify store URL to install the app</p>
        <form method="GET" action="/auth/login">
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
  return null;
}

