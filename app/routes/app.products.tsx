import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation, Link } from "@remix-run/react";
import {
  AppProvider, Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, DataTable, Badge, Modal, TextField, Select,
  FormLayout, Checkbox, EmptyState
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useState, useCallback } from "react";
import { getShopFromSession } from "~/lib/session.server";
import { shopifyGraphQL } from "~/lib/shopify.server";
import prisma from "~/lib/prisma.server";

// GraphQL query to fetch products
const PRODUCTS_QUERY = `
  query getProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          status
          featuredImage {
            url(transform: { maxWidth: 100 })
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

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

  // Get product configs from our database
  const productConfigs = await prisma.productConfig.findMany({
    where: { shopId: shop.id },
    include: {
      assetSet: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch products from Shopify
  let shopifyProducts: Array<{
    id: string;
    title: string;
    status: string;
    image: string | null;
  }> = [];

  if (shop.accessToken) {
    try {
      const result = await shopifyGraphQL<{
        products: {
          edges: Array<{
            node: {
              id: string;
              title: string;
              status: string;
              featuredImage: { url: string } | null;
            };
          }>;
        };
      }>(shopDomain, shop.accessToken, PRODUCTS_QUERY, { first: 50 });

      shopifyProducts = result.products.edges.map(edge => ({
        id: edge.node.id,
        title: edge.node.title,
        status: edge.node.status,
        image: edge.node.featuredImage?.url || null,
      }));
    } catch (error) {
      console.error("Failed to fetch products:", error);
    }
  }

  // Get asset sets for dropdown
  const assetSets = await prisma.assetSet.findMany({
    where: { shopId: shop.id, status: "active" },
    select: { id: true, name: true },
  });

  // Merge Shopify products with our configs
  const products = shopifyProducts.map(product => {
    const config = productConfigs.find(c => c.productId === product.id);
    return {
      ...product,
      uploadEnabled: config?.enabled || false,
      mode: config?.mode || null,
      assetSetId: config?.assetSetId || null,
      assetSetName: config?.assetSet?.name || null,
      configId: config?.id || null,
    };
  });

  return json({
    products,
    assetSets,
    shopPlan: shop.plan,
    configuredCount: productConfigs.filter(c => c.enabled).length,
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

  if (action === "save_config") {
    const productId = formData.get("productId") as string;
    const enabled = formData.get("enabled") === "on";
    const mode = formData.get("mode") as string;
    const assetSetId = formData.get("assetSetId") as string | null;

    // Validate mode based on plan
    const allowedModes: Record<string, string[]> = {
      free: ["classic"],
      starter: ["classic", "quick"],
      pro: ["classic", "quick", "3d_designer"],
      enterprise: ["classic", "quick", "3d_designer"],
    };

    if (!allowedModes[shop.plan]?.includes(mode)) {
      return json({ error: `Mode "${mode}" is not available in your plan` });
    }

    // Upsert product config
    await prisma.productConfig.upsert({
      where: {
        shopId_productId: {
          shopId: shop.id,
          productId,
        },
      },
      update: {
        enabled,
        mode,
        assetSetId: assetSetId || null,
      },
      create: {
        shopId: shop.id,
        productId,
        enabled,
        mode,
        assetSetId: assetSetId || null,
      },
    });

    return json({ success: true, message: "Product configuration saved" });
  }

  if (action === "disable") {
    const productId = formData.get("productId") as string;

    await prisma.productConfig.updateMany({
      where: {
        shopId: shop.id,
        productId,
      },
      data: { enabled: false },
    });

    return json({ success: true, message: "Upload disabled for product" });
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

function ModeBadge({ mode }: { mode: string | null }) {
  if (!mode) return <Badge>Not configured</Badge>;

  const config: Record<string, { tone: "success" | "info" | "attention"; label: string }> = {
    "3d_designer": { tone: "success", label: "3D Designer" },
    classic: { tone: "info", label: "Classic" },
    quick: { tone: "attention", label: "Quick" },
  };

  const { tone, label } = config[mode] || { tone: "info", label: mode };
  return <Badge tone={tone}>{label}</Badge>;
}

export default function ProductsPage() {
  const { products, assetSets, shopPlan, configuredCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);
  const [formMode, setFormMode] = useState("classic");
  const [formAssetSet, setFormAssetSet] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);

  const openConfigModal = useCallback((product: typeof products[0]) => {
    setSelectedProduct(product);
    setFormMode(product.mode || "classic");
    setFormAssetSet(product.assetSetId || "");
    setFormEnabled(product.uploadEnabled);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSelectedProduct(null);
  }, []);

  const modeOptions = [
    { label: "Classic Upload", value: "classic", disabled: false },
    { label: "Quick Upload", value: "quick", disabled: shopPlan === "free" },
    { label: "3D Designer", value: "3d_designer", disabled: !["pro", "enterprise"].includes(shopPlan) },
  ];

  const assetSetOptions = [
    { label: "None (use default)", value: "" },
    ...assetSets.map(a => ({ label: a.name, value: a.id })),
  ];

  const rows = products.map(product => [
    <InlineStack key={product.id} gap="200" align="start" blockAlign="center">
      {product.image ? (
        <img src={product.image} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
      ) : (
        <div style={{ width: 40, height: 40, background: "#f4f6f8", borderRadius: 4 }} />
      )}
      <Text as="span" variant="bodyMd">{product.title}</Text>
    </InlineStack>,
    product.uploadEnabled ? <Badge tone="success">Enabled</Badge> : <Badge>Disabled</Badge>,
    <ModeBadge key={`mode-${product.id}`} mode={product.mode} />,
    product.assetSetName || "-",
    <Button key={`btn-${product.id}`} size="slim" onClick={() => openConfigModal(product)}>
      Configure
    </Button>,
  ]);

  return (
    <AppProvider i18n={enTranslations}>
      <Page
        title="Products"
        backAction={{ content: "Dashboard", url: "/app" }}
        primaryAction={{ content: "Manage Asset Sets", url: "/app/asset-sets" }}
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

          {/* Stats */}
          <Layout.Section>
            <Card>
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Product Configuration</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {configuredCount} of {products.length} products configured for upload
                  </Text>
                </BlockStack>

                {shopPlan === "free" && (
                  <Banner tone="warning">
                    Free plan: Only Classic mode available. <Link to="/app/billing">Upgrade</Link> for more modes.
                  </Banner>
                )}
              </InlineStack>
            </Card>
          </Layout.Section>

          {/* Products Table */}
          <Layout.Section>
            <Card>
              {products.length > 0 ? (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Product", "Status", "Mode", "Asset Set", "Actions"]}
                  rows={rows}
                />
              ) : (
                <EmptyState
                  heading="No products found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Add products to your store to configure upload settings.</p>
                </EmptyState>
              )}
            </Card>
          </Layout.Section>
        </Layout>

        {/* Configure Modal */}
        <Modal
          open={modalOpen}
          onClose={closeModal}
          title={`Configure: ${selectedProduct?.title || ""}`}
          primaryAction={{
            content: "Save",
            loading: isSubmitting,
            onAction: () => {
              const form = document.getElementById("config-form") as HTMLFormElement;
              form?.submit();
            },
          }}
          secondaryActions={[
            { content: "Cancel", onAction: closeModal },
          ]}
        >
          <Modal.Section>
            <Form method="post" id="config-form">
              <input type="hidden" name="_action" value="save_config" />
              <input type="hidden" name="productId" value={selectedProduct?.id || ""} />

              <FormLayout>
                <Checkbox
                  label="Enable upload for this product"
                  checked={formEnabled}
                  onChange={setFormEnabled}
                  name="enabled"
                />

                <Select
                  label="Upload Mode"
                  options={modeOptions}
                  value={formMode}
                  onChange={setFormMode}
                  name="mode"
                  helpText={
                    formMode === "3d_designer"
                      ? "Interactive 3D preview with multi-location support"
                      : formMode === "quick"
                        ? "Streamlined upload for repeat customers"
                        : "Standard upload with size selection and validation"
                  }
                />

                {formMode === "3d_designer" && (
                  <Select
                    label="Asset Set"
                    options={assetSetOptions}
                    value={formAssetSet}
                    onChange={setFormAssetSet}
                    name="assetSetId"
                    helpText="3D model and print locations configuration"
                  />
                )}
              </FormLayout>
            </Form>
          </Modal.Section>
        </Modal>
      </Page>
    </AppProvider>
  );
}

