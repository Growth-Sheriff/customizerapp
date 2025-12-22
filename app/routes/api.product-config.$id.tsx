/**
 * Product Config API - Storefront Endpoint
 * 
 * GET /api/product-config/:productId?shop=xxx.myshopify.com
 * 
 * Returns product configuration for the DTF Uploader widget:
 * - uploadEnabled: boolean
 * - extraQuestions: array of questions
 * - tshirtEnabled: boolean
 * - tshirtConfig: t-shirt addon settings
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { handleCorsOptions, getCorsHeaders } from "~/lib/cors.server";
import prisma from "~/lib/prisma.server";

// Helper to create cached CORS JSON response
function cachedCorsJson<T>(data: T, request: Request, options: { status?: number } = {}) {
  const corsHeaders = getCorsHeaders(request);
  const headers = new Headers();
  
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (value) headers.set(key, value);
  }
  
  // Cache for 5 minutes
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
  headers.set('Content-Type', 'application/json');
  
  return new Response(JSON.stringify(data), {
    status: options.status || 200,
    headers,
  });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }

  const productId = params.id;
  if (!productId) {
    return cachedCorsJson({ error: "Product ID required" }, request, { status: 400 });
  }

  // Get shop from query param
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  if (!shopDomain) {
    return cachedCorsJson({ error: "Shop domain required" }, request, { status: 400 });
  }

  try {
    // Find shop
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (!shop) {
      return cachedCorsJson({ error: "Shop not found" }, request, { status: 404 });
    }

    // Normalize product ID to GID format
    const productGid = productId.startsWith("gid://") 
      ? productId 
      : `gid://shopify/Product/${productId}`;

    // Get product config
    const config = await prisma.productConfig.findUnique({
      where: {
        shopId_productId: {
          shopId: shop.id,
          productId: productGid,
        },
      },
    });

    // If no config exists, return defaults (upload enabled, nothing else)
    if (!config) {
      return cachedCorsJson({
        productId: productGid,
        uploadEnabled: true,
        extraQuestions: [],
        tshirtEnabled: false,
        tshirtConfig: null,
      }, request);
    }

    // Return config
    return cachedCorsJson({
      productId: productGid,
      uploadEnabled: config.uploadEnabled,
      extraQuestions: config.extraQuestions || [],
      tshirtEnabled: config.tshirtEnabled,
      tshirtConfig: config.tshirtConfig || null,
    }, request);

  } catch (error) {
    console.error("[Product Config API] Error:", error);
    return cachedCorsJson({ error: "Failed to fetch config" }, request, { status: 500 });
  }
}
