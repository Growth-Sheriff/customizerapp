import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";

// GDPR: Customer data request
// POST /api/gdpr/customers/data_request
export async function action({ request }: ActionFunctionArgs) {
  // Verify Shopify webhook HMAC signature
  const { shop, topic, payload } = await authenticate.webhook(request);
  
  console.log(`[GDPR] ${topic} for shop: ${shop}`);

  try {
    const { customer } = payload as { customer?: { id: number; email?: string } };
    
    if (!customer?.id) {
      console.log("[GDPR] No customer ID in request");
      return json({ ok: true, records: [] });
    }

    // Look up customer data in uploads
    const shopRecord = await prisma.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord) {
      console.log(`[GDPR] Shop ${shop} not found`);
      return json({ ok: true, records: [] });
    }

    const uploads = await prisma.upload.findMany({
      where: {
        shopId: shopRecord.id,
        customerId: String(customer.id),
      },
      select: {
        id: true,
        mode: true,
        status: true,
        customerEmail: true,
        createdAt: true,
      },
    });

    console.log(`[GDPR] Found ${uploads.length} uploads for customer ${customer.id}`);

    return json({
      ok: true,
      message: "Customer data request processed",
      records: uploads.map(u => ({
        uploadId: u.id,
        mode: u.mode,
        status: u.status,
        email: u.customerEmail,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[GDPR] Error processing data request:", error);
    return json({ ok: true, records: [] }); // Still return 200 to acknowledge
  }
}

