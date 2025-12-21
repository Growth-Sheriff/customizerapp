import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getShopFromSession } from "~/lib/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Check if user is authenticated
  const shopDomain = await getShopFromSession(request);

  if (shopDomain) {
    // Authenticated - redirect to app dashboard
    return redirect("/app");
  }

  // Not authenticated - redirect to install
  return redirect("/auth/install");
}

export default function Index() {
  // This should never render due to redirects
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h1>Upload Lift Pro</h1>
      <p>Redirecting...</p>
    </div>
  );
}

