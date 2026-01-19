/**
 * Visitor Analytics Dashboard
 * Shows visitor identification stats, returning visitors, geo distribution
 * 
 * @route /app/analytics/visitors
 * 
 * ⚠️ This is a NEW file - does not modify existing analytics
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Badge,
  DataTable,
  Select,
  ProgressBar,
  Divider,
  EmptyState,
  Banner,
  Icon,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({
      error: "Shop not found",
      stats: null,
      visitors: [],
      period: "30d",
    });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "30d";

  // Calculate date range
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "7d":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Get visitor stats
  const [
    totalVisitors,
    newVisitors,
    returningVisitors,
    totalSessions,
    visitorsWithUploads,
    visitorsWithOrders,
    topCountries,
    topDevices,
    recentVisitors,
    visitorsByDay,
  ] = await Promise.all([
    // Total unique visitors
    prisma.visitor.count({
      where: { shopId: shop.id },
    }),

    // New visitors in period
    prisma.visitor.count({
      where: {
        shopId: shop.id,
        firstSeenAt: { gte: startDate },
      },
    }),

    // Returning visitors (more than 1 session)
    prisma.visitor.count({
      where: {
        shopId: shop.id,
        totalSessions: { gt: 1 },
      },
    }),

    // Total sessions in period
    prisma.visitorSession.count({
      where: {
        shopId: shop.id,
        startedAt: { gte: startDate },
      },
    }),

    // Visitors with uploads
    prisma.visitor.count({
      where: {
        shopId: shop.id,
        totalUploads: { gt: 0 },
      },
    }),

    // Visitors with orders
    prisma.visitor.count({
      where: {
        shopId: shop.id,
        totalOrders: { gt: 0 },
      },
    }),

    // Top countries
    prisma.visitor.groupBy({
      by: ["country"],
      where: {
        shopId: shop.id,
        country: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // Top devices
    prisma.visitor.groupBy({
      by: ["deviceType"],
      where: {
        shopId: shop.id,
        deviceType: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // Recent visitors
    prisma.visitor.findMany({
      where: { shopId: shop.id },
      orderBy: { lastSeenAt: "desc" },
      take: 20,
      select: {
        id: true,
        country: true,
        city: true,
        deviceType: true,
        browser: true,
        firstSeenAt: true,
        lastSeenAt: true,
        totalSessions: true,
        totalUploads: true,
        totalOrders: true,
        customerEmail: true,
      },
    }),

    // Visitors by day (for chart)
    prisma.$queryRaw`
      SELECT DATE(first_seen_at) as date, COUNT(*) as count
      FROM visitors
      WHERE shop_id = ${shop.id} AND first_seen_at >= ${startDate}
      GROUP BY DATE(first_seen_at)
      ORDER BY date ASC
    ` as Promise<Array<{ date: Date; count: bigint }>>,
  ]);

  // Calculate metrics
  const returningRate = totalVisitors > 0 
    ? Math.round((returningVisitors / totalVisitors) * 100) 
    : 0;

  const uploadConversion = totalVisitors > 0
    ? Math.round((visitorsWithUploads / totalVisitors) * 100)
    : 0;

  const orderConversion = totalVisitors > 0
    ? Math.round((visitorsWithOrders / totalVisitors) * 100)
    : 0;

  return json({
    error: null,
    period,
    stats: {
      totalVisitors,
      newVisitors,
      returningVisitors,
      returningRate,
      totalSessions,
      visitorsWithUploads,
      visitorsWithOrders,
      uploadConversion,
      orderConversion,
      avgSessionsPerVisitor: totalVisitors > 0 
        ? (totalSessions / totalVisitors).toFixed(1) 
        : "0",
    },
    topCountries: topCountries.map((c) => ({
      country: c.country || "Unknown",
      count: c._count.id,
    })),
    topDevices: topDevices.map((d) => ({
      device: d.deviceType || "Unknown",
      count: d._count.id,
    })),
    visitors: recentVisitors.map((v) => ({
      ...v,
      firstSeenAt: v.firstSeenAt.toISOString(),
      lastSeenAt: v.lastSeenAt.toISOString(),
    })),
    visitorsByDay: (visitorsByDay || []).map((d) => ({
      date: d.date,
      count: Number(d.count),
    })),
  });
}

export default function VisitorAnalytics() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const handlePeriodChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("period", value);
      navigate(`?${params.toString()}`);
    },
    [navigate, searchParams]
  );

  if (data.error || !data.stats) {
    return (
      <Page title="Visitor Analytics">
        <Banner tone="critical">
          <p>{data.error || "Failed to load data"}</p>
        </Banner>
      </Page>
    );
  }

  const { stats, period } = data;
  const topCountries = "topCountries" in data ? data.topCountries : [];
  const topDevices = "topDevices" in data ? data.topDevices : [];
  const visitors = "visitors" in data ? data.visitors : [];

  if (!stats || stats.totalVisitors === 0) {
    return (
      <Page
        title="Visitor Analytics"
        backAction={{ content: "Analytics", url: "/app/analytics" }}
      >
        <Card>
          <EmptyState
            heading="No visitor data yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Visitor tracking will start collecting data once visitors interact
              with your customizer.
            </p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  // Prepare table data
  const tableRows = visitors.map((v) => [
    v.customerEmail || v.id.slice(0, 8) + "...",
    v.country || "-",
    v.deviceType || "-",
    v.totalSessions.toString(),
    v.totalUploads.toString(),
    v.totalOrders.toString(),
    new Date(v.lastSeenAt).toLocaleDateString(),
  ]);

  return (
    <Page
      title="Visitor Analytics"
      backAction={{ content: "Analytics", url: "/app/analytics" }}
      secondaryActions={[
        {
          content: "Attribution",
          url: "/app/analytics/attribution",
        },
      ]}
    >
      <Layout>
        {/* Period Selector */}
        <Layout.Section>
          <InlineStack align="end">
            <Select
              label="Period"
              labelInline
              options={[
                { label: "Last 7 days", value: "7d" },
                { label: "Last 30 days", value: "30d" },
                { label: "Last 90 days", value: "90d" },
              ]}
              value={period}
              onChange={handlePeriodChange}
            />
          </InlineStack>
        </Layout.Section>

        {/* Key Metrics */}
        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Total Visitors
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {stats.totalVisitors.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {stats.newVisitors} new in period
                  </Text>
                </BlockStack>
              </Card>
            </Box>

            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Returning Rate
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {stats.returningRate}%
                  </Text>
                  <ProgressBar progress={stats.returningRate} tone="primary" />
                </BlockStack>
              </Card>
            </Box>

            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Upload Conversion
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {stats.uploadConversion}%
                  </Text>
                  <ProgressBar
                    progress={stats.uploadConversion}
                    tone="success"
                  />
                </BlockStack>
              </Card>
            </Box>

            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Order Conversion
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {stats.orderConversion}%
                  </Text>
                  <ProgressBar
                    progress={stats.orderConversion}
                    tone="success"
                  />
                </BlockStack>
              </Card>
            </Box>
          </InlineStack>
        </Layout.Section>

        {/* Top Countries & Devices */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Top Countries
              </Text>
              <Divider />
              <BlockStack gap="300">
                {topCountries.slice(0, 5).map((c, i) => (
                  <InlineStack key={i} align="space-between">
                    <Text as="span">{c.country}</Text>
                    <Badge>{c.count.toLocaleString()}</Badge>
                  </InlineStack>
                ))}
                {topCountries.length === 0 && (
                  <Text as="p" tone="subdued">
                    No country data yet
                  </Text>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Devices
              </Text>
              <Divider />
              <BlockStack gap="300">
                {topDevices.map((d, i) => (
                  <InlineStack key={i} align="space-between">
                    <Text as="span">
                      {d.device.charAt(0).toUpperCase() + d.device.slice(1)}
                    </Text>
                    <Badge>{d.count.toLocaleString()}</Badge>
                  </InlineStack>
                ))}
                {topDevices.length === 0 && (
                  <Text as="p" tone="subdued">
                    No device data yet
                  </Text>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Recent Visitors Table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Recent Visitors
              </Text>
              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "numeric",
                  "numeric",
                  "numeric",
                  "text",
                ]}
                headings={[
                  "Visitor",
                  "Country",
                  "Device",
                  "Sessions",
                  "Uploads",
                  "Orders",
                  "Last Seen",
                ]}
                rows={tableRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
