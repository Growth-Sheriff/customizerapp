import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCorsOptions, corsJson } from "~/lib/cors.server";
import { rateLimitGuard, getIdentifier } from "~/lib/rateLimit.server";
import prisma from "~/lib/prisma.server";
import { getStorageConfig, getDownloadSignedUrl } from "~/lib/storage.server";

// GET /api/asset-sets/:id
export async function loader({ request, params }: LoaderFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }

  // Rate limiting
  const identifier = getIdentifier(request, "customer");
  const rateLimitResponse = await rateLimitGuard(identifier, "adminApi");
  if (rateLimitResponse) return rateLimitResponse;

  const assetSetId = params.id;

  if (!assetSetId) {
    return corsJson({ error: "Missing asset set ID" }, request, { status: 400 });
  }

  // Get asset set (public for storefront)
  const assetSet = await prisma.assetSet.findFirst({
    where: { id: assetSetId, status: "active" },
    include: {
      shop: {
        select: {
          shopDomain: true,
          storageConfig: true,
        },
      },
    },
  });

  if (!assetSet) {
    return corsJson({ error: "Asset set not found" }, request, { status: 404 });
  }

  const schema = assetSet.schema as Record<string, unknown>;

  // Get signed URL for model if it's a storage key
  let modelUrl = (schema.model as any)?.source || "";
  if (modelUrl && !modelUrl.startsWith("http") && !modelUrl.startsWith("default_")) {
    try {
      const storageConfig = getStorageConfig(assetSet.shop.storageConfig as any);
      modelUrl = await getDownloadSignedUrl(storageConfig, modelUrl, 3600);
    } catch (e) {
      console.error("Failed to get model URL:", e);
    }
  }

  return corsJson({
    id: assetSet.id,
    name: assetSet.name,
    version: (schema as any).version || "1.0",
    model: {
      type: (schema.model as any)?.type || "glb",
      source: (schema.model as any)?.source || "default_tshirt.glb",
      url: modelUrl,
    },
    printLocations: (schema as any).printLocations || [],
    cameraPresets: (schema as any).cameraPresets || [],
    renderPreset: (schema as any).renderPreset || {},
    uploadPolicy: (schema as any).uploadPolicy || {
      maxFileSizeMB: 25,
      minDPI: 150,
      allowedFormats: ["image/png", "image/jpeg", "application/pdf"],
    },
  }, request);
}

