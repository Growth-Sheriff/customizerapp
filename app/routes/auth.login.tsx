import type { LoaderFunctionArgs } from "@remix-run/node";
import { login } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Always delegate to shopify login - it handles everything
  // This will throw a redirect response
  throw await login(request);
}
