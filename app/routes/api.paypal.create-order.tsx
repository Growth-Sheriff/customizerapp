/**
 * PayPal Create Order API
 *
 * Called from billing page when merchant clicks "Pay with PayPal"
 * Creates a PayPal order and returns the approval URL
 */
import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { createPayPalOrder, isPayPalConfigured } from '~/lib/paypal.server';
import prisma from '~/lib/prisma.server';
import { authenticate } from '~/shopify.server';

const COMMISSION_PER_ORDER = 0.1;

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  if (!isPayPalConfigured()) {
    return json({ error: 'PayPal is not configured' }, { status: 500 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ error: 'Shop not found' }, { status: 404 });
  }

  // Get all pending (unpaid) order IDs for this shop
  const orderLinks = await prisma.orderLink.findMany({
    where: { shopId: shop.id },
    select: { orderId: true },
  });

  const allOrderIds = [...new Set(orderLinks.map((ol) => ol.orderId))];

  // Get already paid order IDs
  const paidCommissions = await prisma.commission.findMany({
    where: {
      shopId: shop.id,
      status: 'paid',
    },
    select: { orderId: true },
  });

  const paidOrderIds = new Set(paidCommissions.map((c) => c.orderId));
  const pendingOrderIds = allOrderIds.filter((id) => !paidOrderIds.has(id));

  if (pendingOrderIds.length === 0) {
    return json({ error: 'No pending commissions to pay' }, { status: 400 });
  }

  const totalAmount = (pendingOrderIds.length * COMMISSION_PER_ORDER).toFixed(2);
  const description = `Upload Lift commission: ${pendingOrderIds.length} orders @ $${COMMISSION_PER_ORDER}/order`;

  try {
    // First, save order IDs to audit log and get the reference ID
    const auditEntry = await prisma.auditLog.create({
      data: {
        shopId: shop.id,
        action: 'paypal_order_pending',
        resourceType: 'paypal_order',
        resourceId: 'pending',
        metadata: {
          orderIds: pendingOrderIds,
          amount: totalAmount,
          orderCount: pendingOrderIds.length,
        },
      },
    });

    // Use audit log ID as custom_id (short, unique reference)
    const order = await createPayPalOrder(
      totalAmount,
      shopDomain,
      description,
      auditEntry.id // Short cuid instead of massive order list
    );

    // Find the approval URL
    const approvalLink = order.links.find((link) => link.rel === 'approve');

    if (!approvalLink) {
      console.error('[PayPal] No approval link in response:', order);
      return json({ error: 'PayPal did not return an approval URL' }, { status: 500 });
    }

    // Store the PayPal order ID with pending order IDs for later capture
    // Update the audit log entry with the PayPal order ID
    await prisma.auditLog.update({
      where: { id: auditEntry.id },
      data: {
        action: 'paypal_order_created',
        resourceId: order.id,
        metadata: {
          paypalOrderId: order.id,
          auditRefId: auditEntry.id,
          orderIds: pendingOrderIds,
          amount: totalAmount,
          orderCount: pendingOrderIds.length,
          status: order.status,
        },
      },
    });

    console.log(
      `[PayPal] Order ${order.id} created for ${shopDomain}: $${totalAmount} (${pendingOrderIds.length} orders)`
    );

    return json({
      success: true,
      paypalOrderId: order.id,
      approvalUrl: approvalLink.href,
      amount: totalAmount,
      orderCount: pendingOrderIds.length,
    });
  } catch (error) {
    console.error('[PayPal] Create order error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'PayPal order creation failed' },
      { status: 500 }
    );
  }
}
