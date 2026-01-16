import '@shopify/ui-extensions/preact';
import { render } from 'preact';

/**
 * Upload Design Display - Checkout Line Item Extension
 * Shows upload info under cart line items with _ul_upload_id
 */
export default function extension() {
  render(<UploadDisplay />, document.body);
}

function UploadDisplay() {
  // Always show something to confirm extension is running
  const target = shopify.extension?.target || 'unknown';
  const cartLine = shopify.target?.value;
  
  // Log to console
  console.log('[UL-Checkout] Running on target:', target);
  console.log('[UL-Checkout] Cart line:', cartLine);
  
  // If no cart line, show debug
  if (!cartLine) {
    return (
      <s-text size="extraSmall" appearance="subdued">
        📦 Extension active (no line data)
      </s-text>
    );
  }
  
  const attributes = cartLine.attributes || [];
  const productTitle = cartLine.merchandise?.title || 'Product';
  
  console.log('[UL-Checkout] Product:', productTitle);
  console.log('[UL-Checkout] Attributes count:', attributes.length);
  console.log('[UL-Checkout] Attributes:', JSON.stringify(attributes));
  
  // Find upload attributes
  const uploadId = findAttr(attributes, '_ul_upload_id');
  const uploadUrl = findAttr(attributes, '_ul_upload_url');
  const thumbnail = findAttr(attributes, '_ul_thumbnail');
  const fileName = findAttr(attributes, '_ul_file_name') || 'Custom Design';
  const designType = findAttr(attributes, '_ul_design_type') || 'DTF';
  
  // No upload? Show debug info
  if (!uploadId) {
    const attrKeys = attributes.map(a => a.key).join(', ');
    return (
      <s-text size="extraSmall" appearance="subdued">
        🔍 {attributes.length} attrs: {attrKeys || 'none'}
      </s-text>
    );
  }
  
  // Has upload - show full display
  const imageUrl = thumbnail || uploadUrl;
  const linkUrl = uploadUrl || thumbnail;
  
  return (
    <s-stack direction="block" gap="tight" padding="tight">
      <s-divider />
      <s-stack direction="inline" gap="base" blockAlignment="center">
        {imageUrl && (
          <s-image
            source={imageUrl}
            alt="Design"
            aspectRatio={1}
            cornerRadius="base"
            fit="cover"
          />
        )}
        <s-stack direction="block" gap="extraTight">
          <s-text size="small" emphasis="bold">
            🎨 {truncate(fileName, 20)}
          </s-text>
          <s-text size="extraSmall" appearance="subdued">
            Custom Design • {designType.toUpperCase()}
          </s-text>
          {linkUrl && (
            <s-link to={linkUrl} external>
              View Design ↗
            </s-link>
          )}
        </s-stack>
      </s-stack>
    </s-stack>
  );
}

function findAttr(attrs, key) {
  if (!attrs || !Array.isArray(attrs)) return null;
  const found = attrs.find(a => a.key === key);
  return found?.value || null;
}

function truncate(str, max) {
  if (!str) return 'Design';
  return str.length > max ? str.slice(0, max) + '...' : str;
}
