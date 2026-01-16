import '@shopify/ui-extensions/preact';
import { render } from 'preact';

/**
 * Upload Design Display - Block Extension
 * Shows upload info for all cart lines with _ul_upload_id
 */
export default function extension() {
  console.log('[UL-Checkout] Extension starting...');
  render(<UploadDisplay />, document.body);
}

function UploadDisplay() {
  // For block targets, use shopify.lines to get all cart lines
  const lines = shopify.lines?.value || [];
  
  console.log('[UL-Checkout] Block extension mounted');
  console.log('[UL-Checkout] Lines count:', lines.length);
  console.log('[UL-Checkout] Lines:', JSON.stringify(lines.map(l => ({
    id: l.id,
    title: l.merchandise?.title,
    attrs: l.attributes?.length
  }))));
  
  // Filter lines that have upload data
  const uploadLines = lines.filter(line => {
    const attrs = line.attributes || [];
    return attrs.some(a => a.key === '_ul_upload_id');
  });
  
  console.log('[UL-Checkout] Upload lines found:', uploadLines.length);
  
  // If no uploads, show debug or nothing
  if (uploadLines.length === 0) {
    // Debug mode - show that extension is running
    return (
      <s-banner tone="info">
        <s-text>✅ Upload Extension Active - {lines.length} items in cart (no uploads detected)</s-text>
      </s-banner>
    );
  }
  
  // Show upload info for each line with upload
  return (
    <s-stack direction="block" gap="base">
      <s-heading level="3">📎 Uploaded Designs</s-heading>
      {uploadLines.map(line => (
        <UploadLineItem key={line.id} line={line} />
      ))}
    </s-stack>
  );
}

function UploadLineItem({ line }) {
  const attrs = line.attributes || [];
  const uploadId = findAttr(attrs, '_ul_upload_id');
  const uploadUrl = findAttr(attrs, '_ul_upload_url');
  const thumbnail = findAttr(attrs, '_ul_thumbnail');
  const fileName = findAttr(attrs, '_ul_file_name') || 'Custom Design';
  const designType = findAttr(attrs, '_ul_design_type') || 'DTF';
  
  const imageUrl = thumbnail || uploadUrl;
  const linkUrl = uploadUrl || thumbnail;
  const productTitle = line.merchandise?.title || 'Product';
  
  return (
    <s-card padding="base">
      <s-stack direction="inline" gap="base" blockAlignment="center">
        {imageUrl && (
          <s-image
            source={imageUrl}
            alt="Design preview"
            aspectRatio={1}
            fit="cover"
          />
        )}
        <s-stack direction="block" gap="extraTight">
          <s-text size="small" emphasis="bold">{productTitle}</s-text>
          <s-text size="extraSmall" appearance="subdued">
            🎨 {fileName} • {designType.toUpperCase()}
          </s-text>
          {linkUrl && (
            <s-link to={linkUrl} external>
              View Design ↗
            </s-link>
          )}
        </s-stack>
      </s-stack>
    </s-card>
  );
}

function findAttr(attrs, key) {
  if (!attrs || !Array.isArray(attrs)) return null;
  const found = attrs.find(a => a.key === key);
  return found?.value || null;
}
