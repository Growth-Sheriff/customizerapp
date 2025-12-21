import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import prisma from "~/lib/prisma.server";
import { shopifyGraphQL } from "~/lib/shopify.server";

// Verify Shopify webhook signature
function verifyWebhookSignature(body: string, hmac: string, secret: string): boolean {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));
}

// GraphQL mutation to write order metafield
const ORDER_METAFIELD_MUTATION = `
  mutation orderMetafieldSet($input: OrderInput!) {
    orderUpdate(input: $input) {
      order {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// POST /webhooks/orders-paid
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
    console.log(`[Webhook] Order paid: ${order.id} for shop: ${shopDomain}`);

    // Get shop from database
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (!shop) {
      console.log(`[Webhook] Shop not found: ${shopDomain}`);
      return json({ success: true });
    }

    // Find all uploads linked to this order's line items
    const uploadDesigns: Array<{
      lineItemId: string;
      uploadId: string;
      location: string;
      originalFile: string;
      previewUrl: string;
      transform: unknown;
      preflightStatus: string;
    }> = [];

    for (const lineItem of order.line_items || []) {
      const uploadId = lineItem.properties?.find(
        (p: { name: string }) => p.name === "_upload_lift_id"
      )?.value;

      if (uploadId) {
        // Get upload details
        const upload = await prisma.upload.findFirst({
          where: { id: uploadId, shopId: shop.id },
          include: {
            items: {
              select: {
                location: true,
                originalName: true,
                previewKey: true,
                thumbnailKey: true,
                transform: true,
                preflightStatus: true,
              },
            },
          },
        });

        if (upload) {
          // Create order link
          await prisma.orderLink.create({
            data: {
              shopId: shop.id,
              orderId: String(order.id),
              uploadId: upload.id,
              lineItemId: String(lineItem.id),
            },
          });

          // Update upload status
          await prisma.upload.update({
            where: { id: upload.id },
            data: {
              status: "approved",
              orderId: String(order.id),
            },
          });

          // Add to designs array
          for (const item of upload.items) {
            uploadDesigns.push({
              lineItemId: String(lineItem.id),
              uploadId: upload.id,
              location: item.location,
              originalFile: item.originalName || "",
              previewUrl: item.thumbnailKey || item.previewKey || "",
              transform: item.transform,
              preflightStatus: item.preflightStatus,
            });
          }

          console.log(`[Webhook] Linked upload ${uploadId} to order ${order.id}`);
        }
      }
    }

    // Write order metafield with design data
    if (uploadDesigns.length > 0 && shop.accessToken) {
      const metafieldValue = JSON.stringify({
        version: "1.0",
        totalDesigns: uploadDesigns.length,
        designs: uploadDesigns,
        processedAt: new Date().toISOString(),
      });

      try {
        await shopifyGraphQL(shopDomain, shop.accessToken, ORDER_METAFIELD_MUTATION, {
          input: {
            id: `gid://shopify/Order/${order.id}`,
            metafields: [
              {
                namespace: "upload_lift",
                key: "designs",
                value: metafieldValue,
                type: "json",
              },
            ],
          },
        });

        console.log(`[Webhook] Order metafield written for order ${order.id}`);
      } catch (error) {
        console.error(`[Webhook] Failed to write order metafield:`, error);
      }
    }

    return json({ success: true, designsLinked: uploadDesigns.length });
  } catch (error) {
    console.error("[Webhook] Error processing orders/paid:", error);
    return json({ error: "Processing failed" }, { status: 500 });
  }
}

