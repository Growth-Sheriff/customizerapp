import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import {
  AppProvider, Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, DataTable, Badge, EmptyState, Box
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

  // Get export jobs
  const exportJobs = await prisma.exportJob.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return json({
    exports: exportJobs.map((job: any) => ({
      id: job.id,
      uploadCount: job.uploadIds.length,
      status: job.status,
      downloadUrl: job.downloadUrl,
      expiresAt: job.expiresAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() || null,
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const shopDomain = await getShopFromSession(request);
  if (!shopDomain) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const action = formData.get("_action");

  if (action === "retry") {
    const jobId = formData.get("jobId") as string;

    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: "pending",
        downloadUrl: null,
        completedAt: null,
      },
    });

    // TODO: Re-enqueue export worker job
    // await exportQueue.add('export', { jobId, shopId: shop.id });

    return json({ success: true, message: "Export job requeued" });
  }

  if (action === "delete") {
    const jobId = formData.get("jobId") as string;

    await prisma.exportJob.delete({
      where: { id: jobId },
    });

    return json({ success: true, message: "Export job deleted" });
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, "success" | "critical" | "warning" | "info" | "attention"> = {
    pending: "info",
    processing: "attention",
    completed: "success",
    failed: "critical",
    expired: "warning",
  };

  return <Badge tone={tones[status] || "info"}>{status}</Badge>;
}

export default function ExportsPage() {
  const { exports } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const rows = exports.map((job: any) => [
    job.id.slice(0, 8) + "...",
    job.uploadCount,
    <StatusBadge key={job.id} status={job.status} />,
    new Date(job.createdAt).toLocaleDateString(),
    job.completedAt ? new Date(job.completedAt).toLocaleDateString() : "—",
    job.expiresAt && job.status === "completed" ? (
      new Date(job.expiresAt) > new Date() ? (
        <Text as="span" tone="success">Active</Text>
      ) : (
        <Text as="span" tone="subdued">Expired</Text>
      )
    ) : "—",
    <InlineStack key={`actions-${job.id}`} gap="100">
      {job.status === "completed" && job.downloadUrl && new Date(job.expiresAt!) > new Date() && (
        <Button size="slim" url={job.downloadUrl} external>
          Download
        </Button>
      )}
      {job.status === "failed" && (
        <Form method="post" style={{ display: "inline" }}>
          <input type="hidden" name="_action" value="retry" />
          <input type="hidden" name="jobId" value={job.id} />
          <Button size="slim" submit loading={isSubmitting}>
            Retry
          </Button>
        </Form>
      )}
      <Form method="post" style={{ display: "inline" }}>
        <input type="hidden" name="_action" value="delete" />
        <input type="hidden" name="jobId" value={job.id} />
        <Button size="slim" tone="critical" submit loading={isSubmitting}>
          Delete
        </Button>
      </Form>
    </InlineStack>,
  ]);

  return (
    <AppProvider i18n={enTranslations}>
      <Page
        title="Exports"
        backAction={{ content: "Dashboard", url: "/app" }}
        secondaryActions={[
          { content: "Production Queue", url: "/app/queue" },
        ]}
      >
        <Layout>
          {/* Action result banner */}
          {actionData && "success" in actionData && (
            <Layout.Section>
              <Banner tone="success" onDismiss={() => {}}>
                {actionData.message}
              </Banner>
            </Layout.Section>
          )}
          {actionData && "error" in actionData && (
            <Layout.Section>
              <Banner tone="critical" onDismiss={() => {}}>
                {actionData.error}
              </Banner>
            </Layout.Section>
          )}

          {/* Info */}
          <Layout.Section>
            <Banner tone="info">
              Export jobs package selected uploads into a ZIP file with a manifest.
              Downloads are available for 24 hours after completion.
            </Banner>
          </Layout.Section>

          {/* Exports Table */}
          <Layout.Section>
            <Card>
              {exports.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "numeric", "text", "text", "text", "text", "text"]}
                  headings={["Job ID", "Files", "Status", "Created", "Completed", "Link Status", "Actions"]}
                  rows={rows}
                />
              ) : (
                <EmptyState
                  heading="No exports yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{ content: "Go to Queue", url: "/app/queue" }}
                >
                  <p>Select uploads from the production queue to create an export.</p>
                </EmptyState>
              )}
            </Card>
          </Layout.Section>

          {/* Export Format Info */}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Export Format</Text>

                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <pre style={{ fontSize: 12, fontFamily: "monospace", margin: 0 }}>
{`export_YYYY-MM-DD/
├── order_1234/
│   ├── front_design.png
│   ├── back_design.png
│   └── metadata.json
├── order_1235/
│   └── front_design.png
└── manifest.csv`}
                  </pre>
                </Box>

                <BlockStack gap="100">
                  <Text as="p" variant="bodySm">
                    <strong>manifest.csv:</strong> Order ID, Upload ID, Location, File Name, Original Name, DPI, Dimensions
                  </Text>
                  <Text as="p" variant="bodySm">
                    <strong>metadata.json:</strong> Full preflight results, transform data, customer info
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}

