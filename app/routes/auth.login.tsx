import type { LoaderFunctionArgs } from "@remix-run/node";
import { login } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Delegate to shopify login
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  // If no shop provided, return error
  if (!shop) {
    return new Response("Missing shop parameter", { status: 400 });
  }
  
  // Return the login redirect
  return login(request);
}
