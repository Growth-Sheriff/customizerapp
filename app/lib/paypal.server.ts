/**
 * PayPal REST API v2 Integration
 *
 * Handles:
 * - OAuth token generation
 * - Order creation (for merchant commission payments)
 * - Order capture (after merchant approves)
 * - Webhook signature verification
 *
 * Mode: LIVE (production)
 * Docs: https://developer.paypal.com/docs/api/orders/v2/
 */

// ===== CONFIG =====
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_MODE = (process.env.PAYPAL_MODE || 'live') as 'sandbox' | 'live';

const PAYPAL_BASE_URL =
  PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

// ===== TYPES =====
export interface PayPalAccessToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface PayPalOrderResponse {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
}

export interface PayPalCaptureResponse {
  id: string;
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
  purchase_units: Array<{
    reference_id: string;
    payments: {
      captures: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
  payer: {
    email_address: string;
    payer_id: string;
    name: {
      given_name: string;
      surname: string;
    };
  };
}

export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource_type: string;
  resource: {
    id: string;
    status: string;
    purchase_units?: Array<{
      reference_id: string;
      payments?: {
        captures?: Array<{
          id: string;
          status: string;
          amount: {
            currency_code: string;
            value: string;
          };
        }>;
      };
    }>;
    payer?: {
      email_address: string;
      payer_id: string;
    };
    amount?: {
      currency_code: string;
      value: string;
    };
  };
  create_time: string;
  event_version: string;
}

// ===== TOKEN CACHE =====
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Get PayPal OAuth2 access token (cached)
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && tokenExpiresAt > now + 60_000) {
    return cachedToken;
  }

  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET env vars.');
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[PayPal] Token error:', response.status, errorText);
    throw new Error(`PayPal token request failed: ${response.status}`);
  }

  const data: PayPalAccessToken = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;

  console.log('[PayPal] Access token obtained, expires in', data.expires_in, 'seconds');
  return cachedToken;
}

/**
 * Create a PayPal order for commission payment
 *
 * @param amount - USD amount (e.g. "5.00")
 * @param shopDomain - Merchant shop domain (reference)
 * @param description - Payment description
 * @param orderIds - Comma-separated order IDs being paid
 * @returns PayPal order with approval URL
 */
export async function createPayPalOrder(
  amount: string,
  shopDomain: string,
  description: string,
  orderIds: string
): Promise<PayPalOrderResponse> {
  const accessToken = await getAccessToken();

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: shopDomain,
        description: description,
        custom_id: orderIds, // Store order IDs for webhook reference
        amount: {
          currency_code: 'USD',
          value: amount,
        },
      },
    ],
    application_context: {
      brand_name: 'Upload Lift - Customizer App',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: `https://customizerapp.dev/app/billing?paypal=success`,
      cancel_url: `https://customizerapp.dev/app/billing?paypal=cancelled`,
    },
  };

  const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[PayPal] Create order error:', response.status, errorText);
    throw new Error(`PayPal create order failed: ${response.status} - ${errorText}`);
  }

  const order: PayPalOrderResponse = await response.json();
  console.log('[PayPal] Order created:', order.id, 'status:', order.status);
  return order;
}

/**
 * Capture a PayPal order after merchant approval
 *
 * @param paypalOrderId - PayPal order ID from createPayPalOrder
 * @returns Capture response with transaction details
 */
export async function capturePayPalOrder(
  paypalOrderId: string
): Promise<PayPalCaptureResponse> {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `${PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}/capture`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[PayPal] Capture error:', response.status, errorText);
    throw new Error(`PayPal capture failed: ${response.status} - ${errorText}`);
  }

  const capture: PayPalCaptureResponse = await response.json();
  console.log('[PayPal] Order captured:', capture.id, 'status:', capture.status);
  return capture;
}

/**
 * Verify PayPal webhook signature
 *
 * Uses PayPal's webhook signature verification API
 * Docs: https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature
 */
export async function verifyWebhookSignature(
  webhookId: string,
  headers: Record<string, string>,
  body: string
): Promise<boolean> {
  const accessToken = await getAccessToken();

  const verifyPayload = {
    auth_algo: headers['paypal-auth-algo'] || '',
    cert_url: headers['paypal-cert-url'] || '',
    transmission_id: headers['paypal-transmission-id'] || '',
    transmission_sig: headers['paypal-transmission-sig'] || '',
    transmission_time: headers['paypal-transmission-time'] || '',
    webhook_id: webhookId,
    webhook_event: JSON.parse(body),
  };

  const response = await fetch(
    `${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verifyPayload),
    }
  );

  if (!response.ok) {
    console.error('[PayPal] Webhook verify error:', response.status);
    return false;
  }

  const result = await response.json();
  const verified = result.verification_status === 'SUCCESS';

  if (!verified) {
    console.warn('[PayPal] Webhook signature verification FAILED:', result.verification_status);
  }

  return verified;
}

/**
 * Get PayPal order details
 */
export async function getPayPalOrder(
  paypalOrderId: string
): Promise<PayPalCaptureResponse> {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `${PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal get order failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Check if PayPal is configured
 */
export function isPayPalConfigured(): boolean {
  return Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);
}

/**
 * Get PayPal mode (sandbox/live)
 */
export function getPayPalMode(): 'sandbox' | 'live' {
  return PAYPAL_MODE;
}
