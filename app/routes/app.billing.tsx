import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Form, useLoaderData, useNavigation } from '@remix-run/react'
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  DataTable,
  Divider,
  EmptyState,
  InlineStack,
  Layout,
  Modal,
  Page,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris'
import { useCallback, useEffect, useState } from 'react'
import prisma from '~/lib/prisma.server'
import { isPayPalConfigured } from '~/lib/paypal.server'
import { authenticate } from '~/shopify.server'

// Fixed commission per order: $0.10
const COMMISSION_PER_ORDER = 0.1
const PAYPAL_EMAIL = process.env.PAYPAL_EMAIL || 'billing@techifyboost.com'

interface CommissionSummary {
  totalCommission: number
  pendingAmount: number
  paidAmount: number
  totalOrders: number
  pendingOrders: number
  paidOrders: number
}

interface OrderRecord {
  orderId: string
  orderNumber: string | null
  commissionAmount: number
  status: string // pending or paid
  createdAt: string
  paidAt: string | null
  paymentRef: string | null
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shopDomain = session.shop

  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  })

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        shopDomain,
        accessToken: session.accessToken || '',
        plan: 'commission',
        billingStatus: 'active',
        storageProvider: 'bunny',
        settings: {},
      },
    })
  }

  // Get ALL unique orders from OrderLink table (this is the source of truth)
  // Each unique orderId = 1 commission of $0.10
  const orderLinks = await prisma.orderLink.findMany({
    where: { shopId: shop.id },
    select: {
      orderId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get unique order IDs (one commission per order, not per upload)
  const uniqueOrderIds = [...new Set(orderLinks.map((ol) => ol.orderId))]

  // Create a map of orderId -> earliest createdAt
  const orderDateMap = new Map<string, Date>()
  for (const ol of orderLinks) {
    if (!orderDateMap.has(ol.orderId) || ol.createdAt < orderDateMap.get(ol.orderId)!) {
      orderDateMap.set(ol.orderId, ol.createdAt)
    }
  }

  // Get ALL commissions from Commission table (includes orderNumber)
  const allCommissions = await prisma.commission.findMany({
    where: { shopId: shop.id },
    select: {
      orderId: true,
      orderNumber: true,
      status: true,
      paidAt: true,
      paymentRef: true,
    },
  })

  // Create maps for commission info
  const commissionInfo = new Map(
    allCommissions.map((c) => [
      c.orderId,
      {
        orderNumber: c.orderNumber,
        status: c.status,
        paidAt: c.paidAt,
        paymentRef: c.paymentRef,
      },
    ])
  )

  const paidOrderIds = new Set(
    allCommissions.filter((c) => c.status === 'paid').map((c) => c.orderId)
  )

  // Calculate total transfer size from uploads
  const uploadStats = await prisma.uploadItem.aggregate({
    where: {
      upload: {
        shopId: shop.id,
      },
    },
    _sum: {
      fileSize: true,
    },
    _count: true,
  })

  const totalTransferBytes = uploadStats._sum.fileSize || 0
  const totalTransferGB = Number(totalTransferBytes) / (1024 * 1024 * 1024) // Convert to GB

  // Build records list
  const records: OrderRecord[] = uniqueOrderIds.map((orderId) => {
    const commission = commissionInfo.get(orderId)
    const isPaid = paidOrderIds.has(orderId)
    const createdAt = orderDateMap.get(orderId) || new Date()

    return {
      orderId,
      orderNumber: commission?.orderNumber || `#${orderId.slice(-6)}`, // Use real orderNumber from Commission
      commissionAmount: COMMISSION_PER_ORDER,
      status: isPaid ? 'paid' : 'pending',
      createdAt: createdAt.toISOString(),
      paidAt: commission?.paidAt?.toISOString() || null,
      paymentRef: commission?.paymentRef || null,
    }
  })

  // Calculate summary
  const totalOrders = uniqueOrderIds.length
  const paidOrders = paidOrderIds.size
  const pendingOrders = totalOrders - paidOrders

  const summary: CommissionSummary = {
    totalCommission: totalOrders * COMMISSION_PER_ORDER,
    pendingAmount: pendingOrders * COMMISSION_PER_ORDER,
    paidAmount: paidOrders * COMMISSION_PER_ORDER,
    totalOrders,
    pendingOrders,
    paidOrders,
  }

  return json({
    shopDomain,
    summary,
    records,
    totalTransferGB,
    totalFiles: uploadStats._count,
    commissionPerOrder: COMMISSION_PER_ORDER,
    paypalEmail: PAYPAL_EMAIL,
    paypalEnabled: isPayPalConfigured(),
    paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
    autoChargeEnabled: shop.paypalAutoCharge,
    paypalVaulted: Boolean(shop.paypalVaultId),
    paypalPayerEmail: shop.paypalPayerEmail || null,
    autoChargeThreshold: 49.99,
  })
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shopDomain = session.shop

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  })

  if (!shop) {
    return json({ error: 'Shop not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const actionType = formData.get('_action') as string

  // Toggle auto-charge on/off
  if (actionType === 'toggle_auto_charge') {
    const enabled = formData.get('enabled') === 'true'

    // Can only enable if vault exists
    if (enabled && !shop.paypalVaultId) {
      return json(
        { error: 'No saved payment method. Complete a PayPal payment first.' },
        { status: 400 }
      )
    }

    await prisma.shop.update({
      where: { id: shop.id },
      data: { paypalAutoCharge: enabled },
    })

    await prisma.auditLog.create({
      data: {
        shopId: shop.id,
        action: enabled ? 'auto_charge_enabled' : 'auto_charge_disabled',
        resourceType: 'billing',
        resourceId: shop.id,
        metadata: { enabled },
      },
    })

    return json({ success: true, message: `Auto-charge ${enabled ? 'enabled' : 'disabled'}` })
  }

  // Mark orders as paid - creates/updates commission records
  if (actionType === 'mark_paid') {
    const paymentRef = formData.get('paymentRef') as string
    const orderIds = formData.get('orderIds') as string

    if (!paymentRef || !orderIds) {
      return json({ error: 'Payment reference and order IDs required' }, { status: 400 })
    }

    const ids = orderIds.split(',').filter(Boolean)

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
          orderCurrency: 'USD',
          commissionRate: 0,
          commissionAmount: COMMISSION_PER_ORDER,
          status: 'paid',
          paidAt: new Date(),
          paymentRef: paymentRef,
        },
        update: {
          status: 'paid',
          paidAt: new Date(),
          paymentRef: paymentRef,
        },
      })
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        shopId: shop.id,
        action: 'commissions_marked_paid',
        resourceType: 'commission',
        resourceId: paymentRef,
        metadata: {
          orderIds: ids,
          paymentRef,
          count: ids.length,
          totalAmount: ids.length * COMMISSION_PER_ORDER,
        },
      },
    })

    return json({ success: true, message: `${ids.length} orders marked as paid` })
  }

  return json({ error: 'Unknown action' }, { status: 400 })
}

export default function BillingPage() {
  const {
    shopDomain,
    summary,
    records,
    totalTransferGB,
    totalFiles,
    commissionPerOrder,
    paypalEmail,
    paypalEnabled,
    autoChargeEnabled,
    paypalVaulted,
    paypalPayerEmail,
    autoChargeThreshold,
  } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  // Payment modal state (manual flow)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentRef, setPaymentRef] = useState('')

  // PayPal state
  const [paypalLoading, setPaypalLoading] = useState(false)
  const [paypalError, setPaypalError] = useState<string | null>(null)
  const [paypalSuccess, setPaypalSuccess] = useState(false)
  const [paypalCaptureId, setPaypalCaptureId] = useState<string | null>(null)

  const handlePaymentModalOpen = useCallback(() => setPaymentModalOpen(true), [])
  const handlePaymentModalClose = useCallback(() => {
    setPaymentModalOpen(false)
    setPaymentRef('')
  }, [])

  // Check URL params for PayPal return
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const paypalStatus = urlParams.get('paypal')
    if (paypalStatus === 'cancelled') {
      setPaypalError('Payment was cancelled. You can try again.')
    }
  }, [])

  // PayPal checkout flow
  const handlePayWithPayPal = useCallback(async () => {
    setPaypalLoading(true)
    setPaypalError(null)

    try {
      // Step 1: Create PayPal order via our API
      const createResponse = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const createData = await createResponse.json()

      if (!createResponse.ok || !createData.success) {
        throw new Error(createData.error || 'Failed to create PayPal order')
      }

      // Step 2: Redirect to PayPal for approval
      // PayPal will redirect back to /app/billing?paypal=success
      window.open(createData.approvalUrl, '_blank')

      // Show instructions
      setPaypalError(null)
      setPaypalLoading(false)

      // Poll for completion (the user completes payment in PayPal tab)
      // Wait for user to click "I Completed Payment on PayPal"
      setPaypalCaptureId(createData.paypalOrderId)
    } catch (error) {
      console.error('PayPal error:', error)
      setPaypalError(error instanceof Error ? error.message : 'PayPal payment failed')
      setPaypalLoading(false)
    }
  }, [])

  // Capture PayPal payment after user confirms
  const handleCapturePayPal = useCallback(async () => {
    if (!paypalCaptureId) return

    setPaypalLoading(true)
    setPaypalError(null)

    try {
      const captureResponse = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paypalOrderId: paypalCaptureId }),
      })

      const captureData = await captureResponse.json()

      if (!captureResponse.ok || !captureData.success) {
        throw new Error(captureData.error || 'Failed to capture payment')
      }

      setPaypalSuccess(true)
      setPaypalCaptureId(null)

      // Reload page to reflect paid status
      setTimeout(() => {
        window.location.href = '/app/billing'
      }, 2000)
    } catch (error) {
      console.error('PayPal capture error:', error)
      setPaypalError(error instanceof Error ? error.message : 'Payment capture failed')
      setPaypalLoading(false)
    }
  }, [paypalCaptureId])

  // Format date for display
  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Get pending order IDs for payment
  const pendingOrderIds = records
    .filter((r) => r.status === 'pending')
    .map((r) => r.orderId)
    .join(',')

  // DataTable rows - simplified without order total
  const tableRows = records.map((r) => [
    r.orderNumber,
    `$${r.commissionAmount.toFixed(3)}`,
    <Badge key={r.orderId} tone={r.status === 'paid' ? 'success' : 'warning'}>
      {r.status === 'paid' ? 'Paid' : 'Pending'}
    </Badge>,
    formatDate(r.createdAt),
    r.paidAt ? formatDate(r.paidAt) : '-',
  ])

  return (
    <Page title="Billing & Commissions" backAction={{ content: 'Dashboard', url: '/app' }}>
      <Layout>
        {/* Commission Info */}
        <Layout.Section>
          <Banner tone="info">
            <p>
              <strong>Commission:</strong> ${commissionPerOrder.toFixed(3)} per order with Upload
              Lift items (fixed fee). Payments are collected manually via PayPal.
            </p>
          </Banner>
        </Layout.Section>

        {/* Summary Cards */}
        <Layout.Section>
          <InlineStack gap="400" align="start" wrap={false}>
            {/* Total Commission */}
            <Box width="25%">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total Commission
                  </Text>
                  <Text as="p" variant="headingXl">
                    ${summary.totalCommission.toFixed(2)}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {summary.totalOrders} orders
                  </Text>
                </BlockStack>
              </Card>
            </Box>

            {/* Pending Payment */}
            <Box width="25%">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Pending Payment
                  </Text>
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
            <Box width="25%">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Paid
                  </Text>
                  <Text as="p" variant="headingXl" tone="success">
                    ${summary.paidAmount.toFixed(2)}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {summary.paidOrders} orders
                  </Text>
                </BlockStack>
              </Card>
            </Box>

            {/* Total Transfer */}
            <Box width="25%">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total Transfer
                  </Text>
                  <Text as="p" variant="headingXl">
                    {totalTransferGB >= 1
                      ? `${totalTransferGB.toFixed(2)} GB`
                      : `${(totalTransferGB * 1024).toFixed(0)} MB`}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {totalFiles} files uploaded
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
                {/* PayPal Success Banner */}
                {paypalSuccess && (
                  <Banner tone="success" onDismiss={() => setPaypalSuccess(false)}>
                    <p>
                      Payment successful! Your commissions have been marked as paid. Page will
                      refresh shortly.
                    </p>
                  </Banner>
                )}

                {/* PayPal Error Banner */}
                {paypalError && (
                  <Banner tone="critical" onDismiss={() => setPaypalError(null)}>
                    <p>{paypalError}</p>
                  </Banner>
                )}

                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      Payment Due
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Please send <strong>${summary.pendingAmount.toFixed(2)}</strong> for{' '}
                      {summary.pendingOrders} orders
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200">
                    {/* PayPal Checkout Button */}
                    {paypalEnabled && !paypalCaptureId && (
                      <Button
                        variant="primary"
                        onClick={handlePayWithPayPal}
                        loading={paypalLoading}
                        disabled={paypalLoading}
                      >
                        💳 Pay with PayPal
                      </Button>
                    )}
                    {/* Capture Button - shown after PayPal approval */}
                    {paypalCaptureId && (
                      <Button
                        variant="primary"
                        tone="success"
                        onClick={handleCapturePayPal}
                        loading={paypalLoading}
                        disabled={paypalLoading}
                      >
                        ✅ I Completed Payment on PayPal
                      </Button>
                    )}
                    {/* Manual Payment Button (always available as fallback) */}
                    <Button onClick={handlePaymentModalOpen}>
                      I've Made Payment Manually
                    </Button>
                  </InlineStack>
                </InlineStack>

                <Divider />

                {/* PayPal Instructions */}
                {paypalEnabled && !paypalCaptureId && (
                  <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        🔒 Secure PayPal Checkout
                      </Text>
                      <Text as="p" variant="bodySm">
                        Click "Pay with PayPal" to pay securely. You'll be redirected to PayPal
                        to complete the payment. After completing, click "I Completed Payment" to
                        confirm.
                      </Text>
                    </BlockStack>
                  </Box>
                )}

                {/* PayPal Capture Instructions */}
                {paypalCaptureId && (
                  <Banner tone="warning">
                    <p>
                      A PayPal payment window has opened. Complete the payment there, then click
                      "I Completed Payment on PayPal" above.
                    </p>
                  </Banner>
                )}

                {/* Manual Payment Instructions */}
                <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Manual Payment Option
                    </Text>
                    <InlineStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        PayPal Email:
                      </Text>
                      <Text as="p" variant="bodyMd">
                        {paypalEmail}
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Amount:
                      </Text>
                      <Text as="p" variant="bodyMd">
                        ${summary.pendingAmount.toFixed(2)} USD
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Reference:
                      </Text>
                      <Text as="p" variant="bodyMd">
                        {shopDomain}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Box>

                <Text as="p" variant="bodySm" tone="subdued">
                  You can pay via PayPal checkout button or send payment manually to the email
                  above.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Auto-Charge Settings */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      ⚡ Automatic Payments
                    </Text>
                    {autoChargeEnabled ? (
                      <Badge tone="success">Active</Badge>
                    ) : paypalVaulted ? (
                      <Badge tone="attention">Paused</Badge>
                    ) : (
                      <Badge>Not Set Up</Badge>
                    )}
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    When enabled, we'll automatically charge your PayPal when pending commissions
                    reach ${autoChargeThreshold.toFixed(2)}.
                  </Text>
                </BlockStack>

                {paypalVaulted && (
                  <Form method="post">
                    <input type="hidden" name="_action" value="toggle_auto_charge" />
                    <input
                      type="hidden"
                      name="enabled"
                      value={autoChargeEnabled ? 'false' : 'true'}
                    />
                    <Button
                      submit
                      variant={autoChargeEnabled ? 'plain' : 'primary'}
                      tone={autoChargeEnabled ? 'critical' : undefined}
                    >
                      {autoChargeEnabled ? 'Disable Auto-Pay' : 'Enable Auto-Pay'}
                    </Button>
                  </Form>
                )}
              </InlineStack>

              {paypalVaulted && paypalPayerEmail && (
                <>
                  <Divider />
                  <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                    <InlineStack gap="400">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Payment Method
                        </Text>
                        <Text as="p" variant="bodyMd">
                          PayPal ({paypalPayerEmail})
                        </Text>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Threshold
                        </Text>
                        <Text as="p" variant="bodyMd">
                          ${autoChargeThreshold.toFixed(2)}
                        </Text>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Status
                        </Text>
                        <Text as="p" variant="bodyMd">
                          {autoChargeEnabled ? '✅ Auto-charging' : '⏸️ Paused'}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </Box>
                </>
              )}

              {!paypalVaulted && (
                <Banner tone="info">
                  <p>
                    Complete your first PayPal payment above to enable automatic payments. Your
                    payment method will be securely saved for future charges.
                  </p>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Commission History */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Commission History
              </Text>

              {records.length === 0 ? (
                <EmptyState
                  heading="No commissions yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    When orders with Upload Lift items are placed, commissions will appear here.
                  </p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Order', 'Commission', 'Status', 'Order Date', 'Paid Date']}
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
              <Text as="h3" variant="headingMd">
                How Commission Billing Works
              </Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  1. <strong>Order Placed</strong> - Customer places order with Upload Lift items
                </Text>
                <Text as="p" variant="bodyMd">
                  2. <strong>Commission Recorded</strong> - Fixed fee of $
                  {commissionPerOrder.toFixed(3)} per order
                </Text>
                <Text as="p" variant="bodyMd">
                  3. <strong>Pay with PayPal</strong> - Click the PayPal button to pay all pending
                  commissions securely
                </Text>
                <Text as="p" variant="bodyMd">
                  4. <strong>Automatic Payments</strong> - After your first payment, auto-pay kicks
                  in when commissions reach $49.99
                </Text>
                <Text as="p" variant="bodyMd">
                  5. <strong>Automatic Confirmation</strong> - Payment is verified and commissions
                  are marked as paid automatically
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Banner tone="info">Questions about billing? Contact support@customizerapp.dev</Banner>
        </Layout.Section>
      </Layout>

      {/* Payment Confirmation Modal */}
      <Modal
        open={paymentModalOpen}
        onClose={handlePaymentModalClose}
        title="Confirm Payment"
        primaryAction={{
          content: isSubmitting ? 'Submitting...' : 'Confirm Payment',
          disabled: !paymentRef || isSubmitting,
          submit: true,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handlePaymentModalClose,
          },
        ]}
      >
        <Form method="post">
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p" variant="bodyMd">
                Enter your PayPal transaction ID to confirm payment of{' '}
                <strong>${summary.pendingAmount.toFixed(2)}</strong> for {summary.pendingOrders}{' '}
                orders.
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
                  <Text as="p" variant="bodySm">
                    Processing...
                  </Text>
                </InlineStack>
              )}
            </BlockStack>
          </Modal.Section>
        </Form>
      </Modal>
    </Page>
  )
}
