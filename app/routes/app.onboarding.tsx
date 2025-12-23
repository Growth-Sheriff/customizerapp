import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page, Card, Text, BlockStack, Button, InlineStack, Box,
  ProgressBar, Icon, Banner, Divider, Badge, TextField,
  Checkbox, Select,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  StoreMajor,
  SettingsIcon,
  ProductIcon,
  AppsIcon,
  CheckIcon,
} from "@shopify/polaris-icons";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";

const ONBOARDING_STEPS = [
  { id: 0, title: "Welcome", description: "Let's get you set up" },
  { id: 1, title: "Business Info", description: "Tell us about your business" },
  { id: 2, title: "Storage Setup", description: "Configure file storage" },
  { id: 3, title: "First Product", description: "Enable customization" },
  { id: 4, title: "Theme Setup", description: "Add to your theme" },
  { id: 5, title: "Complete", description: "You're all set!" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      productsConfig: { where: { enabled: true }, take: 1 },
    },
  });

  // Create shop if not exists
  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopDomain,
        accessToken: session.accessToken || "",
        plan: "starter",
        billingStatus: "active",
        storageProvider: "r2",
        onboardingCompleted: false,
        onboardingStep: 0,
        settings: {},
      },
      include: {
        productsConfig: { where: { enabled: true }, take: 1 },
      },
    });
  }

  // If onboarding completed, redirect to dashboard
  if (shop.onboardingCompleted) {
    return redirect("/app");
  }

  // Get product count from Shopify
  const { admin } = await authenticate.admin(request);
  const productsResponse = await admin.graphql(`
    query {
      products(first: 1) {
        edges { node { id } }
        pageInfo { hasNextPage }
      }
    }
  `);
  const productsData = await productsResponse.json();
  const hasProducts = productsData.data?.products?.edges?.length > 0;

  return json({
    shop: {
      domain: shopDomain,
      plan: shop.plan,
      currentStep: shop.onboardingStep || 0,
      onboardingData: shop.onboardingData as Record<string, unknown> | null,
      storageProvider: shop.storageProvider,
      hasConfiguredProduct: shop.productsConfig.length > 0,
    },
    hasProducts,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  if (intent === "next") {
    const currentStep = shop.onboardingStep || 0;
    const businessType = formData.get("businessType") as string;
    const printMethod = formData.get("printMethod") as string;
    const storageProvider = formData.get("storageProvider") as string;

    // Save step data
    const onboardingData = (shop.onboardingData as Record<string, unknown>) || {};
    if (businessType) onboardingData.businessType = businessType;
    if (printMethod) onboardingData.printMethod = printMethod;

    const nextStep = Math.min(currentStep + 1, 5);
    const isComplete = nextStep >= 5;

    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        onboardingStep: nextStep,
        onboardingCompleted: isComplete,
        onboardingData,
        storageProvider: storageProvider || shop.storageProvider,
      },
    });

    if (isComplete) {
      return redirect("/app");
    }

    return json({ success: true, step: nextStep });
  }

  if (intent === "skip") {
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        onboardingCompleted: true,
        onboardingStep: 5,
      },
    });
    return redirect("/app");
  }

  if (intent === "back") {
    const currentStep = shop.onboardingStep || 0;
    const prevStep = Math.max(currentStep - 1, 0);
    
    await prisma.shop.update({
      where: { id: shop.id },
      data: { onboardingStep: prevStep },
    });

    return json({ success: true, step: prevStep });
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}

export default function Onboarding() {
  const { shop, hasProducts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(shop.currentStep);
  const [businessType, setBusinessType] = useState(
    (shop.onboardingData?.businessType as string) || "print_shop"
  );
  const [printMethod, setPrintMethod] = useState(
    (shop.onboardingData?.printMethod as string) || "dtf"
  );
  const [storageProvider, setStorageProvider] = useState(shop.storageProvider);

  const handleNext = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "next");
    if (step === 1) {
      formData.append("businessType", businessType);
      formData.append("printMethod", printMethod);
    }
    if (step === 2) {
      formData.append("storageProvider", storageProvider);
    }
    fetcher.submit(formData, { method: "post" });
    setStep(s => Math.min(s + 1, 5));
  }, [step, businessType, printMethod, storageProvider, fetcher]);

  const handleBack = useCallback(() => {
    fetcher.submit({ intent: "back" }, { method: "post" });
    setStep(s => Math.max(s - 1, 0));
  }, [fetcher]);

  const handleSkip = useCallback(() => {
    fetcher.submit({ intent: "skip" }, { method: "post" });
  }, [fetcher]);

  const progress = (step / (ONBOARDING_STEPS.length - 1)) * 100;

  return (
    <Page narrowWidth>
      <BlockStack gap="500">
        {/* Progress Header */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h1" variant="headingLg">Setup Wizard</Text>
              <Badge tone="info">Step {step + 1} of {ONBOARDING_STEPS.length}</Badge>
            </InlineStack>
            <ProgressBar progress={progress} size="small" tone="primary" />
            <InlineStack gap="200" wrap={false}>
              {ONBOARDING_STEPS.map((s, idx) => (
                <Box key={s.id}>
                  <InlineStack gap="100" blockAlign="center">
                    <Box
                      background={idx <= step ? "bg-fill-success" : "bg-fill-secondary"}
                      padding="100"
                      borderRadius="full"
                    >
                      {idx < step ? (
                        <Icon source={CheckIcon} tone="success" />
                      ) : (
                        <Text as="span" variant="bodySm" fontWeight="bold">
                          {idx + 1}
                        </Text>
                      )}
                    </Box>
                  </InlineStack>
                </Box>
              ))}
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Step Content */}
        <Card>
          <BlockStack gap="500">
            {/* Step 0: Welcome */}
            {step === 0 && (
              <BlockStack gap="400">
                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="300" align="center">
                    <Text as="h2" variant="heading2xl" alignment="center">
                      Welcome to Upload Lift
                    </Text>
                    <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
                      Enable product customization on your Shopify store in minutes
                    </Text>
                  </BlockStack>
                </Box>
                
                <Divider />
                
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">What you'll set up:</Text>
                  <InlineStack gap="200" blockAlign="start">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p">Configure your business preferences</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="start">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p">Set up secure file storage (Cloudflare R2)</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="start">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p">Enable your first product for customization</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="start">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p">Add the customizer to your theme</Text>
                  </InlineStack>
                </BlockStack>
                
                <Banner tone="info">
                  This takes about 3-5 minutes. You can skip and complete later.
                </Banner>
              </BlockStack>
            )}

            {/* Step 1: Business Info */}
            {step === 1 && (
              <BlockStack gap="400">
                <Text as="h2" variant="headingXl">Tell us about your business</Text>
                <Text as="p" tone="subdued">
                  This helps us recommend the best settings for you
                </Text>
                
                <Divider />
                
                <Select
                  label="Business Type"
                  options={[
                    { label: "Print Shop / DTF Business", value: "print_shop" },
                    { label: "Apparel Brand", value: "apparel" },
                    { label: "Print on Demand", value: "pod" },
                    { label: "Custom Merchandise", value: "merch" },
                    { label: "Other", value: "other" },
                  ]}
                  value={businessType}
                  onChange={setBusinessType}
                />
                
                <Select
                  label="Primary Print Method"
                  options={[
                    { label: "DTF (Direct to Film)", value: "dtf" },
                    { label: "Sublimation", value: "sublimation" },
                    { label: "Screen Printing", value: "screen" },
                    { label: "DTG (Direct to Garment)", value: "dtg" },
                    { label: "Multiple Methods", value: "multiple" },
                  ]}
                  value={printMethod}
                  onChange={setPrintMethod}
                />
                
                <Banner tone="info">
                  Based on your selection, we'll configure optimal DPI and file format settings.
                </Banner>
              </BlockStack>
            )}

            {/* Step 2: Storage Setup */}
            {step === 2 && (
              <BlockStack gap="400">
                <Text as="h2" variant="headingXl">File Storage Configuration</Text>
                <Text as="p" tone="subdued">
                  Where should customer uploads be stored?
                </Text>
                
                <Divider />
                
                <BlockStack gap="300">
                  <Card background={storageProvider === "r2" ? "bg-surface-success" : undefined}>
                    <InlineStack align="space-between">
                      <BlockStack gap="100">
                        <InlineStack gap="200">
                          <Text as="h3" variant="headingMd">Cloudflare R2</Text>
                          <Badge tone="success">Recommended</Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Fast, secure, globally distributed storage
                        </Text>
                      </BlockStack>
                      <Button
                        variant={storageProvider === "r2" ? "primary" : "secondary"}
                        onClick={() => setStorageProvider("r2")}
                      >
                        {storageProvider === "r2" ? "Selected" : "Select"}
                      </Button>
                    </InlineStack>
                  </Card>
                  
                  <Card background={storageProvider === "shopify" ? "bg-surface-success" : undefined}>
                    <InlineStack align="space-between">
                      <BlockStack gap="100">
                        <Text as="h3" variant="headingMd">Shopify Files</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Use Shopify's built-in file storage
                        </Text>
                      </BlockStack>
                      <Button
                        variant={storageProvider === "shopify" ? "primary" : "secondary"}
                        onClick={() => setStorageProvider("shopify")}
                      >
                        {storageProvider === "shopify" ? "Selected" : "Select"}
                      </Button>
                    </InlineStack>
                  </Card>
                </BlockStack>
                
                <Banner tone="info">
                  R2 offers better performance and lower costs for high-volume stores.
                </Banner>
              </BlockStack>
            )}

            {/* Step 3: First Product */}
            {step === 3 && (
              <BlockStack gap="400">
                <Text as="h2" variant="headingXl">Enable Your First Product</Text>
                <Text as="p" tone="subdued">
                  Select a product to enable customization
                </Text>
                
                <Divider />
                
                {!hasProducts ? (
                  <Banner tone="warning">
                    <p>You don't have any products yet. Create a product in Shopify first, then come back here.</p>
                  </Banner>
                ) : shop.hasConfiguredProduct ? (
                  <Banner tone="success">
                    <InlineStack gap="200" blockAlign="center">
                      <Icon source={CheckCircleIcon} tone="success" />
                      <Text as="p">You have at least one product configured!</Text>
                    </InlineStack>
                  </Banner>
                ) : (
                  <BlockStack gap="300">
                    <Text as="p">
                      Click below to open the Products page and configure your first product.
                    </Text>
                    <Button onClick={() => navigate("/app/products")} variant="primary">
                      Go to Products
                    </Button>
                  </BlockStack>
                )}
              </BlockStack>
            )}

            {/* Step 4: Theme Setup */}
            {step === 4 && (
              <BlockStack gap="400">
                <Text as="h2" variant="headingXl">Add to Your Theme</Text>
                <Text as="p" tone="subdued">
                  Add the customizer widget to your product pages
                </Text>
                
                <Divider />
                
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">Option 1: App Block (Recommended)</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    For Online Store 2.0 themes (Dawn, Refresh, etc.)
                  </Text>
                  <ol style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
                    <li>Go to <strong>Online Store → Themes → Customize</strong></li>
                    <li>Navigate to a product page template</li>
                    <li>Click <strong>Add block</strong> → <strong>Apps</strong></li>
                    <li>Select <strong>DTF Transfer Customizer</strong></li>
                    <li>Save changes</li>
                  </ol>
                </BlockStack>
                
                <Divider />
                
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">Option 2: App Embed</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    For legacy themes or custom implementations
                  </Text>
                  <ol style={{ paddingLeft: "1.5rem", marginTop: "0.5rem" }}>
                    <li>Go to <strong>Online Store → Themes → Customize</strong></li>
                    <li>Click <strong>App embeds</strong> (left sidebar)</li>
                    <li>Enable <strong>Upload Lift</strong></li>
                    <li>Save changes</li>
                  </ol>
                </BlockStack>
                
                <Banner tone="info">
                  You can always adjust theme settings later from Settings → Theme Setup
                </Banner>
              </BlockStack>
            )}

            {/* Step 5: Complete */}
            {step === 5 && (
              <BlockStack gap="400">
                <Box padding="600" background="bg-surface-success" borderRadius="200">
                  <BlockStack gap="300" align="center">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="h2" variant="heading2xl" alignment="center">
                      You're All Set!
                    </Text>
                    <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
                      Your store is ready to accept custom uploads
                    </Text>
                  </BlockStack>
                </Box>
                
                <Divider />
                
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">Next Steps:</Text>
                  <InlineStack gap="200" blockAlign="start">
                    <Icon source={ProductIcon} tone="base" />
                    <Text as="p">Configure more products for customization</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="start">
                    <Icon source={SettingsIcon} tone="base" />
                    <Text as="p">Customize your upload settings</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="start">
                    <Icon source={AppsIcon} tone="base" />
                    <Text as="p">Explore 3D T-Shirt Designer for apparel</Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            )}

            {/* Navigation Buttons */}
            <Divider />
            <InlineStack align="space-between">
              <InlineStack gap="200">
                {step > 0 && step < 5 && (
                  <Button onClick={handleBack} disabled={fetcher.state !== "idle"}>
                    Back
                  </Button>
                )}
                {step < 5 && (
                  <Button variant="plain" onClick={handleSkip}>
                    Skip Setup
                  </Button>
                )}
              </InlineStack>
              
              {step < 5 ? (
                <Button
                  variant="primary"
                  onClick={handleNext}
                  loading={fetcher.state !== "idle"}
                  icon={ChevronRightIcon}
                >
                  {step === 0 ? "Get Started" : step === 4 ? "Finish" : "Continue"}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => navigate("/app")}>
                  Go to Dashboard
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
