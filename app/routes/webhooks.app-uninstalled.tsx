import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";

// POST /webhooks/app-uninstalled
export async function action({ request }: ActionFunctionArgs) {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`[Webhook] ${topic} for shop: ${shop}`);

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

