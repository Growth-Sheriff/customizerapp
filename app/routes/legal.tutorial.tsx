import { Text, BlockStack, Divider, Card, Box, InlineStack, Badge, Button } from "@shopify/polaris";
import { PlayIcon } from "@shopify/polaris-icons";

interface TutorialStep {
  number: number;
  title: string;
  duration: string;
  description: string;
  topics: string[];
}

const tutorialSteps: TutorialStep[] = [
  {
    number: 1,
    title: "App Installation & Setup",
    duration: "3 min",
    description: "Install the app from Shopify App Store and complete initial configuration.",
    topics: [
      "Installing from Shopify App Store",
      "Granting required permissions",
      "Initial dashboard overview",
      "Connecting your first product"
    ]
  },
  {
    number: 2,
    title: "Creating Asset Sets",
    duration: "5 min",
    description: "Learn how to create and configure asset sets for your products.",
    topics: [
      "What are Asset Sets?",
      "Creating a new asset set",
      "Configuring print locations",
      "Setting upload rules and limits"
    ]
  },
  {
    number: 3,
    title: "3D T-Shirt Configuration",
    duration: "7 min",
    description: "Set up the 3D T-Shirt designer for your apparel products.",
    topics: [
      "Enabling 3D mode",
      "Selecting product variants (colors/sizes)",
      "Configuring print positions",
      "Setting DPI and size limits",
      "Testing the 3D preview"
    ]
  },
  {
    number: 4,
    title: "Theme Integration",
    duration: "4 min",
    description: "Add the customizer blocks to your Shopify theme.",
    topics: [
      "Accessing Theme Editor",
      "Adding the DTF Transfer block",
      "Positioning the widget",
      "Mobile responsiveness",
      "Testing on product pages"
    ]
  },
  {
    number: 5,
    title: "Processing Orders",
    duration: "5 min",
    description: "Handle orders with customizations and generate print files.",
    topics: [
      "Viewing customized orders",
      "Downloading customer designs",
      "Generating print-ready files",
      "Order fulfillment workflow"
    ]
  },
  {
    number: 6,
    title: "Analytics & Reporting",
    duration: "3 min",
    description: "Track performance and understand your customization data.",
    topics: [
      "Dashboard metrics overview",
      "Conversion tracking",
      "Popular products and designs",
      "Exporting reports"
    ]
  }
];

export default function Tutorial() {
  return (
    <BlockStack gap="600">
      <BlockStack gap="200">
        <Text variant="headingLg" as="h1">
          Video Tutorial
        </Text>
        <Text variant="bodyMd" as="p" tone="subdued">
          Step-by-step guide to mastering Product 3D Customizer & Upload
        </Text>
      </BlockStack>

      <Divider />

      {/* Main Video */}
      <Card>
        <Box padding="400">
          <BlockStack gap="400">
            <InlineStack gap="200" align="start">
              <Badge tone="success">Full Course</Badge>
              <Text variant="bodySm" as="span" tone="subdued">27 minutes total</Text>
            </InlineStack>
            
            <Text variant="headingMd" as="h2">
              Complete Setup Guide
            </Text>

            <div style={{ 
              backgroundColor: "#1a1a1a", 
              borderRadius: "8px", 
              aspectRatio: "16/9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "300px"
            }}>
              <BlockStack gap="200" inlineAlign="center">
                <div style={{ 
                  width: "60px", 
                  height: "60px", 
                  borderRadius: "50%", 
                  backgroundColor: "rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <PlayIcon />
                </div>
                <Text as="p" tone="subdued">
                  Video coming soon...
                </Text>
              </BlockStack>
            </div>

            <Text as="p" tone="subdued">
              This comprehensive tutorial walks you through the entire setup process, 
              from installation to processing your first customized order.
            </Text>
          </BlockStack>
        </Box>
      </Card>

      {/* Chapter List */}
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Chapters
        </Text>

        <BlockStack gap="300">
          {tutorialSteps.map((step) => (
            <Card key={step.number}>
              <Box padding="400">
                <InlineStack gap="400" align="start" blockAlign="start" wrap={false}>
                  <div style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    backgroundColor: "#2c6ecb",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "bold",
                    flexShrink: 0
                  }}>
                    {step.number}
                  </div>
                  
                  <BlockStack gap="200">
                    <InlineStack gap="200" align="start">
                      <Text variant="headingSm" as="h3">
                        {step.title}
                      </Text>
                      <Badge tone="info">{step.duration}</Badge>
                    </InlineStack>
                    
                    <Text as="p" tone="subdued">
                      {step.description}
                    </Text>
                    
                    <InlineStack gap="100" wrap>
                      {step.topics.map((topic, idx) => (
                        <Badge key={idx}>{topic}</Badge>
                      ))}
                    </InlineStack>
                  </BlockStack>
                </InlineStack>
              </Box>
            </Card>
          ))}
        </BlockStack>
      </BlockStack>

      {/* Quick Tips */}
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              💡 Quick Tips
            </Text>
            <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
              <li>Start with a single product to test the workflow</li>
              <li>Use high-quality 3D model files for better previews</li>
              <li>Test on mobile devices - many customers use phones</li>
              <li>Set appropriate file size limits for your print quality needs</li>
              <li>Enable email notifications for new orders</li>
            </ul>
          </BlockStack>
        </Box>
      </Card>

      {/* Support CTA */}
      <Card>
        <Box padding="400">
          <InlineStack gap="400" align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text variant="headingSm" as="h3">
                Need personalized help?
              </Text>
              <Text as="p" tone="subdued">
                Book a free 15-minute onboarding call with our team.
              </Text>
            </BlockStack>
            <Button url="/legal/contact" variant="primary">
              Contact Support
            </Button>
          </InlineStack>
        </Box>
      </Card>
    </BlockStack>
  );
}
