import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import prisma from "~/lib/prisma.server";

// Verify Shopify webhook signature
function verifyWebhookSignature(body: string, hmac: string, secret: string): boolean {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

// POST /webhooks/app-uninstalled
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
  const shop = request.headers.get("X-Shopify-Shop-Domain");

  if (!hmac || !shop) {
    return json({ error: "Missing headers" }, { status: 400 });
  }

  const body = await request.text();
  const secret = process.env.SHOPIFY_API_SECRET || "";

  if (!verifyWebhookSignature(body, hmac, secret)) {
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  console.log(`[Webhook] App uninstalled for shop: ${shop}`);

  try {
    // Delete shop and all related data (cascade)
    await prisma.shop.delete({
      where: { shopDomain: shop },
    });

    console.log(`[Webhook] Cleaned up data for shop: ${shop}`);
  } catch (error) {
    console.error(`[Webhook] Error cleaning up shop ${shop}:`, error);
  }

  return json({ success: true });
}

