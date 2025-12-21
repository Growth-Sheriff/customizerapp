import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import "@shopify/polaris/build/esm/styles.css";
import { addDocumentResponseHeaders } from "~/shopify.server";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const headers = new Headers();
  await addDocumentResponseHeaders(request, headers);
  return json({}, { headers });
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error - Upload Lift Pro</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div style={{ padding: "2rem", fontFamily: "Inter, sans-serif" }}>
          <h1>Something went wrong</h1>
          <p>Please try again later.</p>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

