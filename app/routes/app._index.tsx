import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, Banner,
  DataTable, Badge, Button, InlineStack, Box,
  Grid, ProgressBar, Divider, Icon,
} from "@shopify/polaris";
import {
  OrderIcon,
  CheckCircleIcon,
  ProductIcon,
  ClockIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import { getUsageAlerts } from "~/lib/billing.server";
import prisma from "~/lib/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  // Create shop if not exists
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopDomain,
        accessToken: session.accessToken || "",
        plan: "starter",
        billingStatus: "active",
        storageProvider: "r2",
        onboardingCompleted: false,
        onboardingStep: 0,
        settings: {},
      },
    });
  }

  // Redirect to onboarding if not completed
  if (!shop.onboardingCompleted) {
    return redirect("/app/onboarding");
  }

  // Get uploads
  const uploads = await prisma.upload.findMany({
    where: { shopId: shop.id },
    include: {
      items: {
        select: {
          id: true,
          location: true,
          preflightStatus: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Get stats
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalUploads, monthlyUploads, productsConfigured] = await Promise.all([
    prisma.upload.count({ where: { shopId: shop.id } }),
    prisma.upload.count({ where: { shopId: shop.id, createdAt: { gte: startOfMonth } } }),
    prisma.productConfig.count({ where: { shopId: shop.id, enabled: true } }),
  ]);

  // Plan limits
  const planLimits: Record<string, number> = {
    free: 100,
    starter: 1000,
    pro: -1,
    enterprise: -1,
  };
  const monthlyLimit = planLimits[shop.plan] || 100;

  // Get usage alerts
  const usageAlerts = await getUsageAlerts(shop.id);

  return json({
    shop: {
      domain: shop.shopDomain,
      plan: shop.plan,
      settings: shop.settings as Record<string, unknown> | null,
    },
    stats: {
      totalUploads,
      monthlyUploads,
      monthlyLimit,
      productsConfigured,
    },
    usageAlerts,
    uploads: uploads.map((u: any) => ({
      id: u.id,
      mode: u.mode,
      status: u.status,
      productId: u.productId,
      itemCount: u.items.length,
      preflightStatus: u.items.some((i: any) => i.preflightStatus === "error")
        ? "error"
        : u.items.some((i: any) => i.preflightStatus === "warning")
          ? "warning"
          : u.items.every((i: any) => i.preflightStatus === "ok")
            ? "ok"
            : "pending",
      createdAt: u.createdAt.toISOString(),
    })),
  });
}

// Status badge helper
function StatusBadge({ status }: { status: string }) {
  const toneMap: Record<string, "success" | "warning" | "critical" | "info" | "attention"> = {
    ok: "success",
    warning: "warning",
    error: "critical",
    pending: "info",
    draft: "info",
    uploaded: "info",
    processing: "attention",
    needs_review: "attention",
    approved: "success",
    rejected: "critical",
    printed: "success",
  };

  return <Badge tone={toneMap[status] || "info"}>{status}</Badge>;
}

export default function AppDashboard() {
  const { shop, stats, uploads, usageAlerts } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const rows = uploads.slice(0, 5).map((upload: any) => [
    upload.id.slice(0, 8) + "...",
    <Badge key={upload.id + "-mode"} tone="info">{upload.mode === "3d_designer" ? "3D" : upload.mode}</Badge>,
    <StatusBadge key={upload.id + "-status"} status={upload.status} />,
    <StatusBadge key={upload.id + "-preflight"} status={upload.preflightStatus} />,
    new Date(upload.createdAt).toLocaleDateString(),
  ]);

  // Calculate success rate
  const successRate = stats.totalUploads > 0 
    ? Math.round((stats.totalUploads - (stats.failedUploads || 0)) / stats.totalUploads * 100) 
    : 100;

  return (
    <Page
      title="Dashboard"
      subtitle="Welcome to Custom Upload for Products Design"
      primaryAction={{
        content: "Configure Product",
        onAction: () => navigate("/app/products"),
      }}
    >
      <BlockStack gap="500">
        {/* Usage Alerts */}
        {usageAlerts && usageAlerts.length > 0 && usageAlerts.map((alert: any, idx: number) => (
          <Banner key={idx} tone={alert.type === "critical" ? "critical" : "warning"}>
            <p>{alert.message}</p>
            {alert.action && (
              <Button url={alert.action.url}>{alert.action.label}</Button>
            )}
          </Banner>
        ))}

        {/* Stats Cards */}
        <Grid>
          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingSm" tone="subdued">Uploads This Month</Text>
                  <Icon source={OrderIcon} tone="base" />
                </InlineStack>
                <Text as="p" variant="heading2xl">{stats.monthlyUploads}</Text>
                {stats.monthlyLimit > 0 && (
                  <BlockStack gap="100">
                    <ProgressBar progress={(stats.monthlyUploads / stats.monthlyLimit) * 100} size="small" />
                    <Text as="p" variant="bodySm" tone="subdued">
                      {stats.monthlyLimit - stats.monthlyUploads} remaining
                    </Text>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingSm" tone="subdued">Success Rate</Text>
                  <Icon source={CheckCircleIcon} tone="success" />
                </InlineStack>
                <Text as="p" variant="heading2xl">{successRate}%</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {stats.totalUploads} total uploads
                </Text>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingSm" tone="subdued">Products Configured</Text>
                  <Icon source={ProductIcon} tone="base" />
                </InlineStack>
                <Text as="p" variant="heading2xl">{stats.productsConfigured}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Ready for customization
                </Text>
              </BlockStack>
            </Card>
          </Grid.Cell>

          <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingSm" tone="subdued">Pending Review</Text>
                  <Icon source={ClockIcon} tone="warning" />
                </InlineStack>
                <Text as="p" variant="heading2xl">{stats.pendingQueue || 0}</Text>
                <Button variant="plain" onClick={() => navigate("/app/queue")}>
                  View Queue
                </Button>
              </BlockStack>
            </Card>
          </Grid.Cell>
        </Grid>

        {/* Main Content Grid */}
        <Grid>
          {/* Recent Uploads */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 8, lg: 8, xl: 8 }}>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Recent Uploads</Text>
                  <Button variant="plain" onClick={() => navigate("/app/uploads")}>View All</Button>
                </InlineStack>
                <Divider />
                {uploads.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text"]}
                    headings={["ID", "Mode", "Status", "Preflight", "Date"]}
                    rows={rows}
                  />
                ) : (
                  <Box padding="400">
                    <BlockStack gap="200" align="center">
                      <Text as="p" tone="subdued">No uploads yet</Text>
                      <Button onClick={() => navigate("/app/products")}>Configure a Product</Button>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Grid.Cell>

          {/* Sidebar */}
          <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
            <BlockStack gap="400">
              {/* Quick Actions */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Quick Actions</Text>
                  <Divider />
                  <BlockStack gap="200">
                    <Button fullWidth onClick={() => navigate("/app/products")}>
                      Configure Products
                    </Button>
                    <Button fullWidth onClick={() => navigate("/app/asset-sets")}>
                      Manage 3D Assets
                    </Button>
                    <Button fullWidth onClick={() => navigate("/app/exports")}>
                      Export Designs
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Plan Info */}
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">Your Plan</Text>
                    <Badge tone={shop.plan === "pro" || shop.plan === "enterprise" ? "success" : "info"}>
                      {shop.plan.toUpperCase()}
                    </Badge>
                  </InlineStack>
                  <Divider />
                  {shop.plan === "starter" ? (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Upgrade to Pro for 3D Designer, team management, and API access.
                      </Text>
                      <Button onClick={() => navigate("/app/billing")}>
                        Upgrade to Pro
                      </Button>
                    </BlockStack>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {stats.monthlyLimit > 0 
                        ? `${stats.monthlyLimit} uploads/month included`
                        : "Unlimited uploads included"
                      }
                    </Text>
                  )}
                </BlockStack>
              </Card>

              {/* News/Updates */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">What's New</Text>
                  <Divider />
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">
                      🎨 <strong>3D Designer</strong> - Real-time product preview
                    </Text>
                    <Text as="p" variant="bodySm">
                      📊 <strong>Analytics</strong> - Track your upload performance
                    </Text>
                    <Text as="p" variant="bodySm">
                      🔗 <strong>API v1</strong> - Integrate with your systems
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Grid.Cell>
        </Grid>
      </BlockStack>
    </Page>
  );
}

