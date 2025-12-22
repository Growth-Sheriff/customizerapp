import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, Badge, Box
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    features: [
      "100 uploads/month",
      "1 mode (Classic Upload)",
      "25MB max file size",
      "Basic preflight",
      "Watermark on previews",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 19,
    features: [
      "1,000 uploads/month",
      "2 modes (Classic + Quick)",
      "50MB max file size",
      "No watermark",
      "R2/S3 storage choice",
      "Basic analytics",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 49,
    features: [
      "Unlimited uploads",
      "All 3 modes including 3D",
      "150MB max file size",
      "Production queue",
      "Batch export",
      "Flow triggers",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 199,
    features: [
      "Everything in Pro",
      "Team RBAC",
      "White-label branding",
      "Public API access",
      "Custom SLA",
      "Dedicated support",
    ],
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
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

  // Get current month usage
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const uploadCount = await prisma.upload.count({
    where: {
      shopId: shop.id,
      createdAt: { gte: startOfMonth },
    },
  });

  return json({
    currentPlan: shop.plan,
    billingStatus: shop.billingStatus,
    usage: {
      uploads: uploadCount,
      limit: shop.plan === "free" ? 100 : shop.plan === "starter" ? 1000 : null,
    },
    plans: PLANS,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, billing } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const formData = await request.formData();
  const planId = formData.get("planId") as string;

  const planDetails = PLANS.find((p) => p.id === planId);
  if (!planDetails || planDetails.price === 0) {
    return json({ error: "Invalid plan" }, { status: 400 });
  }

  // Request billing subscription from Shopify
  try {
    await billing.require({
      plans: [planId.toUpperCase()],
      isTest: true, // Set to false in production
      onFailure: async () => {
        // Redirect to billing confirmation page
        return billing.request({
          plan: planId.toUpperCase(),
          isTest: true, // Set to false in production
        });
      },
    });

    // If we get here, billing is already active
    // Update shop plan in database
    await prisma.shop.update({
      where: { shopDomain },
      data: { plan: planId, billingStatus: "active" },
    });

    return json({ success: true, message: `Upgraded to ${planDetails.name}` });
  } catch (error) {
    console.error("[Billing] Error:", error);
    return json({ error: "Billing request failed" }, { status: 500 });
  }
}

export default function BillingPage() {
  const { currentPlan, billingStatus, usage, plans } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const currentPlanDetails = plans.find((p) => p.id === currentPlan);

  return (
    <Page title="Billing & Plans" backAction={{ content: "Dashboard", url: "/app" }}>
      <Layout>
        {billingStatus !== "active" && (
          <Layout.Section>
            <Banner tone="warning" title="Billing Issue">
              Your billing status is {billingStatus}. Please update your payment method.
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Current Plan</Text>
              <InlineStack align="space-between">
                <BlockStack gap="200">
                  <InlineStack gap="200" align="center">
                    <Text as="span" variant="headingLg">{currentPlanDetails?.name}</Text>
                    <Badge tone="success">Active</Badge>
                  </InlineStack>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    ${currentPlanDetails?.price}/month
                  </Text>
                </BlockStack>
                {usage.limit && (
                  <Box>
                    <Text as="p" variant="bodySm">
                      {usage.uploads} / {usage.limit} uploads this month
                    </Text>
                    <div style={{
                      width: 200,
                      height: 8,
                      backgroundColor: "#e4e5e7",
                      borderRadius: 4,
                      marginTop: 8,
                    }}>
                      <div style={{
                        width: `${Math.min((usage.uploads / usage.limit) * 100, 100)}%`,
                        height: "100%",
                        backgroundColor: usage.uploads / usage.limit > 0.9 ? "#d72c0d" : "#008060",
                        borderRadius: 4,
                      }} />
                    </div>
                  </Box>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Text as="h2" variant="headingMd">Available Plans</Text>
        </Layout.Section>

        <Layout.Section>
          <InlineStack gap="400" wrap>
            {plans.map((plan) => (
              <Card key={plan.id}>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingMd">{plan.name}</Text>
                    {plan.id === currentPlan && <Badge>Current</Badge>}
                  </InlineStack>
                  <Text as="p" variant="headingLg">
                    ${plan.price}
                    <Text as="span" variant="bodySm" tone="subdued">/month</Text>
                  </Text>
                  <BlockStack gap="100">
                    {plan.features.map((feature, i) => (
                      <Text key={i} as="p" variant="bodySm">✓ {feature}</Text>
                    ))}
                  </BlockStack>
                  {plan.id !== currentPlan && plan.price > 0 && (
                    <Form method="post">
                      <input type="hidden" name="planId" value={plan.id} />
                      <Button
                        variant={plan.price > (currentPlanDetails?.price || 0) ? "primary" : undefined}
                        submit
                        loading={isSubmitting}
                      >
                        {plan.price > (currentPlanDetails?.price || 0) ? "Upgrade" : "Downgrade"}
                      </Button>
                    </Form>
                  )}
                </BlockStack>
              </Card>
            ))}
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Banner tone="info">
            Plan changes will take effect on your next billing cycle.
            Contact support for Enterprise plan inquiries.
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

