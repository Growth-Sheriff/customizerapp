import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { nanoid } from "nanoid";
import { getStorageConfig, getUploadSignedUrl, buildStorageKey } from "~/lib/storage.server";
import { rateLimitGuard, getIdentifier } from "~/lib/rateLimit.server";
import { checkUploadAllowed } from "~/lib/billing.server";
import { handleCorsOptions, corsJson } from "~/lib/cors.server";
import prisma from "~/lib/prisma.server";

// Plan limits
const PLAN_LIMITS = {
  free: { maxSizeMB: 25, uploadsPerMonth: 100 },
  starter: { maxSizeMB: 50, uploadsPerMonth: 1000 },
  pro: { maxSizeMB: 150, uploadsPerMonth: -1 }, // unlimited
  enterprise: { maxSizeMB: 150, uploadsPerMonth: -1 },
};

// OPTIONS handler for CORS preflight
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }
  return corsJson({ error: "Method not allowed" }, request, { status: 405 });
}

// POST /api/upload/intent
// Request: { shopDomain, productId?, variantId?, mode, contentType, fileName }
// Response: { uploadId, itemId, uploadUrl, key, expiresIn }
export async function action({ request }: ActionFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }

  if (request.method !== "POST") {
    return corsJson({ error: "Method not allowed" }, request, { status: 405 });
  }

  // Parse request body first to get shopDomain
  let body: any;
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: "Invalid JSON body" }, request, { status: 400 });
  }

  const { shopDomain, productId, variantId, mode, contentType, fileName, fileSize } = body;

  // Validate required fields
  if (!shopDomain) {
    return corsJson({ error: "Missing required field: shopDomain" }, request, { status: 400 });
  }

  if (!mode || !contentType || !fileName) {
    return corsJson({ error: "Missing required fields: mode, contentType, fileName" }, request, { status: 400 });
  }

  // Rate limit check (10/min per customer)
  const identifier = getIdentifier(request, "customer");
  const rateLimitResponse = await rateLimitGuard(identifier, "uploadIntent");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // Get shop from database
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return corsJson({ error: "Shop not found" }, request, { status: 404 });
  }


  // Validate mode
  if (!["3d_designer", "classic", "quick"].includes(mode)) {
    return corsJson({ error: "Invalid mode" }, request, { status: 400 });
  }

  // Check billing / plan limits
  const fileSizeMB = fileSize ? fileSize / (1024 * 1024) : 0;
  const billingCheck = await checkUploadAllowed(shop.id, mode, fileSizeMB);

  if (!billingCheck.allowed) {
    return corsJson({
      error: billingCheck.error,
      code: "BILLING_LIMIT",
    }, request, { status: 403 });
  }

  // Validate content type
  const allowedTypes = [
    "image/png", "image/jpeg", "image/webp",
    "application/pdf", "application/postscript", // AI/EPS
    "image/svg+xml",
  ];
  if (!allowedTypes.includes(contentType)) {
    return corsJson({ error: "Unsupported file type" }, request, { status: 400 });
  }

  // Check plan limits
  const planKey = shop.plan as keyof typeof PLAN_LIMITS;
  const limits = PLAN_LIMITS[planKey] || PLAN_LIMITS.free;

  // Check file size
  if (fileSize && fileSize > limits.maxSizeMB * 1024 * 1024) {
    return corsJson({
      error: `File too large. Max size for ${shop.plan} plan: ${limits.maxSizeMB}MB`,
      code: "FILE_TOO_LARGE",
      maxSizeMB: limits.maxSizeMB,
    }, request, { status: 413 });
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
      return corsJson({
        error: `Monthly upload limit reached (${limits.uploadsPerMonth})`,
        code: "LIMIT_REACHED",
        limit: limits.uploadsPerMonth,
        used: monthlyUploads,
      }, request, { status: 429 });
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
    const { url: uploadUrl, isLocal } = await getUploadSignedUrl(storageConfig, key, contentType);

    return corsJson({
      uploadId,
      itemId,
      uploadUrl,
      key,
      expiresIn: 900, // 15 minutes
      isLocal: isLocal || false, // Indicates if using local storage
      storageProvider: storageConfig.provider,
    }, request);
  } catch (error) {
    console.error("[Upload Intent] Error:", error);
    return corsJson({ error: "Failed to create upload intent" }, request, { status: 500 });
  }
}

