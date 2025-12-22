/**
 * UL Error Handler v4.1.0
 * =======================
 * FAZ 7: Centralized Error Management
 * 
 * Features:
 * - Error codes and messages
 * - Toast notifications (auto-dismiss)
 * - Inline error display
 * - Retry logic with exponential backoff
 * - Error logging and tracking
 * - Validation helpers
 * - Recovery suggestions
 * 
 * Usage:
 * - ULErrorHandler.show('UPLOAD_FILE_TOO_LARGE', { maxSize: '50MB' });
 * - ULErrorHandler.showInline(element, 'VALIDATION_REQUIRED');
 * - ULErrorHandler.retry(asyncFn, { maxRetries: 3 });
 */

(function() {
  'use strict';

  // ==========================================================================
  // ERROR CODES & MESSAGES
  // ==========================================================================
  const ERROR_CODES = {
    // Upload Errors (1xx)
    UPLOAD_FILE_TOO_LARGE: {
      code: 101,
      type: 'error',
      title: 'File Too Large',
      message: 'File exceeds {maxSize} limit. Please compress or use a smaller file.',
      recoverable: true,
      action: 'retry'
    },
    UPLOAD_INVALID_TYPE: {
      code: 102,
      type: 'error',
      title: 'Invalid File Type',
      message: 'This file type is not supported. Please use {allowedTypes}.',
      recoverable: true,
      action: 'retry'
    },
    UPLOAD_FAILED: {
      code: 103,
      type: 'error',
      title: 'Upload Failed',
      message: 'Upload failed. Please check your connection and try again.',
      recoverable: true,
      action: 'retry'
    },
    UPLOAD_PROCESSING_FAILED: {
      code: 104,
      type: 'error',
      title: 'Processing Failed',
      message: 'We couldn\'t process this file. Please try a different file.',
      recoverable: true,
      action: 'retry'
    },
    UPLOAD_LOW_DPI: {
      code: 105,
      type: 'warning',
      title: 'Low Resolution',
      message: 'This image is {actualDpi} DPI. For best print quality, use at least {minDpi} DPI.',
      recoverable: false,
      action: 'continue'
    },
    UPLOAD_NETWORK_ERROR: {
      code: 106,
      type: 'error',
      title: 'Connection Error',
      message: 'Network error occurred. Please check your internet connection.',
      recoverable: true,
      action: 'retry'
    },
    UPLOAD_TIMEOUT: {
      code: 107,
      type: 'error',
      title: 'Upload Timeout',
      message: 'Upload took too long. Please try again with a smaller file or check your connection.',
      recoverable: true,
      action: 'retry'
    },

    // 3D Errors (2xx)
    THREE_MODEL_LOAD_FAILED: {
      code: 201,
      type: 'warning',
      title: '3D Preview Unavailable',
      message: '3D preview unavailable. You can still complete your order.',
      recoverable: false,
      action: 'fallback'
    },
    THREE_TEXTURE_FAILED: {
      code: 202,
      type: 'warning',
      title: 'Design Preview Failed',
      message: 'Design preview failed. Your design will still print correctly.',
      recoverable: false,
      action: 'continue'
    },
    THREE_WEBGL_NOT_SUPPORTED: {
      code: 203,
      type: 'info',
      title: '3D Not Supported',
      message: 'Your device doesn\'t support 3D preview. Using 2D preview instead.',
      recoverable: false,
      action: 'fallback'
    },
    THREE_RENDER_ERROR: {
      code: 204,
      type: 'warning',
      title: 'Rendering Error',
      message: '3D rendering encountered an issue. Switching to 2D preview.',
      recoverable: false,
      action: 'fallback'
    },

    // Cart Errors (3xx)
    CART_ADD_FAILED: {
      code: 301,
      type: 'error',
      title: 'Add to Cart Failed',
      message: 'Couldn\'t add to cart. Please try again.',
      recoverable: true,
      action: 'retry'
    },
    CART_VARIANT_OUT_OF_STOCK: {
      code: 302,
      type: 'error',
      title: 'Out of Stock',
      message: 'This size is currently out of stock. Please select another.',
      recoverable: true,
      action: 'select'
    },
    CART_SESSION_EXPIRED: {
      code: 303,
      type: 'error',
      title: 'Session Expired',
      message: 'Your session has expired. Please refresh the page.',
      recoverable: true,
      action: 'refresh'
    },
    CART_QUANTITY_EXCEEDED: {
      code: 304,
      type: 'error',
      title: 'Quantity Limit',
      message: 'Maximum quantity is {maxQty}. Please reduce the quantity.',
      recoverable: true,
      action: 'adjust'
    },
    CART_PRICE_CHANGED: {
      code: 305,
      type: 'warning',
      title: 'Price Updated',
      message: 'Price has been updated. Please review before adding to cart.',
      recoverable: false,
      action: 'continue'
    },

    // Validation Errors (4xx)
    VALIDATION_REQUIRED: {
      code: 401,
      type: 'error',
      title: 'Required Field',
      message: 'This field is required.',
      recoverable: true,
      action: 'focus'
    },
    VALIDATION_INVALID_INPUT: {
      code: 402,
      type: 'error',
      title: 'Invalid Input',
      message: '{fieldName} is not valid. {hint}',
      recoverable: true,
      action: 'focus'
    },
    VALIDATION_CONFIRMATION_REQUIRED: {
      code: 403,
      type: 'error',
      title: 'Confirmation Required',
      message: 'Please confirm your order before proceeding.',
      recoverable: true,
      action: 'focus'
    },
    VALIDATION_UPLOAD_REQUIRED: {
      code: 404,
      type: 'error',
      title: 'Design Required',
      message: 'Please upload your design first.',
      recoverable: true,
      action: 'focus'
    },
    VALIDATION_SIZE_REQUIRED: {
      code: 405,
      type: 'error',
      title: 'Size Required',
      message: 'Please select a size before adding to cart.',
      recoverable: true,
      action: 'focus'
    },
    VALIDATION_LOCATION_REQUIRED: {
      code: 406,
      type: 'error',
      title: 'Location Required',
      message: 'Please select at least one print location.',
      recoverable: true,
      action: 'focus'
    },

    // API Errors (5xx)
    API_SERVER_ERROR: {
      code: 501,
      type: 'error',
      title: 'Server Error',
      message: 'Something went wrong on our end. Please try again later.',
      recoverable: true,
      action: 'retry'
    },
    API_RATE_LIMITED: {
      code: 502,
      type: 'warning',
      title: 'Too Many Requests',
      message: 'Please wait a moment before trying again.',
      recoverable: true,
      action: 'wait'
    },
    API_UNAUTHORIZED: {
      code: 503,
      type: 'error',
      title: 'Access Denied',
      message: 'You don\'t have permission to perform this action.',
      recoverable: false,
      action: 'none'
    },

    // Generic Errors (9xx)
    UNKNOWN_ERROR: {
      code: 999,
      type: 'error',
      title: 'Something Went Wrong',
      message: 'An unexpected error occurred. Please try again.',
      recoverable: true,
      action: 'retry'
    }
  };

  // ==========================================================================
  // ERROR HANDLER
  // ==========================================================================
  const ULErrorHandler = {
    version: '4.1.0',
    
    // Error history for debugging
    history: [],
    maxHistory: 50,
    
    // Retry state
    retryAttempts: {},
    
    // Toast element cache
    toastEl: null,
    toastTimeout: null,

    // ==========================================================================
    // MAIN API
    // ==========================================================================

    /**
     * Show error as toast notification
     * @param {string} errorCode - Error code from ERROR_CODES
     * @param {object} params - Parameters to interpolate in message
     * @param {object} options - Display options
     */
    show(errorCode, params = {}, options = {}) {
      const errorDef = ERROR_CODES[errorCode] || ERROR_CODES.UNKNOWN_ERROR;
      const message = this.interpolate(errorDef.message, params);
      
      // Log error
      this.log(errorCode, params, errorDef);
      
      // Emit event for global state (FAZ 4)
      this.emitError(errorCode, errorDef, params);
      
      // Show toast
      this.showToast(message, errorDef.type, {
        title: errorDef.title,
        action: errorDef.action,
        onRetry: options.onRetry,
        duration: options.duration || this.getDuration(errorDef.type),
        ...options
      });
      
      return {
        code: errorDef.code,
        type: errorDef.type,
        message,
        recoverable: errorDef.recoverable,
        action: errorDef.action
      };
    },

    /**
     * Show inline error on an element
     * @param {HTMLElement} element - Target element
     * @param {string} errorCode - Error code
     * @param {object} params - Parameters
     */
    showInline(element, errorCode, params = {}) {
      if (!element) return;
      
      const errorDef = ERROR_CODES[errorCode] || ERROR_CODES.UNKNOWN_ERROR;
      const message = this.interpolate(errorDef.message, params);
      
      // Add error class
      element.classList.add('ul-has-error');
      element.classList.remove('ul-has-warning', 'ul-has-success');
      
      if (errorDef.type === 'warning') {
        element.classList.remove('ul-has-error');
        element.classList.add('ul-has-warning');
      }
      
      // Find or create error message element
      let errorEl = element.querySelector('.ul-inline-error');
      if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'ul-inline-error';
        element.appendChild(errorEl);
      }
      
      errorEl.innerHTML = `
        <svg class="ul-inline-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${errorDef.type === 'warning' 
            ? '<path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
            : '<circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>'}
        </svg>
        <span class="ul-inline-error-text">${message}</span>
      `;
      errorEl.style.display = 'flex';
      
      // Log
      this.log(errorCode, params, errorDef);
      
      return { element, message };
    },

    /**
     * Clear inline error from element
     * @param {HTMLElement} element - Target element
     */
    clearInline(element) {
      if (!element) return;
      
      element.classList.remove('ul-has-error', 'ul-has-warning');
      
      const errorEl = element.querySelector('.ul-inline-error');
      if (errorEl) {
        errorEl.style.display = 'none';
      }
    },

    /**
     * Clear all inline errors in a container
     * @param {HTMLElement} container - Container element
     */
    clearAllInline(container) {
      if (!container) return;
      
      container.querySelectorAll('.ul-has-error, .ul-has-warning').forEach(el => {
        el.classList.remove('ul-has-error', 'ul-has-warning');
      });
      
      container.querySelectorAll('.ul-inline-error').forEach(el => {
        el.style.display = 'none';
      });
    },

    /**
     * Show success message
     * @param {string} message - Success message
     * @param {object} options - Display options
     */
    showSuccess(message, options = {}) {
      this.showToast(message, 'success', {
        title: options.title || 'Success',
        duration: options.duration || 3000,
        ...options
      });
    },

    /**
     * Show warning message
     * @param {string} message - Warning message
     * @param {object} options - Display options
     */
    showWarning(message, options = {}) {
      this.showToast(message, 'warning', {
        title: options.title || 'Warning',
        duration: options.duration || 5000,
        ...options
      });
    },

    /**
     * Retry an async function with exponential backoff
     * @param {Function} asyncFn - Async function to retry
     * @param {object} options - Retry options
     */
    async retry(asyncFn, options = {}) {
      const {
        maxRetries = 3,
        baseDelay = 1000,
        maxDelay = 10000,
        onRetry = null,
        retryId = null
      } = options;
      
      const id = retryId || `retry_${Date.now()}`;
      this.retryAttempts[id] = 0;
      
      let lastError;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await asyncFn();
          delete this.retryAttempts[id];
          return result;
        } catch (error) {
          lastError = error;
          this.retryAttempts[id] = attempt + 1;
          
          if (attempt < maxRetries) {
            const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
            
            if (onRetry) {
              onRetry(attempt + 1, maxRetries, delay);
            }
            
            console.log(`[ULErrorHandler] Retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
            await this.sleep(delay);
          }
        }
      }
      
      delete this.retryAttempts[id];
      throw lastError;
    },

    /**
     * Check if currently retrying
     * @param {string} retryId - Retry ID
     */
    isRetrying(retryId) {
      return this.retryAttempts[retryId] > 0;
    },

    /**
     * Get retry count
     * @param {string} retryId - Retry ID
     */
    getRetryCount(retryId) {
      return this.retryAttempts[retryId] || 0;
    },

    // ==========================================================================
    // VALIDATION HELPERS
    // ==========================================================================

    /**
     * Validate file before upload
     * @param {File} file - File to validate
     * @param {object} config - Validation config
     */
    validateFile(file, config = {}) {
      const {
        maxSize = 50 * 1024 * 1024, // 50MB
        allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'],
        allowedExtensions = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'ai', 'eps'],
        minDpi = 150
      } = config;
      
      const errors = [];
      
      // Check file size
      if (file.size > maxSize) {
        errors.push({
          code: 'UPLOAD_FILE_TOO_LARGE',
          params: { maxSize: this.formatFileSize(maxSize) }
        });
      }
      
      // Check file type
      const ext = file.name.split('.').pop()?.toLowerCase();
      const isValidType = allowedTypes.includes(file.type) || allowedExtensions.includes(ext);
      
      if (!isValidType) {
        errors.push({
          code: 'UPLOAD_INVALID_TYPE',
          params: { allowedTypes: allowedExtensions.join(', ').toUpperCase() }
        });
      }
      
      return {
        valid: errors.length === 0,
        errors,
        file: {
          name: file.name,
          size: file.size,
          type: file.type,
          extension: ext
        }
      };
    },

    /**
     * Validate form fields
     * @param {object} fields - Field definitions { fieldName: { value, required, type, validate } }
     */
    validateForm(fields) {
      const errors = [];
      const values = {};
      
      for (const [name, field] of Object.entries(fields)) {
        values[name] = field.value;
        
        // Required check
        if (field.required && !field.value) {
          errors.push({
            field: name,
            code: 'VALIDATION_REQUIRED',
            params: { fieldName: field.label || name }
          });
          continue;
        }
        
        // Custom validation
        if (field.validate && field.value) {
          const result = field.validate(field.value);
          if (result !== true) {
            errors.push({
              field: name,
              code: 'VALIDATION_INVALID_INPUT',
              params: { 
                fieldName: field.label || name,
                hint: typeof result === 'string' ? result : ''
              }
            });
          }
        }
      }
      
      return {
        valid: errors.length === 0,
        errors,
        values
      };
    },

    // ==========================================================================
    // TOAST DISPLAY
    // ==========================================================================

    showToast(message, type = 'info', options = {}) {
      // Get or create toast container
      let toast = document.getElementById('ul-error-toast');
      
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ul-error-toast';
        toast.className = 'ul-error-toast';
        toast.innerHTML = `
          <div class="ul-toast-icon"></div>
          <div class="ul-toast-content">
            <div class="ul-toast-title"></div>
            <div class="ul-toast-message"></div>
          </div>
          <button class="ul-toast-close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="ul-toast-action" style="display: none;">Retry</button>
        `;
        document.body.appendChild(toast);
        
        // Bind close
        toast.querySelector('.ul-toast-close').addEventListener('click', () => {
          this.hideToast();
        });
      }
      
      this.toastEl = toast;
      
      // Clear existing timeout
      if (this.toastTimeout) {
        clearTimeout(this.toastTimeout);
      }
      
      // Set content
      const titleEl = toast.querySelector('.ul-toast-title');
      const messageEl = toast.querySelector('.ul-toast-message');
      const iconEl = toast.querySelector('.ul-toast-icon');
      const actionEl = toast.querySelector('.ul-toast-action');
      
      titleEl.textContent = options.title || '';
      titleEl.style.display = options.title ? 'block' : 'none';
      messageEl.textContent = message;
      
      // Set icon
      iconEl.innerHTML = this.getToastIcon(type);
      
      // Set action button
      if (options.action === 'retry' && options.onRetry) {
        actionEl.textContent = 'Retry';
        actionEl.style.display = 'block';
        actionEl.onclick = () => {
          this.hideToast();
          options.onRetry();
        };
      } else if (options.action === 'refresh') {
        actionEl.textContent = 'Refresh';
        actionEl.style.display = 'block';
        actionEl.onclick = () => {
          window.location.reload();
        };
      } else {
        actionEl.style.display = 'none';
      }
      
      // Set type class
      toast.className = `ul-error-toast active ${type}`;
      
      // Auto-hide
      const duration = options.duration || this.getDuration(type);
      if (duration > 0) {
        this.toastTimeout = setTimeout(() => {
          this.hideToast();
        }, duration);
      }
    },

    hideToast() {
      if (this.toastEl) {
        this.toastEl.classList.remove('active');
      }
      if (this.toastTimeout) {
        clearTimeout(this.toastTimeout);
        this.toastTimeout = null;
      }
    },

    getToastIcon(type) {
      switch (type) {
        case 'success':
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        case 'warning':
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>';
        case 'error':
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6m0-6l6 6" stroke-linecap="round"/></svg>';
        case 'info':
        default:
          return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>';
      }
    },

    getDuration(type) {
      switch (type) {
        case 'error': return 6000;
        case 'warning': return 5000;
        case 'success': return 3000;
        case 'info': default: return 4000;
      }
    },

    // ==========================================================================
    // UTILITIES
    // ==========================================================================

    interpolate(template, params) {
      return template.replace(/\{(\w+)\}/g, (match, key) => {
        return params[key] !== undefined ? params[key] : match;
      });
    },

    formatFileSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    log(errorCode, params, errorDef) {
      const entry = {
        timestamp: new Date().toISOString(),
        code: errorCode,
        type: errorDef.type,
        params,
        url: window.location.href
      };
      
      this.history.unshift(entry);
      
      // Trim history
      if (this.history.length > this.maxHistory) {
        this.history = this.history.slice(0, this.maxHistory);
      }
      
      // Console log
      const logMethod = errorDef.type === 'error' ? 'error' : errorDef.type === 'warning' ? 'warn' : 'log';
      console[logMethod](`[ULError] ${errorCode}:`, params);
    },

    emitError(errorCode, errorDef, params) {
      // Emit for global state (FAZ 4)
      if (window.ULEvents) {
        window.ULEvents.emit('ul:error', {
          code: errorCode,
          type: errorDef.type,
          title: errorDef.title,
          params,
          timestamp: Date.now()
        });
      }
      
      // Custom event
      document.dispatchEvent(new CustomEvent('ul:error', {
        detail: {
          code: errorCode,
          type: errorDef.type,
          params
        }
      }));
    },

    /**
     * Get error definition
     * @param {string} errorCode - Error code
     */
    getError(errorCode) {
      return ERROR_CODES[errorCode] || ERROR_CODES.UNKNOWN_ERROR;
    },

    /**
     * Get error history
     */
    getHistory() {
      return [...this.history];
    },

    /**
     * Clear error history
     */
    clearHistory() {
      this.history = [];
    }
  };

  // Expose globally
  window.ULErrorHandler = ULErrorHandler;

  // Also expose error codes for reference
  window.UL_ERROR_CODES = ERROR_CODES;

  console.log('[ULErrorHandler] Initialized v4.1.0');

})();
