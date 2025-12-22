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
import { handleCorsOptions, corsJson } from "~/lib/cors.server";
import prisma from "~/lib/prisma.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }

  const productId = params.id;
  if (!productId) {
    return corsJson({ error: "Product ID required" }, request, { status: 400 });
  }

  // Get shop from query param
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  if (!shopDomain) {
    return corsJson({ error: "Shop domain required" }, request, { status: 400 });
  }

  try {
    // Find shop
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
    });

    if (!shop) {
      return corsJson({ error: "Shop not found" }, request, { status: 404 });
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
      return corsJson({
        productId: productGid,
        uploadEnabled: true,
        extraQuestions: [],
        tshirtEnabled: false,
        tshirtConfig: null,
      }, request);
    }

    // Return config
    return corsJson({
      productId: productGid,
      uploadEnabled: config.uploadEnabled,
      extraQuestions: config.extraQuestions || [],
      tshirtEnabled: config.tshirtEnabled,
      tshirtConfig: config.tshirtConfig || null,
    }, request);

  } catch (error) {
    console.error("[Product Config API] Error:", error);
    return corsJson({ error: "Failed to fetch config" }, request, { status: 500 });
  }
}
