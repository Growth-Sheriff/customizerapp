/**
 * Analytics Server Utilities
 * Comprehensive analytics with proper shop ID handling
 * 
 * @module analytics.server
 * @version 2.0.0
 */

import prisma from "./prisma.server";

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Get Shop ID from domain
// ═══════════════════════════════════════════════════════════════════════════

export async function getShopIdFromDomain(shopDomain: string): Promise<string | null> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  return shop?.id || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// VISITOR ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface VisitorStats {
  totalVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  totalSessions: number;
  avgSessionsPerVisitor: number;
  visitorsWithUploads: number;
  visitorsWithOrders: number;
  uploadConversionRate: number;
  orderConversionRate: number;
}

export interface VisitorGeo {
  country: string;
  count: number;
  percentage: number;
}

export interface VisitorDevice {
  type: string;
  count: number;
  percentage: number;
}

export interface VisitorBrowser {
  name: string;
  count: number;
  percentage: number;
}

export interface DailyVisitors {
  date: string;
  visitors: number;
  sessions: number;
  newVisitors: number;
}

export interface TopVisitor {
  id: string;
  country: string | null;
  deviceType: string | null;
  browser: string | null;
  totalSessions: number;
  totalUploads: number;
  totalOrders: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export async function getVisitorStats(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<VisitorStats> {
  const [
    totalVisitors,
    newVisitors,
    totalSessions,
    visitorsWithUploads,
    visitorsWithOrders,
  ] = await Promise.all([
    prisma.visitor.count({ where: { shopId } }),
    prisma.visitor.count({
      where: { shopId, firstSeenAt: { gte: startDate, lte: endDate } },
    }),
    prisma.visitorSession.count({
      where: { shopId, startedAt: { gte: startDate, lte: endDate } },
    }),
    prisma.visitor.count({
      where: { shopId, totalUploads: { gt: 0 } },
    }),
    prisma.visitor.count({
      where: { shopId, totalOrders: { gt: 0 } },
    }),
  ]);

  const returningVisitors = await prisma.visitor.count({
    where: { shopId, totalSessions: { gt: 1 } },
  });

  const avgSessionsPerVisitor = totalVisitors > 0 ? totalSessions / totalVisitors : 0;
  const uploadConversionRate = totalVisitors > 0 ? (visitorsWithUploads / totalVisitors) * 100 : 0;
  const orderConversionRate = totalVisitors > 0 ? (visitorsWithOrders / totalVisitors) * 100 : 0;

  return {
    totalVisitors,
    newVisitors,
    returningVisitors,
    totalSessions,
    avgSessionsPerVisitor,
    visitorsWithUploads,
    visitorsWithOrders,
    uploadConversionRate,
    orderConversionRate,
  };
}

export async function getVisitorsByCountry(shopId: string): Promise<VisitorGeo[]> {
  const results = await prisma.visitor.groupBy({
    by: ["country"],
    where: { shopId, country: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 15,
  });

  const total = results.reduce((sum, r) => sum + r._count.id, 0);

  return results.map((r) => ({
    country: r.country || "Unknown",
    count: r._count.id,
    percentage: total > 0 ? (r._count.id / total) * 100 : 0,
  }));
}

export async function getVisitorsByDevice(shopId: string): Promise<VisitorDevice[]> {
  const results = await prisma.visitor.groupBy({
    by: ["deviceType"],
    where: { shopId },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  const total = results.reduce((sum, r) => sum + r._count.id, 0);

  return results.map((r) => ({
    type: r.deviceType || "Unknown",
    count: r._count.id,
    percentage: total > 0 ? (r._count.id / total) * 100 : 0,
  }));
}

export async function getVisitorsByBrowser(shopId: string): Promise<VisitorBrowser[]> {
  const results = await prisma.visitor.groupBy({
    by: ["browser"],
    where: { shopId, browser: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  const total = results.reduce((sum, r) => sum + r._count.id, 0);

  return results.map((r) => ({
    name: r.browser || "Unknown",
    count: r._count.id,
    percentage: total > 0 ? (r._count.id / total) * 100 : 0,
  }));
}

export async function getDailyVisitors(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<DailyVisitors[]> {
  // Get sessions grouped by day
  const sessions = await prisma.visitorSession.findMany({
    where: { shopId, startedAt: { gte: startDate, lte: endDate } },
    select: { startedAt: true, visitorId: true },
  });

  const visitors = await prisma.visitor.findMany({
    where: { shopId, firstSeenAt: { gte: startDate, lte: endDate } },
    select: { firstSeenAt: true },
  });

  // Group by day
  const dayMap = new Map<string, { visitors: Set<string>; sessions: number; newVisitors: number }>();

  sessions.forEach((s) => {
    const day = s.startedAt.toISOString().split("T")[0];
    if (!dayMap.has(day)) {
      dayMap.set(day, { visitors: new Set(), sessions: 0, newVisitors: 0 });
    }
    const data = dayMap.get(day)!;
    data.visitors.add(s.visitorId);
    data.sessions++;
  });

  visitors.forEach((v) => {
    const day = v.firstSeenAt.toISOString().split("T")[0];
    if (dayMap.has(day)) {
      dayMap.get(day)!.newVisitors++;
    }
  });

  return Array.from(dayMap.entries())
    .map(([date, data]) => ({
      date,
      visitors: data.visitors.size,
      sessions: data.sessions,
      newVisitors: data.newVisitors,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getTopVisitors(shopId: string, limit = 20): Promise<TopVisitor[]> {
  const visitors = await prisma.visitor.findMany({
    where: { shopId },
    orderBy: [{ totalOrders: "desc" }, { totalUploads: "desc" }, { totalSessions: "desc" }],
    take: limit,
    select: {
      id: true,
      country: true,
      deviceType: true,
      browser: true,
      totalSessions: true,
      totalUploads: true,
      totalOrders: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  });

  return visitors;
}

// ═══════════════════════════════════════════════════════════════════════════
// ATTRIBUTION ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface AttributionStats {
  totalSessions: number;
  sessionsWithUTM: number;
  utmPercentage: number;
  topSource: string;
  topMedium: string;
  paidClicks: number;
}

export interface SourceBreakdown {
  source: string;
  sessions: number;
  uploads: number;
  orders: number;
  conversionRate: number;
}

export interface MediumBreakdown {
  medium: string;
  sessions: number;
  uploads: number;
  percentage: number;
}

export interface CampaignBreakdown {
  campaign: string;
  sessions: number;
  uploads: number;
  source: string | null;
}

export interface ClickIdStats {
  gclid: number;
  fbclid: number;
  msclkid: number;
  ttclid: number;
  total: number;
}

export interface ReferrerBreakdown {
  type: string;
  sessions: number;
  percentage: number;
}

export async function getAttributionStats(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<AttributionStats> {
  const [totalSessions, sessionsWithUTM] = await Promise.all([
    prisma.visitorSession.count({
      where: { shopId, startedAt: { gte: startDate, lte: endDate } },
    }),
    prisma.visitorSession.count({
      where: {
        shopId,
        startedAt: { gte: startDate, lte: endDate },
        utmSource: { not: null },
      },
    }),
  ]);

  // Top source
  const topSourceResult = await prisma.visitorSession.groupBy({
    by: ["utmSource"],
    where: { shopId, startedAt: { gte: startDate, lte: endDate }, utmSource: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 1,
  });

  // Top medium
  const topMediumResult = await prisma.visitorSession.groupBy({
    by: ["utmMedium"],
    where: { shopId, startedAt: { gte: startDate, lte: endDate }, utmMedium: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 1,
  });

  // Paid clicks
  const paidClicks = await prisma.visitorSession.count({
    where: {
      shopId,
      startedAt: { gte: startDate, lte: endDate },
      OR: [
        { gclid: { not: null } },
        { fbclid: { not: null } },
        { msclkid: { not: null } },
        { ttclid: { not: null } },
      ],
    },
  });

  return {
    totalSessions,
    sessionsWithUTM,
    utmPercentage: totalSessions > 0 ? (sessionsWithUTM / totalSessions) * 100 : 0,
    topSource: topSourceResult[0]?.utmSource || "N/A",
    topMedium: topMediumResult[0]?.utmMedium || "N/A",
    paidClicks,
  };
}

export async function getSourceBreakdown(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<SourceBreakdown[]> {
  const sessions = await prisma.visitorSession.groupBy({
    by: ["utmSource"],
    where: { shopId, startedAt: { gte: startDate, lte: endDate } },
    _count: { id: true },
    _sum: { uploadsInSession: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  return sessions.map((s) => ({
    source: s.utmSource || "direct",
    sessions: s._count.id,
    uploads: s._sum.uploadsInSession || 0,
    orders: 0, // Would need order data
    conversionRate: s._count.id > 0 ? ((s._sum.uploadsInSession || 0) / s._count.id) * 100 : 0,
  }));
}

export async function getMediumBreakdown(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<MediumBreakdown[]> {
  const sessions = await prisma.visitorSession.groupBy({
    by: ["utmMedium"],
    where: { shopId, startedAt: { gte: startDate, lte: endDate } },
    _count: { id: true },
    _sum: { uploadsInSession: true },
    orderBy: { _count: { id: "desc" } },
  });

  const total = sessions.reduce((sum, s) => sum + s._count.id, 0);

  return sessions.map((s) => ({
    medium: s.utmMedium || "none",
    sessions: s._count.id,
    uploads: s._sum.uploadsInSession || 0,
    percentage: total > 0 ? (s._count.id / total) * 100 : 0,
  }));
}

export async function getCampaignBreakdown(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<CampaignBreakdown[]> {
  const sessions = await prisma.visitorSession.groupBy({
    by: ["utmCampaign", "utmSource"],
    where: { shopId, startedAt: { gte: startDate, lte: endDate }, utmCampaign: { not: null } },
    _count: { id: true },
    _sum: { uploadsInSession: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  return sessions.map((s) => ({
    campaign: s.utmCampaign || "unknown",
    sessions: s._count.id,
    uploads: s._sum.uploadsInSession || 0,
    source: s.utmSource,
  }));
}

export async function getClickIdStats(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<ClickIdStats> {
  const [gclid, fbclid, msclkid, ttclid] = await Promise.all([
    prisma.visitorSession.count({
      where: { shopId, startedAt: { gte: startDate, lte: endDate }, gclid: { not: null } },
    }),
    prisma.visitorSession.count({
      where: { shopId, startedAt: { gte: startDate, lte: endDate }, fbclid: { not: null } },
    }),
    prisma.visitorSession.count({
      where: { shopId, startedAt: { gte: startDate, lte: endDate }, msclkid: { not: null } },
    }),
    prisma.visitorSession.count({
      where: { shopId, startedAt: { gte: startDate, lte: endDate }, ttclid: { not: null } },
    }),
  ]);

  return {
    gclid,
    fbclid,
    msclkid,
    ttclid,
    total: gclid + fbclid + msclkid + ttclid,
  };
}

export async function getReferrerBreakdown(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<ReferrerBreakdown[]> {
  const sessions = await prisma.visitorSession.groupBy({
    by: ["referrerType"],
    where: { shopId, startedAt: { gte: startDate, lte: endDate } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  const total = sessions.reduce((sum, s) => sum + s._count.id, 0);

  return sessions.map((s) => ({
    type: s.referrerType || "direct",
    sessions: s._count.id,
    percentage: total > 0 ? (s._count.id / total) * 100 : 0,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// COHORT ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface WeeklyCohort {
  weekStart: string;
  totalVisitors: number;
  week0: number;
  week1: number;
  week2: number;
  week3: number;
  week4: number;
}

export async function getWeeklyCohorts(shopId: string, weeks = 8): Promise<WeeklyCohort[]> {
  const cohorts: WeeklyCohort[] = [];
  const now = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (7 * (i + 1)));
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Get visitors who first appeared in this week
    const cohortVisitors = await prisma.visitor.findMany({
      where: {
        shopId,
        firstSeenAt: { gte: weekStart, lt: weekEnd },
      },
      select: { id: true },
    });

    const visitorIds = cohortVisitors.map((v) => v.id);
    const totalVisitors = visitorIds.length;

    if (totalVisitors === 0) {
      cohorts.push({
        weekStart: weekStart.toISOString().split("T")[0],
        totalVisitors: 0,
        week0: 0,
        week1: 0,
        week2: 0,
        week3: 0,
        week4: 0,
      });
      continue;
    }

    // Calculate retention for each subsequent week
    const retentionCounts = [0, 0, 0, 0, 0];

    for (let w = 0; w <= 4 && (i - w) >= 0; w++) {
      const retentionStart = new Date(weekStart);
      retentionStart.setDate(retentionStart.getDate() + (7 * w));
      
      const retentionEnd = new Date(retentionStart);
      retentionEnd.setDate(retentionEnd.getDate() + 7);

      if (retentionEnd <= now) {
        const activeCount = await prisma.visitorSession.count({
          where: {
            shopId,
            visitorId: { in: visitorIds },
            startedAt: { gte: retentionStart, lt: retentionEnd },
          },
        });
        
        // Count unique visitors who had sessions
        const uniqueActive = await prisma.visitorSession.groupBy({
          by: ["visitorId"],
          where: {
            shopId,
            visitorId: { in: visitorIds },
            startedAt: { gte: retentionStart, lt: retentionEnd },
          },
        });
        
        retentionCounts[w] = uniqueActive.length;
      }
    }

    cohorts.push({
      weekStart: weekStart.toISOString().split("T")[0],
      totalVisitors,
      week0: totalVisitors > 0 ? Math.round((retentionCounts[0] / totalVisitors) * 100) : 0,
      week1: totalVisitors > 0 ? Math.round((retentionCounts[1] / totalVisitors) * 100) : 0,
      week2: totalVisitors > 0 ? Math.round((retentionCounts[2] / totalVisitors) * 100) : 0,
      week3: totalVisitors > 0 ? Math.round((retentionCounts[3] / totalVisitors) * 100) : 0,
      week4: totalVisitors > 0 ? Math.round((retentionCounts[4] / totalVisitors) * 100) : 0,
    });
  }

  return cohorts;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════

export interface AIInsight {
  id: string;
  type: "positive" | "negative" | "neutral" | "suggestion";
  title: string;
  description: string;
  metric?: string;
  change?: number;
  priority: "high" | "medium" | "low";
}

export async function generateAIInsights(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<AIInsight[]> {
  const insights: AIInsight[] = [];

  // Get current period stats
  const stats = await getVisitorStats(shopId, startDate, endDate);

  // Compare with previous period
  const periodLength = endDate.getTime() - startDate.getTime();
  const prevStart = new Date(startDate.getTime() - periodLength);
  const prevEnd = startDate;
  const prevStats = await getVisitorStats(shopId, prevStart, prevEnd);

  // Visitor growth
  if (prevStats.totalVisitors > 0) {
    const growth = ((stats.newVisitors - prevStats.newVisitors) / prevStats.newVisitors) * 100;
    if (growth > 20) {
      insights.push({
        id: "visitor-growth",
        type: "positive",
        title: "Strong Visitor Growth",
        description: `New visitors increased by ${growth.toFixed(1)}% compared to the previous period.`,
        metric: `${stats.newVisitors} new visitors`,
        change: growth,
        priority: "high",
      });
    } else if (growth < -20) {
      insights.push({
        id: "visitor-decline",
        type: "negative",
        title: "Visitor Decline",
        description: `New visitors decreased by ${Math.abs(growth).toFixed(1)}% compared to the previous period.`,
        metric: `${stats.newVisitors} new visitors`,
        change: growth,
        priority: "high",
      });
    }
  }

  // Conversion rate insights
  if (stats.uploadConversionRate > 15) {
    insights.push({
      id: "good-upload-rate",
      type: "positive",
      title: "Excellent Upload Conversion",
      description: `${stats.uploadConversionRate.toFixed(1)}% of visitors are uploading designs. This is above average.`,
      metric: `${stats.visitorsWithUploads} uploaders`,
      priority: "medium",
    });
  } else if (stats.uploadConversionRate < 5 && stats.totalVisitors > 50) {
    insights.push({
      id: "low-upload-rate",
      type: "suggestion",
      title: "Low Upload Conversion",
      description: "Consider improving the upload flow visibility or adding incentives to increase uploads.",
      metric: `${stats.uploadConversionRate.toFixed(1)}% conversion`,
      priority: "high",
    });
  }

  // Returning visitors
  const returnRate = stats.totalVisitors > 0 ? (stats.returningVisitors / stats.totalVisitors) * 100 : 0;
  if (returnRate > 30) {
    insights.push({
      id: "good-retention",
      type: "positive",
      title: "Strong Customer Loyalty",
      description: `${returnRate.toFixed(1)}% of visitors return for multiple sessions, indicating good engagement.`,
      metric: `${stats.returningVisitors} returning visitors`,
      priority: "medium",
    });
  }

  // Device insights
  const devices = await getVisitorsByDevice(shopId);
  const mobileDevice = devices.find((d) => d.type === "mobile");
  if (mobileDevice && mobileDevice.percentage > 60) {
    insights.push({
      id: "mobile-heavy",
      type: "neutral",
      title: "Mobile-First Audience",
      description: `${mobileDevice.percentage.toFixed(1)}% of visitors use mobile devices. Ensure your upload flow is mobile-optimized.`,
      metric: `${mobileDevice.count} mobile visitors`,
      priority: "medium",
    });
  }

  // Add suggestion if no insights generated
  if (insights.length === 0) {
    insights.push({
      id: "collect-more-data",
      type: "neutral",
      title: "Gathering Data",
      description: "Continue collecting visitor data to generate personalized insights.",
      priority: "low",
    });
  }

  return insights;
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface UploadStats {
  totalUploads: number;
  completedUploads: number;
  failedUploads: number;
  successRate: number;
  avgFileSize: number;
  totalDataTransferred: number;
  totalItems: number;
}

export async function getUploadStats(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<UploadStats> {
  const [total, completed, failed] = await Promise.all([
    prisma.upload.count({
      where: { shopId, createdAt: { gte: startDate, lte: endDate } },
    }),
    prisma.upload.count({
      where: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
        status: { in: ["uploaded", "ready", "completed", "approved"] },
      },
    }),
    prisma.upload.count({
      where: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
        status: "failed",
      },
    }),
  ]);

  // Get file size stats from UploadItem (where fileSize is stored)
  const uploadIds = await prisma.upload.findMany({
    where: { shopId, createdAt: { gte: startDate, lte: endDate } },
    select: { id: true },
  });

  const itemStats = await prisma.uploadItem.aggregate({
    where: { uploadId: { in: uploadIds.map((u) => u.id) } },
    _avg: { fileSize: true },
    _sum: { fileSize: true },
    _count: { id: true },
  });

  return {
    totalUploads: total,
    completedUploads: completed,
    failedUploads: failed,
    successRate: total > 0 ? (completed / total) * 100 : 0,
    avgFileSize: itemStats._avg?.fileSize ?? 0,
    totalDataTransferred: itemStats._sum?.fileSize ?? 0,
    totalItems: itemStats._count?.id ?? 0,
  };
}
