import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  TextField, Select, Button, Banner, FormLayout, Divider, Box, Checkbox, Badge
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";

// GraphQL query to get shop info
const SHOP_INFO_QUERY = `
  query {
    shop {
      name
      email
    }
  }
`;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Get shop info from Shopify for defaults
  let shopifyShopName = "";
  let shopifyEmail = "";
  try {
    const response = await admin.graphql(SHOP_INFO_QUERY);
    const data = await response.json();
    shopifyShopName = data?.data?.shop?.name || "";
    shopifyEmail = data?.data?.shop?.email || "";
  } catch (e) {
    console.warn("[Settings] Could not fetch shop info from Shopify");
  }

  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopDomain,
        accessToken: session.accessToken || "",
        plan: "starter",
        billingStatus: "active",
        storageProvider: "shopify", // Default to Shopify Files (recommended)
        settings: {},
      },
    });
  }

  const storageConfig = (shop.storageConfig as Record<string, unknown>) || {};
  const settings = (shop.settings as Record<string, unknown>) || {};

  return json({
    shop: {
      domain: shop.shopDomain,
      plan: shop.plan,
    },
    storageConfig: {
      provider: shop.storageProvider || "shopify",
      bucket: storageConfig.bucket || "",
      region: storageConfig.region || "auto",
      accountId: storageConfig.accountId || "",
      accessKeyId: storageConfig.accessKeyId ? "••••••••" : "",
      secretAccessKey: storageConfig.secretAccessKey ? "••••••••" : "",
      publicUrl: storageConfig.publicUrl || "",
      isConfigured: shop.storageProvider === "shopify" || !!(storageConfig.accessKeyId && storageConfig.bucket),
    },
    settings: {
      // Use saved value, or fallback to Shopify data
      shopName: (settings.shopName as string) || shopifyShopName,
      notificationEmail: (settings.notificationEmail as string) || shopifyEmail,
      autoApprove: settings.autoApprove || false,
      watermarkEnabled: false, // No watermark for any plan
      redisEnabled: settings.redisEnabled || false,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const action = formData.get("_action");

  if (action === "save_storage") {
    const provider = formData.get("provider") as string;
    const bucket = formData.get("bucket") as string;
    const region = formData.get("region") as string;
    const accountId = formData.get("accountId") as string;
    const accessKeyId = formData.get("accessKeyId") as string;
    const secretAccessKey = formData.get("secretAccessKey") as string;
    const publicUrl = formData.get("publicUrl") as string;

    // Get existing config to preserve unchanged secrets
    const existingConfig = (shop.storageConfig as Record<string, unknown>) || {};

    const newConfig: Record<string, unknown> = {
      bucket,
      region: provider === "r2" ? "auto" : region,
      publicUrl,
    };

    if (provider === "r2") {
      newConfig.accountId = accountId;
    }

    // Only update secrets if not placeholder
    if (accessKeyId && accessKeyId !== "••••••••") {
      newConfig.accessKeyId = accessKeyId;
    } else {
      newConfig.accessKeyId = existingConfig.accessKeyId;
    }

    if (secretAccessKey && secretAccessKey !== "••••••••") {
      newConfig.secretAccessKey = secretAccessKey;
    } else {
      newConfig.secretAccessKey = existingConfig.secretAccessKey;
    }

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        storageProvider: provider,
        storageConfig: newConfig,
      },
    });

    return json({ success: true, message: "Storage settings saved" });
  }

  if (action === "save_general") {
    const shopName = formData.get("shopName") as string;
    const notificationEmail = formData.get("notificationEmail") as string;
    const autoApprove = formData.get("autoApprove") === "on";

    const existingSettings = (shop.settings as Record<string, unknown>) || {};

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        settings: {
          ...existingSettings,
          shopName,
          notificationEmail,
          autoApprove,
        },
      },
    });

    return json({ success: true, message: "General settings saved" });
  }

  if (action === "test_storage") {
    // Test storage connection
    try {
      const response = await fetch(`${process.env.HOST || "https://customizerapp.dev"}/api/storage/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("Cookie") || "",
        },
      });

      const result = await response.json();

      if (result.success) {
        return json({ success: true, message: "Storage connection successful!" });
      } else {
        return json({ error: result.message || "Connection failed" });
      }
    } catch (error) {
      return json({ error: "Failed to test connection" });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

export default function SettingsPage() {
  const { shop, storageConfig, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [provider, setProvider] = useState(storageConfig.provider);
  const [showStorageConfig, setShowStorageConfig] = useState(
    storageConfig.provider !== "shopify" && storageConfig.provider !== "local"
  );

  // Form state for general settings
  const [shopName, setShopName] = useState(settings.shopName as string);
  const [notificationEmail, setNotificationEmail] = useState(settings.notificationEmail as string);

  // Form state for storage settings
  const [bucket, setBucket] = useState(storageConfig.bucket as string);
  const [accountId, setAccountId] = useState(storageConfig.accountId as string);
  const [region, setRegion] = useState((storageConfig.region as string) || "us-east-1");
  const [accessKeyId, setAccessKeyId] = useState(storageConfig.accessKeyId as string);
  const [secretAccessKey, setSecretAccessKey] = useState(storageConfig.secretAccessKey as string);
  const [publicUrl, setPublicUrl] = useState(storageConfig.publicUrl as string);

  const handleProviderChange = useCallback((value: string) => {
    setProvider(value);
    if (value === "shopify" || value === "local") {
      setShowStorageConfig(false);
    }
  }, []);

  const handleToggleCloudStorage = useCallback((checked: boolean) => {
    setShowStorageConfig(checked);
    if (!checked) {
      setProvider("shopify");
    } else {
      setProvider("r2");
    }
  }, []);

  return (
    <Page title="Settings" backAction={{ content: "Dashboard", url: "/app" }}>
        <Layout>
          {/* Success/Error Banner */}
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

          {/* General Settings */}
          <Layout.Section>
            <Card>
              <Form method="post">
                <input type="hidden" name="_action" value="save_general" />
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">General Settings</Text>

                  <FormLayout>
                    <TextField
                      label="Shop Name"
                      name="shopName"
                      value={shopName}
                      onChange={setShopName}
                      autoComplete="off"
                    />

                    <TextField
                      label="Notification Email"
                      name="notificationEmail"
                      type="email"
                      value={notificationEmail}
                      onChange={setNotificationEmail}
                      helpText="Receive notifications about uploads and orders"
                      autoComplete="off"
                    />
                  </FormLayout>

                  <InlineStack align="end">
                    <Button submit loading={isSubmitting}>
                      Save General Settings
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Form>
            </Card>
          </Layout.Section>

          {/* Storage Settings */}
          <Layout.Section>
            <Card>
              <Form method="post">
                <input type="hidden" name="_action" value="save_storage" />
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">Storage Configuration</Text>
                    {storageConfig.provider === "shopify" ? (
                      <Badge tone="success">Shopify Files (Recommended)</Badge>
                    ) : storageConfig.provider === "local" ? (
                      <Badge tone="attention">Local Storage</Badge>
                    ) : storageConfig.isConfigured ? (
                      <Badge tone="success">Cloud Connected</Badge>
                    ) : (
                      <Badge tone="warning">Not Configured</Badge>
                    )}
                  </InlineStack>

                  <Banner tone="success">
                    <p>
                      <strong>Shopify Files (Default):</strong> Customer uploads are stored in your Shopify admin. 
                      This is free, unlimited, and requires no configuration.
                    </p>
                  </Banner>

                  <Checkbox
                    label="Use External Cloud Storage (Advanced)"
                    checked={showStorageConfig}
                    onChange={handleToggleCloudStorage}
                    helpText="Only enable if you need to use your own Cloudflare R2 or Amazon S3 bucket"
                  />

                  {showStorageConfig && (
                    <>
                      <Divider />
                      
                      <FormLayout>
                        <Select
                          label="Storage Provider"
                          name="provider"
                          options={[
                            { label: "Cloudflare R2 (Recommended - No egress fees)", value: "r2" },
                            { label: "Amazon S3", value: "s3" },
                          ]}
                          value={provider}
                          onChange={handleProviderChange}
                        />

                        <TextField
                          label="Bucket Name"
                          name="bucket"
                          value={bucket}
                          onChange={setBucket}
                          placeholder="upload-lift-files"
                          autoComplete="off"
                        />

                        {provider === "r2" && (
                          <TextField
                            label="Cloudflare Account ID"
                            name="accountId"
                            value={accountId}
                            onChange={setAccountId}
                            helpText="Found in your Cloudflare dashboard"
                            autoComplete="off"
                          />
                        )}

                        {provider === "s3" && (
                          <Select
                            label="AWS Region"
                            name="region"
                            options={[
                              { label: "US East (N. Virginia)", value: "us-east-1" },
                              { label: "US West (Oregon)", value: "us-west-2" },
                              { label: "EU (Ireland)", value: "eu-west-1" },
                              { label: "EU (Frankfurt)", value: "eu-central-1" },
                              { label: "Asia Pacific (Singapore)", value: "ap-southeast-1" },
                            ]}
                            value={region}
                            onChange={setRegion}
                          />
                        )}

                        <TextField
                          label="Access Key ID"
                          name="accessKeyId"
                          value={accessKeyId}
                          onChange={setAccessKeyId}
                          placeholder="Enter access key"
                          autoComplete="off"
                        />

                        <TextField
                          label="Secret Access Key"
                          name="secretAccessKey"
                          type="password"
                          value={secretAccessKey}
                          onChange={setSecretAccessKey}
                          placeholder="Enter secret key"
                          autoComplete="off"
                        />

                        <TextField
                          label="Public URL (Optional)"
                          name="publicUrl"
                          value={publicUrl}
                          onChange={setPublicUrl}
                          placeholder="https://cdn.example.com"
                          helpText="Custom domain for public file access"
                          autoComplete="off"
                        />
                      </FormLayout>
                    </>
                  )}

                  {!showStorageConfig && (
                    <input type="hidden" name="provider" value="shopify" />
                  )}

                  <Divider />

                  <InlineStack align="space-between">
                    {showStorageConfig && (
                      <Button
                        onClick={() => {
                          const form = document.createElement("form");
                          form.method = "post";
                          const input = document.createElement("input");
                          input.type = "hidden";
                          input.name = "_action";
                          input.value = "test_storage";
                          form.appendChild(input);
                          document.body.appendChild(form);
                          form.submit();
                        }}
                      >
                        Test Connection
                      </Button>
                    )}

                    <Box>
                      <Button submit variant="primary" loading={isSubmitting}>
                        Save Storage Settings
                      </Button>
                    </Box>
                  </InlineStack>
                </BlockStack>
              </Form>
            </Card>
          </Layout.Section>

          {/* Plan Info */}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Current Plan</Text>

                <InlineStack align="space-between">
                  <Box>
                    <Text as="p" variant="bodyLg" fontWeight="semibold">
                      {shop.plan.toUpperCase()}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {shop.plan === "starter" && "20 free orders/month, then $0.05/order"}
                      {shop.plan === "pro" && "30 free orders/month, then $0.06/order, all features"}
                    </Text>
                  </Box>

                  {shop.plan === "starter" && (
                    <Button url="/app/billing">
                      Upgrade to Pro
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Collection Button Integration Guide */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">📦 Collection Button Integration</Text>
                
                <Text as="p" variant="bodyMd" tone="subdued">
                  Add an "Upload Design" button to your collection pages instead of the default Add to Cart button.
                </Text>

                <Box paddingBlockStart="200">
                  <Text as="h3" variant="headingSm">Step 1: Create the Snippet</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Go to <strong>Online Store → Themes → Edit Code → snippets</strong> and create a new file called <code>dtf-quick-upload-btn.liquid</code>
                  </Text>
                </Box>

                <Box 
                  background="bg-surface-secondary" 
                  padding="400" 
                  borderRadius="200"
                  overflowX="auto"
                >
                  <pre style={{ fontSize: '11px', lineHeight: '1.4', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`{% comment %}
  DTF Quick Upload Button - Collection Pages
  Usage: {% render 'dtf-quick-upload-btn', product: product %}
{% endcomment %}

{% liquid
  assign btn_text = button_text | default: 'Upload Design'
  assign btn_style = button_style | default: 'primary'
%}

<style>
.dtf-quick-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  width: 100%;
  background: #6366f1;
  color: white;
}
.dtf-quick-btn:hover {
  background: #5558e3;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99,102,241,0.35);
}
.dtf-quick-btn svg {
  width: 18px;
  height: 18px;
}
</style>

<a href="{{ product.url }}" class="dtf-quick-btn">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
  <span>{{ btn_text }}</span>
</a>`}
                  </pre>
                </Box>

                <Box paddingBlockStart="200">
                  <Text as="h3" variant="headingSm">Step 2: Replace Add to Cart in Your Theme</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Find your product card template (usually <code>snippets/card-product.liquid</code> or <code>snippets/product-card.liquid</code>) and replace the Add to Cart button with:
                  </Text>
                </Box>

                <Box 
                  background="bg-surface-secondary" 
                  padding="400" 
                  borderRadius="200"
                >
                  <pre style={{ fontSize: '12px', lineHeight: '1.5', margin: 0 }}>
{`{% render 'dtf-quick-upload-btn', product: product %}`}
                  </pre>
                </Box>

                <Box paddingBlockStart="200">
                  <Text as="h3" variant="headingSm">Customization Options</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    You can customize the button text:
                  </Text>
                </Box>

                <Box 
                  background="bg-surface-secondary" 
                  padding="400" 
                  borderRadius="200"
                >
                  <pre style={{ fontSize: '12px', lineHeight: '1.5', margin: 0 }}>
{`{% render 'dtf-quick-upload-btn', 
  product: product, 
  button_text: 'Customize Now' 
%}`}
                  </pre>
                </Box>

                <Banner tone="info">
                  <Text as="p" variant="bodySm">
                    When customers click this button, they will be redirected to the product page where the full upload widget is available.
                  </Text>
                </Banner>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
  );
}

