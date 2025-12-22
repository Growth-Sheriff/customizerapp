import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCorsOptions, corsJson } from "~/lib/cors.server";
import { rateLimitGuard, getIdentifier } from "~/lib/rateLimit.server";
import prisma from "~/lib/prisma.server";

// GET /api/upload/status/:id?shopDomain=xxx
export async function loader({ request, params }: LoaderFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }

  // Rate limiting (using admin limit for status checks)
  const identifier = getIdentifier(request, "customer");
  const rateLimitResponse = await rateLimitGuard(identifier, "adminApi");
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shopDomain");

  if (!shopDomain) {
    return corsJson({ error: "Missing shopDomain" }, request, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return corsJson({ error: "Shop not found" }, request, { status: 404 });
  }

  const uploadId = params.id;
  if (!uploadId) {
    return corsJson({ error: "Missing uploadId" }, request, { status: 400 });
  }

  const upload = await prisma.upload.findFirst({
    where: { id: uploadId, shopId: shop.id },
    include: {
      items: {
        select: {
          id: true,
          location: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          preflightStatus: true,
          preflightResult: true,
          thumbnailKey: true,
          previewKey: true,
          transform: true,
        },
      },
    },
  });

  if (!upload) {
    return corsJson({ error: "Upload not found" }, request, { status: 404 });
  }

  // Determine overall status based on items
  const itemStatuses = upload.items.map(i => i.preflightStatus);
  let overallPreflight: "pending" | "ok" | "warning" | "error" = "pending";

  if (itemStatuses.every(s => s === "ok")) {
    overallPreflight = "ok";
  } else if (itemStatuses.some(s => s === "error")) {
    overallPreflight = "error";
  } else if (itemStatuses.some(s => s === "warning")) {
    overallPreflight = "warning";
  }

  return corsJson({
    uploadId: upload.id,
    status: upload.status,
    mode: upload.mode,
    productId: upload.productId,
    variantId: upload.variantId,
    overallPreflight,
    preflightSummary: upload.preflightSummary,
    items: upload.items,
    createdAt: upload.createdAt,
    updatedAt: upload.updatedAt,
  }, request);
}

