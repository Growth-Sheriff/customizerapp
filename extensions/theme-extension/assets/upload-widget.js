/**
 * Upload Lift Pro - Unified Upload Widget
 * Handles file upload with multi-storage support:
 * - Shopify Files API (default, recommended)
 * - Local storage (fallback)
 * - R2/S3 (optional, advanced)
 *
 * @version 2.0.0
 */

(function() {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  // INITIALIZE ALL WIDGETS ON PAGE
  // ══════════════════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', function() {
    const widgets = document.querySelectorAll('.ul-widget');
    widgets.forEach(widget => initWidget(widget));
  });

  // ══════════════════════════════════════════════════════════════
  // WIDGET INITIALIZATION
  // ══════════════════════════════════════════════════════════════

  function initWidget(widget) {
    const blockId = widget.id.replace('ul-widget-', '');
    const config = {
      apiBase: widget.dataset.apiBase || 'https://customizerapp.dev',
      shopDomain: widget.dataset.shopDomain || window.Shopify?.shop,
      productId: widget.dataset.productId,
      variantId: widget.dataset.variantId,
      mode: widget.dataset.mode || 'dtf',
      show3d: widget.dataset.show3d === 'true',
      previewDisplay: widget.dataset.previewDisplay || 'popup',
      maxSizeMB: parseInt(widget.dataset.maxSize) || 25,
    };

    const state = {
      uploadId: null,
      fileUrl: null,
      fileName: null,
      fileSize: null,
      position: 'front',
      xPos: 0,
      yPos: 0,
      width: 9,
      height: 9,
      uploading: false,
    };

    // Elements
    const elements = {
      widget,
      error: document.getElementById(`ul-error-${blockId}`),
      dropzone: document.getElementById(`ul-dropzone-${blockId}`),
      fileInput: document.getElementById(`ul-file-${blockId}`),
      preview: document.getElementById(`ul-preview-${blockId}`),
      previewImg: document.getElementById(`ul-preview-img-${blockId}`),
      fileName: document.getElementById(`ul-filename-${blockId}`),
      fileSize: document.getElementById(`ul-filesize-${blockId}`),
      removeBtn: document.getElementById(`ul-remove-${blockId}`),
      progress: document.getElementById(`ul-progress-${blockId}`),
      progressFill: document.getElementById(`ul-progress-fill-${blockId}`),
      progressText: document.getElementById(`ul-progress-text-${blockId}`),
      positionBtns: widget.querySelectorAll('.ul-position-btn'),
      xPosSlider: document.getElementById(`ul-xpos-${blockId}`),
      yPosSlider: document.getElementById(`ul-ypos-${blockId}`),
      xPosVal: document.getElementById(`ul-xpos-val-${blockId}`),
      yPosVal: document.getElementById(`ul-ypos-val-${blockId}`),
      widthInput: document.getElementById(`ul-width-${blockId}`),
      heightInput: document.getElementById(`ul-height-${blockId}`),
      open3dBtn: document.getElementById(`ul-open-3d-${blockId}`),
      modal: document.getElementById(`ul-modal-${blockId}`),
      // Hidden inputs
      hiddenUploadId: document.getElementById(`ul-upload-id-${blockId}`),
      hiddenFileUrl: document.getElementById(`ul-file-url-${blockId}`),
      hiddenFileName: document.getElementById(`ul-file-name-${blockId}`),
      hiddenPosition: document.getElementById(`ul-position-${blockId}`),
      hiddenXPos: document.getElementById(`ul-xpos-hidden-${blockId}`),
      hiddenYPos: document.getElementById(`ul-ypos-hidden-${blockId}`),
      hiddenWidth: document.getElementById(`ul-width-hidden-${blockId}`),
      hiddenHeight: document.getElementById(`ul-height-hidden-${blockId}`),
    };

    // ══════════════════════════════════════════════════════════════
    // EVENT LISTENERS
    // ══════════════════════════════════════════════════════════════

    // Dropzone click
    if (elements.dropzone) {
      elements.dropzone.addEventListener('click', () => elements.fileInput?.click());
      
      // Drag & drop
      elements.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropzone.classList.add('dragover');
      });
      
      elements.dropzone.addEventListener('dragleave', () => {
        elements.dropzone.classList.remove('dragover');
      });
      
      elements.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropzone.classList.remove('dragover');
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFileSelect(file);
      });
    }

    // File input change
    if (elements.fileInput) {
      elements.fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
      });
    }

    // Remove button
    if (elements.removeBtn) {
      elements.removeBtn.addEventListener('click', resetUpload);
    }

    // Position buttons
    elements.positionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.positionBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.position = btn.dataset.position;
        if (elements.hiddenPosition) {
          elements.hiddenPosition.value = state.position;
        }
      });
    });

    // Position sliders
    if (elements.xPosSlider) {
      elements.xPosSlider.addEventListener('input', (e) => {
        state.xPos = parseFloat(e.target.value);
        if (elements.xPosVal) elements.xPosVal.textContent = state.xPos.toFixed(2);
        if (elements.hiddenXPos) elements.hiddenXPos.value = state.xPos;
      });
    }

    if (elements.yPosSlider) {
      elements.yPosSlider.addEventListener('input', (e) => {
        state.yPos = parseFloat(e.target.value);
        if (elements.yPosVal) elements.yPosVal.textContent = state.yPos.toFixed(2);
        if (elements.hiddenYPos) elements.hiddenYPos.value = state.yPos;
      });
    }

    // Size inputs
    if (elements.widthInput) {
      elements.widthInput.addEventListener('change', (e) => {
        state.width = parseFloat(e.target.value);
        if (elements.hiddenWidth) elements.hiddenWidth.value = state.width;
      });
    }

    if (elements.heightInput) {
      elements.heightInput.addEventListener('change', (e) => {
        state.height = parseFloat(e.target.value);
        if (elements.hiddenHeight) elements.hiddenHeight.value = state.height;
      });
    }

    // 3D preview button
    if (elements.open3dBtn && elements.modal) {
      elements.open3dBtn.addEventListener('click', openModal);
    }

    // Modal close
    if (elements.modal) {
      const closeBackdrop = document.getElementById(`ul-modal-close-${blockId}`);
      const closeX = document.getElementById(`ul-modal-x-${blockId}`);
      const closeCancel = document.getElementById(`ul-modal-cancel-${blockId}`);
      const applyBtn = document.getElementById(`ul-modal-apply-${blockId}`);

      if (closeBackdrop) closeBackdrop.addEventListener('click', closeModal);
      if (closeX) closeX.addEventListener('click', closeModal);
      if (closeCancel) closeCancel.addEventListener('click', closeModal);
      if (applyBtn) applyBtn.addEventListener('click', applyAndClose);
    }

    // ══════════════════════════════════════════════════════════════
    // FILE HANDLING
    // ══════════════════════════════════════════════════════════════

    async function handleFileSelect(file) {
      console.log('[Upload Widget] Processing file:', file.name, file.type, file.size);

      // Validate file type
      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        showError('Please upload a PNG, JPG, PDF, or SVG file.');
        return;
      }

      // Validate file size
      const maxBytes = config.maxSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        showError(`File too large. Maximum size: ${config.maxSizeMB}MB`);
        return;
      }

      hideError();
      state.uploading = true;
      state.fileName = file.name;
      state.fileSize = file.size;

      // Show progress
      showProgress(0, 'Preparing upload...');

      try {
        // Step 1: Get upload intent
        showProgress(10, 'Initializing...');
        const intent = await getUploadIntent(file);
        console.log('[Upload Widget] Got intent:', intent);

        state.uploadId = intent.uploadId;

        // Step 2: Upload file based on storage provider
        showProgress(30, 'Uploading...');
        const fileUrl = await uploadFile(file, intent);
        console.log('[Upload Widget] Upload complete, URL:', fileUrl);

        state.fileUrl = fileUrl;

        // Step 3: Show preview
        showProgress(100, 'Complete!');
        showPreview(file, fileUrl);

        // Update hidden inputs
        updateHiddenInputs();

      } catch (error) {
        console.error('[Upload Widget] Upload failed:', error);
        showError(error.message || 'Upload failed. Please try again.');
        resetUpload();
      }

      state.uploading = false;
    }

    async function getUploadIntent(file) {
      const mode = config.mode === 'tshirt' ? '3d_designer' : 'classic';
      
      const response = await fetch(`${config.apiBase}/api/upload/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopDomain: config.shopDomain,
          productId: config.productId,
          variantId: config.variantId,
          mode,
          contentType: file.type,
          fileName: file.name,
          fileSize: file.size,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to initialize upload');
      }

      return response.json();
    }

    async function uploadFile(file, intent) {
      const { uploadUrl, key, isShopify, isLocal, storageProvider } = intent;

      console.log('[Upload Widget] Storage provider:', storageProvider);

      // Shopify Files API
      if (isShopify || storageProvider === 'shopify') {
        return await uploadToShopify(file, intent);
      }

      // Local storage
      if (isLocal || storageProvider === 'local') {
        return await uploadToLocal(file, uploadUrl, key);
      }

      // R2/S3 - presigned URL
      return await uploadToPresignedUrl(file, uploadUrl, key);
    }

    async function uploadToShopify(file, intent) {
      // Step 1: Get staged upload URL from Shopify
      const stagedResponse = await fetch(`${config.apiBase}/api/upload/shopify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_staged_url',
          shopDomain: config.shopDomain,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });

      if (!stagedResponse.ok) {
        throw new Error('Failed to get Shopify upload URL');
      }

      const staged = await stagedResponse.json();
      console.log('[Upload Widget] Shopify staged target:', staged);

      // Step 2: Upload to Shopify's staged URL using FormData
      const formData = new FormData();
      
      // Add all parameters from Shopify
      if (staged.parameters) {
        staged.parameters.forEach(param => {
          formData.append(param.name, param.value);
        });
      }
      
      // Add file last
      formData.append('file', file);

      const uploadResponse = await fetch(staged.stagedUrl, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload to Shopify');
      }

      showProgress(70, 'Finalizing...');

      // Step 3: Create file record in Shopify
      const createResponse = await fetch(`${config.apiBase}/api/upload/shopify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_file',
          shopDomain: config.shopDomain,
          resourceUrl: staged.resourceUrl,
          fileName: file.name,
          mimeType: file.type,
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to finalize Shopify upload');
      }

      const result = await createResponse.json();
      return result.fileUrl;
    }

    async function uploadToLocal(file, uploadUrl, key) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('key', key);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload file');
      }

      const result = await response.json();
      return result.url || `${config.apiBase}/api/files/${encodeURIComponent(key)}`;
    }

    async function uploadToPresignedUrl(file, uploadUrl, key) {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error('Failed to upload file');
      }

      // For R2/S3, construct public URL from key
      // This will be replaced by actual public URL from storage config
      return uploadUrl.split('?')[0];
    }

    // ══════════════════════════════════════════════════════════════
    // UI HELPERS
    // ══════════════════════════════════════════════════════════════

    function showProgress(percent, text) {
      if (elements.progress) {
        elements.progress.classList.add('active');
        if (elements.progressFill) elements.progressFill.style.width = `${percent}%`;
        if (elements.progressText) elements.progressText.textContent = text;
      }
      if (elements.dropzone) elements.dropzone.style.display = 'none';
    }

    function hideProgress() {
      if (elements.progress) elements.progress.classList.remove('active');
    }

    function showPreview(file, fileUrl) {
      hideProgress();
      
      if (elements.dropzone) elements.dropzone.style.display = 'none';
      if (elements.preview) elements.preview.classList.add('active');
      
      // Show image preview
      if (file.type.startsWith('image/') && elements.previewImg) {
        elements.previewImg.src = fileUrl || URL.createObjectURL(file);
      }
      
      if (elements.fileName) elements.fileName.textContent = file.name;
      if (elements.fileSize) elements.fileSize.textContent = formatFileSize(file.size);
    }

    function resetUpload() {
      state.uploadId = null;
      state.fileUrl = null;
      state.fileName = null;
      state.fileSize = null;
      state.uploading = false;

      hideProgress();
      
      if (elements.preview) elements.preview.classList.remove('active');
      if (elements.dropzone) elements.dropzone.style.display = '';
      if (elements.fileInput) elements.fileInput.value = '';
      if (elements.previewImg) elements.previewImg.src = '';

      updateHiddenInputs();
    }

    function showError(message) {
      if (elements.error) {
        elements.error.textContent = message;
        elements.error.classList.add('active');
      }
    }

    function hideError() {
      if (elements.error) {
        elements.error.classList.remove('active');
      }
    }

    function updateHiddenInputs() {
      if (elements.hiddenUploadId) elements.hiddenUploadId.value = state.uploadId || '';
      if (elements.hiddenFileUrl) elements.hiddenFileUrl.value = state.fileUrl || '';
      if (elements.hiddenFileName) elements.hiddenFileName.value = state.fileName || '';
      if (elements.hiddenPosition) elements.hiddenPosition.value = state.position;
      if (elements.hiddenXPos) elements.hiddenXPos.value = state.xPos;
      if (elements.hiddenYPos) elements.hiddenYPos.value = state.yPos;
      if (elements.hiddenWidth) elements.hiddenWidth.value = state.width;
      if (elements.hiddenHeight) elements.hiddenHeight.value = state.height;
    }

    function formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    // ══════════════════════════════════════════════════════════════
    // MODAL FUNCTIONS
    // ══════════════════════════════════════════════════════════════

    function openModal() {
      if (elements.modal) {
        elements.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        // TODO: Initialize 3D scene if needed
      }
    }

    function closeModal() {
      if (elements.modal) {
        elements.modal.style.display = 'none';
        document.body.style.overflow = '';
      }
    }

    function applyAndClose() {
      // Sync modal values to main widget if needed
      closeModal();
    }

    console.log('[Upload Widget] Initialized for block:', blockId, config);
  }

})();
