/**
 * Custom Upload for Products Design - Admin Panel Frame
 * Polaris Frame with Navigation sidebar
 */

import { useCallback, useState } from "react";
import { useLocation, useNavigate, Outlet } from "@remix-run/react";
import {
  Frame,
  Navigation,
  TopBar,
  Text,
  Icon,
} from "@shopify/polaris";
import {
  HomeIcon,
  ChartVerticalFilledIcon,
  OrderIcon,
  ProductIcon,
  ImageIcon,
  ListBulletedIcon,
  ExportIcon,
  SettingsIcon,
  KeyIcon,
  PersonIcon,
  CreditCardIcon,
  PaintBrushFlatIcon,
  QuestionCircleIcon,
  ChatIcon,
} from "@shopify/polaris-icons";

interface AppFrameProps {
  shop: string;
  pendingUploads?: number;
  pendingQueue?: number;
}

export function AppFrame({ shop, pendingUploads = 0, pendingQueue = 0 }: AppFrameProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavigationActive, setMobileNavigationActive] = useState(false);

  const toggleMobileNavigationActive = useCallback(
    () => setMobileNavigationActive((active) => !active),
    []
  );

  const isSelected = (path: string) => {
    if (path === "/app") {
      return location.pathname === "/app" || location.pathname === "/app/";
    }
    return location.pathname.startsWith(path);
  };

  // Navigation structure
  const navigationMarkup = (
    <Navigation location={location.pathname}>
      {/* Logo / Brand */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e1e3e5" }}>
        <Text variant="headingMd" as="h1">
          🎨 Custom Upload
        </Text>
        <Text variant="bodySm" as="p" tone="subdued">
          Products Design
        </Text>
      </div>

      {/* Analytics Section */}
      <Navigation.Section
        title="Analytics"
        items={[
          {
            url: "/app",
            label: "Dashboard",
            icon: HomeIcon,
            selected: isSelected("/app") && !location.pathname.includes("/app/"),
            onClick: () => navigate("/app"),
          },
          {
            url: "/app/analytics",
            label: "Reports",
            icon: ChartVerticalFilledIcon,
            selected: isSelected("/app/analytics"),
            onClick: () => navigate("/app/analytics"),
          },
        ]}
      />

      {/* Manage Section */}
      <Navigation.Section
        title="Manage"
        items={[
          {
            url: "/app/uploads",
            label: "Uploads",
            icon: OrderIcon,
            selected: isSelected("/app/uploads"),
            badge: pendingUploads > 0 ? String(pendingUploads) : undefined,
            onClick: () => navigate("/app/uploads"),
          },
          {
            url: "/app/products",
            label: "Products",
            icon: ProductIcon,
            selected: isSelected("/app/products"),
            onClick: () => navigate("/app/products"),
          },
          {
            url: "/app/asset-sets",
            label: "Asset Sets",
            icon: ImageIcon,
            selected: isSelected("/app/asset-sets"),
            onClick: () => navigate("/app/asset-sets"),
          },
          {
            url: "/app/queue",
            label: "Production Queue",
            icon: ListBulletedIcon,
            selected: isSelected("/app/queue"),
            badge: pendingQueue > 0 ? String(pendingQueue) : undefined,
            onClick: () => navigate("/app/queue"),
          },
          {
            url: "/app/exports",
            label: "Exports",
            icon: ExportIcon,
            selected: isSelected("/app/exports"),
            onClick: () => navigate("/app/exports"),
          },
        ]}
      />

      {/* Settings Section */}
      <Navigation.Section
        title="Settings"
        separator
        items={[
          {
            url: "/app/settings",
            label: "General",
            icon: SettingsIcon,
            selected: isSelected("/app/settings"),
            onClick: () => navigate("/app/settings"),
          },
          {
            url: "/app/api-keys",
            label: "API Keys",
            icon: KeyIcon,
            selected: isSelected("/app/api-keys"),
            onClick: () => navigate("/app/api-keys"),
          },
          {
            url: "/app/team",
            label: "Team",
            icon: PersonIcon,
            selected: isSelected("/app/team"),
            onClick: () => navigate("/app/team"),
          },
          {
            url: "/app/billing",
            label: "Billing",
            icon: CreditCardIcon,
            selected: isSelected("/app/billing"),
            onClick: () => navigate("/app/billing"),
          },
          {
            url: "/app/white-label",
            label: "Branding",
            icon: PaintBrushFlatIcon,
            selected: isSelected("/app/white-label"),
            onClick: () => navigate("/app/white-label"),
          },
        ]}
      />

      {/* Resources Section */}
      <Navigation.Section
        title="Resources"
        separator
        items={[
          {
            url: "https://docs.customizerapp.dev",
            label: "Documentation",
            icon: QuestionCircleIcon,
            external: true,
          },
          {
            url: "mailto:support@customizerapp.dev",
            label: "Support",
            icon: ChatIcon,
            external: true,
          },
        ]}
      />

      {/* Footer */}
      <div style={{ 
        padding: "16px 20px", 
        borderTop: "1px solid #e1e3e5",
        marginTop: "auto",
        position: "absolute",
        bottom: 0,
        width: "100%",
        boxSizing: "border-box",
        background: "#f6f6f7",
      }}>
        <Text variant="bodySm" as="p" tone="subdued">
          PRO Plan
        </Text>
        <Text variant="bodySm" as="p" tone="subdued">
          v1.0.0
        </Text>
      </div>
    </Navigation>
  );

  // TopBar for mobile
  const topBarMarkup = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={toggleMobileNavigationActive}
    />
  );

  return (
    <Frame
      navigation={navigationMarkup}
      topBar={topBarMarkup}
      showMobileNavigation={mobileNavigationActive}
      onNavigationDismiss={toggleMobileNavigationActive}
    >
      <Outlet />
    </Frame>
  );
}

export default AppFrame;
