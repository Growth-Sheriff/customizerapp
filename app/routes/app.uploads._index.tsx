import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams, Link } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, Button, DataTable, Filters, ChoiceList, Pagination, Box
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";
import { getStorageConfig, getDownloadSignedUrl } from "~/lib/storage.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({ where: { shopDomain } });
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
  const page = parseInt(url.searchParams.get("page") || "1");
  const status = url.searchParams.get("status") || undefined;
  const mode = url.searchParams.get("mode") || undefined;
  const limit = 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = { shopId: shop.id };
  if (status) where.status = status;
  if (mode) where.mode = mode;

  const [uploads, total] = await Promise.all([
    prisma.upload.findMany({
      where,
      include: {
        items: {
          select: {
            id: true,
            location: true,
            preflightStatus: true,
            thumbnailKey: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.upload.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  // Generate signed URLs for thumbnails
  const storageConfig = getStorageConfig(shop.storageConfig as any);
  const uploadsWithThumbnails = await Promise.all(
    uploads.map(async (u) => {
      let thumbnailUrl: string | null = null;
      const firstItem = u.items[0];
      
      if (firstItem?.thumbnailKey) {
        try {
          thumbnailUrl = await getDownloadSignedUrl(storageConfig, firstItem.thumbnailKey, 3600);
        } catch (e) {
          console.warn(`[Uploads] Failed to get thumbnail URL for ${u.id}:`, e);
        }
      }

      return {
        id: u.id,
        mode: u.mode,
        status: u.status,
        productId: u.productId,
        customerId: u.customerId,
        customerEmail: u.customerEmail,
        itemCount: u.items.length,
        thumbnailUrl,
        preflightStatus: u.items.some(i => i.preflightStatus === "error")
          ? "error"
          : u.items.some(i => i.preflightStatus === "warning")
            ? "warning"
            : u.items.every(i => i.preflightStatus === "ok")
              ? "ok"
              : "pending",
        createdAt: u.createdAt.toISOString(),
      };
    })
  );

  return json({
    uploads: uploadsWithThumbnails,
    pagination: {
      page,
      totalPages,
      total,
      limit,
    },
    filters: {
      status,
      mode,
    },
  });
}

function StatusBadge({ status }: { status: string }) {
  // Merchant-friendly status labels with positive tone
  const labelMap: Record<string, string> = {
    ok: "Ready ✓",
    warning: "Review",
    error: "Check",
    pending: "Processing",
    draft: "Draft",
    uploaded: "Received",
    processing: "Processing",
    needs_review: "Pending",
    approved: "Approved ✓",
    rejected: "Rejected",
    blocked: "On Hold",
    printed: "Completed ✓",
  };

  const toneMap: Record<string, "success" | "warning" | "critical" | "info" | "attention"> = {
    ok: "success",
    warning: "info",
    error: "attention",
    pending: "info",
    draft: "info",
    uploaded: "success",
    processing: "info",
    needs_review: "info",
    approved: "success",
    rejected: "critical",
    blocked: "attention",
    printed: "success",
  };
  return <Badge tone={toneMap[status] || "info"}>{labelMap[status] || status}</Badge>;
}

export default function UploadsPage() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  if ("error" in data) {
    return (
      <Page title="Error">
        <Card><Text as="p">{data.error}</Text></Card>
      </Page>
    );
  }

  const { uploads, pagination, filters } = data;

  const handleStatusChange = useCallback((value: string[]) => {
    const newParams = new URLSearchParams(searchParams);
    if (value.length > 0) {
      newParams.set("status", value[0]);
    } else {
      newParams.delete("status");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  const handleModeChange = useCallback((value: string[]) => {
    const newParams = new URLSearchParams(searchParams);
    if (value.length > 0) {
      newParams.set("mode", value[0]);
    } else {
      newParams.delete("mode");
    }
    newParams.set("page", "1");
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  const handleClearFilters = useCallback(() => {
    setSearchParams({ page: "1" });
  }, [setSearchParams]);

  const rows = uploads.map(upload => [
    <InlineStack key={upload.id} gap="200" align="start">
      {upload.thumbnailUrl ? (
        <img
          src={upload.thumbnailUrl}
          alt="Preview"
          style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }}
        />
      ) : (
        <Box background="bg-surface-secondary" padding="200" borderRadius="100" minWidth="36px" minHeight="36px">
          <Text as="span" tone="subdued">—</Text>
        </Box>
      )}
      <Link to={`/app/uploads/${upload.id}`} style={{ textDecoration: "none" }}>
        {upload.id.slice(0, 10)}...
      </Link>
    </InlineStack>,
    upload.mode,
    <StatusBadge key={`${upload.id}-status`} status={upload.status} />,
    <StatusBadge key={`${upload.id}-preflight`} status={upload.preflightStatus} />,
    upload.itemCount,
    upload.customerEmail || "-",
    new Date(upload.createdAt).toLocaleDateString(),
  ]);

  const appliedFilters = [];
  if (filters.status) {
    appliedFilters.push({
      key: "status",
      label: `Status: ${filters.status}`,
      onRemove: () => handleStatusChange([]),
    });
  }
  if (filters.mode) {
    appliedFilters.push({
      key: "mode",
      label: `Mode: ${filters.mode}`,
      onRemove: () => handleModeChange([]),
    });
  }

  return (
    <Page 
      title="Uploads" 
      subtitle={`${pagination.total} total uploads`}
      primaryAction={{
        content: "Export All",
        url: "/app/exports",
      }}
    >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                {/* Filters */}
                <Filters
                  queryValue=""
                  onQueryChange={() => {}}
                  onQueryClear={() => {}}
                  onClearAll={handleClearFilters}
                  filters={[
                    {
                      key: "status",
                      label: "Status",
                      filter: (
                        <ChoiceList
                          title="Status"
                          titleHidden
                          choices={[
                            { label: "Draft", value: "draft" },
                            { label: "Uploaded", value: "uploaded" },
                            { label: "Processing", value: "processing" },
                            { label: "Needs Review", value: "needs_review" },
                            { label: "Approved", value: "approved" },
                            { label: "Rejected", value: "rejected" },
                            { label: "Blocked", value: "blocked" },
                          ]}
                          selected={filters.status ? [filters.status] : []}
                          onChange={handleStatusChange}
                        />
                      ),
                      shortcut: true,
                    },
                    {
                      key: "mode",
                      label: "Mode",
                      filter: (
                        <ChoiceList
                          title="Mode"
                          titleHidden
                          choices={[
                            { label: "3D Designer", value: "3d_designer" },
                            { label: "Classic", value: "classic" },
                            { label: "Quick", value: "quick" },
                          ]}
                          selected={filters.mode ? [filters.mode] : []}
                          onChange={handleModeChange}
                        />
                      ),
                      shortcut: true,
                    },
                  ]}
                  appliedFilters={appliedFilters}
                />

                {/* Table */}
                {uploads.length > 0 ? (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "numeric", "text", "text"]}
                    headings={["Upload", "Mode", "Status", "Quality", "Items", "Customer", "Date"]}
                    rows={rows}
                  />
                ) : (
                  <Box padding="400">
                    <Text as="p" tone="subdued" alignment="center">
                      No uploads found matching your filters.
                    </Text>
                  </Box>
                )}

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <InlineStack align="center">
                    <Pagination
                      hasPrevious={pagination.page > 1}
                      hasNext={pagination.page < pagination.totalPages}
                      onPrevious={() => {
                        const newParams = new URLSearchParams(searchParams);
                        newParams.set("page", String(pagination.page - 1));
                        setSearchParams(newParams);
                      }}
                      onNext={() => {
                        const newParams = new URLSearchParams(searchParams);
                        newParams.set("page", String(pagination.page + 1));
                        setSearchParams(newParams);
                      }}
                    />
                  </InlineStack>
                )}

                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  Showing {uploads.length} of {pagination.total} uploads
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
  );
}

