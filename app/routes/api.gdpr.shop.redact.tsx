import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";
import { getStorageConfig, deleteFile } from "~/lib/storage.server";

// GDPR: Shop redact
// POST /api/gdpr/shop/redact
export async function action({ request }: ActionFunctionArgs) {
  // Verify Shopify webhook HMAC signature
  const { shop, topic } = await authenticate.webhook(request);
  
  console.log(`[GDPR] ${topic} for shop: ${shop}`);

  try {
    // Find shop and all associated files
    const shopRecord = await prisma.shop.findUnique({
      where: { shopDomain: shop },
      include: {
        uploads: {
          include: { items: true },
        },
      },
    });

    if (!shopRecord) {
      console.log(`[GDPR] Shop ${shop} not found, nothing to redact`);
      return json({ ok: true });
    }

    // Delete files from storage
    const storageConfig = getStorageConfig(shopRecord.storageConfig as any);
    let deletedFiles = 0;
    let failedFiles = 0;

    for (const upload of shopRecord.uploads) {
      for (const item of upload.items) {
        const keysToDelete = [
          item.storageKey,
          item.thumbnailKey,
          item.previewKey,
        ].filter(Boolean) as string[];

        for (const key of keysToDelete) {
          try {
            await deleteFile(storageConfig, key);
            deletedFiles++;
          } catch (e) {
            console.warn(`[GDPR] Failed to delete file ${key}:`, e);
            failedFiles++;
          }
        }
      }
    }

    console.log(`[GDPR] Deleted ${deletedFiles} files (${failedFiles} failed) for shop ${shop}`);

    // Delete all shop data (cascade will handle related records)
    await prisma.shop.delete({
      where: { shopDomain: shop },
    });

    console.log(`[GDPR] Deleted all database data for shop ${shop}`);

    return json({ ok: true, deletedFiles, failedFiles });
  } catch (error) {
    console.error("[GDPR] Error processing shop redact:", error);
    return json({ ok: true }); // Still return 200 to acknowledge
  }
}

