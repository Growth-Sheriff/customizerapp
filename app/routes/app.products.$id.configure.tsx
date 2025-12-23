/**
 * Product Configure Page
 * Merchant configures upload widget, extra questions, and T-Shirt options per product
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  TextField, Select, Button, Banner, FormLayout, Divider, Box,
  Checkbox, Badge, Icon, EmptyState, Modal, ChoiceList, RadioButton, Thumbnail
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon, AlertCircleIcon, CheckCircleIcon, SearchIcon } from "@shopify/polaris-icons";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/lib/prisma.server";

// Extra Question Types
type QuestionType = "text" | "select" | "checkbox" | "textarea";

interface ExtraQuestion {
  id: string;
  type: QuestionType;
  label: string;
  options?: string[]; // For select type
  required?: boolean;
  placeholder?: string;
}

interface TshirtConfig {
  tshirtProductId: string | null;      // Selected T-Shirt product GID
  tshirtProductHandle: string | null;  // Selected T-Shirt product handle
  tshirtProductTitle: string | null;   // Selected T-Shirt product title
  colorVariantOption: string;
  sizeVariantOption: string;
  colorValues: string[];               // Available colors from T-Shirt product
  sizeValues: string[];                // Available sizes from T-Shirt product
  priceAddon: number;
  positions: string[];
}

// Fetch product details from Shopify
const PRODUCT_QUERY = `
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      featuredImage {
        url
        altText
      }
      options {
        id
        name
        values
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            price
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

// Fetch all products for T-Shirt dropdown
const ALL_PRODUCTS_QUERY = `
  query getAllProducts {
    products(first: 100, sortKey: TITLE) {
      edges {
        node {
          id
          title
          handle
          options {
            name
            values
          }
        }
      }
    }
  }
`;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const productId = params.id;

  if (!productId) {
    throw new Response("Product ID required", { status: 400 });
  }

  // Get shop
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  // Fetch product from Shopify
  const productGid = productId.startsWith("gid://") 
    ? productId 
    : `gid://shopify/Product/${productId}`;

  const response = await admin.graphql(PRODUCT_QUERY, {
    variables: { id: productGid },
  });

  const { data } = await response.json();
  const product = data?.product;

  if (!product) {
    throw new Response("Product not found", { status: 404 });
  }

  // Fetch all products for T-Shirt dropdown
  const allProductsResponse = await admin.graphql(ALL_PRODUCTS_QUERY);
  const allProductsData = await allProductsResponse.json();
  
  const allProducts = allProductsData.data?.products?.edges?.map((edge: any) => {
    const p = edge.node;
    const colorOpt = p.options?.find((o: any) => 
      o.name.toLowerCase().includes("color") || o.name.toLowerCase().includes("renk")
    );
    const sizeOpt = p.options?.find((o: any) => 
      o.name.toLowerCase().includes("size") || o.name.toLowerCase().includes("beden")
    );
    return {
      id: p.id,
      title: p.title,
      handle: p.handle,
      hasColorVariant: !!colorOpt,
      hasSizeVariant: !!sizeOpt,
      colorValues: colorOpt?.values || [],
      sizeValues: sizeOpt?.values || [],
    };
  }) || [];

  // Get existing config - using raw query to access all fields
  const config = await prisma.productConfig.findUnique({
    where: {
      shopId_productId: {
        shopId: shop.id,
        productId: productGid,
      },
    },
  }) as any; // Type assertion to access new fields

  // Check for color/size variants
  const colorOption = product.options?.find((o: any) => 
    o.name.toLowerCase().includes("color") || o.name.toLowerCase().includes("renk")
  );
  const sizeOption = product.options?.find((o: any) => 
    o.name.toLowerCase().includes("size") || o.name.toLowerCase().includes("beden")
  );

  return json({
    shop: { domain: shopDomain },
    product: {
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      image: product.featuredImage?.url,
      options: product.options || [],
      hasColorVariant: !!colorOption,
      hasSizeVariant: !!sizeOption,
      colorOptionName: colorOption?.name || null,
      sizeOptionName: sizeOption?.name || null,
      colorValues: colorOption?.values || [],
      sizeValues: sizeOption?.values || [],
    },
    allProducts,
    config: config ? {
      mode: config.mode || "dtf",
      uploadEnabled: config.uploadEnabled ?? true,
      extraQuestions: (config.extraQuestions as ExtraQuestion[]) || [],
      tshirtEnabled: config.tshirtEnabled ?? false,
      tshirtConfig: (config.tshirtConfig as TshirtConfig) || null,
    } : {
      mode: "dtf",
      uploadEnabled: true,
      extraQuestions: [] as ExtraQuestion[],
      tshirtEnabled: false,
      tshirtConfig: null as TshirtConfig | null,
    },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const productId = params.id;

  if (!productId) {
    return json({ error: "Product ID required" }, { status: 400 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const action = formData.get("_action");

  const productGid = productId.startsWith("gid://") 
    ? productId 
    : `gid://shopify/Product/${productId}`;

  if (action === "save") {
    const mode = formData.get("mode") as string || "dtf";
    const uploadEnabled = formData.get("uploadEnabled") === "true";
    const tshirtEnabled = formData.get("tshirtEnabled") === "true";
    const extraQuestionsJson = formData.get("extraQuestions") as string;
    const tshirtConfigJson = formData.get("tshirtConfig") as string;

    let extraQuestions: ExtraQuestion[] = [];
    let tshirtConfig: TshirtConfig | null = null;

    try {
      if (extraQuestionsJson) {
        extraQuestions = JSON.parse(extraQuestionsJson);
      }
      if (tshirtConfigJson) {
        tshirtConfig = JSON.parse(tshirtConfigJson);
      }
    } catch (e) {
      return json({ error: "Invalid JSON data" }, { status: 400 });
    }

    // Upsert config - using raw object to bypass type checking for new fields
    const updateData = {
      mode,
      enabled: uploadEnabled,
      uploadEnabled,
      extraQuestions: extraQuestions as any,
      tshirtEnabled,
      tshirtConfig: tshirtConfig as any,
      updatedAt: new Date(),
    };
    
    const createData = {
      shopId: shop.id,
      productId: productGid,
      mode,
      enabled: uploadEnabled,
      uploadEnabled,
      extraQuestions: extraQuestions as any,
      tshirtEnabled,
      tshirtConfig: tshirtConfig as any,
    };

    await (prisma.productConfig as any).upsert({
      where: {
        shopId_productId: {
          shopId: shop.id,
          productId: productGid,
        },
      },
      update: updateData,
      create: createData,
    });

    return json({ success: true, message: "Configuration saved!" });
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function ProductConfigurePage() {
  const { shop, product, allProducts, config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { success?: boolean; message?: string; error?: string } | null;
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isLoading = navigation.state === "submitting";

  // Form state
  const [mode, setMode] = useState(config.mode);
  const [uploadEnabled, setUploadEnabled] = useState(config.uploadEnabled);
  const [tshirtEnabled, setTshirtEnabled] = useState(config.tshirtEnabled);
  const [extraQuestions, setExtraQuestions] = useState<ExtraQuestion[]>(config.extraQuestions || []);
  const [tshirtConfig, setTshirtConfig] = useState<TshirtConfig>(
    config.tshirtConfig || {
      tshirtProductId: null,
      tshirtProductHandle: null,
      tshirtProductTitle: null,
      colorVariantOption: "Color",
      sizeVariantOption: "Size",
      colorValues: [],
      sizeValues: [],
      priceAddon: 15.00,
      positions: ["front", "back"],
    }
  );

  // Question modal state
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<ExtraQuestion | null>(null);
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>("text");
  const [newQuestionLabel, setNewQuestionLabel] = useState("");
  const [newQuestionOptions, setNewQuestionOptions] = useState("");
  const [newQuestionRequired, setNewQuestionRequired] = useState(false);

  // Add/Edit question
  const handleSaveQuestion = useCallback(() => {
    const questionId = editingQuestion?.id || `q_${Date.now()}`;
    const question: ExtraQuestion = {
      id: questionId,
      type: newQuestionType,
      label: newQuestionLabel,
      required: newQuestionRequired,
    };

    if (newQuestionType === "select" && newQuestionOptions) {
      question.options = newQuestionOptions.split(",").map(o => o.trim()).filter(Boolean);
    }

    if (editingQuestion) {
      setExtraQuestions(prev => prev.map(q => q.id === questionId ? question : q));
    } else {
      setExtraQuestions(prev => [...prev, question]);
    }

    setShowQuestionModal(false);
    resetQuestionForm();
  }, [editingQuestion, newQuestionType, newQuestionLabel, newQuestionOptions, newQuestionRequired]);

  const resetQuestionForm = () => {
    setEditingQuestion(null);
    setNewQuestionType("text");
    setNewQuestionLabel("");
    setNewQuestionOptions("");
    setNewQuestionRequired(false);
  };

  const handleEditQuestion = (question: ExtraQuestion) => {
    setEditingQuestion(question);
    setNewQuestionType(question.type);
    setNewQuestionLabel(question.label);
    setNewQuestionOptions(question.options?.join(", ") || "");
    setNewQuestionRequired(question.required || false);
    setShowQuestionModal(true);
  };

  const handleDeleteQuestion = (id: string) => {
    setExtraQuestions(prev => prev.filter(q => q.id !== id));
  };

  return (
    <Page
      backAction={{ content: "Products", onAction: () => navigate("/app/products") }}
      title={`Configure: ${product.title}`}
      subtitle={`Product ID: ${product.id.split("/").pop()}`}
      primaryAction={{
        content: "Save Configuration",
        loading: isLoading,
        onAction: () => {
          const form = document.getElementById("config-form") as HTMLFormElement;
          form?.requestSubmit();
        },
      }}
    >
      <Layout>
        {/* Success/Error Banner */}
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" title="Configuration saved successfully!" />
          </Layout.Section>
        )}
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" title={actionData.error} />
          </Layout.Section>
        )}

        {/* Product Info */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" align="start">
                {product.image && (
                  <img 
                    src={product.image} 
                    alt={product.title}
                    style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }}
                  />
                )}
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">{product.title}</Text>
                  <Text as="p" tone="subdued">Handle: {product.handle}</Text>
                  <Badge tone={product.status === "ACTIVE" ? "success" : "warning"}>
                    {product.status}
                  </Badge>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Form method="post" id="config-form">
          <input type="hidden" name="_action" value="save" />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="uploadEnabled" value={uploadEnabled.toString()} />
          <input type="hidden" name="tshirtEnabled" value={tshirtEnabled.toString()} />
          <input type="hidden" name="extraQuestions" value={JSON.stringify(extraQuestions)} />
          <input type="hidden" name="tshirtConfig" value={JSON.stringify(tshirtConfig)} />

          {/* Mode Selection */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">🎨 Upload Mode</Text>
                <Text as="p" tone="subdued">
                  Select the upload mode for this product. Each mode has different features and customer experience.
                </Text>
                
                <BlockStack gap="200">
                  <RadioButton
                    label="DTF Transfer"
                    helpText="Customers upload their design for DTF (Direct to Film) transfer printing. Includes optional T-Shirt add-on."
                    checked={mode === "dtf"}
                    id="mode-dtf"
                    name="mode-radio"
                    onChange={() => setMode("dtf")}
                  />
                  <RadioButton
                    label="Mode 2 (Coming Soon)"
                    helpText="Second mode will be available soon."
                    checked={mode === "mode2"}
                    id="mode-mode2"
                    name="mode-radio"
                    disabled
                    onChange={() => {}}
                  />
                </BlockStack>

                <Divider />

                <Checkbox
                  label="Enable upload widget for this product"
                  helpText="When enabled, customers can upload their designs on the product page"
                  checked={uploadEnabled}
                  onChange={setUploadEnabled}
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Extra Questions */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">❓ Extra Questions</Text>
                  <Button 
                    icon={PlusIcon} 
                    onClick={() => {
                      resetQuestionForm();
                      setShowQuestionModal(true);
                    }}
                  >
                    Add Question
                  </Button>
                </InlineStack>
                
                <Text as="p" tone="subdued">
                  Add custom questions for customers to answer when uploading their design
                </Text>

                {extraQuestions.length === 0 ? (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                    <Text as="p" tone="subdued" alignment="center">
                      No extra questions configured. Click "Add Question" to create one.
                    </Text>
                  </Box>
                ) : (
                  <BlockStack gap="300">
                    {extraQuestions.map((q, index) => (
                      <Box key={q.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                        <InlineStack align="space-between">
                          <BlockStack gap="100">
                            <InlineStack gap="200">
                              <Badge>{q.type}</Badge>
                              {q.required && <Badge tone="attention">Required</Badge>}
                            </InlineStack>
                            <Text as="p" fontWeight="semibold">{q.label}</Text>
                            {q.options && (
                              <Text as="p" tone="subdued">
                                Options: {q.options.join(", ")}
                              </Text>
                            )}
                          </BlockStack>
                          <InlineStack gap="200">
                            <Button size="slim" onClick={() => handleEditQuestion(q)}>Edit</Button>
                            <Button size="slim" tone="critical" onClick={() => handleDeleteQuestion(q.id)}>
                              Delete
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </Box>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* T-Shirt Option */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">👕 T-Shirt Add-on</Text>
                
                <Checkbox
                  label='Show "I want this on a T-Shirt too!" button'
                  helpText="Allows customers to add their design to a T-Shirt in addition to the DTF transfer"
                  checked={tshirtEnabled}
                  onChange={setTshirtEnabled}
                />

                {tshirtEnabled && (
                  <>
                    <Divider />
                    
                    {/* T-Shirt Product Selection */}
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingSm">🎯 Select T-Shirt Product</Text>
                      <Text as="p" tone="subdued">
                        Choose the T-Shirt product that will be added to cart when customer clicks "I want this on a T-Shirt too!"
                      </Text>
                      
                      <Select
                        label="T-Shirt Product"
                        options={[
                          { label: '-- Select a product --', value: '' },
                          ...allProducts.map((p: any) => ({
                            label: `${p.title} ${!p.hasColorVariant || !p.hasSizeVariant ? '⚠️' : '✅'}`,
                            value: p.id,
                          }))
                        ]}
                        value={tshirtConfig.tshirtProductId || ''}
                        onChange={(selectedId) => {
                          const selectedProduct = allProducts.find((p: any) => p.id === selectedId);
                          if (selectedProduct) {
                            setTshirtConfig(prev => ({
                              ...prev,
                              tshirtProductId: selectedProduct.id,
                              tshirtProductHandle: selectedProduct.handle,
                              tshirtProductTitle: selectedProduct.title,
                              colorValues: selectedProduct.colorValues || [],
                              sizeValues: selectedProduct.sizeValues || [],
                            }));
                          } else {
                            setTshirtConfig(prev => ({
                              ...prev,
                              tshirtProductId: null,
                              tshirtProductHandle: null,
                              tshirtProductTitle: null,
                              colorValues: [],
                              sizeValues: [],
                            }));
                          }
                        }}
                        helpText="Products with ✅ have Color and Size variants. Products with ⚠️ are missing variants."
                      />
                      
                      {tshirtConfig.tshirtProductId && (
                        <Banner tone="success">
                          <p>✅ Selected: <strong>{tshirtConfig.tshirtProductTitle}</strong></p>
                        </Banner>
                      )}
                    </BlockStack>

                    {/* Variant Status */}
                    {tshirtConfig.tshirtProductId && (
                      <>
                        <Divider />
                        
                        <BlockStack gap="300">
                          <Text as="h3" variant="headingSm">Variant Status</Text>
                          
                          <InlineStack gap="400">
                            <Box>
                              <InlineStack gap="200">
                                <Icon source={tshirtConfig.colorValues?.length > 0 ? CheckCircleIcon : AlertCircleIcon} />
                                <Text as="span">
                                  Color Variants: {tshirtConfig.colorValues?.length > 0 ? (
                                    <Badge tone="success">{`${tshirtConfig.colorValues.length} colors`}</Badge>
                                  ) : (
                                    <Badge tone="critical">Not found</Badge>
                                  )}
                                </Text>
                              </InlineStack>
                            </Box>
                            
                            <Box>
                              <InlineStack gap="200">
                                <Icon source={tshirtConfig.sizeValues?.length > 0 ? CheckCircleIcon : AlertCircleIcon} />
                                <Text as="span">
                                  Size Variants: {tshirtConfig.sizeValues?.length > 0 ? (
                                    <Badge tone="success">{`${tshirtConfig.sizeValues.length} sizes`}</Badge>
                                  ) : (
                                    <Badge tone="critical">Not found</Badge>
                                  )}
                                </Text>
                              </InlineStack>
                            </Box>
                          </InlineStack>

                          {(!tshirtConfig.colorValues?.length || !tshirtConfig.sizeValues?.length) && (
                            <Banner tone="critical">
                              <p>
                                ❌ The selected product is missing required variants.
                                T-Shirt product must have both Color and Size options.
                                Please add variants in Shopify Admin → Products → {tshirtConfig.tshirtProductTitle} → Variants
                              </p>
                            </Banner>
                          )}
                          
                          {tshirtConfig.colorValues?.length > 0 && tshirtConfig.sizeValues?.length > 0 && (
                            <Banner tone="success">
                              <p>
                                ✅ Product is properly configured! Colors: {tshirtConfig.colorValues.join(', ')} | Sizes: {tshirtConfig.sizeValues.join(', ')}
                              </p>
                            </Banner>
                          )}
                        </BlockStack>
                      </>
                    )}

                    <Divider />

                    {/* T-Shirt Config */}
                    <FormLayout>
                      <FormLayout.Group>
                        <TextField
                          label="Color Option Name"
                          value={tshirtConfig.colorVariantOption}
                          onChange={(val) => setTshirtConfig(prev => ({ ...prev, colorVariantOption: val }))}
                          helpText="The Shopify option name for T-Shirt color"
                          autoComplete="off"
                        />
                        <TextField
                          label="Size Option Name"
                          value={tshirtConfig.sizeVariantOption}
                          onChange={(val) => setTshirtConfig(prev => ({ ...prev, sizeVariantOption: val }))}
                          helpText="The Shopify option name for T-Shirt size"
                          autoComplete="off"
                        />
                      </FormLayout.Group>

                      <TextField
                        label="Additional Price"
                        type="number"
                        value={tshirtConfig.priceAddon.toString()}
                        onChange={(val) => setTshirtConfig(prev => ({ ...prev, priceAddon: parseFloat(val) || 0 }))}
                        prefix="$"
                        helpText="Extra charge for adding T-Shirt to the order"
                        autoComplete="off"
                      />

                      <ChoiceList
                        title="Available Print Positions"
                        allowMultiple
                        choices={[
                          { label: "Front", value: "front" },
                          { label: "Back", value: "back" },
                          { label: "Left Sleeve", value: "left_sleeve" },
                          { label: "Right Sleeve", value: "right_sleeve" },
                        ]}
                        selected={tshirtConfig.positions}
                        onChange={(selected) => setTshirtConfig(prev => ({ ...prev, positions: selected }))}
                      />
                    </FormLayout>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Form>

        {/* Snippet Instructions */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">🔧 Theme Integration</Text>
              <Text as="p">
                Add this snippet to your product template to display the upload widget:
              </Text>
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <pre style={{ margin: 0, fontFamily: "monospace", fontSize: 13 }}>
{`{% render 'dtf-uploader', product: product %}`}
                </pre>
              </Box>
              <Text as="p" tone="subdued">
                Place this code in your product template (e.g., sections/main-product.liquid) 
                where you want the upload widget to appear.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Question Modal */}
      <Modal
        open={showQuestionModal}
        onClose={() => setShowQuestionModal(false)}
        title={editingQuestion ? "Edit Question" : "Add Question"}
        primaryAction={{
          content: "Save",
          onAction: handleSaveQuestion,
          disabled: !newQuestionLabel,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setShowQuestionModal(false) },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <Select
              label="Question Type"
              options={[
                { label: "Text Input", value: "text" },
                { label: "Dropdown Select", value: "select" },
                { label: "Checkbox", value: "checkbox" },
                { label: "Text Area", value: "textarea" },
              ]}
              value={newQuestionType}
              onChange={(val) => setNewQuestionType(val as QuestionType)}
            />

            <TextField
              label="Question Label"
              value={newQuestionLabel}
              onChange={setNewQuestionLabel}
              placeholder="e.g., Print Direction"
              autoComplete="off"
            />

            {newQuestionType === "select" && (
              <TextField
                label="Options (comma-separated)"
                value={newQuestionOptions}
                onChange={setNewQuestionOptions}
                placeholder="e.g., Left, Center, Right"
                helpText="Enter options separated by commas"
                autoComplete="off"
              />
            )}

            <Checkbox
              label="Required field"
              checked={newQuestionRequired}
              onChange={setNewQuestionRequired}
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
