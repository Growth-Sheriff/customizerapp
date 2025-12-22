/**
 * Products Page - List all products with Configure links
 * Uses Remix Link for navigation (works with AppBridge)
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, DataTable, Badge, EmptyState, Banner
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";

// GraphQL query to fetch products
const PRODUCTS_QUERY = `
  query getProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          status
          featuredImage {
            url(transform: { maxWidth: 100 })
          }
        }
      }
    }
  }
`;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Get or create shop
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

  // Get product configs
  const productConfigs = await prisma.productConfig.findMany({
    where: { shopId: shop.id },
    select: {
      productId: true,
      mode: true,
      enabled: true,
      uploadEnabled: true,
    },
  });

  // Fetch products from Shopify
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

  // Merge with configs
  const products = shopifyProducts.map(product => {
    const config = productConfigs.find(c => c.productId === product.id);
    return {
      ...product,
      numericId: product.id.split("/").pop() || "",
      isEnabled: config?.uploadEnabled ?? config?.enabled ?? false,
      mode: config?.mode || null,
    };
  });

  const configuredCount = productConfigs.filter(c => c.enabled || c.uploadEnabled).length;

  return json({ products, configuredCount, shopPlan: shop.plan });
}

function ModeBadge({ mode }: { mode: string | null }) {
  if (!mode) return <Badge>Not configured</Badge>;
  
  const badges: Record<string, { tone: "success" | "info" | "warning"; label: string }> = {
    dtf: { tone: "warning", label: "DTF Transfer" },
    "3d_designer": { tone: "success", label: "3D Designer" },
    classic: { tone: "info", label: "Classic" },
  };
  
  const { tone, label } = badges[mode] || { tone: "info", label: mode };
  return <Badge tone={tone}>{label}</Badge>;
}

export default function ProductsPage() {
  const { products, configuredCount, shopPlan } = useLoaderData<typeof loader>();

  const rows = products.map(product => [
    // Product column
    <InlineStack key={`prod-${product.id}`} gap="300" blockAlign="center">
      {product.image ? (
        <img 
          src={product.image} 
          alt="" 
          style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} 
        />
      ) : (
        <div style={{ width: 40, height: 40, background: "#f4f6f8", borderRadius: 4 }} />
      )}
      <Text as="span" variant="bodyMd">{product.title}</Text>
    </InlineStack>,
    
    // Status column
    product.isEnabled 
      ? <Badge tone="success">Enabled</Badge> 
      : <Badge>Disabled</Badge>,
    
    // Mode column
    <ModeBadge key={`mode-${product.id}`} mode={product.mode} />,
    
    // Actions column - Remix Link for navigation
    <Link 
      key={`link-${product.id}`} 
      to={`/app/products/${product.numericId}/configure`}
      style={{ textDecoration: "none" }}
    >
      <Button size="slim">Configure</Button>
    </Link>,
  ]);

  return (
    <Page
      title="Products"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        {/* Stats Card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Product Configuration</Text>
              <Text as="p" tone="subdued">
                {configuredCount} of {products.length} products configured for upload
              </Text>
              
              {shopPlan === "free" && (
                <Banner tone="info">
                  Free plan active. <Link to="/app/billing">Upgrade</Link> for more features.
                </Banner>
              )}
            </BlockStack>
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

