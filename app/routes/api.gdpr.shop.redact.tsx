import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/lib/prisma.server";

// GDPR: Shop redact
// POST /api/gdpr/shop/redact
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { shop_domain } = body;

    console.log(`[GDPR] Shop redact request for: ${shop_domain}`);

    if (shop_domain) {
      // Delete all shop data (cascade will handle related records)
      try {
        await prisma.shop.delete({
          where: { shopDomain: shop_domain },
        });
        console.log(`[GDPR] Deleted all data for shop ${shop_domain}`);
      } catch (e) {
        // Shop might already be deleted
        console.log(`[GDPR] Shop ${shop_domain} already deleted or not found`);
      }

      // TODO: Also delete files from storage
      // This would require listing all files with the shop prefix and deleting them
    }

    return json({ ok: true });
  } catch (error) {
    console.error("[GDPR] Error processing shop redact:", error);
    return json({ ok: true }); // Still return 200 to acknowledge
  }
}

