/**
 * Products Page - List products with configure links
 * Uses ResourceList for proper Polaris/React compatibility
 */
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Badge, EmptyState, Banner, ResourceList, ResourceItem,
  Avatar, Filters
} from "@shopify/polaris";
import { useState, useCallback } from "react";
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

interface ProductItem {
  id: string;
  numericId: string;
  title: string;
  status: string;
  image: string | null;
  isEnabled: boolean;
  mode: string | null;
}

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

  // Get product configs - cast to any to access new fields
  const productConfigs = await prisma.productConfig.findMany({
    where: { shopId: shop.id },
  }) as Array<{
    productId: string;
    mode: string;
    enabled: boolean;
    uploadEnabled?: boolean;
  }>;

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
  const products: ProductItem[] = shopifyProducts.map(product => {
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

function getModeLabel(mode: string | null): string {
  if (!mode) return "Not configured";
  const labels: Record<string, string> = {
    dtf: "DTF Transfer",
    "3d_designer": "3D Designer",
    classic: "Classic",
  };
  return labels[mode] || mode;
}

function getModeTone(mode: string | null): "success" | "info" | "warning" | undefined {
  if (!mode) return undefined;
  const tones: Record<string, "success" | "info" | "warning"> = {
    dtf: "warning",
    "3d_designer": "success",
    classic: "info",
  };
  return tones[mode];
}

export default function ProductsPage() {
  const { products, configuredCount, shopPlan } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [queryValue, setQueryValue] = useState("");

  const handleQueryChange = useCallback((value: string) => {
    setQueryValue(value);
  }, []);

  const handleQueryClear = useCallback(() => {
    setQueryValue("");
  }, []);

  // Filter products by search query
  const filteredProducts = products.filter(product =>
    product.title.toLowerCase().includes(queryValue.toLowerCase())
  );

  // Navigate using both Remix navigate and App Bridge
  const handleConfigureClick = useCallback((numericId: string) => {
    const path = `/app/products/${numericId}/configure`;
    
    // Try App Bridge navigation first (for embedded apps)
    const shopify = (window as any).shopify;
    if (shopify?.navigate) {
      shopify.navigate(path);
    } else {
      // Fallback to Remix navigate
      navigate(path);
    }
  }, [navigate]);

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  const filterControl = (
    <Filters
      queryValue={queryValue}
      filters={[]}
      onQueryChange={handleQueryChange}
      onQueryClear={handleQueryClear}
      onClearAll={handleQueryClear}
      queryPlaceholder="Search products..."
    />
  );

  const emptyStateMarkup = (
    <EmptyState
      heading="No products found"
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>Add products to your store to configure upload settings.</p>
    </EmptyState>
  );

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
                  Free plan active. Upgrade for more features.
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Products List */}
        <Layout.Section>
          <Card padding="0">
            <ResourceList
              resourceName={resourceName}
              items={filteredProducts}
              filterControl={filterControl}
              emptyState={emptyStateMarkup}
              renderItem={(item) => {
                const { numericId, title, image, isEnabled, mode } = item;
                const media = (
                  <Avatar
                    customer
                    size="md"
                    source={image || undefined}
                    name={title}
                  />
                );

                return (
                  <ResourceItem
                    id={numericId}
                    media={media}
                    accessibilityLabel={`Configure ${title}`}
                    onClick={() => handleConfigureClick(numericId)}
                    shortcutActions={[
                      {
                        content: "Configure",
                        onAction: () => handleConfigureClick(numericId),
                      },
                    ]}
                  >
                    <BlockStack gap="100">
                      <Text variant="bodyMd" fontWeight="bold" as="span">
                        {title}
                      </Text>
                      <InlineStack gap="200">
                        {isEnabled ? (
                          <Badge tone="success">Enabled</Badge>
                        ) : (
                          <Badge>Disabled</Badge>
                        )}
                        <Badge tone={getModeTone(mode)}>
                          {getModeLabel(mode)}
                        </Badge>
                      </InlineStack>
                    </BlockStack>
                  </ResourceItem>
                );
              }}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

