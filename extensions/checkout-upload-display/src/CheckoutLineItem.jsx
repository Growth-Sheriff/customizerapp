import '@shopify/ui-extensions/preact';
import { render } from 'preact';

/**
 * Upload Design Display - Static Cart Line Item Extension
 * Target: purchase.checkout.cart-line-item.render-after
 * 
 * This renders AFTER each cart line item, under the line item properties.
 * Uses shopify.target.value to get the current line item this extension is attached to.
 * Does NOT require Shopify Plus!
 */
export default function extension() {
  console.log('[UL-Checkout] Static line item extension starting...');
  render(<UploadLineDisplay />, document.body);
}

function UploadLineDisplay() {
  // For static cart-line-item targets, shopify.target.value is the current CartLine
  const line = shopify.target?.value;
  
  console.log('[UL-Checkout] Line item extension mounted');
  console.log('[UL-Checkout] Target line:', line?.id, line?.merchandise?.title);
  
  if (!line) {
    console.log('[UL-Checkout] No line available');
    return null;
  }
  
  // Check if this line has upload data
  const attrs = line.attributes || [];
  console.log('[UL-Checkout] Line attributes:', JSON.stringify(attrs));
  
  const uploadId = findAttr(attrs, '_ul_upload_id');
  
  // Only render if this line has an upload
  if (!uploadId) {
    console.log('[UL-Checkout] No upload on this line item');
    return null; // Nothing to show - no upload on this item
  }
  
  // Get upload details
  const uploadUrl = findAttr(attrs, '_ul_upload_url');
  const thumbnail = findAttr(attrs, '_ul_thumbnail');
  const fileName = findAttr(attrs, '_ul_file_name') || 'Custom Design';
  const designType = findAttr(attrs, '_ul_design_type') || 'DTF';
  
  const imageUrl = thumbnail || uploadUrl;
  const linkUrl = uploadUrl || thumbnail;
  
  console.log('[UL-Checkout] Rendering upload info:', { uploadId, fileName, designType });
  
  // Render upload info under this line item
  return (
    <s-stack direction="block" gap="tight" padding="tight">
      <s-stack direction="inline" gap="tight" blockAlignment="center">
        {imageUrl && (
          <s-image
            source={imageUrl}
            alt="Design preview"
            aspectRatio={1}
            fit="cover"
          />
        )}
        <s-stack direction="block" gap="extraTight">
          <s-text size="small" emphasis="bold">
            🎨 {fileName}
          </s-text>
          <s-text size="extraSmall" appearance="subdued">
            Type: {designType.toUpperCase()}
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
