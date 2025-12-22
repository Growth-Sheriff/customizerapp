/**
 * UL DTF Uploader v4.1.0
 * ======================
 * FAZ 1: Core DTF Upload Widget
 * FAZ 4: Global State Integration
 * 
 * Features:
 * - File upload with drag & drop
 * - Shopify Variants for size selection
 * - Quantity control
 * - Extra questions from merchant config
 * - Add to Cart with line item properties
 * - T-Shirt modal integration (FAZ 2)
 * - Global state sync (FAZ 4)
 * 
 * State Management Architecture:
 * - Each product has its own isolated state
 * - State changes trigger UI updates
 * - Events dispatched for external integrations
 * - Syncs with ULState global store (FAZ 4)
 * 
 * Prepared for:
 * - FAZ 2: T-Shirt Modal (event: ul:openTShirtModal)
 * - FAZ 3: Confirmation Screen
 * - FAZ 4: Global State sync ✓
 */

(function() {
  'use strict';

  // ===== CONSTANTS =====
  const ALLOWED_TYPES = [
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 
    'image/svg+xml', 'application/pdf',
    'application/postscript', // AI, EPS
    'application/illustrator'
  ];
  const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'ai', 'eps'];
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const POLL_INTERVAL = 1000; // 1 second
  const MAX_POLLS = 60; // 60 seconds max wait

  // ===== GLOBAL NAMESPACE =====
  const ULDTFUploader = {
    instances: {},
    version: '4.1.0',

    /**
     * Initialize uploader for a product
     * @param {string} productId - Shopify product ID
     */
    init(productId) {
      if (this.instances[productId]) {
        console.warn(`[UL] Uploader already initialized for product ${productId}`);
        return;
      }

      const container = document.getElementById(`ul-dtf-${productId}`);
      if (!container) {
        console.error(`[UL] Container not found for product ${productId}`);
        return;
      }

      // Create instance with initial state
      const instance = {
        productId,
        container,
        apiBase: container.dataset.apiBase,
        shopDomain: container.dataset.shopDomain,
        productTitle: container.dataset.productTitle,
        
        // FAZ 1 State (matches architecture doc)
        state: {
          upload: {
            status: 'idle', // idle | uploading | processing | ready | error
            progress: 0,
            uploadId: null,
            file: { name: '', size: 0, type: '' },
            result: {
              thumbnailUrl: '',
              originalUrl: '',
              width: 0,
              height: 0,
              dpi: 0,
              colorMode: '',
              qualityScore: 0,
              warnings: []
            },
            error: null
          },
          form: {
            selectedVariantId: null,
            selectedVariantTitle: '',
            selectedVariantPrice: 0,
            quantity: 1,
            extraAnswers: {},
            isValid: false
          },
          config: {
            uploadEnabled: true,
            tshirtEnabled: false,
            allowedFileTypes: ALLOWED_EXTENSIONS,
            maxFileSizeMB: 50,
            minDPI: 150,
            extraQuestions: [],
            bulkDiscountThreshold: 10,
            bulkDiscountPercent: 10
          }
        },
        
        elements: null,
        pollCount: 0
      };

      // Get DOM elements
      instance.elements = this.getElements(productId);
      this.instances[productId] = instance;

      // Load config and initialize
      this.loadConfig(productId);
    },

    /**
     * Get all DOM elements for a product
     */
    getElements(productId) {
      const $ = (id) => document.getElementById(`ul-${id}-${productId}`);
      return {
        container: document.getElementById(`ul-dtf-${productId}`),
        loading: $('loading'),
        content: $('content'),
        error: $('error'),
        errorText: $('error-text'),
        
        // Upload
        dropzone: $('dropzone'),
        fileInput: $('file-input'),
        progress: $('progress'),
        progressFill: $('progress-fill'),
        progressText: $('progress-text'),
        preview: $('preview'),
        thumb: $('thumb'),
        filename: $('filename'),
        filemeta: $('filemeta'),
        filestatus: $('filestatus'),
        removeBtn: $('remove'),
        
        // Size
        sizeGrid: $('size-grid'),
        sizeHint: $('size-hint'),
        selectedSize: $('selected-size'),
        
        // Quantity
        qtyInput: $('qty-input'),
        qtyMinus: $('qty-minus'),
        qtyPlus: $('qty-plus'),
        bulkHint: $('bulk-hint'),
        qtyDisplay: $('qty-display'),
        
        // Questions
        questionsSection: $('questions-section'),
        questionsContainer: $('questions'),
        
        // Price
        unitPrice: $('unit-price'),
        totalPrice: $('total-price'),
        btnPrice: $('btn-price'),
        
        // Buttons
        tshirtBtn: $('tshirt-btn'),
        addCartBtn: $('add-cart'),
        
        // Hidden fields
        uploadIdField: $('upload-id'),
        uploadUrlField: $('upload-url'),
        thumbnailUrlField: $('thumbnail-url'),

        // Steps
        step1: $('step-1'),
        step2: $('step-2'),
        step3: $('step-3'),
        step4: $('step-4')
      };
    },

    /**
     * Load product configuration from API
     */
    async loadConfig(productId) {
      const instance = this.instances[productId];
      const { elements, apiBase, shopDomain, state } = instance;

      try {
        const response = await fetch(
          `${apiBase}/api/product-config/${productId}?shop=${encodeURIComponent(shopDomain)}`
        );
        
        if (!response.ok) {
          throw new Error('Failed to load configuration');
        }

        const config = await response.json();
        
        // Update state with config
        Object.assign(state.config, {
          uploadEnabled: config.uploadEnabled !== false,
          tshirtEnabled: config.tshirtEnabled === true,
          extraQuestions: config.extraQuestions || []
        });

        if (!state.config.uploadEnabled) {
          elements.container.style.display = 'none';
          return;
        }

        // Render extra questions if any
        if (state.config.extraQuestions.length > 0) {
          this.renderExtraQuestions(productId);
        }

        // Show T-Shirt button if enabled
        if (state.config.tshirtEnabled) {
          elements.tshirtBtn.style.display = 'flex';
        }

        // Initialize selected variant from first available
        const firstVariant = elements.sizeGrid.querySelector('input[type="radio"]:not(:disabled):checked');
        if (firstVariant) {
          state.form.selectedVariantId = firstVariant.value;
          state.form.selectedVariantTitle = firstVariant.dataset.title;
          state.form.selectedVariantPrice = parseInt(firstVariant.dataset.priceRaw, 10);
          this.updatePriceDisplay(productId);
        }

        // Bind events
        this.bindEvents(productId);

        // Show content
        elements.loading.classList.remove('active');
        elements.content.style.display = 'block';

      } catch (error) {
        console.error('[UL] Config load error:', error);
        elements.loading.innerHTML = '<div>Failed to load. Please refresh the page.</div>';
      }
    },

    /**
     * Render extra questions from config
     */
    renderExtraQuestions(productId) {
      const instance = this.instances[productId];
      const { elements, state } = instance;
      const questions = state.config.extraQuestions;

      if (!questions.length) return;

      elements.questionsSection.style.display = 'block';
      elements.questionsContainer.innerHTML = '';

      // Update step numbers (questions become step 4, steps 2-3 stay same)
      if (elements.step4) elements.step4.textContent = '4';

      questions.forEach((q, index) => {
        const fieldId = `ul-q-${productId}-${q.id || index}`;
        const fieldDiv = document.createElement('div');
        fieldDiv.className = q.type === 'checkbox' ? 'ul-field checkbox' : 'ul-field';

        const label = document.createElement('label');
        label.setAttribute('for', fieldId);
        label.textContent = q.label;
        if (q.required) {
          const req = document.createElement('span');
          req.className = 'required';
          req.textContent = ' *';
          label.appendChild(req);
        }

        let input;
        switch (q.type) {
          case 'textarea':
            input = document.createElement('textarea');
            input.id = fieldId;
            input.name = `properties[${q.label}]`;
            if (q.required) input.required = true;
            if (q.placeholder) input.placeholder = q.placeholder;
            fieldDiv.appendChild(label);
            fieldDiv.appendChild(input);
            break;

          case 'select':
            input = document.createElement('select');
            input.id = fieldId;
            input.name = `properties[${q.label}]`;
            if (q.required) input.required = true;
            
            const defOpt = document.createElement('option');
            defOpt.value = '';
            defOpt.textContent = 'Select...';
            input.appendChild(defOpt);
            
            (q.options || []).forEach(opt => {
              const option = document.createElement('option');
              option.value = typeof opt === 'string' ? opt : opt.value;
              option.textContent = typeof opt === 'string' ? opt : opt.label;
              input.appendChild(option);
            });
            fieldDiv.appendChild(label);
            fieldDiv.appendChild(input);
            break;

          case 'checkbox':
            input = document.createElement('input');
            input.type = 'checkbox';
            input.id = fieldId;
            input.name = `properties[${q.label}]`;
            input.value = 'Yes';
            fieldDiv.appendChild(input);
            fieldDiv.appendChild(label);
            break;

          case 'number':
            input = document.createElement('input');
            input.type = 'number';
            input.id = fieldId;
            input.name = `properties[${q.label}]`;
            if (q.required) input.required = true;
            if (q.min !== undefined) input.min = q.min;
            if (q.max !== undefined) input.max = q.max;
            fieldDiv.appendChild(label);
            fieldDiv.appendChild(input);
            break;

          default: // text
            input = document.createElement('input');
            input.type = 'text';
            input.id = fieldId;
            input.name = `properties[${q.label}]`;
            if (q.required) input.required = true;
            if (q.placeholder) input.placeholder = q.placeholder;
            fieldDiv.appendChild(label);
            fieldDiv.appendChild(input);
        }

        // Add change listener for validation
        if (input) {
          input.addEventListener('change', () => this.updateExtraAnswer(productId, q.id || index, q.label, input));
        }

        elements.questionsContainer.appendChild(fieldDiv);
      });
    },

    /**
     * Update extra answer in state
     */
    updateExtraAnswer(productId, questionId, label, input) {
      const instance = this.instances[productId];
      if (input.type === 'checkbox') {
        instance.state.form.extraAnswers[label] = input.checked ? 'Yes' : 'No';
      } else {
        instance.state.form.extraAnswers[label] = input.value;
      }
      this.validateForm(productId);
    },

    /**
     * Bind all event handlers
     */
    bindEvents(productId) {
      const instance = this.instances[productId];
      const { elements } = instance;

      // Dropzone click
      elements.dropzone.addEventListener('click', () => {
        elements.fileInput.click();
      });

      // File input change
      elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleFileSelect(productId, e.target.files[0]);
        }
      });

      // Drag & drop
      elements.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropzone.classList.add('dragover');
      });

      elements.dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        elements.dropzone.classList.remove('dragover');
      });

      elements.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          this.handleFileSelect(productId, e.dataTransfer.files[0]);
        }
      });

      // Remove file
      elements.removeBtn.addEventListener('click', () => {
        this.clearUpload(productId);
      });

      // Size selection
      elements.sizeGrid.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
          instance.state.form.selectedVariantId = radio.value;
          instance.state.form.selectedVariantTitle = radio.dataset.title;
          instance.state.form.selectedVariantPrice = parseInt(radio.dataset.priceRaw, 10);
          this.updatePriceDisplay(productId);
          this.validateForm(productId);
        });
      });

      // Quantity controls
      elements.qtyMinus.addEventListener('click', () => {
        const current = parseInt(elements.qtyInput.value, 10) || 1;
        if (current > 1) {
          elements.qtyInput.value = current - 1;
          instance.state.form.quantity = current - 1;
          this.updatePriceDisplay(productId);
        }
      });

      elements.qtyPlus.addEventListener('click', () => {
        const current = parseInt(elements.qtyInput.value, 10) || 1;
        if (current < 999) {
          elements.qtyInput.value = current + 1;
          instance.state.form.quantity = current + 1;
          this.updatePriceDisplay(productId);
        }
      });

      elements.qtyInput.addEventListener('change', () => {
        let val = parseInt(elements.qtyInput.value, 10) || 1;
        val = Math.max(1, Math.min(999, val));
        elements.qtyInput.value = val;
        instance.state.form.quantity = val;
        this.updatePriceDisplay(productId);
      });

      // T-Shirt button
      elements.tshirtBtn.addEventListener('click', () => {
        this.openTShirtModal(productId);
      });

      // Add to Cart button
      elements.addCartBtn.addEventListener('click', () => {
        this.addToCart(productId);
      });
    },

    /**
     * Handle file selection
     * FAZ 7: Enhanced error handling with ULErrorHandler
     */
    async handleFileSelect(productId, file) {
      const instance = this.instances[productId];
      const { elements, apiBase, shopDomain, state } = instance;

      // FAZ 7: Use ULErrorHandler for file validation
      if (window.ULErrorHandler) {
        const validation = window.ULErrorHandler.validateFile(file, {
          maxSize: MAX_FILE_SIZE,
          allowedExtensions: ALLOWED_EXTENSIONS
        });
        
        if (!validation.valid) {
          const err = validation.errors[0];
          window.ULErrorHandler.show(err.code, err.params, {
            onRetry: () => elements.fileInput.click()
          });
          this.showError(productId, window.ULErrorHandler.getError(err.code).message.replace('{maxSize}', err.params.maxSize || '50MB').replace('{allowedTypes}', err.params.allowedTypes || ALLOWED_EXTENSIONS.join(', ').toUpperCase()));
          return;
        }
      } else {
        // Fallback validation
        const ext = file.name.split('.').pop().toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          this.showError(productId, `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}`);
          return;
        }

        if (file.size > MAX_FILE_SIZE) {
          this.showError(productId, 'File too large. Maximum size is 50MB.');
          return;
        }
      }

      this.hideError(productId);

      // Update state
      state.upload.status = 'uploading';
      state.upload.progress = 0;
      state.upload.file = { name: file.name, size: file.size, type: file.type };

      // Sync with global state (FAZ 4)
      if (window.ULState) {
        window.ULState.set('upload.status', 'uploading');
        window.ULState.set('upload.fileName', file.name);
        window.ULState.set('upload.fileSize', file.size);
        window.ULState.set('upload.mimeType', file.type);
      }

      // Emit global event (FAZ 4)
      if (window.ULEvents) {
        window.ULEvents.emit('uploadStart', { 
          fileName: file.name, 
          fileSize: file.size, 
          productId 
        });
      }

      // Show progress UI
      elements.dropzone.style.display = 'none';
      elements.progress.classList.add('active');
      elements.progressFill.style.width = '0%';
      elements.progressText.textContent = 'Preparing upload...';
      elements.step1.classList.remove('completed');

      try {
        // Step 1: Get signed URL from API
        const intentResponse = await fetch(`${apiBase}/api/upload/intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain,
            productId,
            mode: 'dtf',
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            fileSize: file.size
          })
        });

        if (!intentResponse.ok) {
          const err = await intentResponse.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to prepare upload');
        }

        const intentData = await intentResponse.json();
        state.upload.uploadId = intentData.uploadId;

        elements.progressFill.style.width = '15%';
        elements.progressText.textContent = 'Uploading...';

        // Step 2: Upload file directly to storage
        await this.uploadToStorage(productId, file, intentData);

        elements.progressFill.style.width = '80%';
        elements.progressText.textContent = 'Processing...';

        // Step 3: Complete upload
        const completeResponse = await fetch(`${apiBase}/api/upload/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: intentData.uploadId,
            shop: shopDomain
          })
        });

        if (!completeResponse.ok) {
          throw new Error('Failed to finalize upload');
        }

        // Step 4: Poll for processing status
        state.upload.status = 'processing';
        elements.progressText.textContent = 'Analyzing file...';
        await this.pollUploadStatus(productId, intentData.uploadId);

      } catch (error) {
        console.error('[UL] Upload error:', error);
        state.upload.status = 'error';
        state.upload.error = error.message;
        elements.progress.classList.remove('active');
        elements.dropzone.style.display = 'block';
        
        // FAZ 7: Enhanced error handling
        const errorMessage = error.message || 'Upload failed. Please try again.';
        this.showError(productId, errorMessage);
        
        if (window.ULErrorHandler) {
          // Determine error type
          let errorCode = 'UPLOAD_FAILED';
          if (error.message?.includes('network') || error.message?.includes('connection')) {
            errorCode = 'UPLOAD_NETWORK_ERROR';
          } else if (error.message?.includes('timeout')) {
            errorCode = 'UPLOAD_TIMEOUT';
          } else if (error.message?.includes('process')) {
            errorCode = 'UPLOAD_PROCESSING_FAILED';
          }
          
          window.ULErrorHandler.show(errorCode, {}, {
            onRetry: () => {
              this.hideError(productId);
              elements.fileInput.click();
            }
          });
        }
      }
    },

    /**
     * Upload file to storage with progress tracking
     */
    uploadToStorage(productId, file, intentData) {
      const instance = this.instances[productId];
      const { elements } = instance;

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = 15 + ((e.loaded / e.total) * 60); // 15% to 75%
            elements.progressFill.style.width = `${percent}%`;
            elements.progressText.textContent = `Uploading... ${Math.round((e.loaded / e.total) * 100)}%`;
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.open('PUT', intentData.signedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      });
    },

    /**
     * Poll upload status until processing complete
     */
    async pollUploadStatus(productId, uploadId) {
      const instance = this.instances[productId];
      const { elements, apiBase, shopDomain, state } = instance;

      instance.pollCount = 0;

      const poll = async () => {
        try {
          const response = await fetch(
            `${apiBase}/api/upload/status/${uploadId}?shop=${encodeURIComponent(shopDomain)}`
          );
          
          if (!response.ok) {
            throw new Error('Failed to check status');
          }

          const data = await response.json();

          if (data.status === 'ready' || data.status === 'completed') {
            // Success!
            state.upload.status = 'ready';
            state.upload.result = {
              thumbnailUrl: data.thumbnailUrl || '',
              originalUrl: data.downloadUrl || data.url || '',
              width: data.metadata?.width || 0,
              height: data.metadata?.height || 0,
              dpi: data.metadata?.dpi || 0,
              colorMode: data.metadata?.colorMode || '',
              qualityScore: data.qualityScore || 100,
              warnings: data.warnings || []
            };

            // Update hidden fields
            elements.uploadIdField.value = uploadId;
            elements.uploadUrlField.value = state.upload.result.originalUrl;
            elements.thumbnailUrlField.value = state.upload.result.thumbnailUrl;

            // Sync with global state (FAZ 4)
            if (window.ULState) {
              window.ULState.setUploadComplete({
                id: uploadId,
                thumbnailUrl: state.upload.result.thumbnailUrl,
                url: state.upload.result.originalUrl,
                name: state.upload.file.name,
                size: state.upload.file.size,
                mimeType: state.upload.file.type,
                dimensions: {
                  width: state.upload.result.width,
                  height: state.upload.result.height,
                  dpi: state.upload.result.dpi
                }
              });
              
              // Update DTF state
              window.ULState.set('dtf.productId', productId);
            }

            // Emit global event (FAZ 4)
            if (window.ULEvents) {
              window.ULEvents.emit('uploadComplete', {
                uploadId,
                productId,
                thumbnailUrl: state.upload.result.thumbnailUrl,
                originalUrl: state.upload.result.originalUrl
              });
            }

            // Show preview
            this.showPreview(productId);
            elements.progress.classList.remove('active');
            elements.step1.classList.add('completed');
            
            // Enable buttons
            this.validateForm(productId);
            return;

          } else if (data.status === 'failed' || data.status === 'error') {
            throw new Error(data.error || 'Processing failed');

          } else {
            // Still processing - continue polling
            instance.pollCount++;
            if (instance.pollCount >= MAX_POLLS) {
              throw new Error('Processing timeout. Please try again.');
            }
            
            const progress = 80 + (instance.pollCount / MAX_POLLS * 15);
            elements.progressFill.style.width = `${Math.min(progress, 95)}%`;
            
            setTimeout(poll, POLL_INTERVAL);
          }
        } catch (error) {
          throw error;
        }
      };

      await poll();
    },

    /**
     * Show file preview after successful upload
     * FAZ 7: Enhanced DPI warning with ULErrorHandler
     */
    showPreview(productId) {
      const instance = this.instances[productId];
      const { elements, state } = instance;
      const { file, result } = state.upload;

      // Set filename
      elements.filename.textContent = file.name;

      // Set metadata
      const meta = [];
      if (result.width && result.height) {
        meta.push(`${result.width} × ${result.height} px`);
      }
      if (result.dpi) {
        meta.push(`${result.dpi} DPI`);
      }
      meta.push(this.formatFileSize(file.size));
      elements.filemeta.textContent = meta.join(' • ');

      // FAZ 7: Check for low DPI warning
      const minDpi = state.config.minDPI || 150;
      const hasLowDpi = result.dpi && result.dpi < minDpi;
      const hasWarnings = (result.warnings && result.warnings.length > 0) || hasLowDpi;
      const statusEl = elements.filestatus;
      
      if (hasLowDpi && window.ULErrorHandler) {
        // Show DPI warning toast
        window.ULErrorHandler.show('UPLOAD_LOW_DPI', {
          actualDpi: result.dpi,
          minDpi: minDpi
        });
      }
      
      if (hasWarnings) {
        elements.preview.classList.add('has-warning');
        statusEl.classList.add('warning');
        
        const warningText = hasLowDpi 
          ? `Low resolution: ${result.dpi} DPI (recommended: ${minDpi}+ DPI)`
          : result.warnings[0];
        
        statusEl.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          </svg>
          <span>${warningText}</span>
        `;
      } else {
        elements.preview.classList.remove('has-warning');
        statusEl.classList.remove('warning');
        statusEl.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Ready for print</span>
        `;
      }

      // Set thumbnail
      if (result.thumbnailUrl) {
        elements.thumb.src = result.thumbnailUrl;
      } else if (file.type.startsWith('image/')) {
        // Create local preview for images
        const reader = new FileReader();
        reader.onload = (e) => { elements.thumb.src = e.target.result; };
        reader.readAsDataURL(instance.lastFile || new Blob());
      } else {
        // Generic file icon
        elements.thumb.src = 'data:image/svg+xml,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="#6b7280">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
          </svg>
        `);
      }

      // Show preview, hide dropzone
      elements.dropzone.style.display = 'none';
      elements.preview.classList.add('active');

      // Enable T-Shirt button if config allows
      if (state.config.tshirtEnabled) {
        elements.tshirtBtn.disabled = false;
      }
    },

    /**
     * Clear upload and reset to initial state
     */
    clearUpload(productId) {
      const instance = this.instances[productId];
      const { elements, state } = instance;

      // Reset state
      state.upload = {
        status: 'idle',
        progress: 0,
        uploadId: null,
        file: { name: '', size: 0, type: '' },
        result: {
          thumbnailUrl: '',
          originalUrl: '',
          width: 0,
          height: 0,
          dpi: 0,
          colorMode: '',
          qualityScore: 0,
          warnings: []
        },
        error: null
      };

      // Sync with global state (FAZ 4)
      if (window.ULState) {
        window.ULState.clearUpload();
      }

      // Reset hidden fields
      elements.uploadIdField.value = '';
      elements.uploadUrlField.value = '';
      elements.thumbnailUrlField.value = '';

      // Reset file input
      elements.fileInput.value = '';

      // Hide preview, show dropzone
      elements.preview.classList.remove('active');
      elements.preview.classList.remove('has-warning');
      elements.dropzone.style.display = 'block';
      elements.step1.classList.remove('completed');

      // Disable buttons
      elements.tshirtBtn.disabled = true;
      this.validateForm(productId);
    },

    /**
     * Update price display
     */
    updatePriceDisplay(productId) {
      const instance = this.instances[productId];
      const { elements, state } = instance;
      const { form, config } = state;

      // Update selected size display
      elements.selectedSize.textContent = form.selectedVariantTitle || '-';
      
      // Format unit price
      const unitPrice = form.selectedVariantPrice / 100;
      elements.unitPrice.textContent = this.formatMoney(unitPrice);

      // Update quantity display
      elements.qtyDisplay.textContent = form.quantity;

      // Calculate total (with potential bulk discount)
      let total = unitPrice * form.quantity;
      
      // Check for bulk discount
      if (form.quantity >= config.bulkDiscountThreshold) {
        const discount = total * (config.bulkDiscountPercent / 100);
        total = total - discount;
        elements.bulkHint.style.display = 'flex';
      } else {
        elements.bulkHint.style.display = 'none';
      }

      // Update total display
      elements.totalPrice.textContent = this.formatMoney(total);
      elements.btnPrice.textContent = `• ${this.formatMoney(total)}`;
    },

    /**
     * Validate form and update button states
     */
    validateForm(productId) {
      const instance = this.instances[productId];
      const { elements, state } = instance;
      const { upload, form, config } = state;

      let isValid = true;
      const errors = [];

      // Check upload
      if (upload.status !== 'ready') {
        isValid = false;
        errors.push('Upload your design');
      }

      // Check variant selection
      if (!form.selectedVariantId) {
        isValid = false;
        errors.push('Select a size');
      }

      // Check quantity
      if (form.quantity < 1) {
        isValid = false;
        errors.push('Quantity must be at least 1');
      }

      // Check required extra questions
      for (const q of config.extraQuestions) {
        if (q.required) {
          const answer = form.extraAnswers[q.label];
          if (!answer || answer === '' || answer === 'No') {
            isValid = false;
            errors.push(`Fill in "${q.label}"`);
          }
        }
      }

      form.isValid = isValid;
      elements.addCartBtn.disabled = !isValid;

      return { valid: isValid, errors };
    },

    /**
     * Open T-Shirt modal (FAZ 2 integration)
     */
    openTShirtModal(productId) {
      const instance = this.instances[productId];
      const { state } = instance;

      if (state.upload.status !== 'ready') {
        this.showError(productId, 'Please upload your design first.');
        return;
      }

      // Update global state (FAZ 4)
      if (window.ULState) {
        window.ULState.set('tshirt.useInheritedDesign', true);
        window.ULState.openTShirtModal();
      }

      // Emit global event (FAZ 4)
      if (window.ULEvents) {
        window.ULEvents.emit('modalOpen', { source: 'dtf-uploader', productId });
      }

      // Dispatch event for tshirt-modal.js (FAZ 2)
      const event = new CustomEvent('ul:openTShirtModal', {
        detail: {
          productId,
          uploadData: {
            uploadId: state.upload.uploadId,
            thumbnailUrl: state.upload.result.thumbnailUrl,
            originalUrl: state.upload.result.originalUrl,
            dimensions: {
              width: state.upload.result.width,
              height: state.upload.result.height,
              dpi: state.upload.result.dpi
            }
          },
          config: state.config
        },
        bubbles: true
      });
      document.dispatchEvent(event);
    },

    /**
     * Add item to Shopify cart
     */
    async addToCart(productId) {
      const instance = this.instances[productId];
      const { elements, state } = instance;

      // Validate first
      const validation = this.validateForm(productId);
      if (!validation.valid) {
        this.showError(productId, validation.errors[0]);
        return;
      }

      const { upload, form } = state;

      // Disable button and show loading
      elements.addCartBtn.disabled = true;
      elements.addCartBtn.classList.add('loading');

      try {
        // Build cart item with properties
        const properties = {
          '_ul_upload_id': upload.uploadId,
          '_ul_upload_url': upload.result.originalUrl,
          '_ul_thumbnail': upload.result.thumbnailUrl,
          '_ul_design_type': 'dtf',
          '_ul_file_name': upload.file.name
        };

        // Add dimensions if available
        if (upload.result.width && upload.result.height) {
          properties['_ul_dimensions'] = `${upload.result.width}x${upload.result.height}`;
        }

        // Add extra answers
        for (const [key, value] of Object.entries(form.extraAnswers)) {
          if (value && value !== '') {
            properties[key] = value;
          }
        }

        // Add to cart via Shopify AJAX API
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{
              id: parseInt(form.selectedVariantId, 10),
              quantity: form.quantity,
              properties
            }]
          })
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.description || 'Failed to add to cart');
        }

        // Success!
        elements.addCartBtn.classList.remove('loading');
        elements.addCartBtn.classList.add('success');
        elements.addCartBtn.querySelector('.ul-btn-text').textContent = '✓ Added!';

        // Show toast
        this.showToast('Added to cart!', 'success');

        // Dispatch event for cart update (theme may listen)
        document.dispatchEvent(new CustomEvent('ul:addedToCart', {
          detail: { productId, quantity: form.quantity, variantId: form.selectedVariantId },
          bubbles: true
        }));

        // Show confirmation screen (FAZ 3)
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('ul:showConfirmation', {
            detail: { source: 'dtf-uploader', productId }
          }));
        }, 500);

        // Reset after 2 seconds
        setTimeout(() => {
          elements.addCartBtn.classList.remove('success');
          elements.addCartBtn.querySelector('.ul-btn-text').textContent = 'Add to Cart';
          elements.addCartBtn.disabled = false;
          
          // Optionally clear upload for next design
          // this.clearUpload(productId);
        }, 2000);

      } catch (error) {
        console.error('[UL] Add to cart error:', error);
        elements.addCartBtn.classList.remove('loading');
        elements.addCartBtn.disabled = false;
        
        // FAZ 7: Enhanced cart error handling
        const errorMsg = error.message || '';
        
        if (window.ULErrorHandler) {
          let errorCode = 'CART_ADD_FAILED';
          
          if (errorMsg.includes('stock') || errorMsg.includes('available')) {
            errorCode = 'CART_VARIANT_OUT_OF_STOCK';
          } else if (errorMsg.includes('session') || errorMsg.includes('expired')) {
            errorCode = 'CART_SESSION_EXPIRED';
          }
          
          window.ULErrorHandler.show(errorCode, {}, {
            onRetry: () => this.addToCart(productId)
          });
        }
        
        this.showError(productId, errorMsg || 'Failed to add to cart. Please try again.');
      }
    },

    // ===== UTILITY METHODS =====

    showError(productId, message) {
      const { elements } = this.instances[productId];
      elements.errorText.textContent = message;
      elements.error.classList.add('active');
    },

    hideError(productId) {
      const { elements } = this.instances[productId];
      elements.error.classList.remove('active');
    },

    showToast(message, type = 'success') {
      const toast = document.getElementById('ul-toast');
      const text = document.getElementById('ul-toast-text');
      if (toast && text) {
        text.textContent = message;
        toast.className = `ul-toast active ${type}`;
        setTimeout(() => {
          toast.classList.remove('active');
        }, 3000);
      }
    },

    formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    formatMoney(amount) {
      return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    /**
     * Get state for external access (FAZ 2, FAZ 4)
     */
    getState(productId) {
      const instance = this.instances[productId];
      return instance ? { ...instance.state } : null;
    },

    /**
     * Get upload data for T-Shirt modal (FAZ 2)
     */
    getUploadData(productId) {
      const instance = this.instances[productId];
      if (!instance || instance.state.upload.status !== 'ready') {
        return null;
      }
      return {
        uploadId: instance.state.upload.uploadId,
        thumbnailUrl: instance.state.upload.result.thumbnailUrl,
        originalUrl: instance.state.upload.result.originalUrl,
        fileName: instance.state.upload.file.name,
        dimensions: {
          width: instance.state.upload.result.width,
          height: instance.state.upload.result.height,
          dpi: instance.state.upload.result.dpi
        }
      };
    }
  };

  // Expose globally
  window.ULDTFUploader = ULDTFUploader;

})();
