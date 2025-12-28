import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Banner,
  Box,
  Divider,
  List,
} from "@shopify/polaris";
import { useState } from "react";
import fs from "fs/promises";
import path from "path";

// GraphQL mutation for creating theme assets
const CREATE_THEME_ASSET_MUTATION = `
  mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles {
        filename
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// GraphQL query to get main theme info
const GET_MAIN_THEME_QUERY = `
  query getMainTheme {
    themes(first: 10, roles: [MAIN]) {
      nodes {
        id
        name
        role
      }
    }
  }
`;

// Query to check if sections exist
const CHECK_THEME_FILES_QUERY = `
  query checkThemeFiles($themeId: ID!) {
    theme(id: $themeId) {
      files(filenames: [
        "sections/carousel-upload.liquid",
        "sections/product-bar-upload.liquid",
        "assets/carousel-upload.css",
        "assets/carousel-upload.js",
        "assets/product-bar-upload.css",
        "assets/product-bar-upload.js"
      ]) {
        nodes {
          filename
        }
      }
    }
  }
`;

interface Section {
  id: string;
  name: string;
  description: string;
  files: string[];
  installed: boolean;
}

const AVAILABLE_SECTIONS: Section[] = [
  {
    id: "carousel-upload",
    name: "3D Carousel Upload",
    description: "Premium 3D carousel with custom upload functionality for each product. Includes 4D effects, banner slider, and modal upload.",
    files: ["sections/carousel-upload.liquid", "assets/carousel-upload.css", "assets/carousel-upload.js"],
    installed: false
  },
  {
    id: "product-bar-upload", 
    name: "Product Showcase Bar",
    description: "Product grid showcase with per-product upload capabilities. Clean design with modal upload and size selection.",
    files: ["sections/product-bar-upload.liquid", "assets/product-bar-upload.css", "assets/product-bar-upload.js"],
    installed: false
  }
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  try {
    // Get main theme
    const themeResponse = await admin.graphql(GET_MAIN_THEME_QUERY);
    const themeData = await themeResponse.json();
    const mainTheme = themeData?.data?.themes?.nodes?.[0];

    if (!mainTheme) {
      return json({ 
        theme: null, 
        sections: AVAILABLE_SECTIONS,
        error: "No main theme found"
      });
    }

    // Check which files are already installed
    const filesResponse = await admin.graphql(CHECK_THEME_FILES_QUERY, {
      variables: { themeId: mainTheme.id }
    });
    const filesData = await filesResponse.json();
    const existingFiles = filesData?.data?.theme?.files?.nodes?.map((f: { filename: string }) => f.filename) || [];

    // Update sections with installation status
    const sectionsWithStatus = AVAILABLE_SECTIONS.map(section => ({
      ...section,
      installed: section.files.every(file => existingFiles.includes(file))
    }));

    return json({
      theme: mainTheme,
      sections: sectionsWithStatus,
      existingFiles,
      error: null
    });

  } catch (error) {
    console.error("Loader error:", error);
    return json({
      theme: null,
      sections: AVAILABLE_SECTIONS,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const sectionId = formData.get("sectionId") as string;
  const actionType = formData.get("action") as string;

  if (actionType === "install") {
    try {
      // 1. Get main theme
      const themeResponse = await admin.graphql(GET_MAIN_THEME_QUERY);
      const themeData = await themeResponse.json();
      const mainTheme = themeData?.data?.themes?.nodes?.[0];
      
      if (!mainTheme) {
        return json({ success: false, error: "No main theme found" });
      }

      // 2. Read files based on section ID
      const files: Array<{ filename: string; content: string }> = [];
      
      // Section liquid file
      const liquidPath = path.join(process.cwd(), "theme-sections", `${sectionId}.liquid`);
      try {
        const liquidContent = await fs.readFile(liquidPath, "utf-8");
        files.push({
          filename: `sections/${sectionId}.liquid`,
          content: liquidContent
        });
      } catch (e) {
        return json({ success: false, error: `Section file not found: ${sectionId}.liquid` });
      }

      // CSS file
      const cssPath = path.join(process.cwd(), "extensions", "theme-extension", "assets", `${sectionId}.css`);
      try {
        const cssContent = await fs.readFile(cssPath, "utf-8");
        files.push({
          filename: `assets/${sectionId}.css`,
          content: cssContent
        });
      } catch (e) {
        console.log(`CSS not found for ${sectionId}`);
      }

      // JS file
      const jsPath = path.join(process.cwd(), "extensions", "theme-extension", "assets", `${sectionId}.js`);
      try {
        const jsContent = await fs.readFile(jsPath, "utf-8");
        files.push({
          filename: `assets/${sectionId}.js`,
          content: jsContent
        });
      } catch (e) {
        console.log(`JS not found for ${sectionId}`);
      }

      // 3. Upload to theme using GraphQL
      const uploadResponse = await admin.graphql(CREATE_THEME_ASSET_MUTATION, {
        variables: {
          themeId: mainTheme.id,
          files: files.map(f => ({
            filename: f.filename,
            body: {
              type: "TEXT",
              value: f.content
            }
          }))
        }
      });

      const uploadData = await uploadResponse.json();
      
      if (uploadData?.data?.themeFilesUpsert?.userErrors?.length > 0) {
        return json({
          success: false,
          error: uploadData.data.themeFilesUpsert.userErrors.map((e: { message: string }) => e.message).join(", ")
        });
      }

      const uploadedFiles = uploadData?.data?.themeFilesUpsert?.upsertedThemeFiles || [];

      return json({
        success: true,
        theme: mainTheme.name,
        installedFiles: uploadedFiles.map((f: { filename: string }) => f.filename),
        message: `Successfully installed ${uploadedFiles.length} files to theme "${mainTheme.name}"`
      });

    } catch (error) {
      console.error("Install error:", error);
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return json({ error: "Unknown action" });
}

export default function ThemeSectionsPage() {
  const { theme, sections, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [installing, setInstalling] = useState<string | null>(null);

  const isLoading = navigation.state === "submitting";

  const handleInstall = (sectionId: string) => {
    setInstalling(sectionId);
    const formData = new FormData();
    formData.append("sectionId", sectionId);
    formData.append("action", "install");
    submit(formData, { method: "post" });
  };

  return (
    <Page
      title="Theme Sections"
      subtitle="Install custom sections to your theme"
      backAction={{ content: "Settings", url: "/app" }}
    >
      <BlockStack gap="500">
        {error && (
          <Banner tone="critical">
            <p>{error}</p>
          </Banner>
        )}

        {actionData?.success && (
          <Banner tone="success">
            <p>{actionData.message}</p>
          </Banner>
        )}

        {actionData?.error && !actionData?.success && (
          <Banner tone="critical">
            <p>Installation failed: {JSON.stringify(actionData.error)}</p>
          </Banner>
        )}

        {theme && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">Active Theme</Text>
                <Badge tone="success">{theme.name}</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Sections will be installed to your currently active theme.
              </Text>
            </BlockStack>
          </Card>
        )}

        <Layout>
          {sections.map((section: Section) => (
            <Layout.Section key={section.id}>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="start">
                    <BlockStack gap="200">
                      <InlineStack gap="200" align="start">
                        <Text variant="headingMd" as="h3">{section.name}</Text>
                        {section.installed ? (
                          <Badge tone="success">Installed</Badge>
                        ) : (
                          <Badge tone="attention">Not Installed</Badge>
                        )}
                      </InlineStack>
                      <Text as="p" tone="subdued">{section.description}</Text>
                    </BlockStack>
                  </InlineStack>

                  <Divider />

                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Files included:</Text>
                    <List type="bullet">
                      {section.files.map(file => (
                        <List.Item key={file}>{file}</List.Item>
                      ))}
                    </List>
                  </BlockStack>

                  <InlineStack align="end">
                    <Button
                      variant={section.installed ? "secondary" : "primary"}
                      onClick={() => handleInstall(section.id)}
                      loading={isLoading && installing === section.id}
                      disabled={isLoading}
                    >
                      {section.installed ? "Reinstall" : "Install to Theme"}
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          ))}
        </Layout>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Usage Instructions</Text>
            <Text as="p">After installing a section, follow these steps:</Text>
            <List type="number">
              <List.Item>Go to your Shopify Admin → Online Store → Themes</List.Item>
              <List.Item>Click "Customize" on your active theme</List.Item>
              <List.Item>Navigate to the page where you want to add the section</List.Item>
              <List.Item>Click "Add section" and search for the installed section name</List.Item>
              <List.Item>Configure the section settings and add products</List.Item>
            </List>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
