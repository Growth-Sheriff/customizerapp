import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getShopFromSession } from "~/lib/session.server";
import prisma from "~/lib/prisma.server";

// GET /api/upload/status/:id
export async function loader({ request, params }: LoaderFunctionArgs) {
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

  const uploadId = params.id;
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
    return json({ error: "Upload not found" }, { status: 404 });
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

  return json({
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
  });
}

