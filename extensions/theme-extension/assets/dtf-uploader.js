/**
 * DTF Uploader Widget
 * ====================
 * Handles file upload, form submission, and cart integration
 * 
 * Version: 3.0.0
 */

(function() {
  'use strict';

  const DTFUploader = {
    instances: {},
    
    /**
     * Initialize uploader for a product
     */
    init(productId) {
      const container = document.getElementById(`dtf-uploader-${productId}`);
      if (!container) {
        console.error(`[DTF] Container not found for product ${productId}`);
        return;
      }

      // Get config from data attributes
      const apiBase = container.dataset.apiBase;
      const shopDomain = container.dataset.shopDomain;
      const variantId = container.dataset.variantId;

      // Create instance
      this.instances[productId] = {
        productId,
        apiBase,
        shopDomain,
        variantId,
        config: null,
        uploadData: null,
        elements: this.getElements(productId)
      };

      // Load configuration from API
      this.loadConfig(productId);
    },

    /**
     * Get all DOM elements
     */
    getElements(productId) {
      return {
        container: document.getElementById(`dtf-uploader-${productId}`),
        loading: document.getElementById(`dtf-loading-${productId}`),
        content: document.getElementById(`dtf-content-${productId}`),
        error: document.getElementById(`dtf-error-${productId}`),
        dropzone: document.getElementById(`dtf-dropzone-${productId}`),
        fileInput: document.getElementById(`dtf-file-${productId}`),
        preview: document.getElementById(`dtf-preview-${productId}`),
        previewImg: document.getElementById(`dtf-preview-img-${productId}`),
        filename: document.getElementById(`dtf-filename-${productId}`),
        filesize: document.getElementById(`dtf-filesize-${productId}`),
        removeBtn: document.getElementById(`dtf-remove-${productId}`),
        progress: document.getElementById(`dtf-progress-${productId}`),
        progressFill: document.getElementById(`dtf-progress-fill-${productId}`),
        progressText: document.getElementById(`dtf-progress-text-${productId}`),
        questionsSection: document.getElementById(`dtf-questions-section-${productId}`),
        questionsContainer: document.getElementById(`dtf-questions-container-${productId}`),
        sizeStep: document.getElementById(`dtf-size-step-${productId}`),
        widthInput: document.getElementById(`dtf-width-${productId}`),
        heightInput: document.getElementById(`dtf-height-${productId}`),
        qtyInput: document.getElementById(`dtf-qty-${productId}`),
        tshirtSection: document.getElementById(`dtf-tshirt-section-${productId}`),
        tshirtBtn: document.getElementById(`dtf-tshirt-btn-${productId}`),
        uploadId: document.getElementById(`dtf-upload-id-${productId}`),
        uploadUrl: document.getElementById(`dtf-upload-url-${productId}`),
        uploadName: document.getElementById(`dtf-upload-name-${productId}`),
        widthHidden: document.getElementById(`dtf-width-hidden-${productId}`),
        heightHidden: document.getElementById(`dtf-height-hidden-${productId}`)
      };
    },

    /**
     * Load product configuration from API
     */
    async loadConfig(productId) {
      const instance = this.instances[productId];
      const { elements, apiBase, shopDomain } = instance;

      try {
        elements.loading.classList.add('active');
        
        const response = await fetch(
          `${apiBase}/api/product-config/${productId}?shop=${encodeURIComponent(shopDomain)}`
        );
        
        if (!response.ok) {
          throw new Error('Failed to load configuration');
        }

        const config = await response.json();
        instance.config = config;

        // Check if upload is enabled
        if (!config.uploadEnabled) {
          elements.container.style.display = 'none';
          return;
        }

        // Render extra questions
        if (config.extraQuestions && config.extraQuestions.length > 0) {
          this.renderExtraQuestions(productId, config.extraQuestions);
        }

        // Show T-Shirt button if enabled
        if (config.tshirtEnabled) {
          elements.tshirtSection.style.display = 'block';
        }

        // Bind events
        this.bindEvents(productId);

        // Show content
        elements.loading.classList.remove('active');
        elements.content.style.display = 'block';

      } catch (error) {
        console.error('[DTF] Config load error:', error);
        elements.loading.innerHTML = 'Failed to load uploader. Please refresh the page.';
      }
    },

    /**
     * Render extra questions from config (XSS-safe)
     */
    renderExtraQuestions(productId, questions) {
      const instance = this.instances[productId];
      const { questionsSection, questionsContainer, sizeStep } = instance.elements;

      questionsSection.style.display = 'block';
      sizeStep.textContent = '3'; // Update step number

      // Clear container safely
      questionsContainer.innerHTML = '';

      questions.forEach((q, index) => {
        const fieldId = `dtf-q-${productId}-${q.id}`;
        const fieldDiv = document.createElement('div');
        fieldDiv.className = q.type === 'checkbox' ? 'dtf-field dtf-checkbox-field' : 'dtf-field';

        const label = document.createElement('label');
        label.setAttribute('for', fieldId);
        label.textContent = q.label; // Safe - textContent escapes HTML
        
        if (q.required) {
          const reqSpan = document.createElement('span');
          reqSpan.className = 'required';
          reqSpan.textContent = ' *';
          label.appendChild(reqSpan);
        }

        let input;
        switch (q.type) {
          case 'text':
            input = document.createElement('input');
            input.type = 'text';
            input.id = fieldId;
            input.name = `properties[${q.label}]`;
            if (q.required) input.required = true;
            fieldDiv.appendChild(label);
            fieldDiv.appendChild(input);
            break;

          case 'textarea':
            input = document.createElement('textarea');
            input.id = fieldId;
            input.name = `properties[${q.label}]`;
            if (q.required) input.required = true;
            fieldDiv.appendChild(label);
            fieldDiv.appendChild(input);
            break;

          case 'select':
            input = document.createElement('select');
            input.id = fieldId;
            input.name = `properties[${q.label}]`;
            if (q.required) input.required = true;
            
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = 'Select...';
            input.appendChild(defaultOpt);
            
            (q.options || []).forEach(opt => {
              const option = document.createElement('option');
              option.value = opt;
              option.textContent = opt; // Safe
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
            if (q.required) input.required = true;
            fieldDiv.appendChild(input);
            fieldDiv.appendChild(label);
            break;

          case 'number':
            input = document.createElement('input');
            input.type = 'number';
            input.id = fieldId;
            input.name = `properties[${q.label}]`;
            if (q.required) input.required = true;
            fieldDiv.appendChild(label);
            fieldDiv.appendChild(input);
            break;

          default:
            input = document.createElement('input');
            input.type = 'text';
            input.id = fieldId;
            input.name = `properties[${q.label}]`;
            fieldDiv.appendChild(label);
            fieldDiv.appendChild(input);
        }

        questionsContainer.appendChild(fieldDiv);
      });
    },

    /**
     * Bind all event handlers
     */
    bindEvents(productId) {
      const instance = this.instances[productId];
      const { dropzone, fileInput, removeBtn, tshirtBtn, widthInput, heightInput } = instance.elements;

      // Dropzone click
      dropzone.addEventListener('click', () => fileInput.click());

      // File input change
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleFileSelect(productId, e.target.files[0]);
        }
      });

      // Drag & drop
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          this.handleFileSelect(productId, e.dataTransfer.files[0]);
        }
      });

      // Remove file
      removeBtn.addEventListener('click', () => {
        this.clearUpload(productId);
      });

      // Size sync
      widthInput.addEventListener('change', () => {
        instance.elements.widthHidden.value = widthInput.value;
      });
      heightInput.addEventListener('change', () => {
        instance.elements.heightHidden.value = heightInput.value;
      });

      // T-Shirt button
      if (tshirtBtn) {
        tshirtBtn.addEventListener('click', () => {
          this.openTShirtModal(productId);
        });
      }
    },

    /**
     * Handle file selection
     */
    async handleFileSelect(productId, file) {
      const instance = this.instances[productId];
      const { elements, apiBase, shopDomain } = instance;

      // Validate file
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf', 'image/svg+xml', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        this.showError(productId, 'Invalid file type. Please upload PNG, JPG, PDF, SVG or WebP.');
        return;
      }

      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        this.showError(productId, 'File too large. Maximum size is 50MB.');
        return;
      }

      this.hideError(productId);

      // Show progress
      elements.dropzone.style.display = 'none';
      elements.progress.classList.add('active');
      elements.progressFill.style.width = '0%';
      elements.progressText.textContent = 'Preparing upload...';

      try {
        // Step 1: Get signed URL
        const intentResponse = await fetch(`${apiBase}/api/upload/intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain: shopDomain,
            productId: productId,
            mode: 'dtf',
            fileName: file.name,
            contentType: file.type,
            fileSize: file.size
          })
        });

        if (!intentResponse.ok) {
          throw new Error('Failed to get upload URL');
        }

        const intentData = await intentResponse.json();
        elements.progressFill.style.width = '20%';
        elements.progressText.textContent = 'Uploading...';

        // Step 2: Upload to storage
        await this.uploadFile(productId, file, intentData);

        // Step 3: Complete upload
        elements.progressFill.style.width = '90%';
        elements.progressText.textContent = 'Finalizing...';

        const completeResponse = await fetch(`${apiBase}/api/upload/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: intentData.uploadId,
            shop: shopDomain
          })
        });

        if (!completeResponse.ok) {
          throw new Error('Failed to complete upload');
        }

        const completeData = await completeResponse.json();
        
        // Store upload data
        instance.uploadData = {
          id: intentData.uploadId,
          url: completeData.url || intentData.downloadUrl,
          name: file.name
        };

        // Update hidden fields
        elements.uploadId.value = instance.uploadData.id;
        elements.uploadUrl.value = instance.uploadData.url;
        elements.uploadName.value = instance.uploadData.name;

        // Show preview
        elements.progressFill.style.width = '100%';
        elements.progressText.textContent = 'Done!';
        
        setTimeout(() => {
          elements.progress.classList.remove('active');
          this.showPreview(productId, file);
        }, 500);

        // Enable T-Shirt button
        if (elements.tshirtBtn) {
          elements.tshirtBtn.disabled = false;
        }

      } catch (error) {
        console.error('[DTF] Upload error:', error);
        elements.progress.classList.remove('active');
        elements.dropzone.style.display = 'block';
        this.showError(productId, 'Upload failed. Please try again.');
      }
    },

    /**
     * Upload file to storage with progress
     */
    async uploadFile(productId, file, intentData) {
      const instance = this.instances[productId];
      const { elements } = instance;

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = 20 + ((e.loaded / e.total) * 60); // 20-80%
            elements.progressFill.style.width = `${percent}%`;
            elements.progressText.textContent = `Uploading... ${Math.round(e.loaded / e.total * 100)}%`;
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.open('PUT', intentData.signedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
    },

    /**
     * Show file preview
     */
    showPreview(productId, file) {
      const instance = this.instances[productId];
      const { preview, previewImg, filename, filesize, dropzone } = instance.elements;

      filename.textContent = file.name;
      filesize.textContent = this.formatFileSize(file.size);

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImg.src = e.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        previewImg.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 24 24" fill="%236b7280"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/></svg>';
      }

      dropzone.style.display = 'none';
      preview.classList.add('active');
    },

    /**
     * Clear upload
     */
    clearUpload(productId) {
      const instance = this.instances[productId];
      const { elements } = instance;

      instance.uploadData = null;
      elements.uploadId.value = '';
      elements.uploadUrl.value = '';
      elements.uploadName.value = '';
      elements.fileInput.value = '';
      elements.preview.classList.remove('active');
      elements.dropzone.style.display = 'block';

      if (elements.tshirtBtn) {
        elements.tshirtBtn.disabled = true;
      }
    },

    /**
     * Open T-Shirt modal
     */
    openTShirtModal(productId) {
      const instance = this.instances[productId];
      
      if (!instance.uploadData) {
        this.showError(productId, 'Please upload your design first.');
        return;
      }

      // Dispatch event for tshirt-modal.js to handle
      const event = new CustomEvent('dtf:open-tshirt-modal', {
        detail: {
          productId,
          uploadData: instance.uploadData,
          config: instance.config.tshirtConfig
        }
      });
      document.dispatchEvent(event);
    },

    /**
     * Show error message
     */
    showError(productId, message) {
      const { error } = this.instances[productId].elements;
      error.textContent = message;
      error.classList.add('active');
    },

    /**
     * Hide error message
     */
    hideError(productId) {
      const { error } = this.instances[productId].elements;
      error.classList.remove('active');
    },

    /**
     * Format file size
     */
    formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Get upload data for cart (called by theme's cart form)
     */
    getCartProperties(productId) {
      const instance = this.instances[productId];
      if (!instance || !instance.uploadData) return null;

      const { elements } = instance;
      const properties = {
        '_upload_id': instance.uploadData.id,
        '_upload_url': instance.uploadData.url,
        '_upload_name': instance.uploadData.name,
        '_design_width': elements.widthInput.value,
        '_design_height': elements.heightInput.value
      };

      // Add extra questions
      if (instance.config && instance.config.extraQuestions) {
        instance.config.extraQuestions.forEach(q => {
          const fieldId = `dtf-q-${productId}-${q.id}`;
          const field = document.getElementById(fieldId);
          if (field) {
            if (field.type === 'checkbox') {
              properties[q.label] = field.checked ? 'Yes' : 'No';
            } else {
              properties[q.label] = field.value;
            }
          }
        });
      }

      return properties;
    },

    /**
     * Validate form before cart add
     */
    validate(productId) {
      const instance = this.instances[productId];
      if (!instance) return { valid: false, error: 'Uploader not initialized' };

      // Check upload
      if (!instance.uploadData) {
        return { valid: false, error: 'Please upload your design first.' };
      }

      // Check required questions
      if (instance.config && instance.config.extraQuestions) {
        for (const q of instance.config.extraQuestions) {
          if (q.required) {
            const fieldId = `dtf-q-${productId}-${q.id}`;
            const field = document.getElementById(fieldId);
            if (field) {
              if (field.type === 'checkbox' && !field.checked) {
                return { valid: false, error: `Please check "${q.label}"` };
              } else if (!field.value) {
                return { valid: false, error: `Please fill in "${q.label}"` };
              }
            }
          }
        }
      }

      return { valid: true };
    }
  };

  // Expose globally
  window.DTFUploader = DTFUploader;

  // Auto-init on page load for already rendered snippets
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.dtf-uploader').forEach(container => {
      const productId = container.dataset.productId;
      if (productId && !DTFUploader.instances[productId]) {
        DTFUploader.init(productId);
      }
    });
  });

})();
