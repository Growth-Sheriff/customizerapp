import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import {
  AppProvider, Page, Layout, Card, Text, BlockStack, InlineStack,
  TextField, Select, Button, Banner, FormLayout, Divider, Box
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useState, useCallback } from "react";
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

  const storageConfig = (shop.storageConfig as Record<string, unknown>) || {};
  const settings = (shop.settings as Record<string, unknown>) || {};

  return json({
    shop: {
      domain: shop.shopDomain,
      plan: shop.plan,
    },
    storageConfig: {
      provider: shop.storageProvider || "r2",
      bucket: storageConfig.bucket || "",
      region: storageConfig.region || "auto",
      accountId: storageConfig.accountId || "",
      accessKeyId: storageConfig.accessKeyId ? "••••••••" : "",
      secretAccessKey: storageConfig.secretAccessKey ? "••••••••" : "",
      publicUrl: storageConfig.publicUrl || "",
    },
    settings: {
      shopName: settings.shopName || "",
      notificationEmail: settings.notificationEmail || "",
      autoApprove: settings.autoApprove || false,
      watermarkEnabled: shop.plan === "free",
    },
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

  const handleProviderChange = useCallback((value: string) => {
    setProvider(value);
  }, []);

  return (
    <AppProvider i18n={enTranslations}>
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
                      defaultValue={settings.shopName as string}
                      autoComplete="off"
                    />

                    <TextField
                      label="Notification Email"
                      name="notificationEmail"
                      type="email"
                      defaultValue={settings.notificationEmail as string}
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
                  <Text as="h2" variant="headingMd">Storage Configuration</Text>

                  <Banner tone="info">
                    Configure where customer design files are stored. Cloudflare R2 is recommended (no egress fees).
                  </Banner>

                  <FormLayout>
                    <Select
                      label="Storage Provider"
                      name="provider"
                      options={[
                        { label: "Cloudflare R2 (Recommended)", value: "r2" },
                        { label: "Amazon S3", value: "s3" },
                      ]}
                      value={provider}
                      onChange={handleProviderChange}
                    />

                    <TextField
                      label="Bucket Name"
                      name="bucket"
                      defaultValue={storageConfig.bucket as string}
                      placeholder="upload-lift-files"
                      autoComplete="off"
                    />

                    {provider === "r2" && (
                      <TextField
                        label="Cloudflare Account ID"
                        name="accountId"
                        defaultValue={storageConfig.accountId as string}
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
                        value={(storageConfig.region as string) || "us-east-1"}
                      />
                    )}

                    <TextField
                      label="Access Key ID"
                      name="accessKeyId"
                      defaultValue={storageConfig.accessKeyId as string}
                      placeholder="Enter access key"
                      autoComplete="off"
                    />

                    <TextField
                      label="Secret Access Key"
                      name="secretAccessKey"
                      type="password"
                      defaultValue={storageConfig.secretAccessKey as string}
                      placeholder="Enter secret key"
                      autoComplete="off"
                    />

                    <TextField
                      label="Public URL (Optional)"
                      name="publicUrl"
                      defaultValue={storageConfig.publicUrl as string}
                      placeholder="https://cdn.example.com"
                      helpText="Custom domain for public file access"
                      autoComplete="off"
                    />
                  </FormLayout>

                  <Divider />

                  <InlineStack align="space-between">
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

                    <Button submit variant="primary" loading={isSubmitting}>
                      Save Storage Settings
                    </Button>
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
                      {shop.plan === "free" && "100 uploads/month, watermark enabled"}
                      {shop.plan === "starter" && "1,000 uploads/month, no watermark"}
                      {shop.plan === "pro" && "Unlimited uploads, all features"}
                      {shop.plan === "enterprise" && "Custom limits, priority support"}
                    </Text>
                  </Box>

                  {shop.plan !== "enterprise" && (
                    <Button url="/app/billing">
                      Upgrade Plan
                    </Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}

