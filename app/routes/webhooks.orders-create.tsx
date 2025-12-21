import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";

// Verify Shopify webhook signature
function verifyWebhookSignature(body: string, hmac: string, secret: string): boolean {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

// POST /webhooks/orders-create
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

  try {
    const order = JSON.parse(body);
    console.log(`[Webhook] Order created: ${order.id} for shop: ${shop}`);

    // Process line items looking for upload_lift properties
    for (const lineItem of order.line_items || []) {
      const uploadLiftId = lineItem.properties?.find(
        (p: { name: string }) => p.name === "_upload_lift_id"
      )?.value;

      if (uploadLiftId) {
        console.log(`[Webhook] Found upload ${uploadLiftId} in order ${order.id}`);
        // TODO: Create order link in database
        // TODO: Update upload status to "ordered"
      }
    }

    return json({ success: true });
  } catch (error) {
    console.error("[Webhook] Error processing order:", error);
    return json({ error: "Processing failed" }, { status: 500 });
  }
}

