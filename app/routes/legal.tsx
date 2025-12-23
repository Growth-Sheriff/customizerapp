import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { NavLink, Outlet, useLocation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Navigation,
  Frame,
  TopBar,
  Text,
  Box,
} from "@shopify/polaris";
import {
  LockIcon,
  FileIcon,
  GlobeIcon,
  BookIcon,
  ChatIcon,
  ClockIcon,
  PlayCircleIcon,
} from "@shopify/polaris-icons";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }: LoaderFunctionArgs) {
  return json({});
}

const navigationItems = [
  {
    label: "Privacy Policy",
    icon: LockIcon,
    url: "/legal/privacy",
    slug: "privacy",
  },
  {
    label: "Terms of Service",
    icon: FileIcon,
    url: "/legal/terms",
    slug: "terms",
  },
  {
    label: "GDPR Compliance",
    icon: GlobeIcon,
    url: "/legal/gdpr",
    slug: "gdpr",
  },
  {
    label: "Documentation",
    icon: BookIcon,
    url: "/legal/docs",
    slug: "docs",
  },
  {
    label: "Contact",
    icon: ChatIcon,
    url: "/legal/contact",
    slug: "contact",
  },
  {
    label: "Changelog",
    icon: ClockIcon,
    url: "/legal/changelog",
    slug: "changelog",
  },
  {
    label: "Tutorial",
    icon: PlayCircleIcon,
    url: "/legal/tutorial",
    slug: "tutorial",
  },
];

export default function LegalLayout() {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f6f6f7" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
        <div style={{ marginBottom: "2rem", textAlign: "center" }}>
          <Text variant="headingXl" as="h1">
            Product 3D Customizer & Upload
          </Text>
          <Text variant="bodyMd" as="p" tone="subdued">
            Legal Information & Documentation
          </Text>
        </div>

        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
          {/* Navigation Sidebar */}
          <div style={{ width: "250px", flexShrink: 0 }}>
            <Card>
              <Box padding="400">
                <nav>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {navigationItems.map((item) => {
                      const isActive = currentPath === item.url || currentPath === `/legal/${item.slug}`;
                      return (
                        <li key={item.slug} style={{ marginBottom: "0.5rem" }}>
                          <NavLink
                            to={item.url}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.75rem",
                              padding: "0.75rem 1rem",
                              borderRadius: "8px",
                              textDecoration: "none",
                              color: isActive ? "#2c6ecb" : "#202223",
                              backgroundColor: isActive ? "#f0f7ff" : "transparent",
                              fontWeight: isActive ? 600 : 400,
                              transition: "all 0.2s ease",
                            }}
                          >
                            <item.icon />
                            {item.label}
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <Text variant="headingSm" as="h3">
                  Need Help?
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Contact us at{" "}
                  <a href="mailto:support@customizerapp.dev">
                    support@customizerapp.dev
                  </a>
                </Text>
              </Box>
            </Card>
          </div>

          {/* Main Content */}
          <div style={{ flex: 1, minWidth: "300px" }}>
            <Card>
              <Box padding="600">
                <Outlet />
              </Box>
            </Card>
          </div>
        </div>

        <footer style={{ marginTop: "3rem", textAlign: "center", color: "#6d7175" }}>
          <Text variant="bodySm" as="p">
            © {new Date().getFullYear()} Product 3D Customizer & Upload. All rights reserved.
          </Text>
          <Text variant="bodySm" as="p">
            Domain: customizerapp.dev
          </Text>
        </footer>
      </div>
    </div>
  );
}
