/**
 * Analytics - Attribution Page
 * UTM, Click IDs, and Traffic Source Analytics
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
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
  ProgressBar,
  Icon,
  Divider,
  InlineGrid,
  Banner,
} from "@shopify/polaris";
import {
  LinkIcon,
  TargetIcon,
  SearchIcon,
  SocialAdIcon,
  AnalyticsIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import {
  getShopIdFromDomain,
  getAttributionStats,
  getSourceBreakdown,
  getMediumBreakdown,
  getCampaignBreakdown,
  getClickIdStats,
  getReferrerBreakdown,
  type AttributionStats,
  type SourceBreakdown,
  type MediumBreakdown,
  type CampaignBreakdown,
  type ClickIdStats,
  type ReferrerBreakdown,
} from "~/lib/analytics.server";

interface LoaderData {
  stats: AttributionStats;
  sources: SourceBreakdown[];
  mediums: MediumBreakdown[];
  campaigns: CampaignBreakdown[];
  clickIds: ClickIdStats;
  referrers: ReferrerBreakdown[];
  error?: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopId = await getShopIdFromDomain(session.shop);

  if (!shopId) {
    return json<LoaderData>({
      stats: {
        totalSessions: 0,
        sessionsWithUTM: 0,
        utmPercentage: 0,
        topSource: "N/A",
        topMedium: "N/A",
        paidClicks: 0,
      },
      sources: [],
      mediums: [],
      campaigns: [],
      clickIds: { gclid: 0, fbclid: 0, msclkid: 0, ttclid: 0, total: 0 },
      referrers: [],
      error: "Shop not found",
    });
  }

  // Last 30 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  try {
    const [stats, sources, mediums, campaigns, clickIds, referrers] = await Promise.all([
      getAttributionStats(shopId, startDate, endDate),
      getSourceBreakdown(shopId, startDate, endDate),
      getMediumBreakdown(shopId, startDate, endDate),
      getCampaignBreakdown(shopId, startDate, endDate),
      getClickIdStats(shopId, startDate, endDate),
      getReferrerBreakdown(shopId, startDate, endDate),
    ]);

    return json<LoaderData>({
      stats,
      sources,
      mediums,
      campaigns,
      clickIds,
      referrers,
    });
  } catch (error) {
    console.error("Attribution analytics error:", error);
    return json<LoaderData>({
      stats: {
        totalSessions: 0,
        sessionsWithUTM: 0,
        utmPercentage: 0,
        topSource: "N/A",
        topMedium: "N/A",
        paidClicks: 0,
      },
      sources: [],
      mediums: [],
      campaigns: [],
      clickIds: { gclid: 0, fbclid: 0, msclkid: 0, ttclid: 0, total: 0 },
      referrers: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function StatCard({
  title,
  value,
  subtitle,
  badge,
  badgeTone,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: string;
  badgeTone?: "success" | "info" | "warning" | "critical";
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="p" variant="bodyMd" tone="subdued">
            {title}
          </Text>
          {badge && <Badge tone={badgeTone}>{badge}</Badge>}
        </InlineStack>
        <Text as="p" variant="headingXl" fontWeight="bold">
          {typeof value === "number" ? value.toLocaleString() : value}
        </Text>
        {subtitle && (
          <Text as="p" variant="bodySm" tone="subdued">
            {subtitle}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}

function PlatformCard({
  platform,
  icon,
  clicks,
  color,
}: {
  platform: string;
  icon: string;
  clicks: number;
  color: string;
}) {
  return (
    <Box
      padding="400"
      background="bg-surface-secondary"
      borderRadius="300"
    >
      <BlockStack gap="200" inlineAlign="center">
        <Text as="span" variant="headingLg">
          {icon}
        </Text>
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          {platform}
        </Text>
        <Text as="p" variant="headingMd" fontWeight="bold">
          {clicks.toLocaleString()}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          ad clicks
        </Text>
      </BlockStack>
    </Box>
  );
}

export default function AnalyticsAttribution() {
  const { stats, sources, mediums, campaigns, clickIds, referrers, error } =
    useLoaderData<typeof loader>();

  if (error) {
    return (
      <Page title="Attribution Analytics" backAction={{ url: "/app/analytics" }}>
        <Layout>
          <Layout.Section>
            <Banner tone="critical">
              <p>Error loading analytics: {error}</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Prepare table rows
  const sourceRows = sources.map((s) => [
    s.source,
    s.sessions.toString(),
    s.uploads.toString(),
    `${s.conversionRate.toFixed(1)}%`,
  ]);

  const campaignRows = campaigns.map((c) => [
    c.campaign,
    c.source || "-",
    c.sessions.toString(),
    c.uploads.toString(),
  ]);

  return (
    <Page
      title="Attribution Analytics"
      subtitle="Track traffic sources, UTM campaigns, and ad performance"
      backAction={{ url: "/app/analytics" }}
    >
      <Layout>
        {/* Overview Stats */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <StatCard
              title="Total Sessions"
              value={stats.totalSessions}
              subtitle="Last 30 days"
            />
            <StatCard
              title="UTM Tagged"
              value={stats.sessionsWithUTM}
              subtitle={`${stats.utmPercentage.toFixed(1)}% of sessions`}
              badge={stats.utmPercentage > 30 ? "Good tracking" : "Low tracking"}
              badgeTone={stats.utmPercentage > 30 ? "success" : "warning"}
            />
            <StatCard
              title="Top Source"
              value={stats.topSource}
              subtitle="Most common traffic source"
              badge="UTM Source"
              badgeTone="info"
            />
            <StatCard
              title="Paid Ad Clicks"
              value={stats.paidClicks}
              subtitle="Google, Facebook, Microsoft, TikTok"
              badge={stats.paidClicks > 0 ? "Active" : "None"}
              badgeTone={stats.paidClicks > 0 ? "success" : undefined}
            />
          </InlineGrid>
        </Layout.Section>

        {/* Ad Platform Breakdown */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h3" variant="headingMd">
                    🎯 Ad Platform Performance
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Click tracking from major ad platforms
                  </Text>
                </BlockStack>
                <Badge tone="info">{clickIds.total} total clicks</Badge>
              </InlineStack>
              <Divider />
              <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
                <PlatformCard
                  platform="Google Ads"
                  icon="🔵"
                  clicks={clickIds.gclid}
                  color="blue"
                />
                <PlatformCard
                  platform="Facebook Ads"
                  icon="🔷"
                  clicks={clickIds.fbclid}
                  color="blue"
                />
                <PlatformCard
                  platform="Microsoft Ads"
                  icon="🟢"
                  clicks={clickIds.msclkid}
                  color="green"
                />
                <PlatformCard
                  platform="TikTok Ads"
                  icon="⬛"
                  clicks={clickIds.ttclid}
                  color="black"
                />
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Source & Medium Breakdown */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
            {/* Traffic Sources */}
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  🔗 Traffic Sources
                </Text>
                {sourceRows.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric", "text"]}
                    headings={["Source", "Sessions", "Uploads", "Conv Rate"]}
                    rows={sourceRows}
                  />
                ) : (
                  <Box padding="400">
                    <Text as="p" tone="subdued" alignment="center">
                      No UTM source data yet
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </Card>

            {/* Medium Distribution */}
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  📊 Traffic Medium
                </Text>
                <BlockStack gap="300">
                  {mediums.length > 0 ? (
                    mediums.map((m, i) => (
                      <BlockStack gap="200" key={i}>
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodyMd">
                            {m.medium === "none" ? "Direct" : m.medium}
                          </Text>
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {m.sessions.toLocaleString()} ({m.percentage.toFixed(1)}%)
                          </Text>
                        </InlineStack>
                        <ProgressBar progress={m.percentage} size="small" tone="highlight" />
                      </BlockStack>
                    ))
                  ) : (
                    <Box padding="400">
                      <Text as="p" tone="subdued" alignment="center">
                        No medium data yet
                      </Text>
                    </Box>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Referrer Types */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                🌐 Referrer Types
              </Text>
              <Divider />
              <InlineGrid columns={{ xs: 2, sm: 3, md: 6 }} gap="300">
                {referrers.map((r, i) => (
                  <Box
                    key={i}
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <BlockStack gap="100" inlineAlign="center">
                      <Text as="span" variant="headingLg">
                        {r.type === "direct" ? "🏠" :
                         r.type === "search" ? "🔍" :
                         r.type === "social" ? "📱" :
                         r.type === "email" ? "📧" :
                         r.type === "referral" ? "🔗" : "❓"}
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="semibold">
                        {r.type || "Unknown"}
                      </Text>
                      <Text as="p" variant="bodyMd" fontWeight="bold">
                        {r.sessions.toLocaleString()}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {r.percentage.toFixed(1)}%
                      </Text>
                    </BlockStack>
                  </Box>
                ))}
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Campaigns Table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingMd">
                  📣 Campaign Performance
                </Text>
                <Badge>{campaigns.length} campaigns</Badge>
              </InlineStack>
              {campaignRows.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "numeric"]}
                  headings={["Campaign", "Source", "Sessions", "Uploads"]}
                  rows={campaignRows}
                  footerContent={`Showing ${campaigns.length} campaigns with UTM tracking`}
                />
              ) : (
                <Box padding="600">
                  <BlockStack gap="300" inlineAlign="center">
                    <Text as="span" variant="headingLg">
                      📊
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      No campaign data yet
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Add UTM parameters to your marketing links to track campaigns
                    </Text>
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* UTM Guide */}
        <Layout.Section>
          <Banner
            title="UTM Tracking Guide"
            tone="info"
          >
            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                Add these parameters to your marketing URLs:
              </Text>
              <Text as="p" variant="bodySm" fontWeight="semibold">
                ?utm_source=google&utm_medium=cpc&utm_campaign=summer_sale
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
