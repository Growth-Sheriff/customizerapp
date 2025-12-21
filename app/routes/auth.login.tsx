import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const errors = url.searchParams.get("errors");

  // If shop is provided, try to login
  if (shop) {
    throw await login(request);
  }

  return json({
    showForm: true,
    errors: errors ? JSON.parse(errors) : null,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const shop = formData.get("shop");

  if (!shop || typeof shop !== "string") {
    return json({ errors: { shop: "Shop domain is required" } }, { status: 400 });
  }

  const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const shopDomain = cleanShop.includes(".myshopify.com")
    ? cleanShop
    : `${cleanShop}.myshopify.com`;

  throw await login(request);
}

export default function AuthLogin() {
  const { showForm, errors } = useLoaderData<typeof loader>();

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      backgroundColor: "#f4f6f8",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div style={{
        backgroundColor: "white",
        padding: "2rem",
        borderRadius: "8px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        maxWidth: "400px",
        width: "100%",
      }}>
        <h1 style={{ textAlign: "center", marginBottom: "1rem", color: "#202223" }}>
          Upload Lift Pro
        </h1>
        <p style={{ textAlign: "center", color: "#6d7175", marginBottom: "1.5rem" }}>
          Enter your Shopify store domain to continue
        </p>

        <Form method="post">
          <div style={{ marginBottom: "1rem" }}>
            <input
              type="text"
              name="shop"
              placeholder="your-store.myshopify.com"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid #c9cccf",
                borderRadius: "4px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
              required
            />
            {errors?.shop && (
              <p style={{ color: "#d72c0d", fontSize: "12px", marginTop: "4px" }}>
                {errors.shop}
              </p>
            )}
          </div>

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "#008060",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Log in
          </button>
        </Form>
      </div>
    </div>
  );
}

