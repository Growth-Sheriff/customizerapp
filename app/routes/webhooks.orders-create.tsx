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

// POST /webhooks/orders-create
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
  const shopDomain = request.headers.get("X-Shopify-Shop-Domain");

  if (!hmac || !shopDomain) {
    return json({ error: "Missing headers" }, { status: 400 });
  }

  const body = await request.text();
  const secret = process.env.SHOPIFY_API_SECRET || "";

  if (!verifyWebhookSignature(body, hmac, secret)) {
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const order = JSON.parse(body);
    console.log(`[Webhook] Order created: ${order.id} for shop: ${shopDomain}`);

    // Get shop from database
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (!shop) {
      console.log(`[Webhook] Shop not found: ${shopDomain}`);
      return json({ success: true }); // Still return success to Shopify
    }

    // Process line items looking for upload_lift properties
    const processedUploads: string[] = [];

    for (const lineItem of order.line_items || []) {
      const uploadLiftId = lineItem.properties?.find(
        (p: { name: string }) => p.name === "_ul_upload_id"
      )?.value;

      if (uploadLiftId && !processedUploads.includes(uploadLiftId)) {
        console.log(`[Webhook] Found upload ${uploadLiftId} in order ${order.id}`);

        // Verify upload exists and belongs to this shop
        const upload = await prisma.upload.findFirst({
          where: {
            id: uploadLiftId,
            shopId: shop.id,
          },
        });

        if (upload) {
          // Create or update order link (upsert for idempotency - Shopify may retry webhooks)
          await prisma.orderLink.upsert({
            where: {
              orderId_uploadId: {
                orderId: String(order.id),
                uploadId: uploadLiftId,
              },
            },
            create: {
              shopId: shop.id,
              orderId: String(order.id),
              uploadId: uploadLiftId,
              lineItemId: String(lineItem.id),
            },
            update: {
              lineItemId: String(lineItem.id),
            },
          });

          // Update upload with order info and status
          await prisma.upload.update({
            where: { id: uploadLiftId },
            data: {
              orderId: String(order.id),
              status: upload.status === "blocked" ? "blocked" : "needs_review",
            },
          });

          // Audit log
          await prisma.auditLog.create({
            data: {
              shopId: shop.id,
              action: "order_linked",
              resourceType: "upload",
              resourceId: uploadLiftId,
              metadata: {
                orderId: order.id,
                orderName: order.name,
                lineItemId: lineItem.id,
                customerEmail: order.email,
              },
            },
          });

          processedUploads.push(uploadLiftId);
          console.log(`[Webhook] Linked upload ${uploadLiftId} to order ${order.id}`);
        } else {
          console.warn(`[Webhook] Upload ${uploadLiftId} not found for shop ${shopDomain}`);
        }
      }
    }

    console.log(`[Webhook] Processed ${processedUploads.length} uploads for order ${order.id}`);
    return json({ success: true, linkedUploads: processedUploads.length });
  } catch (error) {
    console.error("[Webhook] Error processing order:", error);
    return json({ error: "Processing failed" }, { status: 500 });
  }
}

