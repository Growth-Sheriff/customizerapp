import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  AppProvider, Page, Layout, Card, Text, BlockStack, Banner,
  DataTable, Badge, Button, InlineStack, Box
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { getShopFromSession } from "~/lib/session.server";
import prisma from "~/lib/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopDomain = await getShopFromSession(request);

  if (!shopDomain) {
    return redirect("/auth/install");
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return redirect("/auth/install");
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
    uploads: uploads.map(u => ({
      id: u.id,
      mode: u.mode,
      status: u.status,
      productId: u.productId,
      itemCount: u.items.length,
      preflightStatus: u.items.some(i => i.preflightStatus === "error")
        ? "error"
        : u.items.some(i => i.preflightStatus === "warning")
          ? "warning"
          : u.items.every(i => i.preflightStatus === "ok")
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
  const { shop, stats, uploads } = useLoaderData<typeof loader>();

  const rows = uploads.map(upload => [
    upload.id.slice(0, 8) + "...",
    upload.mode,
    <StatusBadge key={upload.id + "-status"} status={upload.status} />,
    <StatusBadge key={upload.id + "-preflight"} status={upload.preflightStatus} />,
    upload.itemCount,
    new Date(upload.createdAt).toLocaleDateString(),
  ]);

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Upload Lift Pro Dashboard">
        <Layout>
          {/* Welcome Banner */}
          <Layout.Section>
            <Banner title={`Welcome, ${(shop.settings as any)?.shopName || shop.domain}`} tone="success">
              <p>Your customizer is ready. Configure products to enable upload functionality.</p>
            </Banner>
          </Layout.Section>

          {/* Stats Cards */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Plan</Text>
                <Text as="p" variant="headingLg">{shop.plan.toUpperCase()}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {stats.monthlyLimit > 0
                    ? `${stats.monthlyUploads}/${stats.monthlyLimit} uploads this month`
                    : `${stats.monthlyUploads} uploads this month (unlimited)`
                  }
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Total Uploads</Text>
                <Text as="p" variant="headingLg">{stats.totalUploads}</Text>
                <Text as="p" variant="bodySm" tone="subdued">All time</Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Products</Text>
                <Text as="p" variant="headingLg">{stats.productsConfigured}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Configured for upload</Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Quick Actions */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Quick Actions</Text>
                <InlineStack gap="300">
                  <Button url="/app/products">Configure Products</Button>
                  <Button url="/app/settings">Settings</Button>
                  <Button url="/app/queue">Production Queue</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Recent Uploads Table */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Recent Uploads</Text>
                  <Button variant="plain" url="/app/uploads">View All</Button>
                </InlineStack>

                {uploads.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "numeric", "text"]}
                    headings={["ID", "Mode", "Status", "Preflight", "Items", "Date"]}
                    rows={rows}
                  />
                ) : (
                  <Box padding="400">
                    <Text as="p" tone="subdued">No uploads yet. Configure a product to get started.</Text>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}

