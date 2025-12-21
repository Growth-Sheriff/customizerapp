/**
 * Upload Lift Pro - Core Widget (Vanilla JS + Lit-like patterns)
 * Handles: Classic Upload (Mod-2), Quick Upload (Mod-3)
 * 3D Designer (Mod-1) loads separate React bundle
 *
 * @version 1.0.0
 */

(function() {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ══════════════════════════════════════════════════════════════

  const CONFIG = {
    apiBase: '', // Set from data attribute
    allowedMimeTypes: [
      'image/png', 'image/jpeg', 'image/webp',
      'application/pdf', 'application/postscript',
      'image/svg+xml'
    ],
    allowedExtensions: ['.png', '.jpg', '.jpeg', '.pdf', '.ai', '.eps', '.svg', '.webp'],
    maxPollAttempts: 60,
    pollInterval: 2000,
  };

  // ══════════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════════

  const state = {
    productId: null,
    variantId: null,
    mode: 'classic',
    maxSizeMB: 25,
    selectedSize: null,
    customWidth: null,
    customHeight: null,
    uploadId: null,
    itemId: null,
    fileName: null,
    fileSize: null,
    previewUrl: null,
    preflightStatus: 'pending',
    preflightChecks: [],
    approved: false,
    currentStep: 1,
  };

  // ══════════════════════════════════════════════════════════════
  // DOM REFERENCES
  // ══════════════════════════════════════════════════════════════

  let container = null;
  let elements = {};

  // ══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════════════════

  function init() {
    container = document.getElementById('upload-lift-classic');
    if (!container) {
      // Try quick upload
      container = document.getElementById('upload-lift-quick');
      if (!container) return;
      initQuickUpload();
      return;
    }

    // Read data attributes
    state.productId = container.dataset.productId;
    state.variantId = container.dataset.variantId;
    state.mode = container.dataset.mode || 'classic';
    state.maxSizeMB = parseInt(container.dataset.maxSize) || 25;
    CONFIG.apiBase = container.dataset.appUrl || 'https://customizerapp.dev';

    // Cache DOM elements
    cacheElements();

    // Bind events
    bindEvents();

    console.log('[Upload Lift] Initialized', { productId: state.productId, mode: state.mode });
  }

  function cacheElements() {
    elements = {
      steps: container.querySelectorAll('.ul-step'),
      sizeButtons: container.querySelectorAll('.ul-size-btn'),
      customSizeDiv: container.querySelector('.ul-custom-size'),
      customWidth: container.querySelector('#ul-custom-width'),
      customHeight: container.querySelector('#ul-custom-height'),
      dropzone: container.querySelector('#ul-dropzone'),
      fileInput: container.querySelector('#ul-file-input'),
      progress: container.querySelector('.ul-progress'),
      progressFill: container.querySelector('.ul-progress-fill'),
      progressPercent: container.querySelector('.ul-progress-percent'),
      previewImg: container.querySelector('#ul-preview-img'),
      checksList: container.querySelector('#ul-checks-list'),
      warningBanner: container.querySelector('#ul-warning-banner'),
      warningText: container.querySelector('#ul-warning-text'),
      errorBanner: container.querySelector('#ul-error-banner'),
      errorText: container.querySelector('#ul-error-text'),
      summarySize: container.querySelector('#ul-summary-size'),
      summaryFile: container.querySelector('#ul-summary-file'),
      summaryStatus: container.querySelector('#ul-summary-status'),
      approvalCheck: container.querySelector('#ul-approval-check'),
      addToCartBtn: container.querySelector('#ul-add-to-cart'),
      propId: container.querySelector('#ul-prop-id'),
      propMode: container.querySelector('#ul-prop-mode'),
      propPreview: container.querySelector('#ul-prop-preview'),
      propHash: container.querySelector('#ul-prop-hash'),
      propSize: container.querySelector('#ul-prop-size'),
      propFilename: container.querySelector('#ul-prop-filename'),
    };
  }

  function bindEvents() {
    // Size selection
    elements.sizeButtons.forEach(btn => {
      btn.addEventListener('click', () => handleSizeSelect(btn));
    });

    // Custom size inputs
    if (elements.customWidth) {
      elements.customWidth.addEventListener('change', handleCustomSize);
    }
    if (elements.customHeight) {
      elements.customHeight.addEventListener('change', handleCustomSize);
    }

    // Dropzone
    if (elements.dropzone) {
      elements.dropzone.addEventListener('click', () => elements.fileInput?.click());
      elements.dropzone.addEventListener('dragover', handleDragOver);
      elements.dropzone.addEventListener('dragleave', handleDragLeave);
      elements.dropzone.addEventListener('drop', handleDrop);
    }

    // File input
    if (elements.fileInput) {
      elements.fileInput.addEventListener('change', handleFileSelect);
    }

    // Approval checkbox
    if (elements.approvalCheck) {
      elements.approvalCheck.addEventListener('change', handleApprovalChange);
    }

    // Add to cart
    if (elements.addToCartBtn) {
      elements.addToCartBtn.addEventListener('click', handleAddToCart);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // STEP MANAGEMENT
  // ══════════════════════════════════════════════════════════════

  function unlockStep(stepNum) {
    const step = container.querySelector(`.ul-step[data-step="${stepNum}"]`);
    if (step) {
      step.dataset.locked = 'false';
    }
    state.currentStep = stepNum;
  }

  function lockStep(stepNum) {
    const step = container.querySelector(`.ul-step[data-step="${stepNum}"]`);
    if (step) {
      step.dataset.locked = 'true';
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SIZE SELECTION (Step 1)
  // ══════════════════════════════════════════════════════════════

  function handleSizeSelect(btn) {
    // Update UI
    elements.sizeButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const size = btn.dataset.size;
    state.selectedSize = size;

    if (size === 'custom') {
      elements.customSizeDiv.style.display = 'flex';
      handleCustomSize();
    } else {
      elements.customSizeDiv.style.display = 'none';
      state.customWidth = parseFloat(btn.dataset.width);
      state.customHeight = parseFloat(btn.dataset.height);
    }

    // Unlock step 2
    unlockStep(2);

    console.log('[Upload Lift] Size selected:', state.selectedSize, state.customWidth, state.customHeight);
  }

  function handleCustomSize() {
    state.customWidth = parseFloat(elements.customWidth?.value) || 8;
    state.customHeight = parseFloat(elements.customHeight?.value) || 8;
  }

  // ══════════════════════════════════════════════════════════════
  // FILE UPLOAD (Step 2)
  // ══════════════════════════════════════════════════════════════

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.dropzone.classList.add('dragover');
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.dropzone.classList.remove('dragover');
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    elements.dropzone.classList.remove('dragover');

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }

  function handleFileSelect(e) {
    const files = e.target?.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }

  async function processFile(file) {
    console.log('[Upload Lift] Processing file:', file.name, file.type, file.size);

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      showError(validation.error);
      return;
    }

    state.fileName = file.name;
    state.fileSize = file.size;

    // Show progress
    showProgress(true);
    updateProgress(0);

    try {
      // Step 1: Get upload intent (signed URL)
      updateProgress(10);
      const intent = await getUploadIntent(file);

      state.uploadId = intent.uploadId;
      state.itemId = intent.itemId;

      // Step 2: Upload to storage
      updateProgress(20);
      await uploadToStorage(intent.uploadUrl, file);

      updateProgress(60);

      // Step 3: Complete upload & trigger preflight
      await completeUpload();

      updateProgress(80);

      // Step 4: Poll for preflight status
      await pollPreflightStatus();

      updateProgress(100);
      showProgress(false);

      // Unlock step 3
      unlockStep(3);

    } catch (error) {
      console.error('[Upload Lift] Upload failed:', error);
      showProgress(false);
      showError('Upload failed: ' + (error.message || 'Unknown error'));
    }
  }

  function validateFile(file) {
    // Check extension
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!CONFIG.allowedExtensions.includes(ext)) {
      return { valid: false, error: `File type ${ext} is not supported.` };
    }

    // Check size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > state.maxSizeMB) {
      return { valid: false, error: `File size (${sizeMB.toFixed(1)}MB) exceeds maximum (${state.maxSizeMB}MB).` };
    }

    return { valid: true };
  }

  async function getUploadIntent(file) {
    const response = await fetch(`${CONFIG.apiBase}/api/upload/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        productId: state.productId,
        variantId: state.variantId,
        mode: state.mode,
        contentType: file.type || 'application/octet-stream',
        fileName: file.name,
        fileSize: file.size,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to get upload URL');
    }

    return response.json();
  }

  async function uploadToStorage(url, file) {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error('Failed to upload file to storage');
    }
  }

  async function completeUpload() {
    const response = await fetch(`${CONFIG.apiBase}/api/upload/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        uploadId: state.uploadId,
        items: [{
          itemId: state.itemId,
          location: 'front',
          transform: {
            width: state.customWidth,
            height: state.customHeight,
          },
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to complete upload');
    }

    return response.json();
  }

  async function pollPreflightStatus() {
    let attempts = 0;

    while (attempts < CONFIG.maxPollAttempts) {
      const response = await fetch(`${CONFIG.apiBase}/api/upload/status/${state.uploadId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to get upload status');
      }

      const data = await response.json();

      if (data.status !== 'uploaded' && data.status !== 'processing') {
        // Preflight complete
        state.preflightStatus = data.overallPreflight || 'pending';
        state.preflightChecks = data.items?.[0]?.preflightResult?.checks || [];

        // Get preview URL
        if (data.items?.[0]?.thumbnailKey) {
          state.previewUrl = `${CONFIG.apiBase}/api/storage/preview/${data.items[0].thumbnailKey}`;
        }

        renderPreflightResults(data);
        return;
      }

      attempts++;
      await sleep(CONFIG.pollInterval);
    }

    throw new Error('Preflight check timed out');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function showProgress(show) {
    if (elements.progress) {
      elements.progress.style.display = show ? 'block' : 'none';
    }
  }

  function updateProgress(percent) {
    if (elements.progressFill) {
      elements.progressFill.style.width = `${percent}%`;
    }
    if (elements.progressPercent) {
      elements.progressPercent.textContent = `${percent}%`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PREVIEW & VALIDATION (Step 3)
  // ══════════════════════════════════════════════════════════════

  function renderPreflightResults(data) {
    // Set preview image
    if (elements.previewImg && state.previewUrl) {
      elements.previewImg.src = state.previewUrl;
    }

    // Render checks
    if (elements.checksList) {
      elements.checksList.innerHTML = '';

      state.preflightChecks.forEach(check => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="ul-check-icon ul-check-${check.status}">
            ${getStatusIcon(check.status)}
          </span>
          <span>${check.name}: ${check.message || check.value || '-'}</span>
        `;
        elements.checksList.appendChild(li);
      });
    }

    // Show banners
    const hasError = state.preflightStatus === 'error';
    const hasWarning = state.preflightStatus === 'warning';

    if (elements.errorBanner) {
      elements.errorBanner.style.display = hasError ? 'flex' : 'none';
    }
    if (elements.warningBanner) {
      elements.warningBanner.style.display = hasWarning && !hasError ? 'flex' : 'none';
    }

    // Unlock step 4 if no blocking errors
    if (!hasError) {
      unlockStep(4);
      updateSummary();
    }
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'ok':
        return '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
      case 'warning':
        return '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
      case 'error':
        return '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
      default:
        return '<svg viewBox="0 0 24 24" width="16" height="16"><circle fill="currentColor" cx="12" cy="12" r="4"/></svg>';
    }
  }

  function updateSummary() {
    if (elements.summarySize) {
      elements.summarySize.textContent = state.selectedSize === 'custom'
        ? `${state.customWidth}" x ${state.customHeight}"`
        : `${state.selectedSize} (${state.customWidth}" x ${state.customHeight}")`;
    }
    if (elements.summaryFile) {
      elements.summaryFile.textContent = state.fileName || '-';
    }
    if (elements.summaryStatus) {
      const statusText = state.preflightStatus === 'ok' ? '✓ Ready'
        : state.preflightStatus === 'warning' ? '⚠ Warnings'
        : '✗ Issues';
      elements.summaryStatus.textContent = statusText;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CONFIRM & ADD TO CART (Step 4)
  // ══════════════════════════════════════════════════════════════

  function handleApprovalChange(e) {
    state.approved = e.target.checked;
    updateAddToCartButton();
  }

  function updateAddToCartButton() {
    const canAdd = state.approved
      && state.uploadId
      && state.preflightStatus !== 'error'
      && state.selectedSize;

    if (elements.addToCartBtn) {
      elements.addToCartBtn.disabled = !canAdd;
    }
  }

  async function handleAddToCart() {
    if (!state.approved || !state.uploadId) return;

    // Set hidden properties
    if (elements.propId) elements.propId.value = state.uploadId;
    if (elements.propMode) elements.propMode.value = state.mode;
    if (elements.propPreview) elements.propPreview.value = state.previewUrl || '';
    if (elements.propHash) elements.propHash.value = generateHash(state.uploadId);
    if (elements.propSize) elements.propSize.value = `${state.customWidth}" x ${state.customHeight}"`;
    if (elements.propFilename) elements.propFilename.value = state.fileName || '';

    // Get form and add to cart via Shopify
    const form = container.closest('form[action*="/cart/add"]');
    if (form) {
      // Let native form submit
      return;
    }

    // Fallback: Use Shopify AJAX API
    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: state.variantId,
          quantity: 1,
          properties: {
            '_upload_lift_id': state.uploadId,
            '_upload_lift_mode': state.mode,
            '_upload_lift_preview': state.previewUrl || '',
            '_upload_lift_hash': generateHash(state.uploadId),
            'Design Size': `${state.customWidth}" x ${state.customHeight}"`,
            'Design File': state.fileName || '',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add to cart');
      }

      // Redirect to cart or show success
      window.location.href = '/cart';
    } catch (error) {
      console.error('[Upload Lift] Add to cart failed:', error);
      showError('Failed to add to cart. Please try again.');
    }
  }

  function generateHash(uploadId) {
    // Simple hash for verification
    let hash = 0;
    const str = uploadId + Date.now().toString();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  // ══════════════════════════════════════════════════════════════
  // QUICK UPLOAD (Mod-3)
  // ══════════════════════════════════════════════════════════════

  function initQuickUpload() {
    // Quick upload is grid-based, simpler flow
    const quickItems = document.querySelectorAll('.ul-quick-item');

    quickItems.forEach(item => {
      const input = item.querySelector('input[type="file"]');
      const btn = item.querySelector('.ul-quick-upload-btn');

      if (btn && input) {
        btn.addEventListener('click', () => input.click());
        input.addEventListener('change', (e) => handleQuickUpload(e, item));
      }
    });
  }

  async function handleQuickUpload(e, item) {
    const file = e.target?.files?.[0];
    if (!file) return;

    const productId = item.dataset.productId;
    const variantId = item.dataset.variantId;

    // Similar flow to classic but auto-add to cart
    console.log('[Upload Lift] Quick upload for product:', productId);

    // TODO: Implement quick upload flow
  }

  // ══════════════════════════════════════════════════════════════
  // ERROR HANDLING
  // ══════════════════════════════════════════════════════════════

  function showError(message) {
    if (elements.errorBanner && elements.errorText) {
      elements.errorText.textContent = message;
      elements.errorBanner.style.display = 'flex';
    } else {
      alert(message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // BOOT
  // ══════════════════════════════════════════════════════════════

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

