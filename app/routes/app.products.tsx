import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigate, Link } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, DataTable, Badge, EmptyState
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";

// GraphQL query to fetch products - 2025-10 compatible
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
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

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

  // Fetch products from Shopify using admin.graphql()
  let shopifyProducts: Array<{
    id: string;
    title: string;
    status: string;
    image: string | null;
  }> = [];

  try {
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: { first: 50 },
    });
    const result = await response.json();

    if (result.data?.products?.edges) {
      shopifyProducts = result.data.products.edges.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        status: edge.node.status,
        image: edge.node.featuredImage?.url || null,
      }));
    }
  } catch (error) {
    console.error("Failed to fetch products:", error);
  }

  // Merge Shopify products with our configs
  const products = shopifyProducts.map(product => {
    const config = productConfigs.find(c => c.productId === product.id);
    return {
      ...product,
      uploadEnabled: config?.uploadEnabled ?? config?.enabled ?? false,
      mode: config?.mode || null,
      configId: config?.id || null,
    };
  });

  return json({
    products,
    shopPlan: shop.plan,
    configuredCount: productConfigs.filter(c => c.enabled || c.uploadEnabled).length,
  });
}

// Action removed - all config is now in configure page
export async function action({ request }: ActionFunctionArgs) {
  return json({ error: "Use the configure page" }, { status: 400 });
}

function ModeBadge({ mode }: { mode: string | null }) {
  if (!mode) return <Badge>Not configured</Badge>;

  const config: Record<string, { tone: "success" | "info" | "attention" | "warning"; label: string }> = {
    dtf: { tone: "warning", label: "DTF Transfer" },
    // İkinci mod buraya eklenecek
  };

  const { tone, label } = config[mode] || { tone: "info", label: mode };
  return <Badge tone={tone}>{label}</Badge>;
}

export default function ProductsPage() {
  const { products, shopPlan, configuredCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();

  // Extract numeric ID from GID for navigation
  const getNumericId = (gid: string) => gid.split("/").pop() || gid;

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
    <Button 
      key={`btn-${product.id}`} 
      size="slim" 
      onClick={() => navigate(`/app/products/${getNumericId(product.id)}/configure`)}
    >
      Configure
    </Button>,
  ]);

  return (
    <Page
      title="Products"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        {/* Action result banner */}
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
                  Free plan: Limited features. <Link to="/app/billing">Upgrade</Link> for more.
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
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Product", "Status", "Mode", "Actions"]}
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
    </Page>
  );
}

