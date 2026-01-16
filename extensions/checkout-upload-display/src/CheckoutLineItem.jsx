import '@shopify/ui-extensions/preact';
import { render } from 'preact';

/**
 * Upload Design Display - Checkout Line Item Extension
 * Shows upload info (thumbnail, filename, link) under each cart line item
 * that has _ul_upload_id property
 * 
 * Based on Shopify docs: shopify.target.value contains the cart line
 */
export default function extension() {
  render(<UploadDisplay />, document.body);
}

function UploadDisplay() {
  // shopify.target.value contains the cart line for cart-line-item targets
  const cartLine = shopify.target?.value;
  
  // Debug logging - check browser console
  console.log('[Upload Display] Extension mounted');
  console.log('[Upload Display] Target:', shopify.extension?.target);
  console.log('[Upload Display] Cart line:', cartLine);
  
  if (!cartLine) {
    console.log('[Upload Display] No cart line available');
    return <s-text size="extraSmall" appearance="subdued">[Debug: No cart line]</s-text>;
  }
  
  // Get attributes from cart line
  const attributes = cartLine.attributes || [];
  console.log('[Upload Display] Attributes:', attributes);
  console.log('[Upload Display] Merchandise:', cartLine.merchandise?.title);
  
  // Find upload-related attributes
  const uploadId = findAttribute(attributes, '_ul_upload_id');
  const uploadUrl = findAttribute(attributes, '_ul_upload_url');
  const thumbnail = findAttribute(attributes, '_ul_thumbnail');
  const fileName = findAttribute(attributes, '_ul_file_name') || 
                   findAttribute(attributes, '_ul_design_file') || 
                   'Custom Design';
  const designType = findAttribute(attributes, '_ul_design_type') || 'dtf';
  
  console.log('[Upload Display] Upload ID:', uploadId);
  console.log('[Upload Display] All attr keys:', attributes.map(a => a.key));
  
  // If no upload ID, show debug info temporarily
  if (!uploadId) {
    // During testing, show that extension is running
    return (
      <s-text size="extraSmall" appearance="subdued">
        [Debug: {attributes.length} attrs, no _ul_upload_id]
      </s-text>
    );
  }
  
  // Determine URLs
  const displayUrl = thumbnail || uploadUrl;
  const linkUrl = uploadUrl || thumbnail;
  
  console.log('[Upload Display] Rendering for upload:', uploadId);
  
  return (
    <s-stack direction="block" gap="tight" padding="tight">
      <s-divider />
      <s-stack direction="inline" gap="base" padding="tight" cornerRadius="base">
        {/* Thumbnail */}
        {displayUrl && (
          <s-image
            src={displayUrl}
            alt="Design preview"
            size="thumbnail"
            cornerRadius="base"
            border="base"
          />
        )}
        
        {/* Info */}
        <s-stack direction="block" gap="extraTight">
          <s-stack direction="inline" gap="extraTight" inlineAlignment="start">
            <s-icon name="file" size="small" />
            <s-text size="small" emphasis="bold">
              {truncateFileName(fileName, 25)}
            </s-text>
          </s-stack>
          
          <s-stack direction="inline" gap="extraTight" inlineAlignment="start">
            <s-icon name="checkCircle" size="extraSmall" />
            <s-text size="extraSmall" appearance="subdued">
              Custom Design Attached
            </s-text>
          </s-stack>
          
          {/* View Design Link */}
          {linkUrl && (
            <s-link href={linkUrl} external>
              <s-stack direction="inline" gap="extraTight" inlineAlignment="start">
                <s-text size="small" appearance="accent">
                  View Design
                </s-text>
                <s-icon name="external" size="extraSmall" />
              </s-stack>
            </s-link>
          )}
        </s-stack>
        
        {/* Badge */}
        <s-badge tone="info" size="small">
          {designType.toUpperCase()}
        </s-badge>
      </s-stack>
    </s-stack>
  );
}

/**
 * Find attribute value by key
 */
function findAttribute(attributes, key) {
  if (!attributes || !Array.isArray(attributes)) return null;
  const attr = attributes.find(a => a.key === key);
  return attr?.value || null;
}

/**
 * Truncate filename for display
 */
function truncateFileName(name, maxLength) {
  if (!name) return 'Custom Design';
  if (name.length <= maxLength) return name;
  
  const ext = name.split('.').pop();
  const baseName = name.substring(0, name.length - ext.length - 1);
  const truncatedBase = baseName.substring(0, maxLength - ext.length - 4);
  
  return `${truncatedBase}...${ext}`;
}
