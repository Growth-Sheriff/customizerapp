/**
 * Analytics - AI Insights Page
 * AI-powered analytics insights with recommendations
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
  Icon,
  Divider,
  InlineGrid,
  Banner,
  Button,
  ProgressBar,
} from "@shopify/polaris";
import {
  LightbulbIcon,
  ChartVerticalIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  InfoIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import {
  getShopIdFromDomain,
  getVisitorStats,
  getUploadStats,
  generateAIInsights,
  getVisitorsByDevice,
  type AIInsight,
  type VisitorStats,
  type UploadStats,
} from "~/lib/analytics.server";

interface LoaderData {
  insights: AIInsight[];
  visitorStats: VisitorStats;
  uploadStats: UploadStats;
  funnelData: {
    stage: string;
    value: number;
    percentage: number;
  }[];
  error?: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopId = await getShopIdFromDomain(session.shop);

  if (!shopId) {
    return json<LoaderData>({
      insights: [],
      visitorStats: {
        totalVisitors: 0,
        newVisitors: 0,
        returningVisitors: 0,
        totalSessions: 0,
        avgSessionsPerVisitor: 0,
        visitorsWithUploads: 0,
        visitorsWithOrders: 0,
        uploadConversionRate: 0,
        orderConversionRate: 0,
      },
      uploadStats: {
        totalUploads: 0,
        completedUploads: 0,
        failedUploads: 0,
        successRate: 0,
        avgFileSize: 0,
        totalDataTransferred: 0,
      },
      funnelData: [],
      error: "Shop not found",
    });
  }

  // Last 30 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  try {
    const [insights, visitorStats, uploadStats] = await Promise.all([
      generateAIInsights(shopId, startDate, endDate),
      getVisitorStats(shopId, startDate, endDate),
      getUploadStats(shopId, startDate, endDate),
    ]);

    // Calculate funnel data
    const funnelData = [
      {
        stage: "Visitors",
        value: visitorStats.totalVisitors,
        percentage: 100,
      },
      {
        stage: "With Sessions",
        value: visitorStats.totalSessions,
        percentage: visitorStats.totalVisitors > 0 
          ? Math.min(100, (visitorStats.totalSessions / visitorStats.totalVisitors) * 100) 
          : 0,
      },
      {
        stage: "Uploaded",
        value: visitorStats.visitorsWithUploads,
        percentage: visitorStats.totalVisitors > 0 
          ? (visitorStats.visitorsWithUploads / visitorStats.totalVisitors) * 100 
          : 0,
      },
      {
        stage: "Ordered",
        value: visitorStats.visitorsWithOrders,
        percentage: visitorStats.totalVisitors > 0 
          ? (visitorStats.visitorsWithOrders / visitorStats.totalVisitors) * 100 
          : 0,
      },
    ];

    return json<LoaderData>({
      insights,
      visitorStats,
      uploadStats,
      funnelData,
    });
  } catch (error) {
    console.error("AI Insights error:", error);
    return json<LoaderData>({
      insights: [],
      visitorStats: {
        totalVisitors: 0,
        newVisitors: 0,
        returningVisitors: 0,
        totalSessions: 0,
        avgSessionsPerVisitor: 0,
        visitorsWithUploads: 0,
        visitorsWithOrders: 0,
        uploadConversionRate: 0,
        orderConversionRate: 0,
      },
      uploadStats: {
        totalUploads: 0,
        completedUploads: 0,
        failedUploads: 0,
        successRate: 0,
        avgFileSize: 0,
        totalDataTransferred: 0,
      },
      funnelData: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function InsightCard({ insight }: { insight: AIInsight }) {
  const iconMap = {
    positive: CheckCircleIcon,
    negative: AlertCircleIcon,
    neutral: InfoIcon,
    suggestion: LightbulbIcon,
  };

  const toneMap: Record<string, "success" | "critical" | "info" | "warning"> = {
    positive: "success",
    negative: "critical",
    neutral: "info",
    suggestion: "warning",
  };

  const bgMap = {
    positive: "bg-fill-success-secondary",
    negative: "bg-fill-critical-secondary",
    neutral: "bg-fill-info-secondary",
    suggestion: "bg-fill-warning-secondary",
  };

  const priorityBadge = {
    high: { tone: "critical" as const, label: "High Priority" },
    medium: { tone: "warning" as const, label: "Medium" },
    low: { tone: "info" as const, label: "Low" },
  };

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start">
          <InlineStack gap="200" blockAlign="center">
            <Box
              padding="200"
              background={bgMap[insight.type] as any}
              borderRadius="200"
            >
              <Icon source={iconMap[insight.type]} tone={toneMap[insight.type]} />
            </Box>
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm" fontWeight="semibold">
                {insight.title}
              </Text>
              {insight.metric && (
                <Text as="p" variant="bodySm" tone="subdued">
                  {insight.metric}
                </Text>
              )}
            </BlockStack>
          </InlineStack>
          <Badge tone={priorityBadge[insight.priority].tone}>
            {priorityBadge[insight.priority].label}
          </Badge>
        </InlineStack>
        <Text as="p" variant="bodyMd">
          {insight.description}
        </Text>
        {insight.change !== undefined && insight.change !== null && (
          <InlineStack gap="200" blockAlign="center">
            <Icon 
              source={(insight.change ?? 0) >= 0 ? ArrowUpIcon : ArrowDownIcon} 
              tone={(insight.change ?? 0) >= 0 ? "success" : "critical"} 
            />
            <Text 
              as="span" 
              variant="bodySm" 
              fontWeight="semibold"
              tone={(insight.change ?? 0) >= 0 ? "success" : "critical"}
            >
              {(insight.change ?? 0) >= 0 ? "+" : ""}{(insight.change ?? 0).toFixed(1)}% change
            </Text>
          </InlineStack>
        )}
      </BlockStack>
    </Card>
  );
}

function StatBox({
  label,
  value,
  subValue,
  trend,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Box
      padding="400"
      background="bg-surface-secondary"
      borderRadius="300"
    >
      <BlockStack gap="200">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <InlineStack gap="200" blockAlign="end">
          <Text as="p" variant="headingLg" fontWeight="bold">
            {typeof value === "number" ? value.toLocaleString() : value}
          </Text>
          {trend && (
            <Icon
              source={trend === "up" ? ArrowUpIcon : trend === "down" ? ArrowDownIcon : InfoIcon}
              tone={trend === "up" ? "success" : trend === "down" ? "critical" : "subdued"}
            />
          )}
        </InlineStack>
        {subValue && (
          <Text as="p" variant="bodySm" tone="subdued">
            {subValue}
          </Text>
        )}
      </BlockStack>
    </Box>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function AnalyticsInsights() {
  const { insights, visitorStats, uploadStats, funnelData, error } =
    useLoaderData<typeof loader>();

  if (error) {
    return (
      <Page title="AI Insights" backAction={{ url: "/app/analytics" }}>
        <Layout>
          <Layout.Section>
            <Banner tone="critical">
              <p>Error loading insights: {error}</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page
      title="AI Insights"
      subtitle="Intelligent analytics and actionable recommendations"
      backAction={{ url: "/app/analytics" }}
    >
      <Layout>
        {/* Key Metrics Overview */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingMd">
                  📊 Key Performance Metrics
                </Text>
                <Badge tone="info">Last 30 days</Badge>
              </InlineStack>
              <Divider />
              <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
                <StatBox
                  label="Upload Conversion"
                  value={`${(visitorStats.uploadConversionRate ?? 0).toFixed(1)}%`}
                  subValue={`${visitorStats.visitorsWithUploads ?? 0} of ${visitorStats.totalVisitors ?? 0}`}
                  trend={(visitorStats.uploadConversionRate ?? 0) > 10 ? "up" : "down"}
                />
                <StatBox
                  label="Order Conversion"
                  value={`${(visitorStats.orderConversionRate ?? 0).toFixed(1)}%`}
                  subValue={`${visitorStats.visitorsWithOrders ?? 0} orders`}
                  trend={(visitorStats.orderConversionRate ?? 0) > 3 ? "up" : "down"}
                />
                <StatBox
                  label="Upload Success Rate"
                  value={`${(uploadStats.successRate ?? 0).toFixed(1)}%`}
                  subValue={`${uploadStats.completedUploads ?? 0} of ${uploadStats.totalUploads ?? 0}`}
                  trend={(uploadStats.successRate ?? 0) > 90 ? "up" : "down"}
                />
                <StatBox
                  label="Avg Sessions/Visitor"
                  value={(visitorStats.avgSessionsPerVisitor ?? 0).toFixed(1)}
                  subValue={`${visitorStats.totalSessions ?? 0} total sessions`}
                  trend={(visitorStats.avgSessionsPerVisitor ?? 0) > 1.5 ? "up" : "neutral"}
                />
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Conversion Funnel */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                🎯 Conversion Funnel
              </Text>
              <Divider />
              <BlockStack gap="400">
                {funnelData.map((stage, i) => (
                  <BlockStack gap="200" key={i}>
                    <InlineStack align="space-between">
                      <InlineStack gap="200" blockAlign="center">
                        <Box
                          padding="100"
                          background="bg-fill-info"
                          borderRadius="full"
                          minWidth="24px"
                        >
                          <Text as="span" variant="bodySm" fontWeight="bold" tone="text-inverse">
                            {i + 1}
                          </Text>
                        </Box>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {stage.stage}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200">
                        <Text as="span" variant="bodyMd" fontWeight="bold">
                          {stage.value.toLocaleString()}
                        </Text>
                        <Badge tone={(stage.percentage ?? 0) > 50 ? "success" : (stage.percentage ?? 0) > 10 ? "warning" : "critical"}>
                          {(stage.percentage ?? 0).toFixed(1)}%
                        </Badge>
                      </InlineStack>
                    </InlineStack>
                    <ProgressBar 
                      progress={stage.percentage} 
                      size="small" 
                      tone={stage.percentage > 50 ? "success" : stage.percentage > 10 ? "highlight" : "critical"} 
                    />
                  </BlockStack>
                ))}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* AI Insights */}
        <Layout.Section>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingLg">
                💡 AI-Powered Insights
              </Text>
              <Badge tone="success">{insights.length} insights</Badge>
            </InlineStack>
            
            {insights.length > 0 ? (
              <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                {insights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </InlineGrid>
            ) : (
              <Card>
                <BlockStack gap="300" inlineAlign="center">
                  <Text as="span" variant="headingLg">
                    🤖
                  </Text>
                  <Text as="p" variant="bodyMd" alignment="center">
                    Gathering more data to generate insights...
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                    Continue collecting visitor data to unlock AI-powered recommendations
                  </Text>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>

        {/* Upload Performance */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                📤 Upload Performance
              </Text>
              <Divider />
              <InlineGrid columns={{ xs: 2, md: 4 }} gap="300">
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100" inlineAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">Total Uploads</Text>
                    <Text as="p" variant="headingMd" fontWeight="bold">
                      {uploadStats.totalUploads.toLocaleString()}
                    </Text>
                  </BlockStack>
                </Box>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100" inlineAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">Completed</Text>
                    <Text as="p" variant="headingMd" fontWeight="bold" tone="success">
                      {uploadStats.completedUploads.toLocaleString()}
                    </Text>
                  </BlockStack>
                </Box>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100" inlineAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">Failed</Text>
                    <Text as="p" variant="headingMd" fontWeight="bold" tone="critical">
                      {uploadStats.failedUploads.toLocaleString()}
                    </Text>
                  </BlockStack>
                </Box>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100" inlineAlign="center">
                    <Text as="p" variant="bodySm" tone="subdued">Data Transferred</Text>
                    <Text as="p" variant="headingMd" fontWeight="bold">
                      {formatBytes(uploadStats.totalDataTransferred ?? 0)}
                    </Text>
                  </BlockStack>
                </Box>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Pro Tips */}
        <Layout.Section>
          <Banner
            title="Pro Tips for Better Conversions"
            tone="info"
          >
            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                • Add clear call-to-action buttons near product images
              </Text>
              <Text as="p" variant="bodySm">
                • Ensure mobile upload experience is optimized
              </Text>
              <Text as="p" variant="bodySm">
                • Use UTM parameters in all marketing campaigns for better tracking
              </Text>
              <Text as="p" variant="bodySm">
                • Follow up with visitors who uploaded but didn't order
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
