/**
 * CORS Helper for Storefront API Endpoints
 *
 * Handles Cross-Origin requests from Shopify storefront themes
 * Required for widget functionality (theme extension → app API)
 */

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  // All Shopify stores (*.myshopify.com)
  /\.myshopify\.com$/,
  // Custom storefront domains (any https domain for flexibility)
  /^https:\/\/.+$/,
  // Development
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  // Production app domain
  "https://customizerapp.dev",
  "https://fdt.customizerapp.dev",
  // Customer domains
  "https://fastdtftransfer.com",
  "https://www.fastdtftransfer.com",
];

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;

  for (const allowed of ALLOWED_ORIGINS) {
    if (typeof allowed === "string") {
      if (origin === allowed) return true;
    } else if (allowed instanceof RegExp) {
      if (allowed.test(origin)) return true;
    }
  }

  return false;
}

/**
 * Get CORS headers for a request
 */
export function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const allowedOrigin = isOriginAllowed(origin) ? origin : null;

  return {
    "Access-Control-Allow-Origin": allowedOrigin || "",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
}

/**
 * Handle OPTIONS preflight request
 */
export function handleCorsOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/**
 * Add CORS headers to a Response
 */
export function withCors(response: Response, request: Request): Response {
  const corsHeaders = getCorsHeaders(request);

  // Clone response and add CORS headers
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (value) {
      newHeaders.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Create a JSON response with CORS headers
 */
export function corsJson<T>(
  data: T,
  request: Request,
  init?: ResponseInit
): Response {
  const headers = new Headers(init?.headers);

  // Add CORS headers
  const corsHeaders = getCorsHeaders(request);
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (value) {
      headers.set(key, value);
    }
  }

  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}
