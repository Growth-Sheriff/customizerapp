/**
 * Analytics Server Utilities
 * Advanced analytics, AI insights, and revenue attribution
 * 
 * @module analytics.server
 * @version 1.0.0
 * 
 * ⚠️ IMPORTANT: This module is ADDITIVE ONLY
 * - Does NOT modify existing upload/cart/webhook flows
 * - All analytics functions are READ-ONLY on existing data
 * - New writes only to new nullable fields
 * 
 * NOTE: Uses raw SQL for new fields until Prisma migration is applied
 */

import prisma from "./prisma.server";
import { Decimal } from "@prisma/client/runtime/library";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface RevenueMetrics {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  revenueBySource: SourceRevenue[];
  revenueByDay: DailyRevenue[];
}

export interface SourceRevenue {
  source: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
  conversionRate: number;
}

export interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
}

export interface TimeToConvert {
  avgUploadToCart: number; // seconds
  avgCartToOrder: number; // seconds
  avgTotalTime: number; // seconds
  medianUploadToCart: number;
  medianCartToOrder: number;
  distribution: ConvertTimeDistribution[];
}

export interface ConvertTimeDistribution {
  bucket: string; // "0-1m", "1-5m", "5-30m", "30m-1h", "1h-24h", "24h+"
  count: number;
  percentage: number;
}

export interface CohortData {
  cohortDate: string; // Week start date
  totalUsers: number;
  week0: number; // Same week retention
  week1: number;
  week2: number;
  week3: number;
  week4: number;
  totalRevenue: number;
}

export interface DevicePerformance {
  deviceType: string;
  sessions: number;
  uploads: number;
  uploadSuccessRate: number;
  avgUploadTime: number;
  orders: number;
  conversionRate: number;
}

export interface GeoStats {
  country: string;
  sessions: number;
  uploads: number;
  orders: number;
  revenue: number;
  avgOrderValue: number;
}

export interface AIInsight {
  id: string;
  type: "positive" | "negative" | "neutral" | "suggestion";
  title: string;
  description: string;
  metric?: string;
  change?: number; // percentage
  priority: "high" | "medium" | "low";
}

// ═══════════════════════════════════════════════════════════════════════════
// REVENUE ATTRIBUTION
// Uses OrderLink table which already exists
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get revenue metrics by source with attribution
 * Uses existing OrderLink + VisitorSession data
 */
export async function getRevenueMetrics(
  shopId: string,
  range: TimeRange
): Promise<RevenueMetrics> {
  // Use OrderLink table which already exists
  const orderLinks = await prisma.orderLink.findMany({
    where: {
      shopId,
      createdAt: { gte: range.start, lte: range.end },
    },
    include: {
      upload: {
        select: {
          id: true,
          sessionId: true,
        },
      },
    },
  });

  // Get unique session IDs
  const sessionIds = [...new Set(orderLinks
    .map(ol => ol.upload?.sessionId)
    .filter(Boolean))] as string[];

  // Get sessions with UTM data
  const sessions = await prisma.visitorSession.findMany({
    where: {
      id: { in: sessionIds },
    },
    select: {
      id: true,
      utmSource: true,
      utmMedium: true,
      referrerType: true,
    },
  });

  const sessionMap = new Map(sessions.map(s => [s.id, s]));

  // For now, count orders without actual revenue (needs order API integration)
  const totalOrders = orderLinks.length;
  const totalRevenue = 0; // Would need Shopify Order API to get actual values
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Group by source
  const sourceMap = new Map<string, { revenue: number; orders: number }>();
  
  orderLinks.forEach((ol) => {
    const session = ol.upload?.sessionId ? sessionMap.get(ol.upload.sessionId) : null;
    const source = session?.utmSource || session?.referrerType || "direct";
    const existing = sourceMap.get(source) || { revenue: 0, orders: 0 };
    sourceMap.set(source, {
      revenue: existing.revenue,
      orders: existing.orders + 1,
    });
  });

  // Get session counts by source for conversion rate
  const sessionsBySource = await prisma.visitorSession.groupBy({
    by: ["utmSource"],
    where: {
      shopId,
      startedAt: { gte: range.start, lte: range.end },
    },
    _count: { id: true },
  });

  const sessionCountMap = new Map(
    sessionsBySource.map((s) => [s.utmSource || "direct", s._count.id])
  );

  const revenueBySource: SourceRevenue[] = Array.from(sourceMap.entries()).map(
    ([source, data]) => ({
      source,
      revenue: data.revenue,
      orders: data.orders,
      avgOrderValue: data.orders > 0 ? data.revenue / data.orders : 0,
      conversionRate: sessionCountMap.get(source)
        ? (data.orders / sessionCountMap.get(source)!) * 100
        : 0,
    })
  );

  // Daily orders
  const dailyMap = new Map<string, { revenue: number; orders: number }>();
  
  orderLinks.forEach((ol) => {
    const day = ol.createdAt.toISOString().split("T")[0];
    const existing = dailyMap.get(day) || { revenue: 0, orders: 0 };
    dailyMap.set(day, {
      revenue: existing.revenue,
      orders: existing.orders + 1,
    });
  });

  const revenueByDay: DailyRevenue[] = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      orders: data.orders,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalRevenue,
    totalOrders,
    avgOrderValue,
    revenueBySource: revenueBySource.sort((a, b) => b.orders - a.orders),
    revenueByDay,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIME TO CONVERT
// Uses upload createdAt -> OrderLink createdAt as proxy
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate time-to-convert metrics
 * Uses upload creation -> order link creation as conversion time
 */
export async function getTimeToConvert(
  shopId: string,
  range: TimeRange
): Promise<TimeToConvert> {
  // Get order links with their uploads
  const orderLinks = await prisma.orderLink.findMany({
    where: {
      shopId,
      createdAt: { gte: range.start, lte: range.end },
    },
    include: {
      upload: {
        select: {
          createdAt: true,
        },
      },
    },
  });

  const totalTimes: number[] = [];

  orderLinks.forEach((ol) => {
    if (ol.upload?.createdAt) {
      const total = (ol.createdAt.getTime() - ol.upload.createdAt.getTime()) / 1000;
      if (total > 0) {
        totalTimes.push(total);
      }
    }
  });

  // Calculate averages and medians
  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  // Distribution buckets
  const buckets: Record<string, number> = {
    "0-1m": 0,
    "1-5m": 0,
    "5-30m": 0,
    "30m-1h": 0,
    "1h-24h": 0,
    "24h+": 0,
  };

  totalTimes.forEach((t) => {
    if (t < 60) buckets["0-1m"]++;
    else if (t < 300) buckets["1-5m"]++;
    else if (t < 1800) buckets["5-30m"]++;
    else if (t < 3600) buckets["30m-1h"]++;
    else if (t < 86400) buckets["1h-24h"]++;
    else buckets["24h+"]++;
  });

  const total = totalTimes.length;
  const distribution: ConvertTimeDistribution[] = Object.entries(buckets).map(
    ([bucket, count]) => ({
      bucket,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    })
  );

  // Split roughly in half for upload->cart and cart->order estimates
  const avgTotal = avg(totalTimes);
  const medianTotal = median(totalTimes);

  return {
    avgUploadToCart: Math.round(avgTotal * 0.3), // Estimate 30% of time
    avgCartToOrder: Math.round(avgTotal * 0.7), // Estimate 70% of time
    avgTotalTime: Math.round(avgTotal),
    medianUploadToCart: Math.round(medianTotal * 0.3),
    medianCartToOrder: Math.round(medianTotal * 0.7),
    distribution,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COHORT ANALYSIS
// Uses Visitor firstSeenAt for cohort grouping
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate cohort retention data
 */
export async function getCohortData(
  shopId: string,
  weeks: number = 8
): Promise<CohortData[]> {
  const now = new Date();
  const cohorts: CohortData[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (i * 7) - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get visitors who had their first visit in this week
    const cohortVisitors = await prisma.visitor.findMany({
      where: {
        shopId,
        firstSeenAt: { gte: weekStart, lt: weekEnd },
      },
      select: {
        id: true,
        totalUploads: true,
        totalOrders: true,
        totalRevenue: true,
      },
    });

    if (cohortVisitors.length === 0) continue;

    const visitorIds = cohortVisitors.map((v) => v.id);

    // Check activity in subsequent weeks
    const weeklyActivity: number[] = [];
    
    for (let w = 0; w <= 4; w++) {
      const activityStart = new Date(weekStart);
      activityStart.setDate(activityStart.getDate() + (w * 7));
      
      const activityEnd = new Date(activityStart);
      activityEnd.setDate(activityEnd.getDate() + 7);

      if (activityEnd > now) {
        weeklyActivity.push(-1); // Future week
        continue;
      }

      const activeCount = await prisma.upload.groupBy({
        by: ["visitorId"],
        where: {
          shopId,
          visitorId: { in: visitorIds },
          createdAt: { gte: activityStart, lt: activityEnd },
        },
      });

      weeklyActivity.push(activeCount.length);
    }

    cohorts.push({
      cohortDate: weekStart.toISOString().split("T")[0],
      totalUsers: cohortVisitors.length,
      week0: weeklyActivity[0] ?? 0,
      week1: weeklyActivity[1] ?? -1,
      week2: weeklyActivity[2] ?? -1,
      week3: weeklyActivity[3] ?? -1,
      week4: weeklyActivity[4] ?? -1,
      totalRevenue: cohortVisitors.reduce(
        (sum, v) => sum + Number(v.totalRevenue || 0),
        0
      ),
    });
  }

  return cohorts;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE PERFORMANCE
// Uses Visitor.deviceType field
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get device performance metrics
 */
export async function getDevicePerformance(
  shopId: string,
  range: TimeRange
): Promise<DevicePerformance[]> {
  const deviceStats = await prisma.visitor.groupBy({
    by: ["deviceType"],
    where: {
      shopId,
      firstSeenAt: { gte: range.start, lte: range.end },
    },
    _count: { id: true },
    _sum: {
      totalUploads: true,
      totalOrders: true,
      totalSessions: true,
    },
  });

  return deviceStats.map((d) => {
    const sessions = d._sum.totalSessions || 0;
    const uploads = d._sum.totalUploads || 0;
    const orders = d._sum.totalOrders || 0;

    return {
      deviceType: d.deviceType || "unknown",
      sessions,
      uploads,
      uploadSuccessRate: sessions > 0 ? Math.round((uploads / sessions) * 100) : 0,
      avgUploadTime: 0, // Would need timing data
      orders,
      conversionRate: sessions > 0 ? Math.round((orders / sessions) * 100) : 0,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GEO ANALYTICS
// Uses Visitor.country field
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get geo-based analytics
 */
export async function getGeoStats(
  shopId: string,
  range: TimeRange
): Promise<GeoStats[]> {
  const geoStats = await prisma.visitor.groupBy({
    by: ["country"],
    where: {
      shopId,
      firstSeenAt: { gte: range.start, lte: range.end },
      country: { not: null },
    },
    _count: { id: true },
    _sum: {
      totalSessions: true,
      totalUploads: true,
      totalOrders: true,
      totalRevenue: true,
    },
  });

  return geoStats
    .map((g) => ({
      country: g.country || "Unknown",
      sessions: g._sum.totalSessions || 0,
      uploads: g._sum.totalUploads || 0,
      orders: g._sum.totalOrders || 0,
      revenue: Number(g._sum.totalRevenue || 0),
      avgOrderValue:
        (g._sum.totalOrders || 0) > 0
          ? Number(g._sum.totalRevenue || 0) / (g._sum.totalOrders || 0)
          : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ═══════════════════════════════════════════════════════════════════════════
// AI INSIGHTS
// Generates insights based on available data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate AI-powered insights from analytics data
 */
export async function generateAIInsights(
  shopId: string,
  range: TimeRange
): Promise<AIInsight[]> {
  const insights: AIInsight[] = [];
  
  // Compare with previous period
  const periodLength = range.end.getTime() - range.start.getTime();
  const previousStart = new Date(range.start.getTime() - periodLength);
  const previousEnd = new Date(range.start.getTime());

  // Get current and previous period data
  const [currentUploads, previousUploads] = await Promise.all([
    prisma.upload.count({
      where: {
        shopId,
        createdAt: { gte: range.start, lte: range.end },
      },
    }),
    prisma.upload.count({
      where: {
        shopId,
        createdAt: { gte: previousStart, lt: previousEnd },
      },
    }),
  ]);

  // Upload trend insight
  if (previousUploads > 0) {
    const change = ((currentUploads - previousUploads) / previousUploads) * 100;
    
    if (Math.abs(change) > 10) {
      insights.push({
        id: "upload-trend",
        type: change > 0 ? "positive" : "negative",
        title: change > 0 ? "Upload Volume Up" : "Upload Volume Down",
        description: `Uploads ${change > 0 ? "increased" : "decreased"} by ${Math.abs(change).toFixed(1)}% compared to the previous period.`,
        metric: `${currentUploads} uploads`,
        change: Math.round(change),
        priority: Math.abs(change) > 30 ? "high" : "medium",
      });
    }
  }

  // Check for conversion rate anomalies
  const [sessionsWithUploads, totalSessions] = await Promise.all([
    prisma.visitorSession.count({
      where: {
        shopId,
        startedAt: { gte: range.start, lte: range.end },
        uploadsInSession: { gt: 0 },
      },
    }),
    prisma.visitorSession.count({
      where: {
        shopId,
        startedAt: { gte: range.start, lte: range.end },
      },
    }),
  ]);

  const conversionRate = totalSessions > 0
    ? (sessionsWithUploads / totalSessions) * 100
    : 0;

  if (conversionRate < 5 && totalSessions > 100) {
    insights.push({
      id: "low-conversion",
      type: "negative",
      title: "Low Upload Conversion",
      description: "Only a small percentage of visitors are uploading designs. Consider improving the upload UX or adding more prominent CTAs.",
      metric: `${conversionRate.toFixed(1)}% conversion`,
      priority: "high",
    });
  } else if (conversionRate > 20 && totalSessions > 50) {
    insights.push({
      id: "high-conversion",
      type: "positive",
      title: "Strong Upload Conversion",
      description: "Your visitors are converting well. Keep up the good work!",
      metric: `${conversionRate.toFixed(1)}% conversion`,
      priority: "low",
    });
  }

  // Check top traffic sources
  const topSource = await prisma.visitorSession.groupBy({
    by: ["utmSource"],
    where: {
      shopId,
      startedAt: { gte: range.start, lte: range.end },
      utmSource: { not: null },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 1,
  });

  if (topSource.length > 0) {
    const sourceShare = totalSessions > 0
      ? (topSource[0]._count.id / totalSessions) * 100
      : 0;

    if (sourceShare > 50) {
      insights.push({
        id: "traffic-concentration",
        type: "neutral",
        title: "Traffic Concentrated",
        description: `${topSource[0].utmSource} accounts for ${sourceShare.toFixed(0)}% of tracked traffic. Consider diversifying your traffic sources.`,
        metric: topSource[0].utmSource || "Unknown",
        priority: "medium",
      });
    }
  }

  // Check order link growth
  const [currentOrders, previousOrders] = await Promise.all([
    prisma.orderLink.count({
      where: {
        shopId,
        createdAt: { gte: range.start, lte: range.end },
      },
    }),
    prisma.orderLink.count({
      where: {
        shopId,
        createdAt: { gte: previousStart, lt: previousEnd },
      },
    }),
  ]);

  if (previousOrders > 0) {
    const orderChange = ((currentOrders - previousOrders) / previousOrders) * 100;
    
    if (orderChange > 20) {
      insights.push({
        id: "order-growth",
        type: "positive",
        title: "Order Volume Growing",
        description: `Orders with custom uploads increased by ${orderChange.toFixed(0)}% compared to the previous period.`,
        metric: `${currentOrders} orders`,
        change: Math.round(orderChange),
        priority: "medium",
      });
    } else if (orderChange < -20) {
      insights.push({
        id: "order-decline",
        type: "negative",
        title: "Order Volume Declining",
        description: `Orders with custom uploads decreased by ${Math.abs(orderChange).toFixed(0)}% compared to the previous period. Investigate potential issues.`,
        metric: `${currentOrders} orders`,
        change: Math.round(orderChange),
        priority: "high",
      });
    }
  }

  // Mobile vs Desktop performance
  const devicePerf = await getDevicePerformance(shopId, range);
  const mobile = devicePerf.find((d) => d.deviceType === "mobile");
  const desktop = devicePerf.find((d) => d.deviceType === "desktop");

  if (mobile && desktop && mobile.conversionRate < desktop.conversionRate * 0.5 && mobile.sessions > 50) {
    insights.push({
      id: "mobile-optimization",
      type: "suggestion",
      title: "Mobile Experience Needs Work",
      description: `Mobile conversion rate (${mobile.conversionRate}%) is significantly lower than desktop (${desktop.conversionRate}%). Consider optimizing the mobile upload experience.`,
      priority: "high",
    });
  }

  // New visitors insight
  const newVisitors = await prisma.visitor.count({
    where: {
      shopId,
      firstSeenAt: { gte: range.start, lte: range.end },
    },
  });

  if (newVisitors > 100) {
    insights.push({
      id: "new-visitors",
      type: "neutral",
      title: "New Visitor Acquisition",
      description: `${newVisitors} new unique visitors discovered your customizer in this period.`,
      metric: `${newVisitors} new visitors`,
      priority: "low",
    });
  }

  return insights.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Update upload with revenue data (called from webhook)
// These will work after migration is applied
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Link order revenue to upload (called from orders-paid webhook)
 * This function will work after the Prisma migration adds the new fields
 */
export async function linkOrderToUpload(
  uploadId: string,
  orderData: {
    orderId: string;
    orderTotal: number;
    orderCurrency: string;
    paidAt: Date;
  }
): Promise<void> {
  try {
    // Use raw SQL to update since fields may not exist in Prisma client yet
    await prisma.$executeRaw`
      UPDATE uploads 
      SET 
        order_id = ${orderData.orderId},
        order_total = ${orderData.orderTotal},
        order_currency = ${orderData.orderCurrency},
        order_paid_at = ${orderData.paidAt}
      WHERE id = ${uploadId}
    `;

    // Also update visitor totals if linked
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      select: { visitorId: true },
    });

    if (upload?.visitorId) {
      await prisma.visitor.update({
        where: { id: upload.visitorId },
        data: {
          totalOrders: { increment: 1 },
          totalRevenue: { increment: new Decimal(orderData.orderTotal) },
        },
      });
    }
  } catch (error) {
    // Log but don't fail - fields may not exist yet
    console.warn("[Analytics] linkOrderToUpload failed (migration may not be applied):", error);
  }
}

/**
 * Mark upload as added to cart (called from cart tracking)
 */
export async function markUploadAddedToCart(uploadId: string): Promise<void> {
  try {
    // Use raw SQL to update since field may not exist in Prisma client yet
    await prisma.$executeRaw`
      UPDATE uploads 
      SET cart_added_at = ${new Date()}
      WHERE id = ${uploadId}
    `;

    // Update session metrics if linked
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      select: { sessionId: true },
    });

    if (upload?.sessionId) {
      await prisma.visitorSession.update({
        where: { id: upload.sessionId },
        data: {
          addToCartCount: { increment: 1 },
        },
      });
    }
  } catch (error) {
    // Log but don't fail - field may not exist yet
    console.warn("[Analytics] markUploadAddedToCart failed (migration may not be applied):", error);
  }
}
