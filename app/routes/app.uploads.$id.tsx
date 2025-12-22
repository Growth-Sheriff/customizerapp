import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, Button, Banner, Box, DataTable, Thumbnail, Modal, Icon
} from "@shopify/polaris";
import { AlertCircleIcon, CheckCircleIcon, AlertTriangleIcon } from "@shopify/polaris-icons";
import { useState } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";
import { getStorageConfig, getDownloadSignedUrl } from "~/lib/storage.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopDomain,
        accessToken: session.accessToken || "",
        plan: "free",
        billingStatus: "active",
        storageProvider: "r2",
        settings: {},
      },
    });
  }

  const uploadId = params.id;
  if (!uploadId) {
    return json({ error: "Missing uploadId" }, { status: 400 });
  }

  const upload = await prisma.upload.findFirst({
    where: { id: uploadId, shopId: shop.id },
    include: {
      items: true,
    },
  });

  if (!upload) {
    return json({ error: "Upload not found" }, { status: 404 });
  }

  // Generate signed URLs for thumbnails/previews
  const storageConfig = getStorageConfig(shop.storageConfig as any);
  const itemsWithUrls = await Promise.all(
    upload.items.map(async (item) => {
      let thumbnailUrl = null;
      let previewUrl = null;

      if (item.thumbnailKey) {
        try {
          thumbnailUrl = await getDownloadSignedUrl(storageConfig, item.thumbnailKey, 3600);
        } catch {}
      }
      if (item.previewKey) {
        try {
          previewUrl = await getDownloadSignedUrl(storageConfig, item.previewKey, 3600);
        } catch {}
      }

      return {
        ...item,
        thumbnailUrl,
        previewUrl,
        preflightResult: item.preflightResult as any,
      };
    })
  );

  return json({
    upload: {
      ...upload,
      items: itemsWithUrls,
    },
    shopPlan: shop.plan,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  const uploadId = params.id;
  const formData = await request.formData();
  const action = formData.get("_action");

  if (action === "approve") {
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: "approved",
        approvedAt: new Date(),
      },
    });
    return json({ success: true, action: "approved" });
  }

  if (action === "reject") {
    const reason = formData.get("reason") as string;
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        preflightSummary: {
          ...(await prisma.upload.findUnique({ where: { id: uploadId }, select: { preflightSummary: true } }))?.preflightSummary as any,
          rejectionReason: reason,
        },
      },
    });
    return json({ success: true, action: "rejected" });
  }

  if (action === "continue_with_warnings") {
    await prisma.upload.update({
      where: { id: uploadId },
      data: { status: "approved", approvedAt: new Date() },
    });
    return json({ success: true, action: "approved_with_warnings" });
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

function PreflightBadge({ status }: { status: string }) {
  const config: Record<string, { tone: "success" | "warning" | "critical" | "info"; label: string }> = {
    ok: { tone: "success", label: "OK" },
    warning: { tone: "warning", label: "Warning" },
    error: { tone: "critical", label: "Error" },
    pending: { tone: "info", label: "Pending" },
  };
  const { tone, label } = config[status] || config.pending;
  return <Badge tone={tone}>{label}</Badge>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "ok") return <Icon source={CheckCircleIcon} tone="success" />;
  if (status === "warning") return <Icon source={AlertTriangleIcon} tone="warning" />;
  if (status === "error") return <Icon source={AlertCircleIcon} tone="critical" />;
  return null;
}

export default function UploadDetail() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  if ("error" in data) {
    return (
      <Page title="Error">
        <Banner tone="critical">{data.error}</Banner>
      </Page>
    );
  }

  const { upload, shopPlan } = data;
  const overallStatus = (upload.preflightSummary as any)?.overall || "pending";
  const hasWarnings = upload.items.some(i => i.preflightStatus === "warning");
  const hasErrors = upload.items.some(i => i.preflightStatus === "error");

  return (
    <Page
      title={`Upload: ${upload.id.slice(0, 8)}...`}
        backAction={{ content: "Uploads", url: "/app/uploads" }}
        primaryAction={
          upload.status === "needs_review" && !hasErrors
            ? {
                content: hasWarnings ? "Approve with Warnings" : "Approve",
                onAction: () => {
                  const form = document.getElementById("approve-form") as HTMLFormElement;
                  form?.submit();
                },
              }
            : undefined
        }
        secondaryActions={
          upload.status === "needs_review"
            ? [{ content: "Reject", destructive: true, onAction: () => setRejectModalOpen(true) }]
            : []
        }
      >
        <Layout>
          {/* Action result banner */}
          {actionData && "success" in actionData && (
            <Layout.Section>
              <Banner tone="success">
                Upload {actionData.action === "approved" ? "approved" : actionData.action === "rejected" ? "rejected" : "updated"} successfully.
              </Banner>
            </Layout.Section>
          )}

          {/* Overall Status Banner */}
          <Layout.Section>
            {hasErrors && (
              <Banner title="Preflight Errors Detected" tone="critical">
                <p>This upload has blocking errors and cannot be approved until the customer re-uploads.</p>
              </Banner>
            )}
            {hasWarnings && !hasErrors && (
              <Banner title="Preflight Warnings" tone="warning">
                <p>Some checks have warnings. You can still approve this upload or ask the customer to re-upload.</p>
              </Banner>
            )}
            {!hasWarnings && !hasErrors && overallStatus === "ok" && (
              <Banner title="All Checks Passed" tone="success">
                <p>This upload passed all preflight checks.</p>
              </Banner>
            )}
          </Layout.Section>

          {/* Upload Info */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Upload Info</Text>
                <Text as="p">ID: {upload.id}</Text>
                <Text as="p">Mode: {upload.mode}</Text>
                <InlineStack gap="200" align="start">
                  <Text as="span">Status:</Text>
                  <Badge tone={
                    upload.status === "approved" ? "success" :
                    upload.status === "rejected" ? "critical" :
                    upload.status === "blocked" ? "critical" :
                    "attention"
                  }>{upload.status}</Badge>
                </InlineStack>
                <InlineStack gap="200" align="start">
                  <Text as="span">Preflight:</Text>
                  <PreflightBadge status={overallStatus} />
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Created: {new Date(upload.createdAt).toLocaleString()}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Items */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Upload Items ({upload.items.length})</Text>

                {upload.items.map((item) => (
                  <Card key={item.id}>
                    <InlineStack gap="400" align="start" blockAlign="start">
                      {/* Thumbnail */}
                      <Box>
                        {item.thumbnailUrl ? (
                          <Thumbnail
                            source={item.thumbnailUrl}
                            alt={item.originalName || "Upload"}
                            size="large"
                          />
                        ) : (
                          <Box background="bg-surface-secondary" padding="400">
                            <Text as="p" tone="subdued">No preview</Text>
                          </Box>
                        )}
                      </Box>

                      {/* Item Info */}
                      <BlockStack gap="200">
                        <InlineStack gap="200" align="start">
                          <Text as="h3" variant="headingSm">{item.originalName || item.id}</Text>
                          <PreflightBadge status={item.preflightStatus} />
                        </InlineStack>
                        <Text as="p" variant="bodySm">Location: {item.location}</Text>
                        <Text as="p" variant="bodySm">
                          Size: {item.fileSize ? `${(item.fileSize / 1024 / 1024).toFixed(2)} MB` : "Unknown"}
                        </Text>

                        {/* Preflight Checks */}
                        {item.preflightResult?.checks && (
                          <BlockStack gap="100">
                            <Text as="p" variant="bodySm" fontWeight="semibold">Preflight Checks:</Text>
                            {(item.preflightResult.checks as any[]).map((check, idx) => (
                              <InlineStack key={idx} gap="100" align="start">
                                <StatusIcon status={check.status} />
                                <Text as="span" variant="bodySm">
                                  {check.name}: {check.message || check.value}
                                </Text>
                              </InlineStack>
                            ))}
                          </BlockStack>
                        )}

                        {/* Preview link */}
                        {item.previewUrl && (
                          <Button url={item.previewUrl} external variant="plain">
                            View Full Size
                          </Button>
                        )}
                      </BlockStack>
                    </InlineStack>
                  </Card>
                ))}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Hidden forms for actions */}
          <Form method="post" id="approve-form">
            <input type="hidden" name="_action" value={hasWarnings ? "continue_with_warnings" : "approve"} />
          </Form>
        </Layout>

        {/* Reject Modal */}
        <Modal
          open={rejectModalOpen}
          onClose={() => setRejectModalOpen(false)}
          title="Reject Upload"
          primaryAction={{
            content: "Reject",
            destructive: true,
            onAction: () => {
              const form = document.getElementById("reject-form") as HTMLFormElement;
              form?.submit();
            },
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setRejectModalOpen(false) },
          ]}
        >
          <Modal.Section>
            <Form method="post" id="reject-form">
              <input type="hidden" name="_action" value="reject" />
              <BlockStack gap="200">
                <Text as="p">Provide a reason for rejection (optional):</Text>
                <textarea
                  name="reason"
                  style={{ width: "100%", minHeight: "100px", padding: "8px" }}
                  placeholder="Enter rejection reason..."
                />
              </BlockStack>
            </Form>
          </Modal.Section>
        </Modal>
      </Page>
  );
}

