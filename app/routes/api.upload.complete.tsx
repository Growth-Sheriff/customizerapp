import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { triggerUploadReceived } from "~/lib/flow.server";
import { handleCorsOptions, corsJson } from "~/lib/cors.server";
import { rateLimitGuard, getIdentifier } from "~/lib/rateLimit.server";
import prisma from "~/lib/prisma.server";
import { Queue } from "bullmq";
import Redis from "ioredis";

// ============================================================================
// FAZ 0 - API-001: Singleton Redis Connection
// Prevents connection leak by reusing a single connection across all requests
// ============================================================================
let redisConnection: Redis | null = null;

const getRedisConnection = (): Redis => {
  if (!redisConnection) {
    redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Only reconnect on READONLY errors (failover scenario)
          return true;
        }
        return false;
      },
    });

    redisConnection.on('error', (err: Error) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisConnection.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });

    redisConnection.on('close', () => {
      console.warn('[Redis] Connection closed');
      redisConnection = null; // Allow reconnection on next request
    });
  }
  return redisConnection;
};

// POST /api/upload/complete
// Request: { shopDomain, uploadId, items: [{ itemId, location, transform? }] }
export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }

  if (request.method !== "POST") {
    return corsJson({ error: "Method not allowed" }, request, { status: 405 });
  }

  // Rate limiting
  const identifier = getIdentifier(request, "customer");
  const rateLimitResponse = await rateLimitGuard(identifier, "preflight");
  if (rateLimitResponse) return rateLimitResponse;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: "Invalid JSON body" }, request, { status: 400 });
  }

  const { shopDomain, uploadId, items } = body;

  if (!shopDomain) {
    return corsJson({ error: "Missing required field: shopDomain" }, request, { status: 400 });
  }

  if (!uploadId || !items || !Array.isArray(items)) {
    return corsJson({ error: "Missing required fields: uploadId, items" }, request, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return corsJson({ error: "Shop not found" }, request, { status: 404 });
  }


  // Verify upload belongs to shop
  const upload = await prisma.upload.findFirst({
    where: { id: uploadId, shopId: shop.id },
    include: { items: true },
  });

  if (!upload) {
    return corsJson({ error: "Upload not found" }, request, { status: 404 });
  }

  if (upload.status !== "draft") {
    return corsJson({ error: "Upload already completed" }, request, { status: 400 });
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
    // FAZ 0 - API-001: Use singleton connection (don't create new connection per request)
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

    // FAZ 0 - API-001: DON'T close singleton connection - it's reused across requests
    // await connection.quit(); // REMOVED - causes connection churn

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

    return corsJson({
      success: true,
      uploadId,
      status: "processing",
      message: "Upload complete. Preflight checks started.",
    }, request);
  } catch (error) {
    console.error("[Upload Complete] Error:", error);
    return corsJson({ error: "Failed to complete upload" }, request, { status: 500 });
  }
}

// GET /api/upload/complete?uploadId=xxx&shopDomain=xxx (get upload status)
export async function loader({ request }: LoaderFunctionArgs) {
  // Handle CORS preflight - loader handles GET but action handles OPTIONS
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }

  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId");
  const shopDomain = url.searchParams.get("shopDomain");

  if (!shopDomain) {
    return corsJson({ error: "Missing shopDomain" }, request, { status: 400 });
  }

  if (!uploadId) {
    return corsJson({ error: "Missing uploadId" }, request, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return corsJson({ error: "Shop not found" }, request, { status: 404 });
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
    return corsJson({ error: "Upload not found" }, request, { status: 404 });
  }

  return corsJson({
    uploadId: upload.id,
    status: upload.status,
    mode: upload.mode,
    preflightSummary: upload.preflightSummary,
    items: upload.items,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt,
  }, request);
}

