import '@shopify/ui-extensions/preact';
import { render } from 'preact';

/**
 * Simple test - just show text to confirm extension loads
 */
export default function extension() {
  console.log('[UL-Checkout] Extension function called!');
  render(<TestDisplay />, document.body);
}

function TestDisplay() {
  console.log('[UL-Checkout] TestDisplay rendering');
  
  // Just show a simple text to confirm it works
  return (
    <s-text size="small" appearance="accent">
      ✅ Checkout Extension Active
    </s-text>
  );
}
