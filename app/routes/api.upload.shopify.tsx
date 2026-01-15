/**
 * Shopify Files API Upload Handler - DEPRECATED
 * This endpoint is no longer used - all uploads go to local storage.
 * Kept for backward compatibility to return proper error message.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { handleCorsOptions, corsJson } from "~/lib/cors.server";

// GET - Return deprecation notice
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }
  
  return corsJson({
    deprecated: true,
    message: "Shopify Files upload is deprecated. Use local storage via /api/upload/local",
  }, request, { status: 410 }); // 410 Gone
}

// POST - Return deprecation notice
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }
  
  return corsJson({
    error: "Shopify Files upload is deprecated",
    message: "Please use local storage. Get upload URL from /api/upload/intent",
  }, request, { status: 410 }); // 410 Gone
}

