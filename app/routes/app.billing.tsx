import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  Button, Banner, Badge, Box, Divider, DataTable, EmptyState,
  Modal, TextField, Spinner
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";
import { Decimal } from "@prisma/client/runtime/library";

// Fixed commission per order: $0.015 (1.5 cents)
const COMMISSION_PER_ORDER = 0.015;
const PAYPAL_EMAIL = "payments@customizerapp.dev"; // PayPal hesabı

interface CommissionSummary {
  totalCommission: number;
  pendingAmount: number;
  paidAmount: number;
  totalOrders: number;
  pendingOrders: number;
  paidOrders: number;
}

interface CommissionRecord {
  id: string;
  orderId: string;
  orderNumber: string | null;
  orderTotal: string;
  orderCurrency: string;
  commissionAmount: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  paymentRef: string | null;
}

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
        plan: "commission", // Commission-based plan
        billingStatus: "active",
        storageProvider: "bunny",
        settings: {},
      },
    });
  }

  // Get commission records for this shop
  const commissions = await prisma.commission.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Calculate summary
  const summary: CommissionSummary = {
    totalCommission: 0,
    pendingAmount: 0,
    paidAmount: 0,
    totalOrders: commissions.length,
    pendingOrders: 0,
    paidOrders: 0,
  };

  for (const c of commissions) {
    const amount = new Decimal(c.commissionAmount).toNumber();
    summary.totalCommission += amount;
    
    if (c.status === "pending") {
      summary.pendingAmount += amount;
      summary.pendingOrders++;
    } else if (c.status === "paid") {
      summary.paidAmount += amount;
      summary.paidOrders++;
    }
  }

  // Format records for display
  const records: CommissionRecord[] = commissions.map(c => ({
    id: c.id,
    orderId: c.orderId,
    orderNumber: c.orderNumber,
    orderTotal: new Decimal(c.orderTotal).toFixed(2),
    orderCurrency: c.orderCurrency,
    commissionAmount: new Decimal(c.commissionAmount).toFixed(2),
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    paidAt: c.paidAt?.toISOString() || null,
    paymentRef: c.paymentRef,
  }));

  return json({
    shopDomain,
    summary,
    records,
    commissionPerOrder: COMMISSION_PER_ORDER,
    paypalEmail: PAYPAL_EMAIL,
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
  const actionType = formData.get("_action") as string;

  // Mark commissions as paid (admin action - for now manual)
  if (actionType === "mark_paid") {
    const paymentRef = formData.get("paymentRef") as string;
    const commissionIds = formData.get("commissionIds") as string;
    
    if (!paymentRef || !commissionIds) {
      return json({ error: "Payment reference and commission IDs required" }, { status: 400 });
    }

    const ids = commissionIds.split(",").filter(Boolean);
    
    await prisma.commission.updateMany({
      where: {
        id: { in: ids },
        shopId: shop.id,
        status: "pending",
      },
      data: {
        status: "paid",
        paidAt: new Date(),
        paymentRef: paymentRef,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        shopId: shop.id,
        action: "commissions_marked_paid",
        resourceType: "commission",
        resourceId: paymentRef,
        metadata: {
          commissionIds: ids,
          paymentRef,
          count: ids.length,
        },
      },
    });

    return json({ success: true, message: `${ids.length} commissions marked as paid` });
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

export default function BillingPage() {
  const { shopDomain, summary, records, commissionPerOrder, paypalEmail } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");

  const handlePaymentModalOpen = useCallback(() => setPaymentModalOpen(true), []);
  const handlePaymentModalClose = useCallback(() => {
    setPaymentModalOpen(false);
    setPaymentRef("");
  }, []);

  // Format date for display
  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Get pending commission IDs for payment
  const pendingIds = records
    .filter(r => r.status === "pending")
    .map(r => r.id)
    .join(",");

  // DataTable rows
  const tableRows = records.map(r => [
    r.orderNumber || `#${r.orderId.slice(-8)}`,
    `${r.orderCurrency} ${r.orderTotal}`,
    `$${r.commissionAmount}`,
    <Badge key={r.id} tone={r.status === "paid" ? "success" : "warning"}>
      {r.status === "paid" ? "Paid" : "Pending"}
    </Badge>,
    formatDate(r.createdAt),
    r.paidAt ? formatDate(r.paidAt) : "-",
  ]);

  return (
    <Page title="Billing & Commissions" backAction={{ content: "Dashboard", url: "/app" }}>
      <Layout>
        {/* Commission Info */}
        <Layout.Section>
          <Banner tone="info">
            <p>
              <strong>Commission:</strong> ${commissionPerOrder.toFixed(3)} per order with Upload Lift items (fixed fee).
              Payments are collected manually via PayPal.
            </p>
          </Banner>
        </Layout.Section>

        {/* Summary Cards */}
        <Layout.Section>
          <InlineStack gap="400" align="start" wrap={false}>
            {/* Total Commission */}
            <Box width="33%">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">Total Commission</Text>
                  <Text as="p" variant="headingXl">${summary.totalCommission.toFixed(2)}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {summary.totalOrders} orders
                  </Text>
                </BlockStack>
              </Card>
            </Box>

            {/* Pending Payment */}
            <Box width="33%">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">Pending Payment</Text>
                  <Text as="p" variant="headingXl" tone="critical">
                    ${summary.pendingAmount.toFixed(2)}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {summary.pendingOrders} orders
                  </Text>
                </BlockStack>
              </Card>
            </Box>

            {/* Paid */}
            <Box width="33%">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">Paid</Text>
                  <Text as="p" variant="headingXl" tone="success">
                    ${summary.paidAmount.toFixed(2)}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {summary.paidOrders} orders
                  </Text>
                </BlockStack>
              </Card>
            </Box>
          </InlineStack>
        </Layout.Section>

        {/* Payment Instructions */}
        {summary.pendingAmount > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Payment Due</Text>
                    <Text as="p" variant="bodyMd">
                      Please send <strong>${summary.pendingAmount.toFixed(2)}</strong> via PayPal
                    </Text>
                  </BlockStack>
                  <Button variant="primary" onClick={handlePaymentModalOpen}>
                    I've Made Payment
                  </Button>
                </InlineStack>

                <Divider />

                <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                  <BlockStack gap="200">
                    <InlineStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">PayPal Email:</Text>
                      <Text as="p" variant="bodyMd">{paypalEmail}</Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Amount:</Text>
                      <Text as="p" variant="bodyMd">${summary.pendingAmount.toFixed(2)} USD</Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Reference:</Text>
                      <Text as="p" variant="bodyMd">{shopDomain}</Text>
                    </InlineStack>
                  </BlockStack>
                </Box>

                <Text as="p" variant="bodySm" tone="subdued">
                  Please include your shop domain ({shopDomain}) in the PayPal payment note.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Commission History */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Commission History</Text>
              
              {records.length === 0 ? (
                <EmptyState
                  heading="No commissions yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>When orders with Upload Lift items are placed, commissions will appear here.</p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={["Order", "Order Total", "Commission", "Status", "Date", "Paid Date"]}
                  rows={tableRows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* How It Works */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">How Commission Billing Works</Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  1. <strong>Order Placed</strong> - Customer places order with Upload Lift items
                </Text>
                <Text as="p" variant="bodyMd">
                  2. <strong>Commission Recorded</strong> - Fixed fee of ${commissionPerOrder.toFixed(3)} per order
                </Text>
                <Text as="p" variant="bodyMd">
                  3. <strong>Monthly Payment</strong> - Send pending commission via PayPal
                </Text>
                <Text as="p" variant="bodyMd">
                  4. <strong>Confirmation</strong> - Click "I've Made Payment" and enter PayPal transaction ID
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Banner tone="info">
            Questions about billing? Contact support@customizerapp.dev
          </Banner>
        </Layout.Section>
      </Layout>

      {/* Payment Confirmation Modal */}
      <Modal
        open={paymentModalOpen}
        onClose={handlePaymentModalClose}
        title="Confirm Payment"
        primaryAction={{
          content: isSubmitting ? "Submitting..." : "Confirm Payment",
          disabled: !paymentRef || isSubmitting,
          submit: true,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: handlePaymentModalClose,
          },
        ]}
      >
        <Form method="post">
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">
                Enter your PayPal transaction ID to confirm payment of <strong>${summary.pendingAmount.toFixed(2)}</strong>.
              </Text>
              
              <input type="hidden" name="_action" value="mark_paid" />
              <input type="hidden" name="commissionIds" value={pendingIds} />
              
              <TextField
                label="PayPal Transaction ID"
                name="paymentRef"
                value={paymentRef}
                onChange={setPaymentRef}
                autoComplete="off"
                placeholder="e.g., 1AB23456CD789012E"
                helpText="Found in your PayPal transaction details"
              />

              {isSubmitting && (
                <InlineStack gap="200" align="center">
                  <Spinner size="small" />
                  <Text as="p" variant="bodySm">Processing...</Text>
                </InlineStack>
              )}
            </BlockStack>
          </Modal.Section>
        </Form>
      </Modal>
    </Page>
  );
}
