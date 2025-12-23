import { json, type ActionFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { 
  Text, 
  BlockStack, 
  Divider, 
  TextField, 
  Button, 
  Card, 
  Box, 
  InlineStack,
  Banner,
  Select
} from "@shopify/polaris";
import { useState } from "react";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const subject = formData.get("subject") as string;
  const message = formData.get("message") as string;

  // Validate
  if (!name || !email || !subject || !message) {
    return json({ success: false, error: "All fields are required" });
  }

  // In production, send email via SendGrid, Resend, etc.
  // For now, just simulate success
  console.log("Contact form submission:", { name, email, subject, message });

  return json({ success: true, error: null });
}

export default function Contact() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("general");
  const [message, setMessage] = useState("");

  const subjectOptions = [
    { label: "General Inquiry", value: "general" },
    { label: "Technical Support", value: "support" },
    { label: "Billing Question", value: "billing" },
    { label: "Feature Request", value: "feature" },
    { label: "Bug Report", value: "bug" },
    { label: "Partnership", value: "partnership" },
    { label: "GDPR Request", value: "gdpr" },
  ];

  return (
    <BlockStack gap="600">
      <BlockStack gap="200">
        <Text variant="headingLg" as="h1">
          Contact Us
        </Text>
        <Text variant="bodyMd" as="p" tone="subdued">
          Have questions? We'd love to hear from you.
        </Text>
      </BlockStack>

      <Divider />

      {actionData?.success && (
        <Banner tone="success" title="Message Sent!">
          Thank you for contacting us. We'll get back to you within 24 hours.
        </Banner>
      )}

      {actionData?.error && (
        <Banner tone="critical" title="Error">
          {actionData.error}
        </Banner>
      )}

      <InlineStack gap="600" align="start" wrap>
        <div style={{ flex: 2, minWidth: "300px" }}>
          <Card>
            <Box padding="400">
              <Form method="post">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">
                    Send us a message
                  </Text>

                  <TextField
                    label="Your Name"
                    name="name"
                    value={name}
                    onChange={setName}
                    autoComplete="name"
                    requiredIndicator
                  />

                  <TextField
                    label="Email Address"
                    name="email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    requiredIndicator
                  />

                  <Select
                    label="Subject"
                    name="subject"
                    options={subjectOptions}
                    value={subject}
                    onChange={setSubject}
                  />

                  <TextField
                    label="Message"
                    name="message"
                    value={message}
                    onChange={setMessage}
                    multiline={5}
                    autoComplete="off"
                    requiredIndicator
                  />

                  <Button submit variant="primary" loading={isSubmitting}>
                    Send Message
                  </Button>
                </BlockStack>
              </Form>
            </Box>
          </Card>
        </div>

        <div style={{ flex: 1, minWidth: "250px" }}>
          <BlockStack gap="400">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Direct Contact
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p">
                      <strong>General:</strong><br />
                      support@customizerapp.dev
                    </Text>
                    <Text as="p">
                      <strong>Sales:</strong><br />
                      sales@customizerapp.dev
                    </Text>
                    <Text as="p">
                      <strong>Enterprise:</strong><br />
                      enterprise@customizerapp.dev
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Response Times
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p">
                      <strong>Free Plan:</strong> 48-72 hours
                    </Text>
                    <Text as="p">
                      <strong>Starter:</strong> 24 hours
                    </Text>
                    <Text as="p">
                      <strong>Pro:</strong> 12 hours
                    </Text>
                    <Text as="p">
                      <strong>Enterprise:</strong> 4 hours
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">
                    Office Hours
                  </Text>
                  <Text as="p">
                    Monday - Friday<br />
                    9:00 AM - 6:00 PM (CET)
                  </Text>
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </div>
      </InlineStack>
    </BlockStack>
  );
}
