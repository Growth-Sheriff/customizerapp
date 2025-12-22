import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getStorageConfig, createStorageClient } from "~/lib/storage.server";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import prisma from "~/lib/prisma.server";

// POST /api/storage/test
// Test storage connection with merchant's settings
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

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
        plan: "starter",
        billingStatus: "active",
        storageProvider: "r2",
        settings: {},
      },
    });
  }

  // Get storage config - can be from request body (testing new config) or from shop settings
  let testConfig;
  try {
    const body = await request.json();
    testConfig = body.storageConfig;
  } catch {
    testConfig = null;
  }

  const storageConfig = testConfig
    ? getStorageConfig(testConfig)
    : getStorageConfig(shop.storageConfig as any);

  try {
    const client = createStorageClient(storageConfig);
    const testKey = `_test/${shopDomain}/connection-test-${Date.now()}.txt`;
    const testContent = `Connection test at ${new Date().toISOString()}`;

    // Test write
    await client.send(new PutObjectCommand({
      Bucket: storageConfig.bucket,
      Key: testKey,
      Body: testContent,
      ContentType: "text/plain",
    }));

    // Test read
    const getResult = await client.send(new GetObjectCommand({
      Bucket: storageConfig.bucket,
      Key: testKey,
    }));

    const body = await getResult.Body?.transformToString();

    if (body !== testContent) {
      throw new Error("Content mismatch");
    }

    return json({
      success: true,
      provider: storageConfig.provider,
      bucket: storageConfig.bucket,
      message: "Connection successful! Read and write operations verified.",
    });
  } catch (error) {
    console.error("[Storage Test] Error:", error);
    return json({
      success: false,
      provider: storageConfig.provider,
      error: error instanceof Error ? error.message : "Unknown error",
      message: "Connection failed. Please check your credentials and bucket settings.",
    }, { status: 400 });
  }
}

