import { Text, BlockStack, Divider, Badge, Card, Box, InlineStack } from "@shopify/polaris";

interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    type: "feature" | "fix" | "improvement" | "security" | "breaking";
    description: string;
  }[];
}

const changelog: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2025-01-15",
    changes: [
      { type: "feature", description: "Initial release of Product 3D Customizer & Upload" },
      { type: "feature", description: "3D T-Shirt designer with real-time preview" },
      { type: "feature", description: "Multiple print location support (Front, Back, Sleeves)" },
      { type: "feature", description: "DTF/Sublimation file generation" },
      { type: "feature", description: "Asset Sets for product configuration" },
      { type: "feature", description: "Shopify GraphQL API 2025-10 integration" },
      { type: "feature", description: "GDPR compliance with all Shopify webhooks" },
      { type: "feature", description: "Multi-tenant architecture with shop isolation" },
      { type: "security", description: "Cloudflare R2 storage with signed URLs" },
      { type: "security", description: "Row-level database security" },
    ]
  },
  {
    version: "0.9.0",
    date: "2024-12-20",
    changes: [
      { type: "feature", description: "Beta release for testing partners" },
      { type: "feature", description: "Basic upload functionality" },
      { type: "feature", description: "Order webhook integration" },
      { type: "improvement", description: "Performance optimizations for 3D rendering" },
      { type: "fix", description: "Mobile Safari compatibility issues" },
    ]
  },
];

function getBadgeTone(type: string): "success" | "info" | "attention" | "warning" | "critical" {
  switch (type) {
    case "feature": return "success";
    case "fix": return "critical";
    case "improvement": return "info";
    case "security": return "warning";
    case "breaking": return "attention";
    default: return "info";
  }
}

function getBadgeLabel(type: string): string {
  switch (type) {
    case "feature": return "FEATURE";
    case "fix": return "FIX";
    case "improvement": return "IMPROVEMENT";
    case "security": return "SECURITY";
    case "breaking": return "BREAKING";
    default: return type.toUpperCase();
  }
}

export default function Changelog() {
  return (
    <BlockStack gap="600">
      <BlockStack gap="200">
        <Text variant="headingLg" as="h1">
          Changelog
        </Text>
        <Text variant="bodyMd" as="p" tone="subdued">
          All notable changes to Product 3D Customizer & Upload
        </Text>
      </BlockStack>

      <Divider />

      <BlockStack gap="600">
        {changelog.map((entry) => (
          <Card key={entry.version}>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack gap="300" align="start" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    v{entry.version}
                  </Text>
                  <Badge>{entry.date}</Badge>
                </InlineStack>

                <BlockStack gap="200">
                  {entry.changes.map((change, index) => (
                    <InlineStack key={index} gap="200" align="start" wrap={false}>
                      <div style={{ minWidth: "100px" }}>
                        <Badge tone={getBadgeTone(change.type)}>
                          {getBadgeLabel(change.type)}
                        </Badge>
                      </div>
                      <Text as="p">{change.description}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        ))}
      </BlockStack>

      <BlockStack gap="200">
        <Text variant="headingMd" as="h2">
          Versioning
        </Text>
        <Text as="p" tone="subdued">
          We use Semantic Versioning (SemVer). Given a version number MAJOR.MINOR.PATCH:
        </Text>
        <ul style={{ margin: 0, paddingLeft: "1.5rem" }}>
          <li><strong>MAJOR</strong>: Incompatible API changes</li>
          <li><strong>MINOR</strong>: New features (backwards compatible)</li>
          <li><strong>PATCH</strong>: Bug fixes (backwards compatible)</li>
        </ul>
      </BlockStack>
    </BlockStack>
  );
}
