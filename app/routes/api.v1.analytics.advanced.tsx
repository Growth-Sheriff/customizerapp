/**
 * Advanced Analytics API v1
 * Revenue attribution, cohorts, AI insights, time-to-convert
 * 
 * @route /api/v1/analytics/advanced
 * @version 1.0.0
 * 
 * ⚠️ ADDITIVE ONLY: New standalone API, no changes to existing routes
 */

import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "~/lib/prisma.server";
import {
  getRevenueMetrics,
  getTimeToConvert,
  getCohortData,
  getDevicePerformance,
  getGeoStats,
  generateAIInsights,
  markUploadAddedToCart,
} from "~/lib/analytics.server";
import { createHash } from "crypto";

// Types
interface TimeRange {
  start: Date;
  end: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function parseTimeRange(searchParams: URLSearchParams): TimeRange {
  const now = new Date();
  const days = parseInt(searchParams.get("days") || "30", 10);
  
  const start = searchParams.get("start")
    ? new Date(searchParams.get("start")!)
    : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  
  const end = searchParams.get("end")
    ? new Date(searchParams.get("end")!)
    : now;

  return { start, end };
}

async function authenticateRequest(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const apiKey = authHeader.slice(7);
  const keyHash = hashApiKey(apiKey);

  const keyRecord = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      status: "active",
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  if (!keyRecord) return null;

  // Update last used
  await prisma.apiKey.update({
    where: { id: keyRecord.id },
    data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
  });

  // Get shop
  const shop = await prisma.shop.findUnique({
    where: { id: keyRecord.shopId },
  });

  return shop;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADER - GET endpoints
// ═══════════════════════════════════════════════════════════════════════════

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = await authenticateRequest(request);
  
  if (!shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint") || "overview";
  const range = parseTimeRange(url.searchParams);

  try {
    switch (endpoint) {
      // ═════════════════════════════════════════════════════════════════════
      // Revenue Attribution
      // ═════════════════════════════════════════════════════════════════════
      case "revenue": {
        const metrics = await getRevenueMetrics(shop.id, range);
        return json({ success: true, data: metrics });
      }

      // ═════════════════════════════════════════════════════════════════════
      // Time to Convert
      // ═════════════════════════════════════════════════════════════════════
      case "time-to-convert": {
        const metrics = await getTimeToConvert(shop.id, range);
        return json({ success: true, data: metrics });
      }

      // ═════════════════════════════════════════════════════════════════════
      // Cohort Analysis
      // ═════════════════════════════════════════════════════════════════════
      case "cohorts": {
        const weeks = parseInt(url.searchParams.get("weeks") || "8", 10);
        const data = await getCohortData(shop.id, weeks);
        return json({ success: true, data });
      }

      // ═════════════════════════════════════════════════════════════════════
      // Device Performance
      // ═════════════════════════════════════════════════════════════════════
      case "devices": {
        const data = await getDevicePerformance(shop.id, range);
        return json({ success: true, data });
      }

      // ═════════════════════════════════════════════════════════════════════
      // Geo Analytics
      // ═════════════════════════════════════════════════════════════════════
      case "geo": {
        const data = await getGeoStats(shop.id, range);
        return json({ success: true, data });
      }

      // ═════════════════════════════════════════════════════════════════════
      // AI Insights
      // ═════════════════════════════════════════════════════════════════════
      case "insights": {
        const insights = await generateAIInsights(shop.id, range);
        return json({ success: true, data: insights });
      }

      // ═════════════════════════════════════════════════════════════════════
      // Overview (All metrics combined)
      // ═════════════════════════════════════════════════════════════════════
      case "overview": {
        const [revenue, timeToConvert, devices, geoData, insights] =
          await Promise.all([
            getRevenueMetrics(shop.id, range),
            getTimeToConvert(shop.id, range),
            getDevicePerformance(shop.id, range),
            getGeoStats(shop.id, range),
            generateAIInsights(shop.id, range),
          ]);

        return json({
          success: true,
          data: {
            revenue,
            timeToConvert,
            devices,
            topCountries: geoData.slice(0, 10),
            insights,
          },
        });
      }

      default:
        return json(
          { error: `Unknown endpoint: ${endpoint}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[Analytics Advanced API] Error:", error);
    return json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION - POST endpoints
// ═══════════════════════════════════════════════════════════════════════════

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const shop = await authenticateRequest(request);
  
  if (!shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");

  try {
    switch (endpoint) {
      // ═════════════════════════════════════════════════════════════════════
      // Track cart addition
      // ═════════════════════════════════════════════════════════════════════
      case "track-cart": {
        const body = await request.json();
        const { uploadId } = body;

        if (!uploadId) {
          return json({ error: "uploadId is required" }, { status: 400 });
        }

        // Verify upload belongs to shop
        const upload = await prisma.upload.findFirst({
          where: { id: uploadId, shopId: shop.id },
        });

        if (!upload) {
          return json({ error: "Upload not found" }, { status: 404 });
        }

        await markUploadAddedToCart(uploadId);
        return json({ success: true });
      }

      default:
        return json(
          { error: `Unknown endpoint: ${endpoint}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[Analytics Advanced API] Action error:", error);
    return json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
