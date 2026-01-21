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

// Fixed commission per order: $0.015 (1.5 cents)
const COMMISSION_PER_ORDER = 0.10;
const PAYPAL_EMAIL = "payments@customizerapp.dev"; // PayPal hesabı

interface CommissionSummary {
  totalCommission: number;
  pendingAmount: number;
  paidAmount: number;
  totalOrders: number;
  pendingOrders: number;
  paidOrders: number;
}

interface OrderRecord {
  orderId: string;
  orderNumber: string | null;
  commissionAmount: number;
  status: string; // pending or paid
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
        plan: "commission",
        billingStatus: "active",
        storageProvider: "bunny",
        settings: {},
      },
    });
  }

  // Get ALL unique orders from OrderLink table (this is the source of truth)
  // Each unique orderId = 1 commission of $0.015
  const orderLinks = await prisma.orderLink.findMany({
    where: { shopId: shop.id },
    select: {
      orderId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Get unique order IDs (one commission per order, not per upload)
  const uniqueOrderIds = [...new Set(orderLinks.map(ol => ol.orderId))];
  
  // Create a map of orderId -> earliest createdAt
  const orderDateMap = new Map<string, Date>();
  for (const ol of orderLinks) {
    if (!orderDateMap.has(ol.orderId) || ol.createdAt < orderDateMap.get(ol.orderId)!) {
      orderDateMap.set(ol.orderId, ol.createdAt);
    }
  }

  // Get paid commissions from Commission table
  const paidCommissions = await prisma.commission.findMany({
    where: { 
      shopId: shop.id,
      status: "paid",
    },
    select: {
      orderId: true,
      paidAt: true,
      paymentRef: true,
    },
  });
  
  const paidOrderIds = new Set(paidCommissions.map(c => c.orderId));
  const paidOrderInfo = new Map(paidCommissions.map(c => [c.orderId, { paidAt: c.paidAt, paymentRef: c.paymentRef }]));

  // Build records list
  const records: OrderRecord[] = uniqueOrderIds.map(orderId => {
    const isPaid = paidOrderIds.has(orderId);
    const paidInfo = paidOrderInfo.get(orderId);
    const createdAt = orderDateMap.get(orderId) || new Date();
    
    return {
      orderId,
      orderNumber: `#${orderId.slice(-6)}`, // Last 6 chars as order number display
      commissionAmount: COMMISSION_PER_ORDER,
      status: isPaid ? "paid" : "pending",
      createdAt: createdAt.toISOString(),
      paidAt: paidInfo?.paidAt?.toISOString() || null,
      paymentRef: paidInfo?.paymentRef || null,
    };
  });

  // Calculate summary
  const totalOrders = uniqueOrderIds.length;
  const paidOrders = paidOrderIds.size;
  const pendingOrders = totalOrders - paidOrders;
  
  const summary: CommissionSummary = {
    totalCommission: totalOrders * COMMISSION_PER_ORDER,
    pendingAmount: pendingOrders * COMMISSION_PER_ORDER,
    paidAmount: paidOrders * COMMISSION_PER_ORDER,
    totalOrders,
    pendingOrders,
    paidOrders,
  };

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

  // Mark orders as paid - creates/updates commission records
  if (actionType === "mark_paid") {
    const paymentRef = formData.get("paymentRef") as string;
    const orderIds = formData.get("orderIds") as string;
    
    if (!paymentRef || !orderIds) {
      return json({ error: "Payment reference and order IDs required" }, { status: 400 });
    }

    const ids = orderIds.split(",").filter(Boolean);
    
    // Create or update commission records for each order
    for (const orderId of ids) {
      await prisma.commission.upsert({
        where: {
          commission_shop_order: {
            shopId: shop.id,
            orderId: orderId,
          },
        },
        create: {
          shopId: shop.id,
          orderId: orderId,
          orderNumber: `#${orderId.slice(-6)}`,
          orderTotal: 0, // Not tracking order total anymore
          orderCurrency: "USD",
          commissionRate: 0,
          commissionAmount: COMMISSION_PER_ORDER,
          status: "paid",
          paidAt: new Date(),
          paymentRef: paymentRef,
        },
        update: {
          status: "paid",
          paidAt: new Date(),
          paymentRef: paymentRef,
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        shopId: shop.id,
        action: "commissions_marked_paid",
        resourceType: "commission",
        resourceId: paymentRef,
        metadata: {
          orderIds: ids,
          paymentRef,
          count: ids.length,
          totalAmount: ids.length * COMMISSION_PER_ORDER,
        },
      },
    });

    return json({ success: true, message: `${ids.length} orders marked as paid` });
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

  // Get pending order IDs for payment
  const pendingOrderIds = records
    .filter(r => r.status === "pending")
    .map(r => r.orderId)
    .join(",");

  // DataTable rows - simplified without order total
  const tableRows = records.map(r => [
    r.orderNumber,
    `$${r.commissionAmount.toFixed(3)}`,
    <Badge key={r.orderId} tone={r.status === "paid" ? "success" : "warning"}>
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
                  columnContentTypes={["text", "text", "text", "text", "text"]}
                  headings={["Order", "Commission", "Status", "Order Date", "Paid Date"]}
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
                Enter your PayPal transaction ID to confirm payment of <strong>${summary.pendingAmount.toFixed(2)}</strong> for {summary.pendingOrders} orders.
              </Text>
              
              <input type="hidden" name="_action" value="mark_paid" />
              <input type="hidden" name="orderIds" value={pendingOrderIds} />
              
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
