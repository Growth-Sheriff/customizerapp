import { Text, BlockStack, Divider, List, Card, Box, InlineStack, Button, Icon } from "@shopify/polaris";
import { ExternalIcon, CodeIcon, SettingsIcon, ProductIcon, CartIcon, ChartVerticalFilledIcon } from "@shopify/polaris-icons";

export default function Documentation() {
  const sections = [
    {
      title: "Getting Started",
      icon: SettingsIcon,
      items: [
        { title: "Installation Guide", description: "How to install and set up the app" },
        { title: "Initial Configuration", description: "Configure your first product" },
        { title: "Theme Integration", description: "Add the customizer to your theme" },
      ]
    },
    {
      title: "Product Configuration",
      icon: ProductIcon,
      items: [
        { title: "Asset Sets", description: "Create and manage asset sets" },
        { title: "Print Locations", description: "Define print areas on products" },
        { title: "Size & Color Options", description: "Configure product variants" },
        { title: "T-Shirt 3D Mode", description: "Enable 3D preview for apparel" },
      ]
    },
    {
      title: "Order Management",
      icon: CartIcon,
      items: [
        { title: "Processing Orders", description: "Handle customized orders" },
        { title: "Export Files", description: "Generate print-ready files" },
        { title: "Queue Management", description: "Manage the processing queue" },
      ]
    },
    {
      title: "API Reference",
      icon: CodeIcon,
      items: [
        { title: "REST API", description: "API endpoints documentation" },
        { title: "Webhooks", description: "Available webhook events" },
        { title: "Rate Limits", description: "API usage limits" },
      ]
    },
    {
      title: "Analytics",
      icon: ChartVerticalFilledIcon,
      items: [
        { title: "Dashboard Overview", description: "Understanding your metrics" },
        { title: "Conversion Tracking", description: "Track customization conversions" },
        { title: "Export Reports", description: "Generate analytics reports" },
      ]
    },
  ];

  return (
    <BlockStack gap="600">
      <BlockStack gap="200">
        <Text variant="headingLg" as="h1">
          Documentation
        </Text>
        <Text variant="bodyMd" as="p" tone="subdued">
          Complete guide to using Product 3D Customizer & Upload
        </Text>
      </BlockStack>

      <Divider />

      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Quick Links
        </Text>
        <InlineStack gap="300" wrap>
          <Button url="/app" icon={ExternalIcon}>
            Open App Dashboard
          </Button>
          <Button url="/legal/tutorial" variant="secondary">
            Video Tutorial
          </Button>
          <Button url="/legal/changelog" variant="secondary">
            View Changelog
          </Button>
        </InlineStack>
      </BlockStack>

      <BlockStack gap="600">
        {sections.map((section) => (
          <Card key={section.title}>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack gap="200" align="start">
                  <Icon source={section.icon} />
                  <Text variant="headingMd" as="h3">
                    {section.title}
                  </Text>
                </InlineStack>
                
                <List type="bullet">
                  {section.items.map((item) => (
                    <List.Item key={item.title}>
                      <Text as="span" fontWeight="semibold">{item.title}</Text>
                      <Text as="span" tone="subdued"> — {item.description}</Text>
                    </List.Item>
                  ))}
                </List>
              </BlockStack>
            </Box>
          </Card>
        ))}
      </BlockStack>

      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Need More Help?
        </Text>
        <Text as="p">
          Can't find what you're looking for? Our support team is here to help:
        </Text>
        <List type="bullet">
          <List.Item>Email: support@customizerapp.dev</List.Item>
          <List.Item>Response time: Within 24 hours (business days)</List.Item>
          <List.Item>Enterprise customers: Priority support available</List.Item>
        </List>
      </BlockStack>
    </BlockStack>
  );
}
