/**
 * Upload Lift - Cart Upload Display
 * Shows uploaded design info under cart line items
 * Auto-injects into cart page without theme modification
 */
(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    propertyKey: '_ul_upload_id',
    designFileKey: '_ul_design_file',
    pollInterval: 500,
    maxRetries: 20,
    apiBase: '/apps/customizer'
  };

  // Styles for the upload info display
  const STYLES = `
    .ul-cart-upload-info {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
      padding: 10px 12px;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border: 1px solid #bae6fd;
      border-radius: 8px;
      font-size: 13px;
    }
    .ul-cart-upload-info.processing {
      background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);
      border-color: #fde047;
    }
    .ul-cart-upload-info.error {
      background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
      border-color: #fca5a5;
    }
    .ul-cart-upload-icon {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      object-fit: cover;
      border: 1px solid rgba(0,0,0,0.1);
      flex-shrink: 0;
    }
    .ul-cart-upload-icon.placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e5e7eb;
      color: #6b7280;
    }
    .ul-cart-upload-details {
      flex: 1;
      min-width: 0;
    }
    .ul-cart-upload-filename {
      font-weight: 600;
      color: #1e40af;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }
    .ul-cart-upload-status {
      font-size: 11px;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 2px;
    }
    .ul-cart-upload-status .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22c55e;
    }
    .ul-cart-upload-status .dot.processing {
      background: #eab308;
      animation: pulse 1.5s infinite;
    }
    .ul-cart-upload-status .dot.error {
      background: #ef4444;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .ul-cart-upload-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: #dbeafe;
      color: #1e40af;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
  `;

  // Inject styles
  function injectStyles() {
    if (document.getElementById('ul-cart-upload-styles')) return;
    const style = document.createElement('style');
    style.id = 'ul-cart-upload-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // Get cart data from Shopify
  async function getCartData() {
    try {
      const response = await fetch('/cart.js');
      if (!response.ok) throw new Error('Failed to fetch cart');
      return await response.json();
    } catch (error) {
      console.error('[Upload Lift Cart] Failed to get cart:', error);
      return null;
    }
  }

  // Get upload status from API
  async function getUploadStatus(uploadId, shopDomain) {
    try {
      const response = await fetch(`${CONFIG.apiBase}/api/upload/status/${uploadId}?shopDomain=${shopDomain}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('[Upload Lift Cart] Failed to get upload status:', error);
      return null;
    }
  }

  // Create upload info element
  function createUploadInfoElement(item, uploadId, designFile, thumbnail) {
    const div = document.createElement('div');
    div.className = 'ul-cart-upload-info';
    div.dataset.uploadId = uploadId;
    
    const fileName = designFile || 'Custom Design';
    const shortName = fileName.length > 25 ? fileName.substring(0, 22) + '...' : fileName;
    
    // Use thumbnail if available
    const iconHtml = thumbnail 
      ? `<img class="ul-cart-upload-icon" src="${thumbnail}" alt="Design preview" onerror="this.style.display='none'">`
      : `<div class="ul-cart-upload-icon placeholder">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>`;
    
    div.innerHTML = `
      ${iconHtml}
      <div class="ul-cart-upload-details">
        <span class="ul-cart-upload-filename" title="${fileName}">${shortName}</span>
        <div class="ul-cart-upload-status">
          <span class="dot"></span>
          <span class="status-text">Design attached</span>
        </div>
      </div>
      <span class="ul-cart-upload-badge">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Custom
      </span>
    `;
    
    return div;
  }

  // Update upload info with status
  async function updateUploadInfo(element, uploadId) {
    const shopDomain = window.Shopify?.shop || document.querySelector('meta[name="shopify-domain"]')?.content;
    
    if (!shopDomain) {
      updateStatusDisplay(element, 'ready', 'Design attached');
      return;
    }

    const status = await getUploadStatus(uploadId, shopDomain);
    
    if (status) {
      const statusText = getStatusText(status.status);
      const statusClass = getStatusClass(status.status);
      updateStatusDisplay(element, statusClass, statusText);
      
      // Update thumbnail if available
      if (status.thumbnailUrl || status.previewUrl) {
        const iconEl = element.querySelector('.ul-cart-upload-icon');
        if (iconEl) {
          const img = document.createElement('img');
          img.className = 'ul-cart-upload-icon';
          img.src = status.thumbnailUrl || status.previewUrl;
          img.alt = 'Design preview';
          img.onerror = () => { img.style.display = 'none'; };
          iconEl.replaceWith(img);
        }
      }
    } else {
      updateStatusDisplay(element, 'ready', 'Design attached');
    }
  }

  function getStatusText(status) {
    const texts = {
      'pending': 'Processing...',
      'processing': 'Analyzing...',
      'ready': 'Ready for print',
      'completed': 'Ready for print',
      'approved': 'Approved',
      'blocked': 'Issue detected',
      'error': 'Upload error'
    };
    return texts[status] || 'Design attached';
  }

  function getStatusClass(status) {
    if (['pending', 'processing'].includes(status)) return 'processing';
    if (['blocked', 'error'].includes(status)) return 'error';
    return 'ready';
  }

  function updateStatusDisplay(element, statusClass, statusText) {
    const dot = element.querySelector('.dot');
    const text = element.querySelector('.status-text');
    
    if (dot) {
      dot.className = 'dot ' + statusClass;
    }
    if (text) {
      text.textContent = statusText;
    }
    
    element.classList.remove('processing', 'error');
    if (statusClass !== 'ready') {
      element.classList.add(statusClass);
    }
  }

  // Find cart line item containers
  function findCartLineItems() {
    // Common selectors for various Shopify themes
    const selectors = [
      // Dawn theme
      'cart-items .cart-item',
      '.cart-items .cart-item',
      '[data-cart-item]',
      // Debut theme
      '.cart__row',
      '.cart-item',
      // Brooklyn theme
      '.ajaxcart__product',
      // Minimal theme
      '.cart__product',
      // Generic
      '[data-line-item]',
      '.line-item',
      'tr.cart-item',
      'tr[data-cart-item]',
      // Table based
      '.cart-drawer__item',
      '.cart-notification-product',
      // AJAX carts
      '.cart-drawer-item',
      '[data-cart-item-key]',
      // More themes - Prestige, Impulse, etc.
      '.cart-item-row',
      '.cart__item',
      '.cart-products .product',
      '.cart-product',
      // Turbo theme
      '.cart__card',
      '.cart-template__item',
      // Empire theme
      '.cart__row--product',
      // Warehouse theme  
      '.line-item--product',
      // Craft theme
      '.cart-item__wrapper',
      // Sense theme
      '.cart-item--product',
      // Supply theme
      '.cart__product-information',
      // Theme.co themes
      '.x-cart-item',
      // Flex theme
      '.cart-item-container',
      // Pipeline theme
      '.cart__product-item',
      // Narrative theme
      '.cart-item-block',
      // Express theme
      '.cart-drawer__item--product',
      // Motion theme
      '.cart__item-row',
      // Streamline theme
      '.cart__line-item',
      // Venue theme
      '.cart-item__container',
      // Studio theme
      '.cart-drawer-item__content',
      // Colorblock theme
      '.cart-item--full',
      // Taste theme
      '.cart-page__item',
      // Crave theme
      '.cart__line-product',
      // Be Yours theme
      '.cart-items__item'
    ];

    for (const selector of selectors) {
      const items = document.querySelectorAll(selector);
      if (items.length > 0) {
        console.log('[Upload Lift Cart] Found items with selector:', selector, 'Count:', items.length);
        return items;
      }
    }
    
    // Fallback: Try to find any element that looks like a cart item
    const fallbackItems = findCartItemsFallback();
    if (fallbackItems.length > 0) {
      console.log('[Upload Lift Cart] Found items via fallback. Count:', fallbackItems.length);
      return fallbackItems;
    }
    
    return [];
  }
  
  // Fallback method to find cart items by analyzing DOM structure
  function findCartItemsFallback() {
    // Look for elements with product images inside cart-related containers
    const cartContainers = document.querySelectorAll(
      '[class*="cart"], [id*="cart"], [data-section-type="cart"], cart-items, .cart, #cart, #CartContainer'
    );
    
    for (const container of cartContainers) {
      // Find elements that contain product images and look like line items
      const potentialItems = container.querySelectorAll(
        'tr:has(img), li:has(img), div:has(img[src*="cdn.shopify"])'
      );
      
      if (potentialItems.length > 0) {
        // Filter to only include direct product containers (not nested)
        const items = Array.from(potentialItems).filter(item => {
          // Must have a product image
          const hasProductImage = item.querySelector('img[src*="cdn.shopify"]');
          // Should not be too nested
          const depth = getCartContainerDepth(item, container);
          return hasProductImage && depth < 5;
        });
        
        if (items.length > 0) {
          return items;
        }
      }
    }
    
    return [];
  }
  
  function getCartContainerDepth(element, container) {
    let depth = 0;
    let current = element;
    while (current && current !== container) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }

  // Find the element to append upload info to within a line item
  function findAppendTarget(lineItem) {
    // Try to find product details area
    const selectors = [
      '.cart-item__details',
      '.cart__product-information',
      '.cart-item__content',
      '.ajaxcart__product-meta',
      '.cart__meta',
      '.product-details',
      '.line-item__content',
      'td.cart__meta',
      '.cart-item-details',
      // More themes
      '.cart-item__info',
      '.cart-product__info',
      '.cart__item-details',
      '.cart-item__content-wrapper',
      '.product-info',
      '.item-details',
      '.cart__product-details',
      '.line-item-details',
      '.cart-drawer__item-content',
      '.cart-item__text',
      '.cart__item-content',
      // Fallback to any element with "detail" or "info" in class
      '[class*="detail"]',
      '[class*="info"]:not(img):not(svg)'
    ];

    for (const selector of selectors) {
      const target = lineItem.querySelector(selector);
      if (target && target.offsetParent !== null) return target;
    }
    
    // Fallback: append to line item itself
    return lineItem;
  }

  // Get line item key/id from element
  function getLineItemKey(lineItem) {
    // Try various data attributes for key
    const key = lineItem.dataset.lineItemKey || 
           lineItem.dataset.cartItemKey ||
           lineItem.dataset.key ||
           lineItem.dataset.id ||
           lineItem.getAttribute('data-line-item-key') ||
           lineItem.getAttribute('data-cart-item-key') ||
           lineItem.getAttribute('data-key') ||
           lineItem.getAttribute('data-id') ||
           lineItem.querySelector('[data-line-item-key]')?.dataset.lineItemKey ||
           lineItem.querySelector('[data-key]')?.dataset.key ||
           lineItem.querySelector('[data-cart-item-key]')?.dataset.cartItemKey ||
           lineItem.querySelector('input[name*="key"]')?.value ||
           lineItem.querySelector('a[href*="/cart/change?"]')?.href?.match(/id=([^&]+)/)?.[1] ||
           null;
    
    if (key) {
      console.log('[Upload Lift Cart] Found key for line item:', key);
    }
    return key;
  }

  // Get variant ID from line item element
  function getLineItemVariantId(lineItem) {
    return lineItem.dataset.variantId || 
           lineItem.dataset.variant ||
           lineItem.getAttribute('data-variant-id') ||
           lineItem.getAttribute('data-variant') ||
           lineItem.querySelector('[data-variant-id]')?.dataset.variantId ||
           lineItem.querySelector('[data-variant]')?.dataset.variant ||
           lineItem.querySelector('input[name*="id"]')?.value ||
           lineItem.querySelector('a[href*="variant="]')?.href?.match(/variant=(\d+)/)?.[1] ||
           // Try to extract from product link
           extractVariantFromLinks(lineItem) ||
           null;
  }

  function extractVariantFromLinks(lineItem) {
    const links = lineItem.querySelectorAll('a[href*="/products/"]');
    for (const link of links) {
      const match = link.href.match(/variant=(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  // Main function to process cart
  async function processCart() {
    const cart = await getCartData();
    if (!cart || !cart.items || cart.items.length === 0) {
      console.log('[Upload Lift Cart] No cart data or empty cart');
      return;
    }
    
    console.log('[Upload Lift Cart] Processing cart with', cart.items.length, 'items');

    const lineItemElements = findCartLineItems();
    if (lineItemElements.length === 0) {
      console.log('[Upload Lift Cart] No cart line items found in DOM');
      console.log('[Upload Lift Cart] Debugging: Looking for cart containers...');
      const cartContainers = document.querySelectorAll('[class*="cart"], [id*="cart"]');
      console.log('[Upload Lift Cart] Found', cartContainers.length, 'cart-related elements');
      cartContainers.forEach(el => {
        if (el.children.length > 0 && el.children.length < 50) {
          console.log('[Upload Lift Cart] Container:', el.tagName, el.className, el.id, 'Children:', el.children.length);
        }
      });
      return;
    }
    
    console.log('[Upload Lift Cart] Found', lineItemElements.length, 'line item elements');

    // Create a map of cart items with upload properties
    // Use item.key as primary identifier (unique per line item)
    const uploadItems = new Map();
    const uploadItemsByVariant = new Map();
    
    cart.items.forEach((item, index) => {
      const uploadId = item.properties?.[CONFIG.propertyKey] || 
                       item.properties?.['_ul_upload_id'];
      const designFile = item.properties?.[CONFIG.designFileKey] ||
                         item.properties?.['_ul_design_file'] ||
                         item.properties?.['_ul_file_name'] ||
                         item.properties?.['File Name'] ||
                         item.properties?.['Design Name'];
      const thumbnail = item.properties?.['_ul_thumbnail'] || 
                        item.properties?.['_ul_upload_url'] ||
                        item.properties?.['Uploaded File'];
      
      if (uploadId) {
        const uploadData = { uploadId, designFile, thumbnail, index, variantId: item.variant_id, key: item.key };
        // Primary: by item key (most reliable)
        uploadItems.set(item.key, uploadData);
        // Secondary: by variant ID (for themes that expose variant_id)
        // Note: Multiple items can have same variant, so only use if key match fails
        if (!uploadItemsByVariant.has(String(item.variant_id))) {
          uploadItemsByVariant.set(String(item.variant_id), uploadData);
        }
        console.log('[Upload Lift Cart] Found upload item:', uploadId, 'at index', index, 'key:', item.key, 'variant:', item.variant_id);
      }
    });

    if (uploadItems.size === 0) {
      console.log('[Upload Lift Cart] No upload items in cart');
      return;
    }
    
    console.log('[Upload Lift Cart] Found', uploadItems.size, 'items with uploads');

    // Process each line item element
    lineItemElements.forEach((lineItem, index) => {
      // Skip if already processed
      if (lineItem.querySelector('.ul-cart-upload-info')) {
        console.log('[Upload Lift Cart] Item', index, 'already has upload info, skipping');
        return;
      }

      // Try to find matching cart item by key (most reliable)
      const key = getLineItemKey(lineItem);
      let uploadData = key ? uploadItems.get(key) : null;
      
      if (key) {
        console.log('[Upload Lift Cart] Line item', index, 'has key:', key, 'matched:', !!uploadData);
      } else {
        console.log('[Upload Lift Cart] Line item', index, 'has NO key attribute');
      }
      
      // Fallback: Try by variant ID
      if (!uploadData) {
        const variantId = getLineItemVariantId(lineItem);
        if (variantId) {
          uploadData = uploadItemsByVariant.get(String(variantId));
          if (uploadData) {
            console.log('[Upload Lift Cart] Matched by variant ID:', variantId);
          } else {
            console.log('[Upload Lift Cart] Line item', index, 'variant:', variantId, '- no upload for this variant');
          }
        } else {
          console.log('[Upload Lift Cart] Line item', index, 'has NO variant ID attribute');
        }
      }
      
      // Last resort: If DOM count matches cart count and item has upload, use index
      // This is risky but necessary for themes with no data attributes
      if (!uploadData && lineItemElements.length === cart.items.length) {
        const cartItem = cart.items[index];
        const cartUploadId = cartItem?.properties?.[CONFIG.propertyKey] || 
                             cartItem?.properties?.['_ul_upload_id'];
        if (cartUploadId) {
          // Extra verification: Check if product names/images match
          const cartProductTitle = cartItem.title || cartItem.product_title || '';
          const domProductTitle = lineItem.querySelector('[class*="title"], [class*="name"], h2, h3, h4')?.textContent?.trim() || '';
          
          // If titles roughly match (at least first word), use index matching
          const cartFirstWord = cartProductTitle.split(' ')[0]?.toLowerCase();
          const domFirstWord = domProductTitle.split(' ')[0]?.toLowerCase();
          
          if (cartFirstWord && domFirstWord && cartFirstWord === domFirstWord) {
            uploadData = uploadItems.get(cartItem.key);
            if (uploadData) {
              console.log('[Upload Lift Cart] Matched by index (verified by title match):', index, cartProductTitle);
            }
          } else {
            console.log('[Upload Lift Cart] Index match SKIPPED - title mismatch:', cartProductTitle, 'vs', domProductTitle);
          }
        }
      }

      if (uploadData) {
        console.log('[Upload Lift Cart] Adding upload info to item', index, 'uploadId:', uploadData.uploadId);
        const target = findAppendTarget(lineItem);
        const infoEl = createUploadInfoElement(lineItem, uploadData.uploadId, uploadData.designFile, uploadData.thumbnail);
        target.appendChild(infoEl);
        
        // Fetch and update status
        updateUploadInfo(infoEl, uploadData.uploadId);
      } else {
        // This is expected for items without uploads
        console.log('[Upload Lift Cart] No upload data for item', index, '(normal product without upload)');
      }
    });
  }

  // Initialize
  function init() {
    // Only run on cart-related pages
    const isCartPage = window.location.pathname.includes('/cart') ||
                       document.querySelector('[data-cart-form]') ||
                       document.querySelector('form[action="/cart"]') ||
                       document.querySelector('.cart-form') ||
                       document.querySelector('#cart') ||
                       document.querySelector('.cart__items');

    if (!isCartPage) return;

    console.log('[Upload Lift Cart] Initializing cart display');
    injectStyles();
    
    // Initial process
    let retries = 0;
    const tryProcess = () => {
      const items = findCartLineItems();
      if (items.length > 0 || retries >= CONFIG.maxRetries) {
        processCart();
      } else {
        retries++;
        setTimeout(tryProcess, CONFIG.pollInterval);
      }
    };
    
    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryProcess);
    } else {
      setTimeout(tryProcess, 100);
    }

    // Watch for AJAX cart updates
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1 && 
                (node.matches?.('[data-cart-item]') || 
                 node.querySelector?.('[data-cart-item]') ||
                 node.classList?.contains('cart-item'))) {
              shouldProcess = true;
              break;
            }
          }
        }
      }
      if (shouldProcess) {
        setTimeout(processCart, 200);
      }
    });

    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });

    // Listen for cart updates via custom events
    document.addEventListener('cart:updated', () => setTimeout(processCart, 200));
    document.addEventListener('ajaxCart:updated', () => setTimeout(processCart, 200));
    
    // Shopify theme events
    document.addEventListener('cart:refresh', () => setTimeout(processCart, 200));
  }

  // Run
  init();
})();
