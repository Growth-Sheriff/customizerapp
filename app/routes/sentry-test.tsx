
import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import * as Sentry from "@sentry/remix";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ message: "Sentry Test Route" });
};

export default function SentryTest() {
  const data = useLoaderData<typeof loader>();

  const triggerError = () => {
    // @ts-ignore
    myUndefinedFunction();
  };

  const triggerServerError = () => {
    throw new Error("This is a server-side test error from Sentry Test Page");
  };

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Sentry Integration Test</h1>
      <p>Click these buttons to test Sentry capturing.</p>
      
      <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
        <button 
          onClick={triggerError}
          style={{ padding: "10px 20px", background: "#d82c2c", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" }}
        >
          Trigger Client Error (myUndefinedFunction)
        </button>

        <form method="post">
            <button 
              type="submit"
              name="intent" 
              value="error"
              style={{ padding: "10px 20px", background: "#333", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" }}
            >
              Trigger Server Error
            </button>
        </form>
      </div>
    </div>
  );
}

export const action = async () => {
    throw new Error("This is a simulated Server Action Error!");
}
