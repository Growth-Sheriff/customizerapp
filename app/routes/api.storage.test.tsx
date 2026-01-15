import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { saveLocalFile, readLocalFile, deleteLocalFile } from "~/lib/storage.server";

// POST /api/storage/test
// Test local storage connection - always succeeds for local
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    // Test local storage write/read/delete
    const testKey = `_test/${shopDomain}/connection-test-${Date.now()}.txt`;
    const testContent = `Connection test at ${new Date().toISOString()}`;

    // Test write
    await saveLocalFile(testKey, Buffer.from(testContent));

    // Test read
    const readContent = await readLocalFile(testKey);
    
    if (readContent.toString() !== testContent) {
      throw new Error("Content mismatch");
    }

    // Clean up
    await deleteLocalFile(testKey);

    return json({
      success: true,
      provider: "local",
      message: "Local storage is working correctly.",
    });
  } catch (error) {
    console.error("[Storage Test] Error:", error);
    return json({
      success: false,
      provider: "local",
      error: error instanceof Error ? error.message : "Unknown error",
      message: "Local storage test failed. Check server permissions.",
    }, { status: 400 });
  }
}

