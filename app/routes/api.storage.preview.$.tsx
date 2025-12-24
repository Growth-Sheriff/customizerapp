import type { LoaderFunctionArgs } from "@remix-run/node";
import { getStorageConfig, createStorageClient, getDownloadSignedUrl } from "~/lib/storage.server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { authenticate } from "~/shopify.server";

/**
 * GET /api/storage/preview/:key
 * 
 * WI-004: Protected endpoint - requires admin authentication
 * Serves files from storage (R2/S3/Local) with proper caching headers.
 * For thumbnails and preview images in the admin panel.
 * 
 * The key is URL-encoded and can contain slashes.
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
  try {
    // WI-004: Require admin authentication for storage preview
    try {
      await authenticate.admin(request);
    } catch (authError) {
      console.error("[Storage Preview] Auth failed:", authError);
      return new Response("Unauthorized", { status: 401 });
    }

    // Get the full key from params - Remix handles the splat
    const url = new URL(request.url);
    const pathAfterPreview = url.pathname.replace("/api/storage/preview/", "");
    const key = decodeURIComponent(pathAfterPreview);

    if (!key) {
      return new Response("Missing key", { status: 400 });
    }

    const config = getStorageConfig();

    // For Shopify storage, the key IS the URL - redirect to it
    if (config.provider === "shopify") {
      return Response.redirect(key, 302);
    }

    // For local storage
    if (config.provider === "local") {
      const { readLocalFile } = await import("~/lib/storage.server");
      try {
        const data = await readLocalFile(key);
        const contentType = getContentType(key);
        return new Response(data, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      } catch {
        return new Response("File not found", { status: 404 });
      }
    }

    // For R2/S3 - fetch from storage
    const client = createStorageClient(config);
    if (!client) {
      return new Response("Storage not configured", { status: 500 });
    }

    try {
      const command = new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      });

      const response = await client.send(command);
      
      if (!response.Body) {
        return new Response("File not found", { status: 404 });
      }

      // Convert readable stream to buffer
      const chunks: Uint8Array[] = [];
      const reader = response.Body.transformToWebStream().getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const buffer = Buffer.concat(chunks);
      const contentType = response.ContentType || getContentType(key);

      return new Response(buffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Length": buffer.length.toString(),
        },
      });
    } catch (error: any) {
      console.error("[Storage Preview] Error fetching file:", error.message);
      
      // If direct fetch fails, try redirect to signed URL
      try {
        const signedUrl = await getDownloadSignedUrl(config, key, 3600);
        return Response.redirect(signedUrl, 302);
      } catch {
        return new Response("File not found", { status: 404 });
      }
    }
  } catch (error: any) {
    console.error("[Storage Preview] Error:", error);
    return new Response("Internal error", { status: 500 });
  }
}

function getContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    ai: "application/postscript",
    eps: "application/postscript",
    psd: "image/vnd.adobe.photoshop",
  };
  return types[ext || ""] || "application/octet-stream";
}
