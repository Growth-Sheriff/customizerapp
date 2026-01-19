/**
 * Session Tracking API Endpoint
 * Handles session activity updates
 * 
 * @route POST /api/v1/sessions - Update session activity
 * @route POST /api/v1/sessions/cart - Record add to cart
 * 
 * ⚠️ This is a NEW endpoint - does not modify existing flows
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "~/lib/prisma.server";
import { recordAddToCart, linkUploadToVisitor } from "~/lib/visitor.server";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SessionUpdateRequest {
  shopDomain: string;
  sessionId: string;
  action: "page_view" | "add_to_cart" | "link_upload";
  uploadId?: string;
  visitorId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION - POST /api/v1/sessions
// ═══════════════════════════════════════════════════════════════════════════

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  
  let body: SessionUpdateRequest;
  
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  
  const { shopDomain, sessionId, action: sessionAction, uploadId, visitorId } = body;
  
  if (!shopDomain || !sessionId || !sessionAction) {
    return json(
      { error: "Missing required fields (shopDomain, sessionId, action)" },
      { status: 400 }
    );
  }
  
  // Verify shop exists
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  
  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }
  
  // Verify session exists and belongs to shop
  const session = await prisma.visitorSession.findFirst({
    where: {
      id: sessionId,
      shopId: shop.id,
    },
    select: { id: true, visitorId: true },
  });
  
  if (!session) {
    return json({ error: "Session not found" }, { status: 404 });
  }
  
  try {
    switch (sessionAction) {
      case "page_view":
        await prisma.visitorSession.update({
          where: { id: sessionId },
          data: {
            pageViews: { increment: 1 },
            lastActivityAt: new Date(),
          },
        });
        break;
        
      case "add_to_cart":
        await recordAddToCart(sessionId);
        break;
        
      case "link_upload":
        if (!uploadId) {
          return json({ error: "uploadId required for link_upload action" }, { status: 400 });
        }
        
        const effectiveVisitorId = visitorId || session.visitorId;
        await linkUploadToVisitor(uploadId, effectiveVisitorId, sessionId);
        break;
        
      default:
        return json({ error: `Unknown action: ${sessionAction}` }, { status: 400 });
    }
    
    return json({
      success: true,
      action: sessionAction,
    });
  } catch (error) {
    console.error("[Session Update Error]", error);
    return json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}
