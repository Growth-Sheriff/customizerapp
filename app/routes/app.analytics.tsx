import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Box, Badge, DataTable, Select
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopDomain,
        accessToken: session.accessToken || "",
        plan: "starter",
        billingStatus: "active",
        storageProvider: "r2",
        settings: {},
      },
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

  // Get basic metrics
  const [
    totalUploads,
    completedUploads,
    blockedUploads,
    warningUploads,
    uploadsByMode,
    uploadsByStatus,
    recentUploads,
    uploadsByDay,
  ] = await Promise.all([
    // Total uploads in period
    prisma.upload.count({
      where: { shopId: shop.id, createdAt: { gte: startDate } },
    }),
    // Completed uploads (uploaded status = successfully processed)
    prisma.upload.count({
      where: { shopId: shop.id, createdAt: { gte: startDate }, status: "uploaded" },
    }),
    // Blocked uploads (rejected/failed)
    prisma.upload.count({
      where: { shopId: shop.id, createdAt: { gte: startDate }, status: "blocked" },
    }),
    // Uploads with warnings
    prisma.uploadItem.count({
      where: {
        upload: { shopId: shop.id, createdAt: { gte: startDate } },
        preflightStatus: "warning",
      },
    }),
    // Uploads by mode
    prisma.upload.groupBy({
      by: ["mode"],
      where: { shopId: shop.id, createdAt: { gte: startDate } },
      _count: true,
    }),
    // Uploads by status
    prisma.upload.groupBy({
      by: ["status"],
      where: { shopId: shop.id, createdAt: { gte: startDate } },
      _count: true,
    }),
    // Recent uploads for table
    prisma.upload.findMany({
      where: { shopId: shop.id },
      include: {
        items: {
          select: { location: true, preflightStatus: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // Daily upload counts (simplified - actual would need raw SQL for grouping)
    prisma.upload.findMany({
      where: { shopId: shop.id, createdAt: { gte: startDate } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Process uploads by day for chart
  const dailyCounts: Record<string, number> = {};
  uploadsByDay.forEach((u: { createdAt: Date }) => {
    const day = u.createdAt.toISOString().split("T")[0];
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  });

  // Get location usage
  const locationUsage = await prisma.uploadItem.groupBy({
    by: ["location"],
    where: {
      upload: { shopId: shop.id, createdAt: { gte: startDate } },
    },
    _count: true,
  });

  // Calculate success rate (uploaded = completed successfully)
  const successRate = totalUploads > 0
    ? Math.round((completedUploads / totalUploads) * 100)
    : 0;

  const warningRate = totalUploads > 0
    ? Math.round((warningUploads / totalUploads) * 100)
    : 0;

  const blockedRate = totalUploads > 0
    ? Math.round((blockedUploads / totalUploads) * 100)
    : 0;

  return json({
    period,
    metrics: {
      totalUploads,
      completedUploads,
      blockedUploads,
      warningUploads,
      successRate,
      warningRate,
      blockedRate,
    },
    modeBreakdown: uploadsByMode.map((m: { mode: string; _count: number }) => ({
      mode: m.mode,
      count: m._count,
      percentage: totalUploads > 0 ? Math.round((m._count / totalUploads) * 100) : 0,
    })),
    statusBreakdown: uploadsByStatus.map((s: { status: string; _count: number }) => ({
      status: s.status,
      count: s._count,
      percentage: totalUploads > 0 ? Math.round((s._count / totalUploads) * 100) : 0,
    })),
    locationUsage: locationUsage.map((l: { location: string; _count: number }) => ({
      location: l.location,
      count: l._count,
      percentage: totalUploads > 0 ? Math.round((l._count / totalUploads) * 100) : 0,
    })),
    dailyTrend: Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      count,
    })),
    recentUploads: recentUploads.map((u: any) => ({
      id: u.id,
      mode: u.mode,
      status: u.status,
      locations: u.items.map((i: { location: string }) => i.location),
      preflightStatus: u.items.some((i: { preflightStatus: string }) => i.preflightStatus === "error")
        ? "error"
        : u.items.some((i: { preflightStatus: string }) => i.preflightStatus === "warning")
          ? "warning"
          : "ok",
      createdAt: u.createdAt.toISOString(),
    })),
  });
}

function MetricCard({ title, value, subtitle, tone }: {
  title: string;
  value: string | number;
  subtitle?: string;
  tone?: "success" | "critical" | "warning";
}) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm" tone="subdued">{title}</Text>
        <Text as="p" variant="headingXl" fontWeight="bold">
          {tone ? (
            <span style={{ color: tone === "success" ? "#008060" : tone === "critical" ? "#D72C0D" : "#B98900" }}>
              {value}
            </span>
          ) : (
            value
          )}
        </Text>
        {subtitle && (
          <Text as="p" variant="bodySm" tone="subdued">{subtitle}</Text>
        )}
      </BlockStack>
    </Card>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <Box
      background="bg-surface-secondary"
      borderRadius="200"
      minHeight="8px"
    >
      <div
        style={{
          width: `${Math.min(value, 100)}%`,
          height: "8px",
          backgroundColor: color,
          borderRadius: "4px",
          transition: "width 0.3s",
        }}
      />
    </Box>
  );
}

export default function AnalyticsPage() {
  const { period, metrics, modeBreakdown, statusBreakdown, locationUsage, dailyTrend, recentUploads } = useLoaderData<typeof loader>();
  const [selectedPeriod, setSelectedPeriod] = useState(period);

  const handlePeriodChange = useCallback((value: string) => {
    setSelectedPeriod(value);
    window.location.href = `/app/analytics?period=${value}`;
  }, []);

  const modeColors: Record<string, string> = {
    "dtf": "#5C6AC4",
    "3d_designer": "#47C1BF",
    "classic": "#9C6ADE",
    "quick": "#F49342",
  };

  const statusColors: Record<string, string> = {
    "uploaded": "#008060",
    "blocked": "#D72C0D",
    "needs_review": "#B98900",
    "draft": "#637381",
    "processing": "#00A0AC",
  };

  const locationColors: Record<string, string> = {
    "front": "#5C6AC4",
    "back": "#47C1BF",
    "left_sleeve": "#9C6ADE",
    "right_sleeve": "#F49342",
  };

  // Friendly status labels
  const statusLabels: Record<string, string> = {
    uploaded: "Received",
    blocked: "On Hold",
    needs_review: "Pending",
    draft: "Draft",
    processing: "Processing",
  };

  const recentRows = recentUploads.map((u: any) => [
    u.id.slice(0, 8) + "...",
    <Badge key={u.id}>{u.mode}</Badge>,
    <Badge key={`status-${u.id}`} tone={
      u.status === "uploaded" ? "success" :
      u.status === "blocked" ? "attention" :
      u.status === "needs_review" ? "attention" : "info"
    }>
      {statusLabels[u.status] || u.status.replace("_", " ")}
    </Badge>,
    u.locations.join(", "),
    new Date(u.createdAt).toLocaleDateString(),
  ]);

  return (
    <Page
      title="Analytics"
      backAction={{ content: "Dashboard", url: "/app" }}
      secondaryActions={[
        { content: "Production Queue", url: "/app/queue" },
      ]}
    >
        <Layout>
          {/* Period Selector */}
          <Layout.Section>
            <Card>
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Upload Analytics</Text>
                <Select
                  label=""
                  labelHidden
                  options={[
                    { label: "Last 7 days", value: "7d" },
                    { label: "Last 30 days", value: "30d" },
                    { label: "Last 90 days", value: "90d" },
                  ]}
                  value={selectedPeriod}
                  onChange={handlePeriodChange}
                />
              </InlineStack>
            </Card>
          </Layout.Section>

          {/* Key Metrics */}
          <Layout.Section variant="oneThird">
            <MetricCard
              title="Total Uploads"
              value={metrics.totalUploads}
              subtitle={`in last ${selectedPeriod}`}
            />
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <MetricCard
              title="Success Rate"
              value={`${metrics.successRate}%`}
              subtitle={`${metrics.completedUploads} completed`}
              tone="success"
            />
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <MetricCard
              title="Warning Rate"
              value={`${metrics.warningRate}%`}
              subtitle={`${metrics.warningUploads} with warnings`}
              tone="warning"
            />
          </Layout.Section>

          {/* Mode Breakdown */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Uploads by Mode</Text>

                {modeBreakdown.length > 0 ? (
                  <BlockStack gap="300">
                    {modeBreakdown.map((m: any) => (
                      <BlockStack key={m.mode} gap="100">
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodySm">{m.mode}</Text>
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            {m.count} ({m.percentage}%)
                          </Text>
                        </InlineStack>
                        <ProgressBar value={m.percentage} color={modeColors[m.mode] || "#637381"} />
                      </BlockStack>
                    ))}
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">No data available</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Location Usage */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Location Usage</Text>

                {locationUsage.length > 0 ? (
                  <BlockStack gap="300">
                    {locationUsage.map((l: any) => (
                      <BlockStack key={l.location} gap="100">
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodySm">{l.location.replace("_", " ")}</Text>
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            {l.count} ({l.percentage}%)
                          </Text>
                        </InlineStack>
                        <ProgressBar value={l.percentage} color={locationColors[l.location] || "#637381"} />
                      </BlockStack>
                    ))}
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">No data available</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Status Breakdown */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Status Distribution</Text>

                <InlineStack gap="400" wrap>
                  {statusBreakdown.map((s: any) => (
                    <Box
                      key={s.status}
                      background="bg-surface-secondary"
                      padding="300"
                      borderRadius="200"
                      minWidth="120px"
                    >
                      <BlockStack gap="100" inlineAlign="center">
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            backgroundColor: statusColors[s.status] || "#637381",
                          }}
                        />
                        <Text as="p" variant="headingMd" alignment="center">{s.count}</Text>
                        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                          {s.status.replace("_", " ")}
                        </Text>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Daily Trend (Simple) */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Daily Trend</Text>

                {dailyTrend.length > 0 ? (
                  <Box minHeight="200px">
                    <InlineStack gap="100" align="end" blockAlign="end">
                      {dailyTrend.slice(-14).map((d, i) => {
                        const maxCount = Math.max(...dailyTrend.map(x => x.count));
                        const height = maxCount > 0 ? (d.count / maxCount) * 150 : 0;
                        return (
                          <Box key={i} minWidth="20px">
                            <BlockStack gap="050" inlineAlign="center">
                              <div
                                style={{
                                  width: 16,
                                  height: Math.max(height, 4),
                                  backgroundColor: "#5C6AC4",
                                  borderRadius: "2px 2px 0 0",
                                }}
                                title={`${d.date}: ${d.count} uploads`}
                              />
                              <Text as="span" variant="bodySm" tone="subdued">
                                {d.date.slice(-2)}
                              </Text>
                            </BlockStack>
                          </Box>
                        );
                      })}
                    </InlineStack>
                  </Box>
                ) : (
                  <Text as="p" tone="subdued">No data available</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Recent Uploads */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Recent Uploads</Text>
                  <a href="/app/uploads">View All</a>
                </InlineStack>

                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["ID", "Mode", "Status", "Locations", "Date"]}
                  rows={recentRows}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
  );
}

