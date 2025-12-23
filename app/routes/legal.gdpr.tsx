import { Text, BlockStack, Divider, List, Badge, InlineStack, Box, Card } from "@shopify/polaris";

export default function GDPRCompliance() {
  return (
    <BlockStack gap="600">
      <BlockStack gap="200">
        <InlineStack gap="300" align="start">
          <Text variant="headingLg" as="h1">
            GDPR Compliance
          </Text>
          <Badge tone="success">Compliant</Badge>
        </InlineStack>
        <Text variant="bodySm" as="p" tone="subdued">
          Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </Text>
      </BlockStack>

      <Divider />

      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Overview
        </Text>
        <Text as="p">
          Product 3D Customizer & Upload is fully compliant with the General Data Protection Regulation (GDPR) 
          and other applicable data protection laws. We are committed to protecting the privacy and rights 
          of our users and their customers.
        </Text>
      </BlockStack>

      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Data Controller & Processor
        </Text>
        <Text as="p">
          When you use our App:
        </Text>
        <List type="bullet">
          <List.Item><strong>You (Merchant)</strong> are the Data Controller for your customers' data</List.Item>
          <List.Item><strong>We</strong> act as a Data Processor on your behalf</List.Item>
          <List.Item><strong>Shopify</strong> provides the underlying platform infrastructure</List.Item>
        </List>
      </BlockStack>

      <Box paddingBlockStart="400">
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Shopify GDPR Webhooks
              </Text>
              <Text as="p">
                We implement all required Shopify GDPR webhooks:
              </Text>
              
              <BlockStack gap="300">
                <InlineStack gap="200" align="start">
                  <Badge tone="success">Active</Badge>
                  <Text as="span" fontWeight="semibold">customers/data_request</Text>
                </InlineStack>
                <Text as="p" tone="subdued">
                  When a customer requests their data, we provide all stored information including 
                  uploads, configurations, and order customizations.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <InlineStack gap="200" align="start">
                  <Badge tone="success">Active</Badge>
                  <Text as="span" fontWeight="semibold">customers/redact</Text>
                </InlineStack>
                <Text as="p" tone="subdued">
                  When a customer requests deletion, we remove all their personal data and 
                  uploaded files within 30 days.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <InlineStack gap="200" align="start">
                  <Badge tone="success">Active</Badge>
                  <Text as="span" fontWeight="semibold">shop/redact</Text>
                </InlineStack>
                <Text as="p" tone="subdued">
                  When a shop uninstalls our app, we delete all shop data within 48 hours.
                </Text>
              </BlockStack>
            </BlockStack>
          </Box>
        </Card>
      </Box>

      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Data Subject Rights
        </Text>
        <Text as="p">
          We support all GDPR data subject rights:
        </Text>
        <List type="bullet">
          <List.Item><strong>Right to Access:</strong> Request a copy of stored data</List.Item>
          <List.Item><strong>Right to Rectification:</strong> Correct inaccurate data</List.Item>
          <List.Item><strong>Right to Erasure:</strong> Request data deletion</List.Item>
          <List.Item><strong>Right to Portability:</strong> Export data in standard format</List.Item>
          <List.Item><strong>Right to Restrict Processing:</strong> Limit data usage</List.Item>
          <List.Item><strong>Right to Object:</strong> Opt out of certain processing</List.Item>
        </List>
      </BlockStack>

      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Data Security Measures
        </Text>
        <List type="bullet">
          <List.Item>TLS 1.3 encryption for all data in transit</List.Item>
          <List.Item>AES-256 encryption for data at rest</List.Item>
          <List.Item>Row-level database security with tenant isolation</List.Item>
          <List.Item>Regular security audits and penetration testing</List.Item>
          <List.Item>Access logging and monitoring</List.Item>
          <List.Item>Employee access controls and training</List.Item>
        </List>
      </BlockStack>

      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Data Processing Agreement (DPA)
        </Text>
        <Text as="p">
          A Data Processing Agreement is available for Enterprise customers upon request. 
          Contact enterprise@customizerapp.dev for more information.
        </Text>
      </BlockStack>

      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          International Data Transfers
        </Text>
        <Text as="p">
          Our servers are located in the EU (Germany). For data transfers outside the EU, 
          we rely on:
        </Text>
        <List type="bullet">
          <List.Item>Standard Contractual Clauses (SCCs)</List.Item>
          <List.Item>Cloudflare's GDPR-compliant infrastructure</List.Item>
          <List.Item>Shopify's data processing terms</List.Item>
        </List>
      </BlockStack>

      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Contact Our DPO
        </Text>
        <Text as="p">
          For GDPR-related inquiries, contact our Data Protection Officer:
        </Text>
        <List type="bullet">
          <List.Item>Email: dpo@customizerapp.dev</List.Item>
          <List.Item>Response time: Within 72 hours</List.Item>
        </List>
      </BlockStack>
    </BlockStack>
  );
}
