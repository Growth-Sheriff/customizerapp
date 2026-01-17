/**
 * Upload Lift - Cart Upload Display (Fixed Version)
 * Shows uploaded design info under cart line items
 * Auto-injects into cart page without theme modification
 * 
 * FIXES:
 * - Multiple uploads with same variant now all match correctly
 * - Used uploads are tracked to prevent double-assignment
 * - Multi-signal matching (key, variant+index, product handle, image URL)
 * - Better fallback logic with confidence scoring
 */
(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    propertyKey: '_ul_upload_id',
    designFileKey: '_ul_design_file',
    pollInterval: 500,
    maxRetries: 20,
    apiBase: '/apps/customizer',
    debug: true // Set to false in production
  };

  // Debug logger
  function log(...args) {
    if (CONFIG.debug) {
      console.log('[Upload Lift Cart]', ...args);
    }
  }

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
  function createUploadInfoElement(uploadId, designFile, thumbnail) {
    const div = document.createElement('div');
    div.className = 'ul-cart-upload-info';
    div.dataset.uploadId = uploadId;
    
    const fileName = designFile || 'Custom Design';
    const shortName = fileName.length > 25 ? fileName.substring(0, 22) + '...' : fileName;
    
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

  // ============================================
  // DOM ELEMENT FINDERS
  // ============================================

  // Find cart line item containers
  function findCartLineItems() {
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
      // More themes
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
        log('Found items with selector:', selector, 'Count:', items.length);
        return Array.from(items);
      }
    }
    
    // Fallback
    const fallbackItems = findCartItemsFallback();
    if (fallbackItems.length > 0) {
      log('Found items via fallback. Count:', fallbackItems.length);
      return fallbackItems;
    }
    
    return [];
  }
  
  function findCartItemsFallback() {
    const cartContainers = document.querySelectorAll(
      '[class*="cart"], [id*="cart"], [data-section-type="cart"], cart-items, .cart, #cart, #CartContainer'
    );
    
    for (const container of cartContainers) {
      const potentialItems = container.querySelectorAll(
        'tr:has(img), li:has(img), div:has(img[src*="cdn.shopify"])'
      );
      
      if (potentialItems.length > 0) {
        const items = Array.from(potentialItems).filter(item => {
          const hasProductImage = item.querySelector('img[src*="cdn.shopify"]');
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

  function findAppendTarget(lineItem) {
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
      '[class*="detail"]',
      '[class*="info"]:not(img):not(svg)'
    ];

    for (const selector of selectors) {
      const target = lineItem.querySelector(selector);
      if (target && target.offsetParent !== null) return target;
    }
    
    return lineItem;
  }

  // ============================================
  // LINE ITEM DATA EXTRACTORS
  // ============================================

  // Extract all possible identifiers from a DOM line item
  function extractLineItemIdentifiers(lineItem) {
    const identifiers = {
      key: null,
      variantId: null,
      productHandle: null,
      productId: null,
      imageUrl: null,
      title: null,
      quantity: null
    };

    // 1. Try to get line item key
    identifiers.key = 
      lineItem.dataset.lineItemKey || 
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
      extractKeyFromLinks(lineItem);

    // 2. Try to get variant ID
    identifiers.variantId = 
      lineItem.dataset.variantId || 
      lineItem.dataset.variant ||
      lineItem.dataset.productVariantId ||
      lineItem.getAttribute('data-variant-id') ||
      lineItem.getAttribute('data-variant') ||
      lineItem.getAttribute('data-product-variant-id') ||
      lineItem.querySelector('[data-variant-id]')?.dataset.variantId ||
      lineItem.querySelector('[data-variant]')?.dataset.variant ||
      lineItem.querySelector('input[name*="id"]')?.value ||
      extractVariantFromLinks(lineItem);

    // 3. Try to get product handle
    identifiers.productHandle = 
      lineItem.dataset.productHandle ||
      lineItem.dataset.handle ||
      lineItem.getAttribute('data-product-handle') ||
      lineItem.getAttribute('data-handle') ||
      extractHandleFromLinks(lineItem);

    // 4. Try to get product ID
    identifiers.productId = 
      lineItem.dataset.productId ||
      lineItem.dataset.product ||
      lineItem.getAttribute('data-product-id') ||
      lineItem.getAttribute('data-product');

    // 5. Get image URL (useful for matching)
    const img = lineItem.querySelector('img[src*="cdn.shopify"]');
    if (img) {
      identifiers.imageUrl = normalizeImageUrl(img.src);
    }

    // 6. Get title
    const titleEl = lineItem.querySelector(
      '.cart-item__name, .cart__product-title, .product-title, ' +
      '.cart-item__title, .line-item__title, [class*="title"], ' +
      '[class*="name"], h2, h3, h4, a[href*="/products/"]'
    );
    if (titleEl) {
      identifiers.title = normalizeTitle(titleEl.textContent);
    }

    // 7. Get quantity
    const qtyInput = lineItem.querySelector('input[name*="quantity"], input[type="number"], .quantity-input');
    if (qtyInput) {
      identifiers.quantity = parseInt(qtyInput.value, 10) || null;
    }

    return identifiers;
  }

  function extractKeyFromLinks(lineItem) {
    const link = lineItem.querySelector('a[href*="/cart/change?"]');
    if (link) {
      const match = link.href.match(/id=([^&]+)/);
      if (match) return match[1];
    }
    return null;
  }

  function extractVariantFromLinks(lineItem) {
    const links = lineItem.querySelectorAll('a[href*="/products/"]');
    for (const link of links) {
      const match = link.href.match(/variant=(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  function extractHandleFromLinks(lineItem) {
    const link = lineItem.querySelector('a[href*="/products/"]');
    if (link) {
      const match = link.href.match(/\/products\/([^/?#]+)/);
      if (match) return match[1];
    }
    return null;
  }

  function normalizeImageUrl(url) {
    if (!url) return null;
    // Remove size parameters to get base image URL
    return url.replace(/_\d+x\d*(@\d+x)?\./, '.').replace(/\?.*$/, '').toLowerCase();
  }

  function normalizeTitle(title) {
    if (!title) return null;
    return title.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // ============================================
  // MATCHING ALGORITHM
  // ============================================

  /**
   * Build upload data from cart items
   * Returns array of upload items with all relevant data
   */
  function buildUploadItemsData(cartItems) {
    const uploadItems = [];

    cartItems.forEach((item, index) => {
      const uploadId = item.properties?.[CONFIG.propertyKey] || 
                       item.properties?.['_ul_upload_id'];
      
      if (!uploadId) return; // Skip items without uploads

      const designFile = item.properties?.[CONFIG.designFileKey] ||
                         item.properties?.['_ul_design_file'] ||
                         item.properties?.['_ul_file_name'] ||
                         item.properties?.['File Name'] ||
                         item.properties?.['Design Name'];
      
      const thumbnail = item.properties?.['_ul_thumbnail'] || 
                        item.properties?.['_ul_upload_url'] ||
                        item.properties?.['Uploaded File'];

      uploadItems.push({
        uploadId,
        designFile,
        thumbnail,
        cartIndex: index,
        key: item.key,
        variantId: String(item.variant_id),
        productId: String(item.product_id),
        handle: item.handle,
        title: normalizeTitle(item.title || item.product_title),
        imageUrl: normalizeImageUrl(item.image),
        quantity: item.quantity,
        matched: false // Track if this upload has been matched to a DOM element
      });
    });

    return uploadItems;
  }

  /**
   * Calculate match score between a DOM line item and a cart upload item
   * Higher score = more confident match
   */
  function calculateMatchScore(domIdentifiers, uploadItem) {
    let score = 0;
    const reasons = [];

    // Key match is definitive (100 points)
    if (domIdentifiers.key && domIdentifiers.key === uploadItem.key) {
      score += 100;
      reasons.push('key');
    }

    // Variant ID match (30 points)
    if (domIdentifiers.variantId && domIdentifiers.variantId === uploadItem.variantId) {
      score += 30;
      reasons.push('variantId');
    }

    // Product handle match (20 points)
    if (domIdentifiers.productHandle && domIdentifiers.productHandle === uploadItem.handle) {
      score += 20;
      reasons.push('handle');
    }

    // Product ID match (20 points)
    if (domIdentifiers.productId && domIdentifiers.productId === uploadItem.productId) {
      score += 20;
      reasons.push('productId');
    }

    // Image URL match (15 points)
    if (domIdentifiers.imageUrl && uploadItem.imageUrl) {
      if (domIdentifiers.imageUrl === uploadItem.imageUrl) {
        score += 15;
        reasons.push('imageUrl');
      } else if (domIdentifiers.imageUrl.includes(uploadItem.handle) || 
                 uploadItem.imageUrl.includes(domIdentifiers.productHandle)) {
        score += 5;
        reasons.push('imageUrl-partial');
      }
    }

    // Title match (10 points for exact, 5 for partial)
    if (domIdentifiers.title && uploadItem.title) {
      if (domIdentifiers.title === uploadItem.title) {
        score += 10;
        reasons.push('title-exact');
      } else if (domIdentifiers.title.includes(uploadItem.title.split(' ')[0]) ||
                 uploadItem.title.includes(domIdentifiers.title.split(' ')[0])) {
        score += 5;
        reasons.push('title-partial');
      }
    }

    return { score, reasons };
  }

  /**
   * Find best matching upload for a DOM line item
   * Returns the upload item or null
   */
  function findBestMatch(domIdentifiers, uploadItems, domIndex, totalDomItems) {
    let bestMatch = null;
    let bestScore = 0;
    let bestReasons = [];

    for (const uploadItem of uploadItems) {
      // Skip already matched uploads
      if (uploadItem.matched) continue;

      const { score, reasons } = calculateMatchScore(domIdentifiers, uploadItem);

      // If key matches exactly, this is definitely the right one
      if (reasons.includes('key')) {
        log(`DOM[${domIndex}] DEFINITIVE match by key:`, uploadItem.key);
        return { upload: uploadItem, reasons };
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = uploadItem;
        bestReasons = reasons;
      }
    }

    // Require minimum confidence for non-key matches
    // At least variant ID or (handle + image) or (handle + title)
    const minConfidenceScore = 30;
    
    if (bestScore >= minConfidenceScore) {
      log(`DOM[${domIndex}] Best match score=${bestScore} reasons=[${bestReasons.join(',')}]`);
      return { upload: bestMatch, reasons: bestReasons };
    }

    // Last resort: If DOM count equals cart upload count, try position matching
    // But only if we have SOME signal (at least variant or handle)
    if (bestScore >= 20 && totalDomItems === uploadItems.filter(u => !u.matched).length + 
        uploadItems.filter(u => u.matched).length) {
      log(`DOM[${domIndex}] Low confidence match score=${bestScore}, accepting due to count match`);
      return { upload: bestMatch, reasons: bestReasons };
    }

    log(`DOM[${domIndex}] No confident match found. Best score was ${bestScore}`);
    return null;
  }

  /**
   * Smart index-based fallback matching
   * Used when other methods fail but cart/DOM counts match
   */
  function performIndexFallback(lineItemElements, uploadItems, cart) {
    const unmatchedDomIndices = [];
    const unmatchedUploads = uploadItems.filter(u => !u.matched);

    // Find DOM elements that haven't been matched yet
    lineItemElements.forEach((el, idx) => {
      if (!el.querySelector('.ul-cart-upload-info')) {
        unmatchedDomIndices.push(idx);
      }
    });

    log('Index fallback: unmatched DOM=', unmatchedDomIndices.length, 'unmatched uploads=', unmatchedUploads.length);

    // Only proceed if counts match
    if (unmatchedDomIndices.length !== unmatchedUploads.length) {
      log('Index fallback: count mismatch, skipping');
      return [];
    }

    const matches = [];

    // Match by position, but verify with any available signal
    unmatchedDomIndices.forEach((domIndex, i) => {
      const uploadItem = unmatchedUploads[i];
      if (!uploadItem) return;

      const lineItem = lineItemElements[domIndex];
      const domIdentifiers = extractLineItemIdentifiers(lineItem);
      
      // Verify with at least one signal
      let verified = false;
      
      if (domIdentifiers.variantId === uploadItem.variantId) verified = true;
      if (domIdentifiers.productHandle === uploadItem.handle) verified = true;
      if (domIdentifiers.title && uploadItem.title && 
          domIdentifiers.title.includes(uploadItem.title.split(' ')[0])) verified = true;

      if (verified) {
        log(`Index fallback: DOM[${domIndex}] matched to upload[${uploadItem.cartIndex}] (verified)`);
        matches.push({ domIndex, upload: uploadItem });
        uploadItem.matched = true;
      } else {
        log(`Index fallback: DOM[${domIndex}] could not be verified, skipping`);
      }
    });

    return matches;
  }

  // ============================================
  // MAIN PROCESSING
  // ============================================

  async function processCart() {
    const cart = await getCartData();
    if (!cart || !cart.items || cart.items.length === 0) {
      log('No cart data or empty cart');
      return;
    }
    
    log('Processing cart with', cart.items.length, 'items');

    // Build upload items data
    const uploadItems = buildUploadItemsData(cart.items);
    
    if (uploadItems.length === 0) {
      log('No upload items in cart');
      return;
    }
    
    log('Found', uploadItems.length, 'items with uploads:', uploadItems.map(u => ({
      key: u.key,
      variantId: u.variantId,
      handle: u.handle,
      uploadId: u.uploadId
    })));

    // Find DOM elements
    const lineItemElements = findCartLineItems();
    if (lineItemElements.length === 0) {
      log('No cart line items found in DOM');
      return;
    }
    
    log('Found', lineItemElements.length, 'line item elements in DOM');

    // Phase 1: Match using identifiers
    const matchResults = [];

    lineItemElements.forEach((lineItem, domIndex) => {
      // Skip if already processed
      if (lineItem.querySelector('.ul-cart-upload-info')) {
        log(`DOM[${domIndex}] already has upload info, skipping`);
        return;
      }

      const domIdentifiers = extractLineItemIdentifiers(lineItem);
      log(`DOM[${domIndex}] identifiers:`, domIdentifiers);

      const match = findBestMatch(domIdentifiers, uploadItems, domIndex, lineItemElements.length);
      
      if (match) {
        match.upload.matched = true;
        matchResults.push({ domIndex, lineItem, upload: match.upload, reasons: match.reasons });
      }
    });

    // Phase 2: Index-based fallback for remaining items
    const fallbackMatches = performIndexFallback(lineItemElements, uploadItems, cart);
    fallbackMatches.forEach(({ domIndex, upload }) => {
      matchResults.push({ 
        domIndex, 
        lineItem: lineItemElements[domIndex], 
        upload, 
        reasons: ['index-fallback'] 
      });
    });

    // Phase 3: Apply matches to DOM
    log('Applying', matchResults.length, 'matches to DOM');
    
    for (const { domIndex, lineItem, upload, reasons } of matchResults) {
      log(`Applying upload to DOM[${domIndex}]:`, upload.uploadId, 'via', reasons.join(','));
      
      const target = findAppendTarget(lineItem);
      const infoEl = createUploadInfoElement(upload.uploadId, upload.designFile, upload.thumbnail);
      target.appendChild(infoEl);
      
      // Fetch and update status asynchronously
      updateUploadInfo(infoEl, upload.uploadId);
    }

    // Log any unmatched uploads
    const unmatchedUploads = uploadItems.filter(u => !u.matched);
    if (unmatchedUploads.length > 0) {
      log('WARNING: Could not match these uploads to DOM elements:', 
        unmatchedUploads.map(u => ({ uploadId: u.uploadId, key: u.key, variantId: u.variantId }))
      );
    }
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  function init() {
    const isCartPage = window.location.pathname.includes('/cart') ||
                       document.querySelector('[data-cart-form]') ||
                       document.querySelector('form[action="/cart"]') ||
                       document.querySelector('.cart-form') ||
                       document.querySelector('#cart') ||
                       document.querySelector('.cart__items');

    if (!isCartPage) return;

    log('Initializing cart display');
    injectStyles();
    
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

    // Listen for cart update events
    document.addEventListener('cart:updated', () => setTimeout(processCart, 200));
    document.addEventListener('ajaxCart:updated', () => setTimeout(processCart, 200));
    document.addEventListener('cart:refresh', () => setTimeout(processCart, 200));
  }

  init();
})();