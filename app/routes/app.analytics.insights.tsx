/**
 * AI Insights Dashboard
 * Analytics dashboard with AI-powered insights
 * 
 * @route /app/analytics/insights
 * @version 1.0.0
 * 
 * ⚠️ ADDITIVE ONLY: New standalone route
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Icon,
  Select,
  Divider,
  Box,
  Banner,
  ProgressBar,
  EmptyState,
} from "@shopify/polaris";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChartVerticalIcon,
  ClockIcon,
  GlobeIcon,
  MobileIcon,
  InfoIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import {
  getRevenueMetrics,
  getTimeToConvert,
  getDevicePerformance,
  getGeoStats,
  generateAIInsights,
} from "~/lib/analytics.server";

// Local type definitions to avoid import issues
interface AIInsightType {
  id: string;
  type: "positive" | "negative" | "neutral" | "suggestion";
  title: string;
  description: string;
  metric?: string;
  change?: number;
  priority: "high" | "medium" | "low";
}

interface DevicePerformanceType {
  deviceType: string;
  sessions: number;
  uploads: number;
  uploadSuccessRate: number;
  avgUploadTime: number;
  orders: number;
  conversionRate: number;
}

interface GeoStatsType {
  country: string;
  sessions: number;
  uploads: number;
  orders: number;
  revenue: number;
  avgOrderValue: number;
}

interface SourceRevenueType {
  source: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
  conversionRate: number;
}

interface DistributionType {
  bucket: string;
  count: number;
  percentage: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADER
// ═══════════════════════════════════════════════════════════════════════════

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);

  const now = new Date();
  const range = {
    start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    end: now,
  };

  try {
    const [revenue, timeToConvert, devices, geo, insights] = await Promise.all([
      getRevenueMetrics(shopId, range),
      getTimeToConvert(shopId, range),
      getDevicePerformance(shopId, range),
      getGeoStats(shopId, range),
      generateAIInsights(shopId, range),
    ]);

    return json({
      revenue,
      timeToConvert,
      devices,
      geo: geo.slice(0, 10),
      insights,
      days,
      error: null as string | null,
    });
  } catch (error) {
    console.error("[AI Insights] Loader error:", error);
    return json({
      revenue: null,
      timeToConvert: null,
      devices: [] as DevicePerformanceType[],
      geo: [] as GeoStatsType[],
      insights: [] as AIInsightType[],
      days,
      error: String(error),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AIInsightsPage() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const handlePeriodChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("days", value);
    setSearchParams(params);
  };

  if (data.error) {
    return (
      <Page title="AI Insights">
        <Banner tone="critical">
          <p>Error loading analytics: {data.error}</p>
        </Banner>
      </Page>
    );
  }

  const insightCount = data.insights?.length ?? 0;

  return (
    <Page
      title="AI Insights"
      subtitle="Intelligent analytics and recommendations"
      primaryAction={{
        content: "Export Report",
        disabled: true,
      }}
      secondaryActions={[
        {
          content: "Back to Analytics",
          url: "/app/analytics",
        },
      ]}
    >
      <Layout>
        {/* Period Selector */}
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">
                Analysis Period
              </Text>
              <div style={{ width: "200px" }}>
                <Select
                  label=""
                  labelHidden
                  options={[
                    { label: "Last 7 days", value: "7" },
                    { label: "Last 30 days", value: "30" },
                    { label: "Last 90 days", value: "90" },
                  ]}
                  value={String(data.days)}
                  onChange={handlePeriodChange}
                />
              </div>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* AI Insights */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={InfoIcon} tone="info" />
                  <Text variant="headingMd" as="h2">
                    AI-Powered Insights
                  </Text>
                </InlineStack>
                <Badge tone="info">{`${insightCount} insights`}</Badge>
              </InlineStack>

              <Divider />

              {insightCount === 0 ? (
                <EmptyState
                  heading="No insights yet"
                  image=""
                >
                  <p>
                    Not enough data to generate insights. Keep collecting data!
                  </p>
                </EmptyState>
              ) : (
                <BlockStack gap="300">
                  {(data.insights as AIInsightType[]).map((insight: AIInsightType) => 
                    insight && <InsightCard key={insight.id} insight={insight} />
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Revenue Overview */}
        {data.revenue && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={ChartVerticalIcon} tone="success" />
                  <Text variant="headingMd" as="h2">
                    Revenue Attribution
                  </Text>
                </InlineStack>

                <Divider />

                <InlineStack gap="800" wrap={false}>
                  <MetricBox
                    label="Total Revenue"
                    value={`$${data.revenue.totalRevenue.toLocaleString()}`}
                  />
                  <MetricBox
                    label="Total Orders"
                    value={String(data.revenue.totalOrders)}
                  />
                  <MetricBox
                    label="Avg Order Value"
                    value={`$${data.revenue.avgOrderValue.toFixed(2)}`}
                  />
                </InlineStack>

                {data.revenue.revenueBySource.length > 0 && (
                  <>
                    <Divider />
                    <Text variant="headingSm" as="h3">
                      Revenue by Source
                    </Text>
                    <BlockStack gap="200">
                      {(data.revenue.revenueBySource.slice(0, 5) as SourceRevenueType[]).map((source: SourceRevenueType) => 
                        source && (
                          <SourceRevenueBar
                            key={source.source}
                            source={source}
                            maxRevenue={data.revenue!.totalRevenue}
                          />
                        )
                      )}
                    </BlockStack>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Time to Convert */}
        {data.timeToConvert && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={ClockIcon} tone="warning" />
                  <Text variant="headingMd" as="h2">
                    Time to Convert
                  </Text>
                </InlineStack>

                <Divider />

                <InlineStack gap="400" wrap={false}>
                  <TimeMetric
                    label="Upload → Cart"
                    seconds={data.timeToConvert.avgUploadToCart}
                    median={data.timeToConvert.medianUploadToCart}
                  />
                  <TimeMetric
                    label="Cart → Order"
                    seconds={data.timeToConvert.avgCartToOrder}
                    median={data.timeToConvert.medianCartToOrder}
                  />
                  <TimeMetric
                    label="Total Journey"
                    seconds={data.timeToConvert.avgTotalTime}
                    highlight
                  />
                </InlineStack>

                {data.timeToConvert.distribution.length > 0 && (
                  <>
                    <Divider />
                    <Text variant="headingSm" as="h3">
                      Conversion Time Distribution
                    </Text>
                    <InlineStack gap="200" wrap>
                      {(data.timeToConvert.distribution as DistributionType[]).map((d: DistributionType) => 
                        d && <Badge key={d.bucket} tone="info">{`${d.bucket}: ${d.percentage}%`}</Badge>
                      )}
                    </InlineStack>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Device Performance */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" blockAlign="center">
                <Icon source={MobileIcon} tone="info" />
                <Text variant="headingMd" as="h2">
                  Device Performance
                </Text>
              </InlineStack>

              <Divider />

              {data.devices.length === 0 ? (
                <Text as="p" tone="subdued">
                  No device data available
                </Text>
              ) : (
                <BlockStack gap="300">
                  {(data.devices as DevicePerformanceType[]).map((device: DevicePerformanceType) => 
                    device && <DeviceRow key={device.deviceType} device={device} />
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Geo Stats */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200" blockAlign="center">
                <Icon source={GlobeIcon} tone="info" />
                <Text variant="headingMd" as="h2">
                  Geographic Performance
                </Text>
              </InlineStack>

              <Divider />

              {data.geo.length === 0 ? (
                <Text as="p" tone="subdued">
                  No geographic data available
                </Text>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Country</th>
                        <th style={thStyle}>Sessions</th>
                        <th style={thStyle}>Uploads</th>
                        <th style={thStyle}>Orders</th>
                        <th style={thStyle}>Revenue</th>
                        <th style={thStyle}>AOV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.geo as GeoStatsType[]).map((g: GeoStatsType) => 
                        g && (
                          <tr key={g.country}>
                            <td style={tdStyle}>{g.country}</td>
                            <td style={tdStyle}>{g.sessions}</td>
                            <td style={tdStyle}>{g.uploads}</td>
                            <td style={tdStyle}>{g.orders}</td>
                            <td style={tdStyle}>${g.revenue.toFixed(2)}</td>
                            <td style={tdStyle}>${g.avgOrderValue.toFixed(2)}</td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function InsightCard({ insight }: { insight: AIInsightType }) {
  const toneMap: Record<string, "success" | "critical" | "info" | "warning"> = {
    positive: "success",
    negative: "critical",
    neutral: "info",
    suggestion: "warning",
  };

  const iconMap: Record<string, typeof CheckCircleIcon> = {
    positive: CheckCircleIcon,
    negative: AlertCircleIcon,
    neutral: ChartVerticalIcon,
    suggestion: InfoIcon,
  };

  return (
    <Box
      background={
        insight.type === "positive"
          ? "bg-surface-success"
          : insight.type === "negative"
          ? "bg-surface-critical"
          : "bg-surface-secondary"
      }
      padding="400"
      borderRadius="200"
    >
      <InlineStack gap="300" blockAlign="start">
        <Icon source={iconMap[insight.type]} tone={toneMap[insight.type]} />
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm" as="h4">
              {insight.title}
            </Text>
            <Badge
              tone={
                insight.priority === "high"
                  ? "critical"
                  : insight.priority === "medium"
                  ? "warning"
                  : "info"
              }
            >
              {insight.priority}
            </Badge>
            {insight.change !== undefined && (
              <Badge tone={insight.change > 0 ? "success" : "critical"}>
                {`${insight.change > 0 ? "+" : ""}${insight.change}%`}
              </Badge>
            )}
          </InlineStack>
          <Text as="p" tone="subdued">
            {insight.description}
          </Text>
          {insight.metric && (
            <Text as="p" variant="bodySm" fontWeight="semibold">
              {insight.metric}
            </Text>
          )}
        </BlockStack>
      </InlineStack>
    </Box>
  );
}

function MetricBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <BlockStack gap="100">
      <Text as="p" tone="subdued" variant="bodySm">
        {label}
      </Text>
      <Text as="p" variant="headingLg" fontWeight="bold">
        {value}
      </Text>
    </BlockStack>
  );
}

function SourceRevenueBar({
  source,
  maxRevenue,
}: {
  source: SourceRevenueType;
  maxRevenue: number;
}) {
  const percentage = maxRevenue > 0 ? (source.revenue / maxRevenue) * 100 : 0;

  return (
    <BlockStack gap="100">
      <InlineStack align="space-between">
        <Text as="span" variant="bodySm">
          {source.source}
        </Text>
        <InlineStack gap="200">
          <Text as="span" variant="bodySm" tone="subdued">
            {source.orders} orders
          </Text>
          <Text as="span" variant="bodySm" fontWeight="semibold">
            ${source.revenue.toFixed(2)}
          </Text>
        </InlineStack>
      </InlineStack>
      <ProgressBar progress={percentage} tone="primary" size="small" />
    </BlockStack>
  );
}

function TimeMetric({
  label,
  seconds,
  median,
  highlight,
}: {
  label: string;
  seconds: number;
  median?: number;
  highlight?: boolean;
}) {
  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
    return `${(s / 86400).toFixed(1)}d`;
  };

  return (
    <Box
      background={highlight ? "bg-surface-success" : "bg-surface-secondary"}
      padding="300"
      borderRadius="200"
    >
      <BlockStack gap="100">
        <Text as="p" tone="subdued" variant="bodySm">
          {label}
        </Text>
        <Text as="p" variant="headingMd" fontWeight="bold">
          {formatTime(seconds)}
        </Text>
        {median !== undefined && (
          <Text as="p" variant="bodySm" tone="subdued">
            Median: {formatTime(median)}
          </Text>
        )}
      </BlockStack>
    </Box>
  );
}

function DeviceRow({ device }: { device: DevicePerformanceType }) {
  return (
    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <Text as="span" variant="bodySm" fontWeight="semibold">
            {device.deviceType.charAt(0).toUpperCase() +
              device.deviceType.slice(1)}
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {device.sessions} sessions
          </Text>
        </BlockStack>
        <InlineStack gap="300">
          <Badge tone="info">{`${device.uploads} uploads`}</Badge>
          <Badge tone={device.conversionRate > 5 ? "success" : "warning"}>
            {`${device.conversionRate}% conv`}
          </Badge>
        </InlineStack>
      </InlineStack>
    </Box>
  );
}

// Table styles
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "1px solid var(--p-border-subdued)",
  fontWeight: 600,
  fontSize: "13px",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--p-border-subdued)",
  fontSize: "13px",
};
