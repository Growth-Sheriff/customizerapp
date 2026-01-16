import '@shopify/ui-extensions/preact';
import { render } from 'preact';

/**
 * Upload Design Display - Checkout Line Item Extension
 * Shows upload info (thumbnail, filename, link) under each cart line item
 * that has _ul_upload_id property
 */
export default async () => {
  render(<UploadDisplay />, document.body);
};

function UploadDisplay() {
  // Get the current cart line item from the target
  const target = shopify.extension.target;
  const cartLine = shopify.target?.value;
  
  // Check if this line item has upload properties
  const attributes = cartLine?.attributes || [];
  
  // Find upload-related attributes
  const uploadId = findAttribute(attributes, '_ul_upload_id');
  const uploadUrl = findAttribute(attributes, '_ul_upload_url');
  const thumbnail = findAttribute(attributes, '_ul_thumbnail');
  const fileName = findAttribute(attributes, '_ul_file_name') || 
                   findAttribute(attributes, '_ul_design_file') || 
                   'Custom Design';
  const designType = findAttribute(attributes, '_ul_design_type') || 'dtf';
  
  // If no upload ID, don't render anything
  if (!uploadId) {
    return null;
  }
  
  // Determine the display URL (prefer thumbnail, fallback to upload URL)
  const displayUrl = thumbnail || uploadUrl;
  const linkUrl = uploadUrl || thumbnail;
  
  return (
    <s-stack direction="block" gap="tight">
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
            <s-text size="small" type="emphasis">
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
            <s-link
              href={linkUrl}
              target="_blank"
              external
            >
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
