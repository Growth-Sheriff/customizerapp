import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// Root route - just redirect to /app for embedded app
// The /app route handles authentication
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  // Pass through all query params to /app
  const searchParams = url.searchParams.toString();
  const targetUrl = searchParams ? `/app?${searchParams}` : "/app";

  return redirect(targetUrl);
}

export default function Index() {
  return null;
}

