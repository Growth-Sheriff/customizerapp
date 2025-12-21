import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { AppProvider, Page, Layout, Card, Text, BlockStack, Banner } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export async function loader({ request }: LoaderFunctionArgs) {
  return json({
    appName: "Upload Lift Pro",
    version: "1.0.0",
    status: "healthy",
  });
}

export default function Index() {
  const data = useLoaderData<typeof loader>();

  return (
    <AppProvider i18n={enTranslations}>
      <Page title="Upload Lift Pro">
        <Layout>
          <Layout.Section>
            <Banner title="Welcome to Upload Lift Pro" tone="success">
              <p>Your DTF/custom print customizer is ready.</p>
            </Banner>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">App Status</Text>
                <Text as="p">Version: {data.version}</Text>
                <Text as="p">Status: {data.status}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Quick Stats</Text>
                <Text as="p">Uploads: 0</Text>
                <Text as="p">Products: 0</Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Plan</Text>
                <Text as="p">Current: Free</Text>
                <Text as="p">Uploads: 0/100</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}

