/**
 * Shopify Files API Upload Handler
 * Uses Shopify GraphQL Files API to upload customer designs
 * This is the RECOMMENDED storage method - free and unlimited
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { handleCorsOptions, corsJson } from "~/lib/cors.server";
import { rateLimitGuard, getIdentifier } from "~/lib/rateLimit.server";
import prisma from "~/lib/prisma.server";
import { nanoid } from "nanoid";

// Shopify Files API - Staged Upload Target
// Shopify 2025-10 GraphQL API
const STAGED_UPLOAD_MUTATION = `
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// Create file from staged upload
// Shopify 2025-10 GraphQL API
const FILE_CREATE_MUTATION = `
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        alt
        createdAt
        fileStatus
        ... on MediaImage {
          image {
            url
            originalSrc
            width
            height
          }
          mimeType
        }
        ... on GenericFile {
          url
          originalFileSize
          mimeType
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// OPTIONS handler for CORS preflight
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }
  return corsJson({ error: "Method not allowed" }, request, { status: 405 });
}

// POST /api/upload/shopify
// Step 1: Get staged upload URL from Shopify
export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return handleCorsOptions(request);
  }

  if (request.method !== "POST") {
    return corsJson({ error: "Method not allowed" }, request, { status: 405 });
  }

  // Rate limit
  const identifier = getIdentifier(request, "customer");
  const rateLimitResponse = await rateLimitGuard(identifier, "uploadIntent");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    
    // Check if this is a staged upload request or file creation request
    if (contentType.includes("application/json")) {
      const body = await request.json();
      const { action: uploadAction, shopDomain, fileName, fileSize, mimeType, resourceUrl } = body;

      if (!shopDomain) {
        return corsJson({ error: "Missing shopDomain" }, request, { status: 400 });
      }

      // Get shop with access token
      const shop = await prisma.shop.findUnique({
        where: { shopDomain },
      });

      if (!shop) {
        return corsJson({ error: "Shop not found" }, request, { status: 404 });
      }

      // Action: get_staged_url - Get Shopify staged upload URL
      if (uploadAction === "get_staged_url") {
        if (!fileName || !fileSize || !mimeType) {
          return corsJson({ error: "Missing fileName, fileSize, or mimeType" }, request, { status: 400 });
        }

        // Validate file size (max 20MB for images, 5GB for files)
        const maxSize = mimeType.startsWith("image/") ? 20 * 1024 * 1024 : 5 * 1024 * 1024 * 1024;
        if (fileSize > maxSize) {
          return corsJson({ error: `File too large. Maximum: ${mimeType.startsWith("image/") ? "20MB" : "5GB"}` }, request, { status: 400 });
        }

        // Determine file type for Shopify - StagedUploadTargetGenerateUploadResource enum
        // Valid values: IMAGE, FILE, VIDEO, MODEL_3D, BULK_MUTATION_VARIABLES, etc.
        const isImage = mimeType.startsWith("image/");
        const isVideo = mimeType.startsWith("video/");
        const is3DModel = mimeType.includes("gltf") || mimeType.includes("glb") || mimeType.includes("usdz");
        const httpMethod = "POST";
        
        let fileType = "FILE"; // Default for PDF, etc.
        if (isImage) fileType = "IMAGE";
        else if (isVideo) fileType = "VIDEO";
        else if (is3DModel) fileType = "MODEL_3D";

        // Call Shopify GraphQL to get staged upload URL
        const response = await fetch(`https://${shopDomain}/admin/api/2025-10/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": shop.accessToken,
          },
          body: JSON.stringify({
            query: STAGED_UPLOAD_MUTATION,
            variables: {
              input: [
                {
                  filename: fileName,
                  mimeType,
                  fileSize: String(fileSize),
                  httpMethod,
                  resource: fileType,
                },
              ],
            },
          }),
        });

        const result = await response.json();

        if (result.errors) {
          console.error("[Shopify Files] GraphQL errors:", result.errors);
          return corsJson({ error: "Failed to create staged upload" }, request, { status: 500 });
        }

        const stagedTarget = result.data?.stagedUploadsCreate?.stagedTargets?.[0];
        const userErrors = result.data?.stagedUploadsCreate?.userErrors;

        if (userErrors?.length > 0) {
          console.error("[Shopify Files] User errors:", userErrors);
          return corsJson({ error: userErrors[0].message }, request, { status: 400 });
        }

        if (!stagedTarget) {
          return corsJson({ error: "No staged target returned" }, request, { status: 500 });
        }

        // Generate internal upload ID for tracking
        const uploadId = nanoid(12);

        return corsJson({
          uploadId,
          stagedUrl: stagedTarget.url,
          resourceUrl: stagedTarget.resourceUrl,
          parameters: stagedTarget.parameters,
          method: "shopify",
        }, request);
      }

      // Action: create_file - Create file in Shopify after upload
      if (uploadAction === "create_file") {
        if (!resourceUrl) {
          return corsJson({ error: "Missing resourceUrl" }, request, { status: 400 });
        }

        // Determine contentType based on mimeType - FileContentType enum
        // Valid values: IMAGE, FILE, VIDEO, MODEL_3D, EXTERNAL_VIDEO
        let contentType = "FILE";
        if (mimeType?.startsWith("image/")) {
          contentType = "IMAGE";
        } else if (mimeType?.startsWith("video/")) {
          contentType = "VIDEO";
        } else if (mimeType?.includes("gltf") || mimeType?.includes("glb") || mimeType?.includes("usdz")) {
          contentType = "MODEL_3D";
        }

        // Create file in Shopify
        const response = await fetch(`https://${shopDomain}/admin/api/2025-10/graphql.json`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": shop.accessToken,
          },
          body: JSON.stringify({
            query: FILE_CREATE_MUTATION,
            variables: {
              files: [
                {
                  originalSource: resourceUrl,
                  contentType,
                  alt: fileName || "Customer upload",
                },
              ],
            },
          }),
        });

        const result = await response.json();

        if (result.errors) {
          console.error("[Shopify Files] File create errors:", result.errors);
          return corsJson({ error: "Failed to create file" }, request, { status: 500 });
        }

        const file = result.data?.fileCreate?.files?.[0];
        const userErrors = result.data?.fileCreate?.userErrors;

        if (userErrors?.length > 0) {
          console.error("[Shopify Files] User errors:", userErrors);
          const errorMsg = userErrors[0].message;
          return corsJson({ 
            error: errorMsg, 
            details: userErrors 
          }, request, { status: 400 });
        }

        // Check file status - Shopify processes files asynchronously
        const fileStatus = file?.fileStatus;
        if (fileStatus === "FAILED") {
          return corsJson({ error: "File processing failed" }, request, { status: 500 });
        }

        // Get the file URL based on file type
        let fileUrl = "";
        let fileType = "unknown";
        
        // MediaImage type
        if (file?.image?.url) {
          fileUrl = file.image.url;
          fileType = "image";
        } else if (file?.image?.originalSrc) {
          fileUrl = file.image.originalSrc;
          fileType = "image";
        } 
        // GenericFile type (PDF, etc.)
        else if (file?.url) {
          fileUrl = file.url;
          fileType = "file";
        }

        // Log success
        console.log(`[Shopify Files] Created ${fileType}: ${file?.id}, status: ${fileStatus}`);

        return corsJson({
          success: true,
          fileId: file?.id,
          fileUrl,
          fileStatus,
          fileType,
          mimeType: file?.mimeType,
        }, request);
      }

      return corsJson({ error: "Invalid action" }, request, { status: 400 });
    }

    return corsJson({ error: "Invalid content type" }, request, { status: 400 });
  } catch (error) {
    console.error("[Shopify Files] Error:", error);
    return corsJson({ error: "Upload failed" }, request, { status: 500 });
  }
}
