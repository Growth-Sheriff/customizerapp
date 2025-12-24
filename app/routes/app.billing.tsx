import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, Badge, Box, Divider, Icon, ProgressBar
} from "@shopify/polaris";
import { CheckCircleIcon, XCircleIcon } from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";
import { calculateEstimatedBill } from "~/lib/billing.server";

// Plan data for UI
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 9,
    freeOrders: 20,
    extraOrderPrice: 0.05,
    popular: false,
    features: [
      { name: "20 free orders/month", included: true },
      { name: "$0.05 per extra order", included: true },
      { name: "DTF Transfer mode", included: true },
      { name: "Quick Upload mode", included: true },
      { name: "50MB file uploads", included: true },
      { name: "Analytics dashboard", included: true },
      { name: "Export to PDF/PNG", included: true },
      { name: "3D Designer mode", included: false },
      { name: "Team collaboration", included: false },
      { name: "API access", included: false },
      { name: "White-label branding", included: false },
      { name: "Priority support", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 19,
    freeOrders: 30,
    extraOrderPrice: 0.06,
    popular: true,
    features: [
      { name: "30 free orders/month", included: true },
      { name: "$0.06 per extra order", included: true },
      { name: "DTF Transfer mode", included: true },
      { name: "Quick Upload mode", included: true },
      { name: "150MB file uploads", included: true },
      { name: "Analytics dashboard", included: true },
      { name: "Export to PDF/PNG", included: true },
      { name: "3D Designer mode", included: true },
      { name: "Team collaboration", included: true },
      { name: "API access", included: true },
      { name: "White-label branding", included: true },
      { name: "Priority support", included: true },
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
        plan: "starter",
        billingStatus: "active",
        storageProvider: "r2",
        settings: {},
      },
    });
  }

  // Calculate current billing
  const billing = await calculateEstimatedBill(shop.id);

  return json({
    currentPlan: shop.plan as "starter" | "pro",
    billingStatus: shop.billingStatus,
    billing,
    plans: PLANS,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, billing } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // WI-003: Get shop and verify owner role for billing changes
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      teamMembers: {
        where: { email: session.onlineAccessInfo?.associated_user?.email },
      },
    },
  });

  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  // Check if user is owner (owner can be: first user, no team members, or role=owner)
  const teamMember = shop.teamMembers[0];
  const isOwner = !teamMember || teamMember.role === "owner";
  
  if (!isOwner && shop.teamMembers.length > 0) {
    return json({ 
      error: "Only the shop owner can change billing plans" 
    }, { status: 403 });
  }

  const formData = await request.formData();
  const planId = formData.get("planId") as string;

  const planDetails = PLANS.find((p) => p.id === planId);
  if (!planDetails) {
    return json({ error: "Invalid plan" }, { status: 400 });
  }

  const planName = planId.toUpperCase();
  
  // Use test mode only in development
  const isTestMode = process.env.NODE_ENV !== "production";

  try {
    // Check if already subscribed
    const hasSubscription = await billing.check({
      plans: [planName],
      isTest: isTestMode,
    });

    if (hasSubscription) {
      await prisma.shop.update({
        where: { shopDomain },
        data: { plan: planId, billingStatus: "active" },
      });
      
      // Audit log
      await prisma.auditLog.create({
        data: {
          shopId: shop.id,
          action: "billing_plan_confirmed",
          entityType: "billing",
          entityId: planId,
          changes: { plan: planId },
        },
      });
      
      return json({ success: true, message: `Already on ${planDetails.name} plan` });
    }

    // Request subscription
    return await billing.request({
      plan: planName,
      isTest: isTestMode,
      returnUrl: `https://customizerapp.dev/app?shop=${shopDomain}&billing=success`,
    });
  } catch (error: any) {
    if (error instanceof Response) {
      return error;
    }
    console.error("[Billing] Error:", error);
    return json({ error: error?.message || "Billing request failed" }, { status: 500 });
  }
}

export default function BillingPage() {
  const { currentPlan, billingStatus, billing, plans } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const currentPlanDetails = plans.find((p) => p.id === currentPlan);
  const usagePercentage = Math.min((billing.usedOrders / billing.freeOrders) * 100, 100);

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

        {/* Current Usage Card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Current Usage</Text>
                  <InlineStack gap="200" align="center">
                    <Badge tone="success">{currentPlanDetails?.name} Plan</Badge>
                    <Text as="span" variant="bodySm" tone="subdued">
                      ${currentPlanDetails?.price}/month base
                    </Text>
                  </InlineStack>
                </BlockStack>
                <BlockStack gap="100" inlineAlign="end">
                  <Text as="p" variant="headingLg">
                    ${billing.estimatedTotal.toFixed(2)}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Estimated this month
                  </Text>
                </BlockStack>
              </InlineStack>

              <Divider />

              {/* Usage Progress */}
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text as="p" variant="bodyMd">
                    Orders this month
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {billing.usedOrders} / {billing.freeOrders} free
                  </Text>
                </InlineStack>
                <ProgressBar 
                  progress={usagePercentage} 
                  tone={usagePercentage >= 100 ? "critical" : usagePercentage >= 80 ? "warning" : "primary"}
                  size="small"
                />
              </BlockStack>

              {/* Cost Breakdown */}
              {billing.extraOrders > 0 && (
                <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm">Base subscription</Text>
                      <Text as="p" variant="bodySm">${billing.basePrice.toFixed(2)}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm">
                        Extra orders ({billing.extraOrders} × ${billing.extraOrderPrice})
                      </Text>
                      <Text as="p" variant="bodySm">+${billing.extraOrdersCost.toFixed(2)}</Text>
                    </InlineStack>
                    <Divider />
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Total</Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        ${billing.estimatedTotal.toFixed(2)}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Plan Comparison */}
        <Layout.Section>
          <Text as="h2" variant="headingMd">Choose Your Plan</Text>
        </Layout.Section>

        <Layout.Section>
          <InlineStack gap="400" align="start" wrap={false}>
            {plans.map((plan) => (
              <Box key={plan.id} width="50%">
                <Card>
                  <BlockStack gap="400">
                    {/* Header */}
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="100">
                        <InlineStack gap="200">
                          <Text as="h3" variant="headingLg">{plan.name}</Text>
                          {plan.popular && <Badge tone="info">Most Popular</Badge>}
                        </InlineStack>
                        <Text as="p" variant="headingXl">
                          ${plan.price}
                          <Text as="span" variant="bodySm" tone="subdued">/month</Text>
                        </Text>
                      </BlockStack>
                      {plan.id === currentPlan && (
                        <Badge tone="success">Current Plan</Badge>
                      )}
                    </InlineStack>

                    {/* Pricing Details */}
                    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold">
                          {plan.freeOrders} free orders/month
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Then ${plan.extraOrderPrice.toFixed(2)} per additional order
                        </Text>
                      </BlockStack>
                    </Box>

                    <Divider />

                    {/* Features List */}
                    <BlockStack gap="200">
                      {plan.features.map((feature, i) => (
                        <InlineStack key={i} gap="200" align="start">
                          <Box>
                            <Icon
                              source={feature.included ? CheckCircleIcon : XCircleIcon}
                              tone={feature.included ? "success" : "subdued"}
                            />
                          </Box>
                          <Text 
                            as="p" 
                            variant="bodySm"
                            tone={feature.included ? undefined : "subdued"}
                          >
                            {feature.name}
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>

                    {/* Action Button */}
                    {plan.id !== currentPlan && (
                      <Form method="post">
                        <input type="hidden" name="planId" value={plan.id} />
                        <Button
                          variant={plan.price > (currentPlanDetails?.price || 0) ? "primary" : undefined}
                          submit
                          loading={isSubmitting}
                          fullWidth
                        >
                          {plan.price > (currentPlanDetails?.price || 0) ? "Upgrade to Pro" : "Switch to Starter"}
                        </Button>
                      </Form>
                    )}
                    {plan.id === currentPlan && (
                      <Button disabled fullWidth>Current Plan</Button>
                    )}
                  </BlockStack>
                </Card>
              </Box>
            ))}
          </InlineStack>
        </Layout.Section>

        {/* FAQ / Info */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">How Usage-Based Billing Works</Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  1. <strong>Base subscription</strong> - Fixed monthly fee for your plan
                </Text>
                <Text as="p" variant="bodyMd">
                  2. <strong>Free orders included</strong> - Each plan includes free orders per month
                </Text>
                <Text as="p" variant="bodyMd">
                  3. <strong>Pay as you grow</strong> - Only pay for extra orders beyond your free limit
                </Text>
                <Text as="p" variant="bodyMd">
                  4. <strong>Billed at end of cycle</strong> - Usage charges are calculated and billed monthly
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Banner tone="info">
            Plan changes take effect immediately. You can upgrade or downgrade anytime.
            Questions? Contact support@customizerapp.dev
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
