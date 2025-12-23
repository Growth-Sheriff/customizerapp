import type { LoaderFunctionArgs } from "@remix-run/node";
import { readLocalFile } from "~/lib/storage.server";
import mime from "mime-types";

// GET /api/files/:key
// Serves files from local storage with CORS support
export async function loader({ params, request }: LoaderFunctionArgs) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
      },
    });
  }

  const key = params["*"];
  
  if (!key) {
    return new Response("File not found", { status: 404 });
  }

  try {
    const decodedKey = decodeURIComponent(key);
    const buffer = await readLocalFile(decodedKey);
    
    // Determine content type from file extension
    const ext = decodedKey.split(".").pop() || "";
    const contentType = mime.lookup(ext) || "application/octet-stream";
    
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000", // 1 year cache
        "Content-Length": String(buffer.length),
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[FileServe] Error:", error);
    return new Response("File not found", { status: 404 });
  }
}
