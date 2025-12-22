/**
 * Custom Upload Main.js - Unified State Management
 * 
 * Features:
 * - Mode switching (DTF Only / T-Shirt Included)
 * - Upload handling with progress
 * - Multi-location print management
 * - Dynamic price calculation
 * - Cart integration
 */

(function() {
  'use strict';

  // Wait for DOM
  document.addEventListener('DOMContentLoaded', initCustomUpload);

  // ============================================================
  // STATE MANAGEMENT
  // ============================================================
  const CustomizerState = {
    // Widget config
    productId: null,
    productHandle: null,
    variantId: null,
    appUrl: null,
    shopDomain: null,
    maxSizeMB: 25,
    
    // Mode
    mode: 'dtf_only', // 'dtf_only' or 'tshirt_included'
    tshirtEnabled: false,
    shopPlan: 'free',
    
    // Upload
    uploadId: null,
    uploadPreviewUrl: null,
    uploadFileName: null,
    uploadStatus: 'pending', // pending, uploading, completed, error
    uploadProgress: 0,
    
    // Locations (for 3D mode)
    selectedLocations: [], // [{location: 'front', x: 0, y: 0, z: 0, width: 8, height: 10}]
    activeLocation: null,
    
    // T-Shirt options
    tshirtProductId: null,
    tshirtVariantId: null,
    tshirtSize: 'M',
    tshirtColor: '#FFFFFF',
    
    // Pricing
    basePrice: 0,
    tshirtPrice: 0,
    locationPrices: {},
    totalPrice: 0,
    
    // Quantity
    quantity: 1,
    
    // 3D
    is3DReady: false,
    
    // Validation
    isValid: false
  };

  // ============================================================
  // INITIALIZATION
  // ============================================================
  function initCustomUpload() {
    const widget = document.getElementById('custom-upload-widget');
    if (!widget) {
      console.log('[CustomUpload] Widget not found on page');
      return;
    }

    // Parse widget data attributes
    parseWidgetConfig(widget);

    // Bind event listeners
    bindEvents();

    // Initialize upload area
    initUploadArea();

    // Initialize size buttons
    initSizeButtons();

    // Initialize quantity controls
    initQuantityControls();

    // If 3D mode available, prepare 3D module
    if (CustomizerState.tshirtEnabled) {
      initTshirtToggle();
    }

    // Initial validation
    validateState();

    console.log('[CustomUpload] Initialized', CustomizerState);
  }

  function parseWidgetConfig(widget) {
    CustomizerState.productId = widget.dataset.productId;
    CustomizerState.productHandle = widget.dataset.productHandle;
    CustomizerState.variantId = widget.dataset.variantId;
    CustomizerState.appUrl = widget.dataset.appUrl || 'https://customizerapp.dev';
    CustomizerState.shopDomain = widget.dataset.shopDomain;
    CustomizerState.maxSizeMB = parseInt(widget.dataset.maxSize) || 25;
    CustomizerState.tshirtEnabled = widget.dataset.tshirtEnabled === 'true';
    CustomizerState.tshirtProductId = widget.dataset.tshirtProductId || null;
    CustomizerState.shopPlan = widget.dataset.shopPlan || 'free';
    CustomizerState.basePrice = parseFloat(widget.dataset.productPrice) || 0;
    
    // Parse print locations
    const locationsStr = widget.dataset.printLocations || 'front,back';
    CustomizerState.availableLocations = locationsStr.split(',').map(l => l.trim());
  }

  // ============================================================
  // EVENT BINDINGS
  // ============================================================
  function bindEvents() {
    // Gallery thumbnails
    document.querySelectorAll('.cu-thumb-btn').forEach(btn => {
      btn.addEventListener('click', handleThumbnailClick);
    });

    // Add to cart
    const addToCartBtn = document.getElementById('cu-add-to-cart');
    if (addToCartBtn) {
      addToCartBtn.addEventListener('click', handleAddToCart);
    }

    // Remove file
    const removeFileBtn = document.getElementById('cu-remove-file');
    if (removeFileBtn) {
      removeFileBtn.addEventListener('click', handleRemoveFile);
    }

    // Change file
    const changeFileBtn = document.getElementById('cu-change-file');
    if (changeFileBtn) {
      changeFileBtn.addEventListener('click', handleChangeFile);
    }
  }

  function handleThumbnailClick(e) {
    const btn = e.currentTarget;
    const imageUrl = btn.dataset.imageUrl;
    
    // Update main image
    const mainImage = document.getElementById('cu-product-image');
    if (mainImage && imageUrl) {
      mainImage.src = imageUrl;
    }
    
    // Update active state
    document.querySelectorAll('.cu-thumb-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  // ============================================================
  // UPLOAD HANDLING
  // ============================================================
  function initUploadArea() {
    const uploadArea = document.getElementById('cu-upload-area');
    const fileInput = document.getElementById('cu-file-input');

    if (!uploadArea || !fileInput) return;

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    });
  }

  async function handleFileSelect(file) {
    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(ai|eps)$/i)) {
      showError('Unsupported file type. Please upload PNG, JPG, PDF, SVG, AI, or EPS files.');
      return;
    }

    // Validate file size
    const maxBytes = CustomizerState.maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      showError(`File too large. Maximum size is ${CustomizerState.maxSizeMB}MB.`);
      return;
    }

    // Update state
    CustomizerState.uploadFileName = file.name;
    CustomizerState.uploadStatus = 'uploading';
    
    // Show preview for images
    if (file.type.startsWith('image/')) {
      showPreview(file);
    }

    // Upload file
    try {
      await uploadFile(file);
    } catch (error) {
      console.error('[CustomUpload] Upload error:', error);
      CustomizerState.uploadStatus = 'error';
      showError('Upload failed. Please try again.');
    }
  }

  function showPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      CustomizerState.uploadPreviewUrl = e.target.result;
      
      // Update UI
      const uploadArea = document.getElementById('cu-upload-area');
      const previewArea = document.getElementById('cu-upload-preview');
      const previewImg = document.getElementById('cu-preview-img');
      const previewName = document.getElementById('cu-preview-name');
      
      if (uploadArea && previewArea && previewImg) {
        uploadArea.style.display = 'none';
        previewArea.style.display = 'flex';
        previewImg.src = e.target.result;
        previewName.textContent = file.name;
      }

      // If 3D mode is active, update the 3D view
      if (CustomizerState.mode === 'tshirt_included' && window.CustomUpload3D) {
        window.CustomUpload3D.updateDesign(e.target.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function uploadFile(file) {
    const statusEl = document.getElementById('cu-upload-status');
    
    // Step 1: Get upload intent
    if (statusEl) statusEl.textContent = 'Preparing upload...';
    
    const intentResponse = await fetch(`${CustomizerState.appUrl}/api/upload/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        contentType: file.type,
        mode: CustomizerState.mode === 'tshirt_included' ? '3d_designer' : 'classic',
        productId: CustomizerState.productId,
        shopDomain: CustomizerState.shopDomain
      })
    });

    if (!intentResponse.ok) {
      throw new Error('Failed to get upload intent');
    }

    const { uploadUrl, uploadId, key, isLocal, fields } = await intentResponse.json();

    // Step 2: Upload to storage (handles both local and cloud)
    if (statusEl) statusEl.textContent = 'Uploading...';
    CustomizerState.uploadProgress = 30;

    if (isLocal) {
      // Local storage: use FormData with POST
      const formData = new FormData();
      formData.append('file', file);
      formData.append('key', key);
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }
    } else {
      // Cloud storage (R2/S3): use PUT with raw file
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }
    }

    CustomizerState.uploadProgress = 70;

    // Step 3: Complete upload
    if (statusEl) statusEl.textContent = 'Processing...';

    const completeResponse = await fetch(`${CustomizerState.appUrl}/api/upload/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        shopDomain: CustomizerState.shopDomain
      })
    });

    if (!completeResponse.ok) {
      throw new Error('Failed to complete upload');
    }

    const result = await completeResponse.json();

    // Update state
    CustomizerState.uploadId = uploadId;
    CustomizerState.uploadStatus = 'completed';
    CustomizerState.uploadProgress = 100;

    // Update hidden fields
    document.getElementById('cu-upload-id').value = uploadId;
    document.getElementById('cu-upload-preview-url').value = result.previewUrl || '';

    // Update status
    if (statusEl) {
      statusEl.textContent = '✓ Uploaded';
      statusEl.classList.add('success');
    }

    // Validate state
    validateState();

    console.log('[CustomUpload] Upload completed:', uploadId);
  }

  function handleRemoveFile() {
    CustomizerState.uploadId = null;
    CustomizerState.uploadPreviewUrl = null;
    CustomizerState.uploadFileName = null;
    CustomizerState.uploadStatus = 'pending';
    CustomizerState.uploadProgress = 0;

    // Update UI
    const uploadArea = document.getElementById('cu-upload-area');
    const previewArea = document.getElementById('cu-upload-preview');
    const statusEl = document.getElementById('cu-upload-status');
    const fileInput = document.getElementById('cu-file-input');

    if (uploadArea) uploadArea.style.display = 'block';
    if (previewArea) previewArea.style.display = 'none';
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.classList.remove('success');
    }
    if (fileInput) fileInput.value = '';

    // Clear hidden fields
    document.getElementById('cu-upload-id').value = '';
    document.getElementById('cu-upload-preview-url').value = '';

    // Clear 3D design if active
    if (window.CustomUpload3D) {
      window.CustomUpload3D.clearDesign();
    }

    validateState();
  }

  function handleChangeFile() {
    const fileInput = document.getElementById('cu-file-input');
    if (fileInput) {
      fileInput.click();
    }
  }

  // ============================================================
  // SIZE SELECTION
  // ============================================================
  function initSizeButtons() {
    document.querySelectorAll('.cu-size-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const variantId = e.currentTarget.dataset.variantId;
        const price = e.currentTarget.dataset.price;
        
        // Update state
        CustomizerState.variantId = variantId;
        if (price) {
          CustomizerState.basePrice = parseFloat(price);
        }
        
        // Update UI
        document.querySelectorAll('.cu-size-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        // Recalculate price
        calculatePrice();
        validateState();
      });
    });
  }

  // ============================================================
  // QUANTITY CONTROLS
  // ============================================================
  function initQuantityControls() {
    const minusBtn = document.getElementById('cu-qty-minus');
    const plusBtn = document.getElementById('cu-qty-plus');
    const qtyInput = document.getElementById('cu-quantity');

    if (minusBtn) {
      minusBtn.addEventListener('click', () => {
        let val = parseInt(qtyInput.value) || 1;
        if (val > 1) {
          qtyInput.value = val - 1;
          CustomizerState.quantity = val - 1;
          calculatePrice();
        }
      });
    }

    if (plusBtn) {
      plusBtn.addEventListener('click', () => {
        let val = parseInt(qtyInput.value) || 1;
        if (val < 999) {
          qtyInput.value = val + 1;
          CustomizerState.quantity = val + 1;
          calculatePrice();
        }
      });
    }

    if (qtyInput) {
      qtyInput.addEventListener('change', () => {
        let val = parseInt(qtyInput.value) || 1;
        val = Math.max(1, Math.min(999, val));
        qtyInput.value = val;
        CustomizerState.quantity = val;
        calculatePrice();
      });
    }
  }

  // ============================================================
  // T-SHIRT MODE TOGGLE
  // ============================================================
  function initTshirtToggle() {
    const toggleBtn = document.getElementById('cu-tshirt-toggle');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      const isActive = toggleBtn.classList.toggle('active');
      
      if (isActive) {
        enableTshirtMode();
      } else {
        disableTshirtMode();
      }
    });
  }

  function enableTshirtMode() {
    CustomizerState.mode = 'tshirt_included';
    
    // Update hidden field
    document.getElementById('cu-upload-mode').value = 'tshirt_included';
    document.getElementById('cu-tshirt-included').value = 'true';
    
    // Hide gallery, show 3D
    document.getElementById('cu-gallery-section').style.display = 'none';
    document.getElementById('cu-3d-section').style.display = 'block';
    
    // Hide DTF size step, show position step
    document.getElementById('cu-size-step').style.display = 'none';
    document.getElementById('cu-position-step').style.display = 'block';
    document.getElementById('cu-adjust-step').style.display = 'block';
    document.getElementById('cu-size-adjust-step').style.display = 'block';
    document.getElementById('cu-tshirt-options').style.display = 'block';
    
    // Show price breakdown
    document.getElementById('cu-price-breakdown').style.display = 'block';
    document.querySelector('.cu-price-tshirt').style.display = 'flex';
    
    // Initialize 3D if not already
    if (window.CustomUpload3D && !CustomizerState.is3DReady) {
      window.CustomUpload3D.init();
    }
    
    // Add default location
    if (CustomizerState.selectedLocations.length === 0) {
      addLocation('front');
    }
    
    calculatePrice();
    validateState();
  }

  function disableTshirtMode() {
    CustomizerState.mode = 'dtf_only';
    
    // Update hidden field
    document.getElementById('cu-upload-mode').value = 'dtf_only';
    document.getElementById('cu-tshirt-included').value = 'false';
    
    // Show gallery, hide 3D
    document.getElementById('cu-gallery-section').style.display = 'block';
    document.getElementById('cu-3d-section').style.display = 'none';
    
    // Show DTF size step, hide position steps
    document.getElementById('cu-size-step').style.display = 'block';
    document.getElementById('cu-position-step').style.display = 'none';
    document.getElementById('cu-adjust-step').style.display = 'none';
    document.getElementById('cu-size-adjust-step').style.display = 'none';
    document.getElementById('cu-tshirt-options').style.display = 'none';
    
    // Hide price breakdown
    document.getElementById('cu-price-breakdown').style.display = 'none';
    
    calculatePrice();
    validateState();
  }

  // ============================================================
  // LOCATION MANAGEMENT
  // ============================================================
  function addLocation(location) {
    // Check if already selected
    if (CustomizerState.selectedLocations.find(l => l.location === location)) {
      return;
    }
    
    CustomizerState.selectedLocations.push({
      location: location,
      x: 0,
      y: 0,
      z: 0,
      width: 8,
      height: 10
    });
    
    // Update UI
    updateSelectedLocationsUI();
    updatePositionGridUI();
    
    // Update active location
    setActiveLocation(location);
    
    calculatePrice();
    validateState();
  }

  function removeLocation(location) {
    CustomizerState.selectedLocations = CustomizerState.selectedLocations.filter(l => l.location !== location);
    
    // Update UI
    updateSelectedLocationsUI();
    updatePositionGridUI();
    
    // Set new active location
    if (CustomizerState.selectedLocations.length > 0) {
      setActiveLocation(CustomizerState.selectedLocations[0].location);
    } else {
      CustomizerState.activeLocation = null;
    }
    
    calculatePrice();
    validateState();
  }

  function setActiveLocation(location) {
    CustomizerState.activeLocation = location;
    
    // Update UI
    document.querySelectorAll('.cu-position-item').forEach(item => {
      item.classList.toggle('active', item.dataset.position === location);
    });
    
    // Update 3D view
    if (window.CustomUpload3D) {
      window.CustomUpload3D.focusLocation(location);
    }
  }

  function updateSelectedLocationsUI() {
    const container = document.getElementById('cu-selected-locations');
    if (!container) return;
    
    container.innerHTML = CustomizerState.selectedLocations.map(loc => {
      const locationName = getLocationDisplayName(loc.location);
      const price = CustomizerState.locationPrices[loc.location] || 0;
      
      return `
        <div class="cu-location-item" data-location="${loc.location}">
          <span class="cu-location-name">
            <span class="cu-location-check">✓</span>
            ${locationName}
          </span>
          <span class="cu-location-price">+$${price.toFixed(2)}</span>
          <button type="button" class="cu-remove-location" data-location="${loc.location}">×</button>
        </div>
      `;
    }).join('');
    
    // Bind remove buttons
    container.querySelectorAll('.cu-remove-location').forEach(btn => {
      btn.addEventListener('click', (e) => {
        removeLocation(e.currentTarget.dataset.location);
      });
    });
  }

  function updatePositionGridUI() {
    document.querySelectorAll('.cu-position-item').forEach(item => {
      const location = item.dataset.position;
      const isSelected = CustomizerState.selectedLocations.find(l => l.location === location);
      const checkEl = item.querySelector('.cu-position-check');
      
      item.classList.toggle('selected', !!isSelected);
      if (checkEl) {
        checkEl.style.display = isSelected ? 'flex' : 'none';
      }
    });
  }

  function getLocationDisplayName(location) {
    const names = {
      'front': 'Front',
      'back': 'Back',
      'left_sleeve': 'Left Sleeve',
      'right_sleeve': 'Right Sleeve'
    };
    return names[location] || location;
  }

  // ============================================================
  // PRICE CALCULATION
  // ============================================================
  function calculatePrice() {
    let total = 0;
    
    if (CustomizerState.mode === 'dtf_only') {
      // Simple: just base price
      total = CustomizerState.basePrice * CustomizerState.quantity;
    } else {
      // T-Shirt mode: base + tshirt + locations
      const dtfBase = CustomizerState.basePrice;
      const tshirtPrice = 15; // TODO: Get from metafield
      const locationPricePerItem = 5; // TODO: Get from metafield
      
      const locationTotal = CustomizerState.selectedLocations.length * locationPricePerItem;
      const unitPrice = dtfBase + tshirtPrice + locationTotal;
      
      total = unitPrice * CustomizerState.quantity;
      
      // Update breakdown
      const dtfEl = document.getElementById('cu-price-dtf');
      const tshirtEl = document.getElementById('cu-price-tshirt-val');
      const finalEl = document.getElementById('cu-final-price');
      
      if (dtfEl) dtfEl.textContent = `$${dtfBase.toFixed(2)}`;
      if (tshirtEl) tshirtEl.textContent = `$${tshirtPrice.toFixed(2)}`;
      if (finalEl) finalEl.textContent = `$${total.toFixed(2)}`;
      
      // Update location prices
      const locationsEl = document.getElementById('cu-price-locations');
      if (locationsEl) {
        locationsEl.innerHTML = CustomizerState.selectedLocations.map(loc => `
          <div class="cu-price-line">
            <span>${getLocationDisplayName(loc.location)} Print</span>
            <span>+$${locationPricePerItem.toFixed(2)}</span>
          </div>
        `).join('');
      }
    }
    
    CustomizerState.totalPrice = total;
    
    // Update main price display
    const totalPriceEl = document.getElementById('cu-total-price');
    const cartPriceEl = document.getElementById('cu-cart-price');
    
    if (totalPriceEl) totalPriceEl.textContent = `$${total.toFixed(2)}`;
    if (cartPriceEl) cartPriceEl.textContent = `$${total.toFixed(2)}`;
  }

  // ============================================================
  // VALIDATION
  // ============================================================
  function validateState() {
    let isValid = true;
    const errors = [];
    
    // Must have upload
    if (!CustomizerState.uploadId) {
      isValid = false;
      errors.push('Please upload a design');
    }
    
    // Must have variant selected
    if (!CustomizerState.variantId) {
      isValid = false;
      errors.push('Please select a size');
    }
    
    // T-Shirt mode: must have at least one location
    if (CustomizerState.mode === 'tshirt_included') {
      if (CustomizerState.selectedLocations.length === 0) {
        isValid = false;
        errors.push('Please select at least one print location');
      }
    }
    
    CustomizerState.isValid = isValid;
    
    // Update add to cart button
    const addToCartBtn = document.getElementById('cu-add-to-cart');
    if (addToCartBtn) {
      addToCartBtn.disabled = !isValid;
    }
    
    return { isValid, errors };
  }

  // ============================================================
  // ADD TO CART
  // ============================================================
  async function handleAddToCart() {
    const validation = validateState();
    if (!validation.isValid) {
      showError(validation.errors[0]);
      return;
    }
    
    const addToCartBtn = document.getElementById('cu-add-to-cart');
    if (addToCartBtn) {
      addToCartBtn.disabled = true;
      addToCartBtn.querySelector('.cu-cart-text').textContent = 'Adding...';
    }
    
    try {
      // Build line item properties
      const properties = {
        '_custom_upload_id': CustomizerState.uploadId,
        '_custom_upload_mode': CustomizerState.mode,
        '_custom_upload_preview': CustomizerState.uploadPreviewUrl || ''
      };
      
      if (CustomizerState.mode === 'tshirt_included') {
        properties['_tshirt_included'] = 'true';
        properties['_tshirt_size'] = CustomizerState.tshirtSize;
        properties['_tshirt_color'] = CustomizerState.tshirtColor;
        properties['_print_locations'] = JSON.stringify(CustomizerState.selectedLocations);
      }
      
      // Add to cart via Shopify AJAX API
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: parseInt(CustomizerState.variantId),
          quantity: CustomizerState.quantity,
          properties: properties
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to add to cart');
      }
      
      const result = await response.json();
      console.log('[CustomUpload] Added to cart:', result);
      
      // Success feedback
      if (addToCartBtn) {
        addToCartBtn.querySelector('.cu-cart-text').textContent = 'Added! ✓';
        addToCartBtn.style.background = 'linear-gradient(135deg, #28c76f 0%, #48d483 100%)';
      }
      
      // Open cart drawer or redirect
      setTimeout(() => {
        // Try to open cart drawer if available
        if (typeof window.openCartDrawer === 'function') {
          window.openCartDrawer();
        } else {
          // Redirect to cart
          window.location.href = '/cart';
        }
      }, 1000);
      
    } catch (error) {
      console.error('[CustomUpload] Add to cart error:', error);
      showError('Failed to add to cart. Please try again.');
      
      if (addToCartBtn) {
        addToCartBtn.disabled = false;
        addToCartBtn.querySelector('.cu-cart-text').textContent = 'Add to Cart';
      }
    }
  }

  // ============================================================
  // UTILITIES
  // ============================================================
  function showError(message) {
    // Simple alert for now, can be enhanced
    alert(message);
  }

  // ============================================================
  // EXPORTS
  // ============================================================
  window.CustomizerState = CustomizerState;
  window.CustomUploadMain = {
    getState: () => CustomizerState,
    addLocation,
    removeLocation,
    setActiveLocation,
    calculatePrice,
    validateState
  };

})();
