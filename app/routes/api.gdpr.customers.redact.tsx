import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/lib/prisma.server";

// GDPR: Customer redact
// POST /api/gdpr/customers/redact
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { shop_domain, customer } = body;

    console.log(`[GDPR] Customer redact request for shop: ${shop_domain}, customer: ${customer?.id}`);

    if (shop_domain && customer?.id) {
      const shop = await prisma.shop.findUnique({
        where: { shopDomain: shop_domain },
      });

      if (shop) {
        // Anonymize customer data in uploads
        await prisma.upload.updateMany({
          where: {
            shopId: shop.id,
            customerId: String(customer.id),
          },
          data: {
            customerId: "REDACTED",
            customerEmail: null,
          },
        });

        console.log(`[GDPR] Redacted customer ${customer.id} data for shop ${shop_domain}`);
      }
    }

    return json({ ok: true });
  } catch (error) {
    console.error("[GDPR] Error processing customer redact:", error);
    return json({ ok: true }); // Still return 200 to acknowledge
  }
}

