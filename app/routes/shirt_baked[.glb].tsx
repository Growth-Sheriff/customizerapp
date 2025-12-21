import type { LoaderFunctionArgs } from "@remix-run/node";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// GET /shirt_baked.glb
// Serves the default T-shirt 3D model
export async function loader({ request }: LoaderFunctionArgs) {
  const filePath = join(process.cwd(), "public", "shirt_baked.glb");

  if (!existsSync(filePath)) {
    console.error("[Model] File not found:", filePath);
    return new Response("Model not found", { status: 404 });
  }

  try {
    const fileBuffer = readFileSync(filePath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[Model] Error reading file:", error);
    return new Response("Error loading model", { status: 500 });
  }
}

