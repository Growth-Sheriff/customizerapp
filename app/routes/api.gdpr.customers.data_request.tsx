import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

// GDPR: Customer data request
// POST /api/gdpr/customers/data_request
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    console.log("[GDPR] Customer data request:", body);

    // Shopify requires a 200 response
    // In production, you would:
    // 1. Look up customer data
    // 2. Compile it into a report
    // 3. Send it to the merchant

    return json({
      ok: true,
      message: "Customer data request received",
      records: [],
    });
  } catch (error) {
    console.error("[GDPR] Error processing data request:", error);
    return json({ ok: true }); // Still return 200 to acknowledge
  }
}

