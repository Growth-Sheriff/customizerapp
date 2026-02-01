/**
 * Analytics Server Utilities
 * Comprehensive analytics with proper shop ID handling
 *
 * @module analytics.server
 * @version 2.0.0
 */

import type { Decimal } from '@prisma/client/runtime/library'
import prisma from './prisma.server'

// Helper to convert Decimal to number
function toNumber(value: number | Decimal | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  return Number(value)
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Get Shop ID from domain
// ═══════════════════════════════════════════════════════════════════════════

export async function getShopIdFromDomain(shopDomain: string): Promise<string | null> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  })
  return shop?.id || null
}

// ═══════════════════════════════════════════════════════════════════════════
// VISITOR ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface VisitorStats {
  totalVisitors: number
  newVisitors: number
  returningVisitors: number
  totalSessions: number
  avgSessionsPerVisitor: number
  visitorsWithUploads: number
  visitorsWithOrders: number
  uploadConversionRate: number
  orderConversionRate: number
}

export interface VisitorGeo {
  country: string
  count: number
  percentage: number
}

export interface VisitorDevice {
  type: string
  count: number
  percentage: number
}

export interface VisitorBrowser {
  name: string
  count: number
  percentage: number
}

export interface DailyVisitors {
  date: string
  visitors: number
  sessions: number
  newVisitors: number
}

export interface TopVisitor {
  id: string
  email: string | null
  country: string | null
  deviceType: string | null
  browser: string | null
  totalSessions: number
  totalUploads: number
  totalOrders: number
  firstSeenAt: Date
  lastSeenAt: Date
}

export async function getVisitorStats(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<VisitorStats> {
  const [totalVisitors, newVisitors, totalSessions, visitorsWithUploads, visitorsWithOrders] =
    await Promise.all([
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
    ])

  const returningVisitors = await prisma.visitor.count({
    where: { shopId, totalSessions: { gt: 1 } },
  })

  const avgSessionsPerVisitor = totalVisitors > 0 ? totalSessions / totalVisitors : 0
  const uploadConversionRate = totalVisitors > 0 ? (visitorsWithUploads / totalVisitors) * 100 : 0
  const orderConversionRate = totalVisitors > 0 ? (visitorsWithOrders / totalVisitors) * 100 : 0

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
  }
}

export async function getVisitorsByCountry(shopId: string): Promise<VisitorGeo[]> {
  const results = await prisma.visitor.groupBy({
    by: ['country'],
    where: { shopId, country: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 15,
  })

  const total = results.reduce((sum, r) => sum + r._count.id, 0)

  return results.map((r) => ({
    country: r.country || 'Unknown',
    count: r._count.id,
    percentage: total > 0 ? (r._count.id / total) * 100 : 0,
  }))
}

export async function getVisitorsByDevice(shopId: string): Promise<VisitorDevice[]> {
  const results = await prisma.visitor.groupBy({
    by: ['deviceType'],
    where: { shopId },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const total = results.reduce((sum, r) => sum + r._count.id, 0)

  return results.map((r) => ({
    type: r.deviceType || 'Unknown',
    count: r._count.id,
    percentage: total > 0 ? (r._count.id / total) * 100 : 0,
  }))
}

export async function getVisitorsByBrowser(shopId: string): Promise<VisitorBrowser[]> {
  const results = await prisma.visitor.groupBy({
    by: ['browser'],
    where: { shopId, browser: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  })

  const total = results.reduce((sum, r) => sum + r._count.id, 0)

  return results.map((r) => ({
    name: r.browser || 'Unknown',
    count: r._count.id,
    percentage: total > 0 ? (r._count.id / total) * 100 : 0,
  }))
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
  })

  const visitors = await prisma.visitor.findMany({
    where: { shopId, firstSeenAt: { gte: startDate, lte: endDate } },
    select: { firstSeenAt: true },
  })

  // Group by day
  const dayMap = new Map<string, { visitors: Set<string>; sessions: number; newVisitors: number }>()

  sessions.forEach((s) => {
    const day = s.startedAt.toISOString().split('T')[0]
    if (!dayMap.has(day)) {
      dayMap.set(day, { visitors: new Set(), sessions: 0, newVisitors: 0 })
    }
    const data = dayMap.get(day)!
    data.visitors.add(s.visitorId)
    data.sessions++
  })

  visitors.forEach((v) => {
    const day = v.firstSeenAt.toISOString().split('T')[0]
    if (dayMap.has(day)) {
      dayMap.get(day)!.newVisitors++
    }
  })

  return Array.from(dayMap.entries())
    .map(([date, data]) => ({
      date,
      visitors: data.visitors.size,
      sessions: data.sessions,
      newVisitors: data.newVisitors,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function getTopVisitors(shopId: string, limit = 20): Promise<TopVisitor[]> {
  const visitors = await prisma.visitor.findMany({
    where: { shopId },
    orderBy: [{ totalOrders: 'desc' }, { totalUploads: 'desc' }, { totalSessions: 'desc' }],
    take: limit,
    select: {
      id: true,
      customerEmail: true,
      country: true,
      deviceType: true,
      browser: true,
      totalSessions: true,
      totalUploads: true,
      totalOrders: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  })

  // Map customerEmail to email for consistent interface
  return visitors.map((v) => ({
    ...v,
    email: v.customerEmail,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════
// ATTRIBUTION ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface AttributionStats {
  totalSessions: number
  sessionsWithUTM: number
  utmPercentage: number
  topSource: string
  topMedium: string
  paidClicks: number
}

export interface SourceBreakdown {
  source: string
  sessions: number
  uploads: number
  orders: number
  conversionRate: number
}

export interface MediumBreakdown {
  medium: string
  sessions: number
  uploads: number
  percentage: number
}

export interface CampaignBreakdown {
  campaign: string
  sessions: number
  uploads: number
  source: string | null
}

export interface ClickIdStats {
  gclid: number
  fbclid: number
  msclkid: number
  ttclid: number
  total: number
}

export interface ReferrerBreakdown {
  type: string
  sessions: number
  percentage: number
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
  ])

  // Top source
  const topSourceResult = await prisma.visitorSession.groupBy({
    by: ['utmSource'],
    where: { shopId, startedAt: { gte: startDate, lte: endDate }, utmSource: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 1,
  })

  // Top medium
  const topMediumResult = await prisma.visitorSession.groupBy({
    by: ['utmMedium'],
    where: { shopId, startedAt: { gte: startDate, lte: endDate }, utmMedium: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 1,
  })

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
  })

  return {
    totalSessions,
    sessionsWithUTM,
    utmPercentage: totalSessions > 0 ? (sessionsWithUTM / totalSessions) * 100 : 0,
    topSource: topSourceResult[0]?.utmSource || 'N/A',
    topMedium: topMediumResult[0]?.utmMedium || 'N/A',
    paidClicks,
  }
}

export async function getSourceBreakdown(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<SourceBreakdown[]> {
  const sessions = await prisma.visitorSession.groupBy({
    by: ['utmSource'],
    where: { shopId, startedAt: { gte: startDate, lte: endDate } },
    _count: { id: true },
    _sum: { uploadsInSession: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  })

  return sessions.map((s) => ({
    source: s.utmSource || 'direct',
    sessions: s._count.id,
    uploads: s._sum.uploadsInSession || 0,
    orders: 0, // Would need order data
    conversionRate: s._count.id > 0 ? ((s._sum.uploadsInSession || 0) / s._count.id) * 100 : 0,
  }))
}

export async function getMediumBreakdown(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<MediumBreakdown[]> {
  const sessions = await prisma.visitorSession.groupBy({
    by: ['utmMedium'],
    where: { shopId, startedAt: { gte: startDate, lte: endDate } },
    _count: { id: true },
    _sum: { uploadsInSession: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const total = sessions.reduce((sum, s) => sum + s._count.id, 0)

  return sessions.map((s) => ({
    medium: s.utmMedium || 'none',
    sessions: s._count.id,
    uploads: s._sum.uploadsInSession || 0,
    percentage: total > 0 ? (s._count.id / total) * 100 : 0,
  }))
}

export async function getCampaignBreakdown(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<CampaignBreakdown[]> {
  const sessions = await prisma.visitorSession.groupBy({
    by: ['utmCampaign', 'utmSource'],
    where: { shopId, startedAt: { gte: startDate, lte: endDate }, utmCampaign: { not: null } },
    _count: { id: true },
    _sum: { uploadsInSession: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  })

  return sessions.map((s) => ({
    campaign: s.utmCampaign || 'unknown',
    sessions: s._count.id,
    uploads: s._sum.uploadsInSession || 0,
    source: s.utmSource,
  }))
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
  ])

  return {
    gclid,
    fbclid,
    msclkid,
    ttclid,
    total: gclid + fbclid + msclkid + ttclid,
  }
}

export async function getReferrerBreakdown(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<ReferrerBreakdown[]> {
  const sessions = await prisma.visitorSession.groupBy({
    by: ['referrerType'],
    where: { shopId, startedAt: { gte: startDate, lte: endDate } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const total = sessions.reduce((sum, s) => sum + s._count.id, 0)

  return sessions.map((s) => ({
    type: s.referrerType || 'direct',
    sessions: s._count.id,
    percentage: total > 0 ? (s._count.id / total) * 100 : 0,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════
// COHORT ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface WeeklyCohort {
  weekStart: string
  totalVisitors: number
  week0: number
  week1: number
  week2: number
  week3: number
  week4: number
}

export async function getWeeklyCohorts(shopId: string, weeks = 8): Promise<WeeklyCohort[]> {
  const cohorts: WeeklyCohort[] = []
  const now = new Date()

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - 7 * (i + 1))
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Start of week

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    // Get visitors who first appeared in this week
    const cohortVisitors = await prisma.visitor.findMany({
      where: {
        shopId,
        firstSeenAt: { gte: weekStart, lt: weekEnd },
      },
      select: { id: true },
    })

    const visitorIds = cohortVisitors.map((v) => v.id)
    const totalVisitors = visitorIds.length

    if (totalVisitors === 0) {
      cohorts.push({
        weekStart: weekStart.toISOString().split('T')[0],
        totalVisitors: 0,
        week0: 0,
        week1: 0,
        week2: 0,
        week3: 0,
        week4: 0,
      })
      continue
    }

    // Calculate retention for each subsequent week
    const retentionCounts = [0, 0, 0, 0, 0]

    for (let w = 0; w <= 4 && i - w >= 0; w++) {
      const retentionStart = new Date(weekStart)
      retentionStart.setDate(retentionStart.getDate() + 7 * w)

      const retentionEnd = new Date(retentionStart)
      retentionEnd.setDate(retentionEnd.getDate() + 7)

      if (retentionEnd <= now) {
        const activeCount = await prisma.visitorSession.count({
          where: {
            shopId,
            visitorId: { in: visitorIds },
            startedAt: { gte: retentionStart, lt: retentionEnd },
          },
        })

        // Count unique visitors who had sessions
        const uniqueActive = await prisma.visitorSession.groupBy({
          by: ['visitorId'],
          where: {
            shopId,
            visitorId: { in: visitorIds },
            startedAt: { gte: retentionStart, lt: retentionEnd },
          },
        })

        retentionCounts[w] = uniqueActive.length
      }
    }

    cohorts.push({
      weekStart: weekStart.toISOString().split('T')[0],
      totalVisitors,
      week0: totalVisitors > 0 ? Math.round((retentionCounts[0] / totalVisitors) * 100) : 0,
      week1: totalVisitors > 0 ? Math.round((retentionCounts[1] / totalVisitors) * 100) : 0,
      week2: totalVisitors > 0 ? Math.round((retentionCounts[2] / totalVisitors) * 100) : 0,
      week3: totalVisitors > 0 ? Math.round((retentionCounts[3] / totalVisitors) * 100) : 0,
      week4: totalVisitors > 0 ? Math.round((retentionCounts[4] / totalVisitors) * 100) : 0,
    })
  }

  return cohorts
}

// ═══════════════════════════════════════════════════════════════════════════
// AI INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════

export interface AIInsight {
  id: string
  type: 'positive' | 'negative' | 'neutral' | 'suggestion'
  title: string
  description: string
  metric?: string
  change?: number
  priority: 'high' | 'medium' | 'low'
}

export async function generateAIInsights(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<AIInsight[]> {
  const insights: AIInsight[] = []

  // Get current period stats
  const stats = await getVisitorStats(shopId, startDate, endDate)

  // Compare with previous period
  const periodLength = endDate.getTime() - startDate.getTime()
  const prevStart = new Date(startDate.getTime() - periodLength)
  const prevEnd = startDate
  const prevStats = await getVisitorStats(shopId, prevStart, prevEnd)

  // Visitor growth
  if (prevStats.totalVisitors > 0) {
    const growth = ((stats.newVisitors - prevStats.newVisitors) / prevStats.newVisitors) * 100
    if (growth > 20) {
      insights.push({
        id: 'visitor-growth',
        type: 'positive',
        title: 'Strong Visitor Growth',
        description: `New visitors increased by ${growth.toFixed(1)}% compared to the previous period.`,
        metric: `${stats.newVisitors} new visitors`,
        change: growth,
        priority: 'high',
      })
    } else if (growth < -20) {
      insights.push({
        id: 'visitor-decline',
        type: 'negative',
        title: 'Visitor Decline',
        description: `New visitors decreased by ${Math.abs(growth).toFixed(1)}% compared to the previous period.`,
        metric: `${stats.newVisitors} new visitors`,
        change: growth,
        priority: 'high',
      })
    }
  }

  // Conversion rate insights
  if (stats.uploadConversionRate > 15) {
    insights.push({
      id: 'good-upload-rate',
      type: 'positive',
      title: 'Excellent Upload Conversion',
      description: `${stats.uploadConversionRate.toFixed(1)}% of visitors are uploading designs. This is above average.`,
      metric: `${stats.visitorsWithUploads} uploaders`,
      priority: 'medium',
    })
  } else if (stats.uploadConversionRate < 5 && stats.totalVisitors > 50) {
    insights.push({
      id: 'low-upload-rate',
      type: 'suggestion',
      title: 'Low Upload Conversion',
      description:
        'Consider improving the upload flow visibility or adding incentives to increase uploads.',
      metric: `${stats.uploadConversionRate.toFixed(1)}% conversion`,
      priority: 'high',
    })
  }

  // Returning visitors
  const returnRate =
    stats.totalVisitors > 0 ? (stats.returningVisitors / stats.totalVisitors) * 100 : 0
  if (returnRate > 30) {
    insights.push({
      id: 'good-retention',
      type: 'positive',
      title: 'Strong Customer Loyalty',
      description: `${returnRate.toFixed(1)}% of visitors return for multiple sessions, indicating good engagement.`,
      metric: `${stats.returningVisitors} returning visitors`,
      priority: 'medium',
    })
  }

  // Device insights
  const devices = await getVisitorsByDevice(shopId)
  const mobileDevice = devices.find((d) => d.type === 'mobile')
  if (mobileDevice && mobileDevice.percentage > 60) {
    insights.push({
      id: 'mobile-heavy',
      type: 'neutral',
      title: 'Mobile-First Audience',
      description: `${mobileDevice.percentage.toFixed(1)}% of visitors use mobile devices. Ensure your upload flow is mobile-optimized.`,
      metric: `${mobileDevice.count} mobile visitors`,
      priority: 'medium',
    })
  }

  // Add suggestion if no insights generated
  if (insights.length === 0) {
    insights.push({
      id: 'collect-more-data',
      type: 'neutral',
      title: 'Gathering Data',
      description: 'Continue collecting visitor data to generate personalized insights.',
      priority: 'low',
    })
  }

  return insights
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface UploadStats {
  totalUploads: number
  completedUploads: number
  failedUploads: number
  successRate: number
  avgFileSize: number
  totalDataTransferred: number
  totalItems: number
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
        status: { in: ['uploaded', 'ready', 'completed', 'approved'] },
      },
    }),
    prisma.upload.count({
      where: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
        status: 'failed',
      },
    }),
  ])

  // Get file size stats from UploadItem (where fileSize is stored)
  const uploadIds = await prisma.upload.findMany({
    where: { shopId, createdAt: { gte: startDate, lte: endDate } },
    select: { id: true },
  })

  const itemStats = await prisma.uploadItem.aggregate({
    where: { uploadId: { in: uploadIds.map((u) => u.id) } },
    _avg: { fileSize: true },
    _sum: { fileSize: true },
    _count: { id: true },
  })

  return {
    totalUploads: total,
    completedUploads: completed,
    failedUploads: failed,
    successRate: total > 0 ? (completed / total) * 100 : 0,
    avgFileSize: itemStats._avg?.fileSize ?? 0,
    totalDataTransferred: itemStats._sum?.fileSize ?? 0,
    totalItems: itemStats._count?.id ?? 0,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER SEGMENTATION ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface CustomerSegmentation {
  loggedInCustomers: number
  anonymousVisitors: number
  loggedInPercentage: number
  loggedInUploads: number
  anonymousUploads: number
  loggedInOrders: number
  anonymousOrders: number
  loggedInRevenue: number
  anonymousRevenue: number
  loggedInConversionRate: number
  anonymousConversionRate: number
}

export interface CustomerMetrics {
  uniqueCustomers: number
  repeatCustomers: number
  newCustomers: number
  avgUploadsPerCustomer: number
  avgOrdersPerCustomer: number
  avgRevenuePerCustomer: number
  topCustomerRevenue: number
}

export interface CustomerByValue {
  customerId: string
  customerEmail: string | null
  totalUploads: number
  totalOrders: number
  totalRevenue: number
  firstPurchaseDate: Date | null
  lastPurchaseDate: Date | null
}

export async function getCustomerSegmentation(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<CustomerSegmentation> {
  // Logged-in customers (have customerEmail or customerId)
  const [
    loggedInCustomers,
    anonymousVisitors,
    loggedInUploads,
    anonymousUploads,
    uploadsWithOrders,
  ] = await Promise.all([
    // Unique logged-in customers
    prisma.upload
      .groupBy({
        by: ['customerId'],
        where: {
          shopId,
          createdAt: { gte: startDate, lte: endDate },
          customerId: { not: null },
        },
      })
      .then((r) => r.length),

    // Anonymous visitors (no customerId)
    prisma.upload.count({
      where: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
        customerId: null,
      },
    }),

    // Uploads from logged-in customers
    prisma.upload.count({
      where: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
        customerId: { not: null },
      },
    }),

    // Uploads from anonymous visitors
    prisma.upload.count({
      where: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
        customerId: null,
      },
    }),

    // Uploads that resulted in orders
    prisma.upload.findMany({
      where: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
        orderId: { not: null },
      },
      select: {
        customerId: true,
        orderTotal: true,
      },
    }),
  ])

  // Calculate orders and revenue by segment
  let loggedInOrders = 0
  let anonymousOrders = 0
  let loggedInRevenue = 0
  let anonymousRevenue = 0

  uploadsWithOrders.forEach((u) => {
    if (u.customerId) {
      loggedInOrders++
      loggedInRevenue += toNumber(u.orderTotal)
    } else {
      anonymousOrders++
      anonymousRevenue += toNumber(u.orderTotal)
    }
  })

  const totalCustomers = loggedInCustomers + anonymousVisitors
  const loggedInPercentage = totalCustomers > 0 ? (loggedInCustomers / totalCustomers) * 100 : 0

  const loggedInConversionRate = loggedInUploads > 0 ? (loggedInOrders / loggedInUploads) * 100 : 0
  const anonymousConversionRate =
    anonymousUploads > 0 ? (anonymousOrders / anonymousUploads) * 100 : 0

  return {
    loggedInCustomers,
    anonymousVisitors,
    loggedInPercentage,
    loggedInUploads,
    anonymousUploads,
    loggedInOrders,
    anonymousOrders,
    loggedInRevenue,
    anonymousRevenue,
    loggedInConversionRate,
    anonymousConversionRate,
  }
}

export async function getCustomerMetrics(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<CustomerMetrics> {
  // Get all uploads with customers
  const uploads = await prisma.upload.findMany({
    where: {
      shopId,
      createdAt: { gte: startDate, lte: endDate },
      customerId: { not: null },
    },
    select: {
      customerId: true,
      orderId: true,
      orderTotal: true,
      createdAt: true,
    },
  })

  // Group by customer
  const customerMap = new Map<
    string,
    {
      uploads: number
      orders: number
      revenue: number
      firstSeen: Date
      lastSeen: Date
    }
  >()

  uploads.forEach((u) => {
    if (!u.customerId) return

    const existing = customerMap.get(u.customerId)
    if (existing) {
      existing.uploads++
      if (u.orderId) existing.orders++
      existing.revenue += toNumber(u.orderTotal)
      if (u.createdAt < existing.firstSeen) existing.firstSeen = u.createdAt
      if (u.createdAt > existing.lastSeen) existing.lastSeen = u.createdAt
    } else {
      customerMap.set(u.customerId, {
        uploads: 1,
        orders: u.orderId ? 1 : 0,
        revenue: toNumber(u.orderTotal),
        firstSeen: u.createdAt,
        lastSeen: u.createdAt,
      })
    }
  })

  const uniqueCustomers = customerMap.size
  const repeatCustomers = Array.from(customerMap.values()).filter((c) => c.uploads > 1).length

  // New customers (first seen in this period)
  const newCustomers = Array.from(customerMap.values()).filter(
    (c) => c.firstSeen >= startDate
  ).length

  // Averages
  let totalUploads = 0
  let totalOrders = 0
  let totalRevenue = 0
  let topRevenue = 0

  customerMap.forEach((c) => {
    totalUploads += c.uploads
    totalOrders += c.orders
    totalRevenue += c.revenue
    if (c.revenue > topRevenue) topRevenue = c.revenue
  })

  return {
    uniqueCustomers,
    repeatCustomers,
    newCustomers,
    avgUploadsPerCustomer: uniqueCustomers > 0 ? totalUploads / uniqueCustomers : 0,
    avgOrdersPerCustomer: uniqueCustomers > 0 ? totalOrders / uniqueCustomers : 0,
    avgRevenuePerCustomer: uniqueCustomers > 0 ? totalRevenue / uniqueCustomers : 0,
    topCustomerRevenue: topRevenue,
  }
}

export async function getTopCustomersByValue(
  shopId: string,
  limit = 20
): Promise<CustomerByValue[]> {
  const uploads = await prisma.upload.findMany({
    where: {
      shopId,
      customerId: { not: null },
    },
    select: {
      customerId: true,
      customerEmail: true,
      orderId: true,
      orderTotal: true,
      orderPaidAt: true,
      createdAt: true,
    },
  })

  // Group by customer
  const customerMap = new Map<string, CustomerByValue>()

  uploads.forEach((u) => {
    if (!u.customerId) return

    const existing = customerMap.get(u.customerId)
    if (existing) {
      existing.totalUploads++
      if (u.orderId) {
        existing.totalOrders++
        existing.totalRevenue += toNumber(u.orderTotal)
        if (
          u.orderPaidAt &&
          (!existing.lastPurchaseDate || u.orderPaidAt > existing.lastPurchaseDate)
        ) {
          existing.lastPurchaseDate = u.orderPaidAt
        }
        if (
          u.orderPaidAt &&
          (!existing.firstPurchaseDate || u.orderPaidAt < existing.firstPurchaseDate)
        ) {
          existing.firstPurchaseDate = u.orderPaidAt
        }
      }
      // Update email if we have it
      if (u.customerEmail && !existing.customerEmail) {
        existing.customerEmail = u.customerEmail
      }
    } else {
      customerMap.set(u.customerId, {
        customerId: u.customerId,
        customerEmail: u.customerEmail,
        totalUploads: 1,
        totalOrders: u.orderId ? 1 : 0,
        totalRevenue: toNumber(u.orderTotal),
        firstPurchaseDate: u.orderPaidAt,
        lastPurchaseDate: u.orderPaidAt,
      })
    }
  })

  // Sort by revenue and return top N
  return Array.from(customerMap.values())
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit)
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE METRICS ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface FileMetrics {
  avgFileSize: number
  medianFileSize: number
  totalDataTransferred: number
  avgUploadDuration: number
  medianUploadDuration: number
  fileSizeDistribution: {
    range: string
    count: number
    percentage: number
  }[]
  uploadSpeedAvg: number // bytes per second
}

export interface FileTypeBreakdown {
  mimeType: string
  count: number
  percentage: number
  avgSize: number
}

export async function getFileMetrics(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<FileMetrics> {
  // Get all upload items in period
  const items = await prisma.uploadItem.findMany({
    where: {
      upload: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
      },
    },
  })

  if (items.length === 0) {
    return {
      avgFileSize: 0,
      medianFileSize: 0,
      totalDataTransferred: 0,
      avgUploadDuration: 0,
      medianUploadDuration: 0,
      fileSizeDistribution: [],
      uploadSpeedAvg: 0,
    }
  }

  // Calculate stats
  const fileSizes = items.map((i) => i.fileSize || 0).filter((s) => s > 0)
  const uploadDurations = items
    .map((i) => (i as any).uploadDurationMs || 0)
    .filter((d: number) => d > 0)

  fileSizes.sort((a, b) => a - b)
  uploadDurations.sort((a, b) => a - b)

  const avgFileSize =
    fileSizes.length > 0 ? fileSizes.reduce((a, b) => a + b, 0) / fileSizes.length : 0
  const medianFileSize = fileSizes.length > 0 ? fileSizes[Math.floor(fileSizes.length / 2)] : 0
  const totalDataTransferred = fileSizes.reduce((a, b) => a + b, 0)

  const avgUploadDuration =
    uploadDurations.length > 0
      ? uploadDurations.reduce((a, b) => a + b, 0) / uploadDurations.length
      : 0
  const medianUploadDuration =
    uploadDurations.length > 0 ? uploadDurations[Math.floor(uploadDurations.length / 2)] : 0

  // Calculate upload speed (bytes per second)
  let totalSpeed = 0
  let speedCount = 0
  items.forEach((i) => {
    const durationMs = (i as any).uploadDurationMs
    if (i.fileSize && durationMs && durationMs > 0) {
      totalSpeed += (i.fileSize / durationMs) * 1000 // bytes per second
      speedCount++
    }
  })
  const uploadSpeedAvg = speedCount > 0 ? totalSpeed / speedCount : 0

  // File size distribution
  const sizeRanges = [
    { range: '< 500 KB', min: 0, max: 500 * 1024 },
    { range: '500 KB - 1 MB', min: 500 * 1024, max: 1024 * 1024 },
    { range: '1 - 5 MB', min: 1024 * 1024, max: 5 * 1024 * 1024 },
    { range: '5 - 10 MB', min: 5 * 1024 * 1024, max: 10 * 1024 * 1024 },
    { range: '> 10 MB', min: 10 * 1024 * 1024, max: Infinity },
  ]

  const distribution = sizeRanges.map((r) => {
    const count = fileSizes.filter((s) => s >= r.min && s < r.max).length
    return {
      range: r.range,
      count,
      percentage: fileSizes.length > 0 ? (count / fileSizes.length) * 100 : 0,
    }
  })

  return {
    avgFileSize,
    medianFileSize,
    totalDataTransferred,
    avgUploadDuration,
    medianUploadDuration,
    fileSizeDistribution: distribution,
    uploadSpeedAvg,
  }
}

export async function getFileTypeBreakdown(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<FileTypeBreakdown[]> {
  const items = await prisma.uploadItem.groupBy({
    by: ['mimeType'],
    where: {
      upload: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
      },
    },
    _count: { id: true },
    _avg: { fileSize: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  })

  const total = items.reduce((sum, i) => sum + i._count.id, 0)

  return items.map((i) => ({
    mimeType: i.mimeType || 'unknown',
    count: i._count.id,
    percentage: total > 0 ? (i._count.id / total) * 100 : 0,
    avgSize: i._avg.fileSize || 0,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════
// VISITOR DETAIL ANALYTICS (OS, Screen Resolution)
// ═══════════════════════════════════════════════════════════════════════════

export interface VisitorOS {
  os: string
  count: number
  percentage: number
}

export interface ScreenResolution {
  resolution: string
  count: number
  percentage: number
}

export interface VisitorTimezone {
  timezone: string
  count: number
  percentage: number
}

export interface VisitorLanguage {
  language: string
  count: number
  percentage: number
}

export async function getVisitorsByOS(shopId: string): Promise<VisitorOS[]> {
  const results = await prisma.visitor.groupBy({
    by: ['os'],
    where: { shopId, os: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  })

  const total = results.reduce((sum, r) => sum + r._count.id, 0)

  return results.map((r) => ({
    os: r.os || 'Unknown',
    count: r._count.id,
    percentage: total > 0 ? (r._count.id / total) * 100 : 0,
  }))
}

export async function getVisitorsByScreenResolution(shopId: string): Promise<ScreenResolution[]> {
  const results = await prisma.visitor.groupBy({
    by: ['screenResolution'],
    where: { shopId, screenResolution: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  })

  const total = results.reduce((sum, r) => sum + r._count.id, 0)

  return results.map((r) => ({
    resolution: r.screenResolution || 'Unknown',
    count: r._count.id,
    percentage: total > 0 ? (r._count.id / total) * 100 : 0,
  }))
}

export async function getVisitorsByTimezone(shopId: string): Promise<VisitorTimezone[]> {
  const results = await prisma.visitor.groupBy({
    by: ['timezone'],
    where: { shopId, timezone: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 15,
  })

  const total = results.reduce((sum, r) => sum + r._count.id, 0)

  return results.map((r) => ({
    timezone: r.timezone || 'Unknown',
    count: r._count.id,
    percentage: total > 0 ? (r._count.id / total) * 100 : 0,
  }))
}

export async function getVisitorsByLanguage(shopId: string): Promise<VisitorLanguage[]> {
  const results = await prisma.visitor.groupBy({
    by: ['language'],
    where: { shopId, language: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  })

  const total = results.reduce((sum, r) => sum + r._count.id, 0)

  return results.map((r) => ({
    language: r.language || 'Unknown',
    count: r._count.id,
    percentage: total > 0 ? (r._count.id / total) * 100 : 0,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════
// REVENUE ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface RevenueStats {
  totalRevenue: number
  avgOrderValue: number
  totalOrders: number
  revenueByMode: { mode: string; revenue: number; orders: number }[]
  revenueByDay: { date: string; revenue: number; orders: number }[]
  conversionFunnel: {
    visitors: number
    uploads: number
    cartAdds: number
    orders: number
  }
}

export async function getRevenueStats(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<RevenueStats> {
  // Get uploads with orders
  const uploads = await prisma.upload.findMany({
    where: {
      shopId,
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      mode: true,
      orderId: true,
      orderTotal: true,
      orderCurrency: true,
      orderPaidAt: true,
      cartAddedAt: true,
      createdAt: true,
    },
  })

  // Total revenue and orders
  let totalRevenue = 0
  let totalOrders = 0
  const ordersSet = new Set<string>()

  uploads.forEach((u) => {
    if (u.orderId && !ordersSet.has(u.orderId)) {
      ordersSet.add(u.orderId)
      totalRevenue += toNumber(u.orderTotal)
      totalOrders++
    }
  })

  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

  // Revenue by mode
  const modeMap = new Map<string, { revenue: number; orders: Set<string> }>()
  uploads.forEach((u) => {
    if (!u.orderId) return
    const existing = modeMap.get(u.mode)
    if (existing) {
      if (!existing.orders.has(u.orderId)) {
        existing.orders.add(u.orderId)
        existing.revenue += toNumber(u.orderTotal)
      }
    } else {
      const orderSet = new Set<string>()
      orderSet.add(u.orderId)
      modeMap.set(u.mode, {
        revenue: toNumber(u.orderTotal),
        orders: orderSet,
      })
    }
  })

  const revenueByMode = Array.from(modeMap.entries()).map(([mode, data]) => ({
    mode,
    revenue: data.revenue,
    orders: data.orders.size,
  }))

  // Revenue by day
  const dayMap = new Map<string, { revenue: number; orders: Set<string> }>()
  uploads.forEach((u) => {
    if (!u.orderId || !u.orderPaidAt) return
    const day = u.orderPaidAt.toISOString().split('T')[0]
    const existing = dayMap.get(day)
    if (existing) {
      if (!existing.orders.has(u.orderId)) {
        existing.orders.add(u.orderId)
        existing.revenue += toNumber(u.orderTotal)
      }
    } else {
      const orderSet = new Set<string>()
      orderSet.add(u.orderId)
      dayMap.set(day, {
        revenue: toNumber(u.orderTotal),
        orders: orderSet,
      })
    }
  })

  const revenueByDay = Array.from(dayMap.entries())
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      orders: data.orders.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Conversion funnel
  const [visitors, uploadsCount, cartAdds] = await Promise.all([
    prisma.visitor.count({
      where: { shopId, firstSeenAt: { gte: startDate, lte: endDate } },
    }),
    prisma.upload.count({
      where: { shopId, createdAt: { gte: startDate, lte: endDate } },
    }),
    prisma.upload.count({
      where: {
        shopId,
        createdAt: { gte: startDate, lte: endDate },
        cartAddedAt: { not: null },
      },
    }),
  ])

  return {
    totalRevenue,
    avgOrderValue,
    totalOrders,
    revenueByMode,
    revenueByDay,
    conversionFunnel: {
      visitors,
      uploads: uploadsCount,
      cartAdds,
      orders: totalOrders,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED AI INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════

export async function generateEnhancedAIInsights(
  shopId: string,
  startDate: Date,
  endDate: Date
): Promise<AIInsight[]> {
  const insights: AIInsight[] = []

  // Get all data
  const [
    visitorStats,
    uploadStats,
    customerSegmentation,
    customerMetrics,
    fileMetrics,
    revenueStats,
    deviceData,
  ] = await Promise.all([
    getVisitorStats(shopId, startDate, endDate),
    getUploadStats(shopId, startDate, endDate),
    getCustomerSegmentation(shopId, startDate, endDate),
    getCustomerMetrics(shopId, startDate, endDate),
    getFileMetrics(shopId, startDate, endDate),
    getRevenueStats(shopId, startDate, endDate),
    getVisitorsByDevice(shopId),
  ])

  // 1. Customer segmentation insight
  if (
    customerSegmentation.loggedInConversionRate >
    customerSegmentation.anonymousConversionRate * 1.5
  ) {
    insights.push({
      id: 'logged-in-converts-better',
      type: 'positive',
      title: 'Logged-in Customers Convert Better',
      description: `Logged-in customers have ${customerSegmentation.loggedInConversionRate.toFixed(1)}% conversion rate vs ${customerSegmentation.anonymousConversionRate.toFixed(1)}% for anonymous visitors. Consider adding login incentives.`,
      metric: `${customerSegmentation.loggedInOrders} orders from logged-in users`,
      priority: 'high',
    })
  }

  // 2. Anonymous visitors opportunity
  if (customerSegmentation.anonymousVisitors > customerSegmentation.loggedInCustomers * 2) {
    insights.push({
      id: 'anonymous-opportunity',
      type: 'suggestion',
      title: 'High Anonymous Traffic',
      description: `${customerSegmentation.anonymousVisitors} anonymous uploads vs ${customerSegmentation.loggedInCustomers} logged-in customers. Implement email capture to improve conversion.`,
      metric: `${((customerSegmentation.anonymousVisitors / (customerSegmentation.anonymousVisitors + customerSegmentation.loggedInCustomers)) * 100).toFixed(0)}% anonymous`,
      priority: 'high',
    })
  }

  // 3. File size optimization
  if (fileMetrics.avgFileSize > 5 * 1024 * 1024) {
    // > 5MB
    insights.push({
      id: 'large-files',
      type: 'suggestion',
      title: 'Large File Uploads',
      description: `Average file size is ${(fileMetrics.avgFileSize / 1024 / 1024).toFixed(1)} MB. Consider adding file compression guidance for faster uploads.`,
      metric: `Avg upload: ${(fileMetrics.avgUploadDuration / 1000).toFixed(1)}s`,
      priority: 'medium',
    })
  }

  // 4. Upload speed insight
  if (fileMetrics.uploadSpeedAvg > 0 && fileMetrics.uploadSpeedAvg < 500 * 1024) {
    // < 500 KB/s
    insights.push({
      id: 'slow-uploads',
      type: 'negative',
      title: 'Slow Upload Speeds',
      description: `Average upload speed is ${(fileMetrics.uploadSpeedAvg / 1024).toFixed(0)} KB/s. This may be affecting user experience and abandonment.`,
      metric: `Median duration: ${(fileMetrics.medianUploadDuration / 1000).toFixed(1)}s`,
      priority: 'high',
    })
  }

  // 5. Repeat customer value
  if (customerMetrics.repeatCustomers > 0 && customerMetrics.avgRevenuePerCustomer > 0) {
    const repeatRate =
      customerMetrics.uniqueCustomers > 0
        ? (customerMetrics.repeatCustomers / customerMetrics.uniqueCustomers) * 100
        : 0
    if (repeatRate > 20) {
      insights.push({
        id: 'good-retention',
        type: 'positive',
        title: 'Strong Customer Retention',
        description: `${repeatRate.toFixed(0)}% of customers return for more uploads. Average customer value is $${customerMetrics.avgRevenuePerCustomer.toFixed(2)}.`,
        metric: `${customerMetrics.repeatCustomers} repeat customers`,
        priority: 'medium',
      })
    }
  }

  // 6. Revenue insight
  if (revenueStats.totalRevenue > 0) {
    insights.push({
      id: 'revenue-summary',
      type: 'positive',
      title: 'Revenue Performance',
      description: `Total revenue: $${revenueStats.totalRevenue.toFixed(2)} from ${revenueStats.totalOrders} orders. Average order value: $${revenueStats.avgOrderValue.toFixed(2)}.`,
      metric: `$${revenueStats.avgOrderValue.toFixed(2)} AOV`,
      priority: 'high',
    })
  }

  // 7. Cart abandonment
  if (revenueStats.conversionFunnel.cartAdds > 0 && revenueStats.conversionFunnel.orders > 0) {
    const cartToOrderRate =
      (revenueStats.conversionFunnel.orders / revenueStats.conversionFunnel.cartAdds) * 100
    if (cartToOrderRate < 50) {
      insights.push({
        id: 'cart-abandonment',
        type: 'negative',
        title: 'High Cart Abandonment',
        description: `Only ${cartToOrderRate.toFixed(0)}% of cart additions result in orders. Consider implementing abandoned cart recovery.`,
        metric: `${revenueStats.conversionFunnel.cartAdds - revenueStats.conversionFunnel.orders} abandoned carts`,
        priority: 'high',
      })
    }
  }

  // 8. Mobile optimization
  const mobileDevice = deviceData.find((d) => d.type === 'mobile')
  if (mobileDevice && mobileDevice.percentage > 50) {
    insights.push({
      id: 'mobile-majority',
      type: 'neutral',
      title: 'Mobile-First Audience',
      description: `${mobileDevice.percentage.toFixed(0)}% of visitors use mobile. Ensure upload UX is optimized for touch devices.`,
      metric: `${mobileDevice.count} mobile visitors`,
      priority: 'medium',
    })
  }

  // 9. Upload success rate
  if (uploadStats.successRate < 90 && uploadStats.totalUploads > 10) {
    insights.push({
      id: 'upload-failures',
      type: 'negative',
      title: 'Upload Success Rate Below Target',
      description: `${uploadStats.successRate.toFixed(1)}% success rate. ${uploadStats.failedUploads} uploads failed. Investigate common failure causes.`,
      metric: `${uploadStats.failedUploads} failed uploads`,
      priority: 'high',
    })
  }

  // 10. Data transfer volume
  if (fileMetrics.totalDataTransferred > 1024 * 1024 * 1024) {
    // > 1GB
    insights.push({
      id: 'high-data-transfer',
      type: 'neutral',
      title: 'High Data Volume',
      description: `${(fileMetrics.totalDataTransferred / 1024 / 1024 / 1024).toFixed(2)} GB transferred. Monitor storage costs and consider CDN optimization.`,
      metric: `${(fileMetrics.totalDataTransferred / 1024 / 1024).toFixed(0)} MB total`,
      priority: 'low',
    })
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  // Return at least one insight
  if (insights.length === 0) {
    insights.push({
      id: 'gathering-data',
      type: 'neutral',
      title: 'Building Insights',
      description: 'Continue collecting data to generate personalized recommendations.',
      priority: 'low',
    })
  }

  return insights.slice(0, 10) // Return top 10 insights
}
