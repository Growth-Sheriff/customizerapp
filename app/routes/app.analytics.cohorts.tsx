/**
 * Cohort Analysis Dashboard
 * Weekly cohort retention and revenue analysis
 * 
 * @route /app/analytics/cohorts
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
  Select,
  Divider,
  Box,
  Banner,
  Tooltip,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { getCohortData } from "~/lib/analytics.server";

// Local type definition
interface CohortDataType {
  cohortDate: string;
  totalUsers: number;
  week0: number;
  week1: number;
  week2: number;
  week3: number;
  week4: number;
  totalRevenue: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADER
// ═══════════════════════════════════════════════════════════════════════════

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;

  const url = new URL(request.url);
  const weeks = parseInt(url.searchParams.get("weeks") || "8", 10);

  try {
    const cohorts = await getCohortData(shopId, weeks);

    return json({
      cohorts,
      weeks,
      error: null as string | null,
    });
  } catch (error) {
    console.error("[Cohort Analysis] Loader error:", error);
    return json({
      cohorts: [] as CohortDataType[],
      weeks,
      error: String(error),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function CohortAnalysisPage() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleWeeksChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("weeks", value);
    setSearchParams(params);
  };

  if (data.error) {
    return (
      <Page title="Cohort Analysis">
        <Banner tone="critical">
          <p>Error loading cohorts: {data.error}</p>
        </Banner>
      </Page>
    );
  }

  const cohorts = data.cohorts as CohortDataType[];
  const totalUsers = cohorts.reduce((sum: number, c: CohortDataType) => sum + (c?.totalUsers || 0), 0);
  const totalRevenue = cohorts.reduce((sum: number, c: CohortDataType) => sum + (c?.totalRevenue || 0), 0);

  return (
    <Page
      title="Cohort Analysis"
      subtitle="Weekly visitor retention and engagement"
      secondaryActions={[
        {
          content: "Back to Analytics",
          url: "/app/analytics",
        },
        {
          content: "AI Insights",
          url: "/app/analytics/insights",
        },
      ]}
    >
      <Layout>
        {/* Period Selector */}
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">
                  Cohort Period
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Analyze visitor retention over time
                </Text>
              </BlockStack>
              <div style={{ width: "200px" }}>
                <Select
                  label=""
                  labelHidden
                  options={[
                    { label: "Last 4 weeks", value: "4" },
                    { label: "Last 8 weeks", value: "8" },
                    { label: "Last 12 weeks", value: "12" },
                  ]}
                  value={String(data.weeks)}
                  onChange={handleWeeksChange}
                />
              </div>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Cohort Table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Weekly Retention Cohorts
              </Text>

              <Text as="p" tone="subdued" variant="bodySm">
                Each row represents visitors who first uploaded in that week.
                Columns show how many returned in subsequent weeks.
              </Text>

              <Divider />

              {cohorts.length === 0 ? (
                <Banner tone="info">
                  <p>
                    No cohort data available yet. Cohorts are created as new
                    visitors upload designs.
                  </p>
                </Banner>
              ) : (
                <CohortTable cohorts={cohorts} />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Summary Stats */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Cohort Summary
              </Text>

              <Divider />

              <InlineStack gap="600" wrap>
                <SummaryMetric
                  label="Total Cohort Users"
                  value={String(totalUsers)}
                />
                <SummaryMetric
                  label="Total Revenue"
                  value={`$${totalRevenue.toFixed(2)}`}
                />
                <SummaryMetric
                  label="Avg Week 1 Retention"
                  value={`${calculateAvgRetention(cohorts, 1)}%`}
                />
                <SummaryMetric
                  label="Avg Week 4 Retention"
                  value={`${calculateAvgRetention(cohorts, 4)}%`}
                />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Help Section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                How to Read This
              </Text>

              <BlockStack gap="200">
                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="success">Green</Badge>
                    <Text as="span" variant="bodySm">
                      Above 20% retention - Excellent engagement
                    </Text>
                  </InlineStack>
                </Box>

                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="warning">Yellow</Badge>
                    <Text as="span" variant="bodySm">
                      10-20% retention - Room for improvement
                    </Text>
                  </InlineStack>
                </Box>

                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="critical">Red</Badge>
                    <Text as="span" variant="bodySm">
                      Below 10% retention - Needs attention
                    </Text>
                  </InlineStack>
                </Box>

                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge>Gray</Badge>
                    <Text as="span" variant="bodySm">
                      Future period - Data not yet available
                    </Text>
                  </InlineStack>
                </Box>
              </BlockStack>
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

function CohortTable({ cohorts }: { cohorts: CohortDataType[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
        <thead>
          <tr>
            <th style={thStyle}>Cohort Week</th>
            <th style={thStyle}>Users</th>
            <th style={thStyle}>Week 0</th>
            <th style={thStyle}>Week 1</th>
            <th style={thStyle}>Week 2</th>
            <th style={thStyle}>Week 3</th>
            <th style={thStyle}>Week 4</th>
            <th style={thStyle}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((cohort: CohortDataType) => (
            <tr key={cohort.cohortDate}>
              <td style={tdStyle}>
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  {formatWeekDate(cohort.cohortDate)}
                </Text>
              </td>
              <td style={tdStyle}>
                <Badge>{String(cohort.totalUsers)}</Badge>
              </td>
              <td style={tdStyle}>
                <RetentionCell
                  value={cohort.week0}
                  total={cohort.totalUsers}
                />
              </td>
              <td style={tdStyle}>
                <RetentionCell
                  value={cohort.week1}
                  total={cohort.totalUsers}
                />
              </td>
              <td style={tdStyle}>
                <RetentionCell
                  value={cohort.week2}
                  total={cohort.totalUsers}
                />
              </td>
              <td style={tdStyle}>
                <RetentionCell
                  value={cohort.week3}
                  total={cohort.totalUsers}
                />
              </td>
              <td style={tdStyle}>
                <RetentionCell
                  value={cohort.week4}
                  total={cohort.totalUsers}
                />
              </td>
              <td style={tdStyle}>
                <Text as="span" variant="bodySm">
                  ${cohort.totalRevenue.toFixed(2)}
                </Text>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RetentionCell({
  value,
  total,
}: {
  value: number;
  total: number;
}) {
  // -1 means future week (no data yet)
  if (value === -1) {
    return (
      <Box
        background="bg-surface-disabled"
        padding="200"
        borderRadius="100"
      >
        <Text as="span" variant="bodySm" tone="subdued">
          -
        </Text>
      </Box>
    );
  }

  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;

  let bgColor: "bg-surface-success" | "bg-surface-warning" | "bg-surface-critical" = "bg-surface-critical";
  if (percentage >= 20) bgColor = "bg-surface-success";
  else if (percentage >= 10) bgColor = "bg-surface-warning";

  return (
    <Tooltip content={`${value} of ${total} users returned`}>
      <Box
        background={bgColor}
        padding="200"
        borderRadius="100"
      >
        <Text as="span" variant="bodySm" fontWeight="semibold">
          {percentage}%
        </Text>
      </Box>
    </Tooltip>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Box background="bg-surface-secondary" padding="400" borderRadius="200">
      <BlockStack gap="100">
        <Text as="p" tone="subdued" variant="bodySm">
          {label}
        </Text>
        <Text as="p" variant="headingMd" fontWeight="bold">
          {value}
        </Text>
      </BlockStack>
    </Box>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatWeekDate(dateStr: string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  return date.toLocaleDateString("en-US", options);
}

function calculateAvgRetention(cohorts: CohortDataType[], week: number): string {
  const validCohorts = cohorts.filter((c: CohortDataType) => {
    const weekValue =
      week === 1
        ? c.week1
        : week === 2
        ? c.week2
        : week === 3
        ? c.week3
        : c.week4;
    return weekValue >= 0;
  });

  if (validCohorts.length === 0) return "N/A";

  const totalRetention = validCohorts.reduce((sum: number, c: CohortDataType) => {
    const weekValue =
      week === 1
        ? c.week1
        : week === 2
        ? c.week2
        : week === 3
        ? c.week3
        : c.week4;
    return sum + (c.totalUsers > 0 ? (weekValue / c.totalUsers) * 100 : 0);
  }, 0);

  return (totalRetention / validCohorts.length).toFixed(1);
}

// Table styles
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "2px solid var(--p-border-subdued)",
  fontWeight: 600,
  fontSize: "13px",
  backgroundColor: "var(--p-surface-secondary)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--p-border-subdued)",
  fontSize: "13px",
};
