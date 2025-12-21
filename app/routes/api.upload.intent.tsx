import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { nanoid } from "nanoid";
import { getShopFromSession, getAccessTokenFromSession } from "~/lib/session.server";
import { getStorageConfig, getUploadSignedUrl, buildStorageKey } from "~/lib/storage.server";
import { rateLimitGuard, getIdentifier } from "~/lib/rateLimit.server";
import { checkUploadAllowed } from "~/lib/billing.server";
import prisma from "~/lib/prisma.server";

// Plan limits
const PLAN_LIMITS = {
  free: { maxSizeMB: 25, uploadsPerMonth: 100 },
  starter: { maxSizeMB: 50, uploadsPerMonth: 1000 },
  pro: { maxSizeMB: 150, uploadsPerMonth: -1 }, // unlimited
  enterprise: { maxSizeMB: 150, uploadsPerMonth: -1 },
};

// POST /api/upload/intent
// Request: { productId?, variantId?, mode, contentType, fileName }
// Response: { uploadId, itemId, uploadUrl, key, expiresIn }
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Rate limit check (10/min per customer)
  const identifier = getIdentifier(request, "customer");
  const rateLimitResponse = await rateLimitGuard(identifier, "uploadIntent");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const shopDomain = await getShopFromSession(request);
  const accessToken = await getAccessTokenFromSession(request);

  if (!shopDomain || !accessToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get shop from database
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  // Parse request body
  const body = await request.json();
  const { productId, variantId, mode, contentType, fileName, fileSize } = body;

  if (!mode || !contentType || !fileName) {
    return json({ error: "Missing required fields: mode, contentType, fileName" }, { status: 400 });
  }

  // Validate mode
  if (!["3d_designer", "classic", "quick"].includes(mode)) {
    return json({ error: "Invalid mode" }, { status: 400 });
  }

  // Check billing / plan limits
  const fileSizeMB = fileSize ? fileSize / (1024 * 1024) : 0;
  const billingCheck = await checkUploadAllowed(shop.id, mode, fileSizeMB);

  if (!billingCheck.allowed) {
    return json({
      error: billingCheck.error,
      code: "BILLING_LIMIT",
    }, { status: 403 });
  }

  // Validate content type
  const allowedTypes = [
    "image/png", "image/jpeg", "image/webp",
    "application/pdf", "application/postscript", // AI/EPS
    "image/svg+xml",
  ];
  if (!allowedTypes.includes(contentType)) {
    return json({ error: "Unsupported file type" }, { status: 400 });
  }

  // Check plan limits
  const planKey = shop.plan as keyof typeof PLAN_LIMITS;
  const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS.free;

  // Check file size
  if (fileSize && fileSize > limits.maxSizeMB * 1024 * 1024) {
    return json({
      error: `File too large. Max size for ${shop.plan} plan: ${limits.maxSizeMB}MB`,
      code: "FILE_TOO_LARGE",
      maxSizeMB: limits.maxSizeMB,
    }, { status: 413 });
  }

  // Check monthly upload limit
  if (limits.uploadsPerMonth > 0) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyUploads = await prisma.upload.count({
      where: {
        shopId: shop.id,
        createdAt: { gte: startOfMonth },
      },
    });

    if (monthlyUploads >= limits.uploadsPerMonth) {
      return json({
        error: `Monthly upload limit reached (${limits.uploadsPerMonth})`,
        code: "LIMIT_REACHED",
        limit: limits.uploadsPerMonth,
        used: monthlyUploads,
      }, { status: 429 });
    }
  }

  // Generate IDs
  const uploadId = nanoid(12);
  const itemId = nanoid(8);

  // Get storage config
  const storageConfig = getStorageConfig(shop.storageConfig as any);

  // Build storage key
  const key = buildStorageKey(shopDomain, uploadId, itemId, fileName);

  try {
    // Create upload record
    const upload = await prisma.upload.create({
      data: {
        id: uploadId,
        shopId: shop.id,
        productId,
        variantId,
        mode,
        status: "draft",
      },
    });

    // Create upload item record
    await prisma.uploadItem.create({
      data: {
        id: itemId,
        uploadId: upload.id,
        location: "front", // default, will be updated later
        storageKey: key,
        originalName: fileName,
        mimeType: contentType,
        fileSize: fileSize || null,
        preflightStatus: "pending",
      },
    });

    // Generate signed upload URL
    const { url: uploadUrl } = await getUploadSignedUrl(storageConfig, key, contentType);

    return json({
      uploadId,
      itemId,
      uploadUrl,
      key,
      expiresIn: 900, // 15 minutes
    });
  } catch (error) {
    console.error("[Upload Intent] Error:", error);
    return json({ error: "Failed to create upload intent" }, { status: 500 });
  }
}

