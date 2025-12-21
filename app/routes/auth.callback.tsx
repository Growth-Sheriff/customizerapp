import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getSession, commitSession } from "~/lib/session.server";
import { verifyHmac, exchangeCodeForToken, getShopInfo, registerWebhooks } from "~/lib/shopify.server";
import prisma from "~/lib/prisma.server";

// GET /auth/callback?code=...&hmac=...&shop=...&state=...
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = url.searchParams;

  const shop = query.get("shop");
  const code = query.get("code");
  const state = query.get("state");

  if (!shop || !code || !state) {
    return new Response("Missing required parameters", { status: 400 });
  }

  // Get session
  const session = await getSession(request.headers.get("Cookie"));
  const storedState = session.get("state");
  const storedShop = session.get("shop");

  // Verify state matches
  if (state !== storedState || shop !== storedShop) {
    return new Response("State mismatch - possible CSRF attack", { status: 403 });
  }

  // Verify HMAC
  if (!verifyHmac(query)) {
    return new Response("Invalid HMAC signature", { status: 403 });
  }

  try {
    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(shop, code);

    // Get shop info
    const shopInfo = await getShopInfo(shop, accessToken);

    // Store or update shop in database
    await prisma.shop.upsert({
      where: { shopDomain: shop },
      update: {
        accessToken,
        updatedAt: new Date(),
      },
      create: {
        shopDomain: shop,
        accessToken,
        plan: "free",
        billingStatus: "active",
        storageProvider: "r2",
        settings: {
          shopName: shopInfo.shop.name,
          email: shopInfo.shop.email,
          shopifyPlan: shopInfo.shop.plan.displayName,
        },
      },
    });

    // Register webhooks
    await registerWebhooks(shop, accessToken);

    // Store access token in session
    session.set("accessToken", accessToken);
    session.set("shop", shop);
    session.unset("state"); // Clear state after use

    // Redirect to app
    return redirect("/app", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    return new Response(`Authentication failed: ${error}`, { status: 500 });
  }
}

