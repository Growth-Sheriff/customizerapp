/**
 * Attribution Analytics Dashboard
 * Shows UTM campaign performance, referrer sources, conversion tracking
 * 
 * @route /app/analytics/attribution
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
  Tabs,
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

  // Get attribution stats
  const [
    // UTM Sources
    utmSources,
    // UTM Mediums
    utmMediums,
    // UTM Campaigns
    utmCampaigns,
    // Referrer Types
    referrerTypes,
    // Top Referrer Domains
    referrerDomains,
    // Landing Pages
    landingPages,
    // Sessions with UTM
    sessionsWithUtm,
    // Total sessions
    totalSessions,
    // Click ID stats (gclid, fbclid, etc.)
    clickIdStats,
    // Revenue by source
    revenueBySource,
    // Conversions by source
    conversionsBySource,
  ] = await Promise.all([
    // UTM Source breakdown
    prisma.visitorSession.groupBy({
      by: ["utmSource"],
      where: {
        shopId: shop.id,
        startedAt: { gte: startDate },
        utmSource: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // UTM Medium breakdown
    prisma.visitorSession.groupBy({
      by: ["utmMedium"],
      where: {
        shopId: shop.id,
        startedAt: { gte: startDate },
        utmMedium: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // UTM Campaign breakdown
    prisma.visitorSession.groupBy({
      by: ["utmCampaign"],
      where: {
        shopId: shop.id,
        startedAt: { gte: startDate },
        utmCampaign: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // Referrer type breakdown
    prisma.visitorSession.groupBy({
      by: ["referrerType"],
      where: {
        shopId: shop.id,
        startedAt: { gte: startDate },
        referrerType: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),

    // Top referrer domains
    prisma.visitorSession.groupBy({
      by: ["referrerDomain"],
      where: {
        shopId: shop.id,
        startedAt: { gte: startDate },
        referrerDomain: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // Landing pages
    prisma.visitorSession.groupBy({
      by: ["landingPage"],
      where: {
        shopId: shop.id,
        startedAt: { gte: startDate },
        landingPage: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),

    // Sessions with UTM params
    prisma.visitorSession.count({
      where: {
        shopId: shop.id,
        startedAt: { gte: startDate },
        OR: [
          { utmSource: { not: null } },
          { utmMedium: { not: null } },
          { utmCampaign: { not: null } },
        ],
      },
    }),

    // Total sessions in period
    prisma.visitorSession.count({
      where: {
        shopId: shop.id,
        startedAt: { gte: startDate },
      },
    }),

    // Click ID stats (NEW) - Google, Facebook, TikTok, Microsoft
    Promise.all([
      prisma.visitorSession.count({
        where: { shopId: shop.id, startedAt: { gte: startDate }, gclid: { not: null } },
      }),
      prisma.visitorSession.count({
        where: { shopId: shop.id, startedAt: { gte: startDate }, fbclid: { not: null } },
      }),
      prisma.visitorSession.count({
        where: { shopId: shop.id, startedAt: { gte: startDate }, ttclid: { not: null } },
      }),
      prisma.visitorSession.count({
        where: { shopId: shop.id, startedAt: { gte: startDate }, msclkid: { not: null } },
      }),
    ]),

    // Revenue by referrer type (NEW)
    prisma.$queryRaw`
      SELECT 
        vs.referrer_type,
        COUNT(DISTINCT vs.id) as sessions,
        SUM(v.total_revenue) as revenue,
        COUNT(DISTINCT CASE WHEN v.total_orders > 0 THEN v.id END) as customers
      FROM visitor_sessions vs
      LEFT JOIN visitors v ON vs.visitor_id = v.id
      WHERE vs.shop_id = ${shop.id} AND vs.started_at >= ${startDate}
      GROUP BY vs.referrer_type
      ORDER BY revenue DESC NULLS LAST
    ` as Promise<Array<{
      referrer_type: string | null;
      sessions: bigint;
      revenue: bigint | null;
      customers: bigint;
    }>>,

    // Uploads by referrer type (conversion indicator)
    prisma.$queryRaw`
      SELECT 
        vs.referrer_type,
        COUNT(DISTINCT vs.id) as sessions,
        COUNT(DISTINCT u.id) as uploads,
        COUNT(DISTINCT CASE WHEN u.status = 'completed' THEN u.id END) as completed_uploads
      FROM visitor_sessions vs
      LEFT JOIN visitors v ON vs.visitor_id = v.id
      LEFT JOIN uploads u ON u.visitor_id = v.id AND u.created_at >= vs.started_at
      WHERE vs.shop_id = ${shop.id} AND vs.started_at >= ${startDate}
      GROUP BY vs.referrer_type
      ORDER BY sessions DESC
    ` as Promise<Array<{
      referrer_type: string | null;
      sessions: bigint;
      uploads: bigint;
      completed_uploads: bigint;
    }>>,
  ]);

  // Calculate metrics
  const utmRate = totalSessions > 0 
    ? Math.round((sessionsWithUtm / totalSessions) * 100) 
    : 0;

  // Click ID metrics
  const [gclidCount, fbclidCount, ttclidCount, msclidCount] = clickIdStats;
  const totalPaidClicks = gclidCount + fbclidCount + ttclidCount + msclidCount;

  // Total revenue from all sources
  const totalRevenue = revenueBySource.reduce(
    (sum, r) => sum + Number(r.revenue || 0), 
    0
  );

  return json({
    error: null,
    period,
    stats: {
      totalSessions,
      sessionsWithUtm,
      utmRate,
      totalPaidClicks,
      totalRevenue,
    },
    clickIds: {
      gclid: gclidCount,
      fbclid: fbclidCount,
      ttclid: ttclidCount,
      msclid: msclidCount,
    },
    utmSources: utmSources.map((s) => ({
      source: s.utmSource || "Unknown",
      count: s._count.id,
    })),
    utmMediums: utmMediums.map((m) => ({
      medium: m.utmMedium || "Unknown",
      count: m._count.id,
    })),
    utmCampaigns: utmCampaigns.map((c) => ({
      campaign: c.utmCampaign || "Unknown",
      count: c._count.id,
    })),
    referrerTypes: referrerTypes.map((r) => ({
      type: r.referrerType || "Unknown",
      count: r._count.id,
    })),
    referrerDomains: referrerDomains.map((d) => ({
      domain: d.referrerDomain || "Unknown",
      count: d._count.id,
    })),
    landingPages: landingPages.map((p) => ({
      page: p.landingPage || "Unknown",
      count: p._count.id,
    })),
    revenueBySource: (revenueBySource || []).map((r) => ({
      type: r.referrer_type || "direct",
      sessions: Number(r.sessions),
      revenue: Number(r.revenue || 0),
      customers: Number(r.customers),
    })),
    conversions: (conversionsBySource || []).map((c) => ({
      type: c.referrer_type || "direct",
      sessions: Number(c.sessions),
      uploads: Number(c.uploads),
      completedUploads: Number(c.completed_uploads),
      conversionRate: Number(c.sessions) > 0 
        ? Math.round((Number(c.uploads) / Number(c.sessions)) * 100) 
        : 0,
    })),
  });
}

export default function AttributionAnalytics() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);

  const handlePeriodChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("period", value);
      navigate(`?${params.toString()}`);
    },
    [navigate, searchParams]
  );

  const handleTabChange = useCallback(
    (selectedTabIndex: number) => setSelectedTab(selectedTabIndex),
    []
  );

  if (data.error || !data.stats) {
    return (
      <Page title="Attribution Analytics">
        <Banner tone="critical">
          <p>{data.error || "Failed to load data"}</p>
        </Banner>
      </Page>
    );
  }

  const { stats, period } = data;
  const utmSources = "utmSources" in data ? data.utmSources : [];
  const utmMediums = "utmMediums" in data ? data.utmMediums : [];
  const utmCampaigns = "utmCampaigns" in data ? data.utmCampaigns : [];
  const referrerTypes = "referrerTypes" in data ? data.referrerTypes : [];
  const referrerDomains = "referrerDomains" in data ? data.referrerDomains : [];
  const landingPages = "landingPages" in data ? data.landingPages : [];
  const conversions = "conversions" in data ? data.conversions : [];
  const clickIds = "clickIds" in data ? data.clickIds : { gclid: 0, fbclid: 0, ttclid: 0, msclid: 0 };
  const revenueBySource = "revenueBySource" in data ? data.revenueBySource : [];

  if (!stats || stats.totalSessions === 0) {
    return (
      <Page
        title="Attribution Analytics"
        backAction={{ content: "Analytics", url: "/app/analytics" }}
      >
        <Card>
          <EmptyState
            heading="No attribution data yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Attribution tracking will start collecting data once visitors
              arrive with UTM parameters or from referrer sources.
            </p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  // Prepare conversion table
  const conversionRows = conversions.map((c: any) => [
    c.type,
    c.sessions.toLocaleString(),
    c.uploads.toLocaleString(),
    c.completedUploads.toLocaleString(),
    `${c.conversionRate}%`,
  ]);

  // Prepare revenue by source table
  const revenueRows = revenueBySource.map((r: any) => [
    r.type ? r.type.charAt(0).toUpperCase() + r.type.slice(1) : "Direct",
    r.sessions.toLocaleString(),
    r.customers.toLocaleString(),
    `$${(r.revenue / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    r.customers > 0 ? `$${(r.revenue / 100 / r.customers).toFixed(2)}` : "$0",
  ]);

  // Prepare UTM table based on tab
  const utmTabs = [
    {
      id: "sources",
      content: "Sources",
      data: utmSources,
      keyName: "source",
    },
    {
      id: "mediums",
      content: "Mediums",
      data: utmMediums,
      keyName: "medium",
    },
    {
      id: "campaigns",
      content: "Campaigns",
      data: utmCampaigns,
      keyName: "campaign",
    },
  ];

  const selectedUtmData = utmTabs[selectedTab];

  return (
    <Page
      title="Attribution Analytics"
      backAction={{ content: "Analytics", url: "/app/analytics" }}
      secondaryActions={[
        {
          content: "Visitors",
          url: "/app/analytics/visitors",
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
                    Total Sessions
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {stats.totalSessions.toLocaleString()}
                  </Text>
                </BlockStack>
              </Card>
            </Box>

            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Sessions with UTM
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {stats.sessionsWithUtm.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {stats.utmRate}% of total
                  </Text>
                </BlockStack>
              </Card>
            </Box>

            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Top Source
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {utmSources[0]?.source || "-"}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {utmSources[0]?.count?.toLocaleString() || 0} sessions
                  </Text>
                </BlockStack>
              </Card>
            </Box>

            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Top Referrer Type
                  </Text>
                  <Text as="p" variant="heading2xl">
                    {referrerTypes[0]?.type 
                      ? referrerTypes[0].type.charAt(0).toUpperCase() + referrerTypes[0].type.slice(1)
                      : "-"}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {referrerTypes[0]?.count?.toLocaleString() || 0} sessions
                  </Text>
                </BlockStack>
              </Card>
            </Box>

            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Total Revenue
                  </Text>
                  <Text as="p" variant="heading2xl">
                    ${((stats.totalRevenue || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    From all tracked visitors
                  </Text>
                </BlockStack>
              </Card>
            </Box>
          </InlineStack>
        </Layout.Section>

        {/* Paid Click IDs (Google, Facebook, TikTok, Microsoft) */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Paid Ad Clicks (Click IDs)
              </Text>
              <Divider />
              <InlineStack gap="600" wrap>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued">Google Ads (gclid)</Text>
                  <Text as="p" variant="headingLg">{clickIds.gclid.toLocaleString()}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued">Facebook (fbclid)</Text>
                  <Text as="p" variant="headingLg">{clickIds.fbclid.toLocaleString()}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued">TikTok (ttclid)</Text>
                  <Text as="p" variant="headingLg">{clickIds.ttclid.toLocaleString()}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued">Microsoft (msclkid)</Text>
                  <Text as="p" variant="headingLg">{clickIds.msclid.toLocaleString()}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" tone="subdued">Total Paid Clicks</Text>
                  <Text as="p" variant="headingLg" fontWeight="bold">
                    {stats.totalPaidClicks?.toLocaleString() || 0}
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Revenue by Source */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Revenue by Traffic Source
              </Text>
              <DataTable
                columnContentTypes={[
                  "text",
                  "numeric",
                  "numeric",
                  "text",
                  "text",
                ]}
                headings={[
                  "Source Type",
                  "Sessions",
                  "Customers",
                  "Revenue",
                  "Avg Order Value",
                ]}
                rows={revenueRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Conversion by Source */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Conversions by Traffic Source
              </Text>
              <DataTable
                columnContentTypes={[
                  "text",
                  "numeric",
                  "numeric",
                  "numeric",
                  "numeric",
                ]}
                headings={[
                  "Source Type",
                  "Sessions",
                  "Uploads",
                  "Completed",
                  "Conversion Rate",
                ]}
                rows={conversionRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* UTM Breakdown */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                UTM Parameters
              </Text>
              <Tabs tabs={utmTabs} selected={selectedTab} onSelect={handleTabChange}>
                <Box paddingBlockStart="400">
                  <BlockStack gap="300">
                    {selectedUtmData.data.length > 0 ? (
                      selectedUtmData.data.map((item: any, i: number) => (
                        <InlineStack key={i} align="space-between">
                          <Text as="span">
                            {item[selectedUtmData.keyName]}
                          </Text>
                          <Badge>{item.count.toLocaleString()}</Badge>
                        </InlineStack>
                      ))
                    ) : (
                      <Text as="p" tone="subdued">
                        No {selectedUtmData.content.toLowerCase()} data yet
                      </Text>
                    )}
                  </BlockStack>
                </Box>
              </Tabs>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Referrer Domains & Landing Pages */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Top Referrer Domains
              </Text>
              <Divider />
              <BlockStack gap="300">
                {referrerDomains.slice(0, 5).map((d, i) => (
                  <InlineStack key={i} align="space-between">
                    <Text as="span">{d.domain}</Text>
                    <Badge>{d.count.toLocaleString()}</Badge>
                  </InlineStack>
                ))}
                {referrerDomains.length === 0 && (
                  <Text as="p" tone="subdued">
                    No referrer data yet
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
                Top Landing Pages
              </Text>
              <Divider />
              <BlockStack gap="300">
                {landingPages.slice(0, 5).map((p, i) => (
                  <InlineStack key={i} align="space-between">
                    <Text as="span">
                      {p.page.length > 40 ? p.page.slice(0, 40) + "..." : p.page}
                    </Text>
                    <Badge>{p.count.toLocaleString()}</Badge>
                  </InlineStack>
                ))}
                {landingPages.length === 0 && (
                  <Text as="p" tone="subdued">
                    No landing page data yet
                  </Text>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Referrer Types Breakdown */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Traffic Sources
              </Text>
              <Divider />
              <BlockStack gap="300">
                {referrerTypes.map((r, i) => {
                  const percentage =
                    stats.totalSessions > 0
                      ? Math.round((r.count / stats.totalSessions) * 100)
                      : 0;
                  return (
                    <BlockStack key={i} gap="100">
                      <InlineStack align="space-between">
                        <Text as="span">
                          {r.type.charAt(0).toUpperCase() + r.type.slice(1)}
                        </Text>
                        <Text as="span">
                          {r.count.toLocaleString()} ({percentage}%)
                        </Text>
                      </InlineStack>
                      <ProgressBar progress={percentage} tone="primary" />
                    </BlockStack>
                  );
                })}
                {referrerTypes.length === 0 && (
                  <Text as="p" tone="subdued">
                    No traffic source data yet
                  </Text>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
