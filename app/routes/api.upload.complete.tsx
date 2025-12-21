import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getShopFromSession } from "~/lib/session.server";
import { triggerUploadReceived } from "~/lib/flow.server";
import prisma from "~/lib/prisma.server";
import { Queue } from "bullmq";
import Redis from "ioredis";

// Redis connection for queue
const getRedisConnection = () => {
  return new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
};

// POST /api/upload/complete
// Request: { uploadId, items: [{ itemId, location, transform? }] }
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const shopDomain = await getShopFromSession(request);
  if (!shopDomain) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  const body = await request.json();
  const { uploadId, items } = body;

  if (!uploadId || !items || !Array.isArray(items)) {
    return json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify upload belongs to shop
  const upload = await prisma.upload.findFirst({
    where: { id: uploadId, shopId: shop.id },
    include: { items: true },
  });

  if (!upload) {
    return json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.status !== "draft") {
    return json({ error: "Upload already completed" }, { status: 400 });
  }

  try {
    // Update upload status
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "uploaded" },
    });

    // Update items with location and transform
    for (const item of items) {
      await prisma.uploadItem.update({
        where: { id: item.itemId },
        data: {
          location: item.location || "front",
          transform: item.transform || null,
        },
      });
    }

    // Enqueue preflight job for each item
    const connection = getRedisConnection();
    const preflightQueue = new Queue("preflight", { connection });

    for (const uploadItem of upload.items) {
      await preflightQueue.add("preflight", {
        uploadId,
        shopId: shop.id,
        itemId: uploadItem.id,
        storageKey: uploadItem.storageKey,
      });
    }

    await connection.quit();

    // Trigger Flow event
    await triggerUploadReceived(shop.id, shop.shopDomain, {
      id: uploadId,
      mode: upload.mode,
      productId: upload.productId,
      variantId: upload.variantId,
      customerId: upload.customerId,
      customerEmail: upload.customerEmail,
      items: upload.items.map((i: { location: string }) => ({ location: i.location })),
    });

    return json({
      success: true,
      uploadId,
      status: "processing",
      message: "Upload complete. Preflight checks started.",
    });
  } catch (error) {
    console.error("[Upload Complete] Error:", error);
    return json({ error: "Failed to complete upload" }, { status: 500 });
  }
}

// GET /api/upload/complete?uploadId=xxx (get upload status)
export async function loader({ request }: LoaderFunctionArgs) {
  const shopDomain = await getShopFromSession(request);
  if (!shopDomain) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId");

  if (!uploadId) {
    return json({ error: "Missing uploadId" }, { status: 400 });
  }

  const upload = await prisma.upload.findFirst({
    where: { id: uploadId, shopId: shop.id },
    include: {
      items: {
        select: {
          id: true,
          location: true,
          preflightStatus: true,
          preflightResult: true,
          thumbnailKey: true,
          previewKey: true,
        },
      },
    },
  });

  if (!upload) {
    return json({ error: "Upload not found" }, { status: 404 });
  }

  return json({
    uploadId: upload.id,
    status: upload.status,
    mode: upload.mode,
    preflightSummary: upload.preflightSummary,
    items: upload.items,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt,
  });
}

