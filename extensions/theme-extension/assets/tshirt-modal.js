/**
 * T-Shirt Modal - 3D Preview & Cart Integration
 * ===============================================
 * Provides 3D T-shirt preview with uploaded design
 * 
 * Version: 3.0.0
 */

(function() {
  'use strict';

  const TShirtModal = {
    isOpen: false,
    scene: null,
    camera: null,
    renderer: null,
    tshirt: null,
    decal: null,
    animationId: null,
    
    // Current state
    uploadData: null,
    config: null,
    productId: null,
    selectedColor: null,
    selectedSize: null,
    selectedPosition: 'front',
    variants: [],

    // DOM elements
    elements: {},

    // T-shirt color hex map
    colorMap: {
      'white': '#ffffff',
      'black': '#1a1a1a',
      'navy': '#1e3a5f',
      'red': '#dc2626',
      'blue': '#3b82f6',
      'green': '#22c55e',
      'gray': '#6b7280',
      'grey': '#6b7280',
      'pink': '#ec4899',
      'yellow': '#eab308',
      'orange': '#f97316',
      'purple': '#a855f7',
      'brown': '#92400e',
      'maroon': '#7f1d1d',
      'olive': '#556b2f',
      'teal': '#14b8a6',
      'coral': '#ff7f50',
      'beige': '#f5f5dc',
      'cream': '#fffdd0',
      'burgundy': '#800020',
      'charcoal': '#36454f',
      'heather gray': '#9ca3af',
      'heather grey': '#9ca3af',
      'light blue': '#93c5fd',
      'dark green': '#166534',
      'dark blue': '#1e40af',
      'royal blue': '#4169e1',
      'forest green': '#228b22',
      'sky blue': '#87ceeb',
      'mint': '#98ff98',
      'lavender': '#e6e6fa',
      'natural': '#faebd7',
      'sand': '#c2b280',
      'slate': '#708090'
    },

    /**
     * Initialize the modal
     */
    init() {
      this.elements = {
        overlay: document.getElementById('tshirt-modal-overlay'),
        closeBtn: document.getElementById('tshirt-modal-close'),
        canvas: document.getElementById('tshirt-3d-canvas'),
        loading: document.getElementById('tshirt-3d-loading'),
        colorsContainer: document.getElementById('tshirt-colors'),
        sizesContainer: document.getElementById('tshirt-sizes'),
        priceDisplay: document.getElementById('tshirt-price'),
        priceAddon: document.getElementById('tshirt-price-addon'),
        addCartBtn: document.getElementById('tshirt-add-cart'),
        positionBtns: document.querySelectorAll('.tshirt-position-btn')
      };

      this.bindEvents();
    },

    /**
     * Bind event handlers
     */
    bindEvents() {
      // Listen for open event from DTF uploader
      document.addEventListener('dtf:open-tshirt-modal', (e) => {
        this.open(e.detail);
      });

      // Close button
      this.elements.closeBtn?.addEventListener('click', () => this.close());

      // Click outside to close
      this.elements.overlay?.addEventListener('click', (e) => {
        if (e.target === this.elements.overlay) {
          this.close();
        }
      });

      // Escape key to close
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      });

      // Position toggle
      this.elements.positionBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
          this.setPosition(btn.dataset.position);
        });
      });

      // Add to cart
      this.elements.addCartBtn?.addEventListener('click', () => {
        this.addToCart();
      });
    },

    /**
     * Open the modal
     */
    async open(detail) {
      const { productId, uploadData, config } = detail;

      this.productId = productId;
      this.uploadData = uploadData;
      this.config = config || {};

      // Show modal
      this.elements.overlay.classList.add('active');
      this.isOpen = true;
      document.body.style.overflow = 'hidden';

      // Show loading
      this.elements.loading.style.display = 'block';
      this.elements.canvas.style.display = 'none';

      // Load variants from product
      await this.loadVariants();

      // Render options
      this.renderColors();
      this.renderSizes();
      this.updatePrice();

      // Initialize 3D scene
      await this.init3D();

      // Hide loading
      this.elements.loading.style.display = 'none';
      this.elements.canvas.style.display = 'block';
    },

    /**
     * Close the modal
     */
    close() {
      this.elements.overlay.classList.remove('active');
      this.isOpen = false;
      document.body.style.overflow = '';

      // Stop animation loop
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }

      // Cleanup Three.js
      if (this.renderer) {
        this.renderer.dispose();
        this.renderer = null;
      }
      this.scene = null;
      this.camera = null;
      this.tshirt = null;
      this.decal = null;
    },

    /**
     * Load product variants
     */
    async loadVariants() {
      // Get variants from the page (assumes Shopify liquid context)
      const productJson = document.querySelector(`[data-product-json="${this.productId}"]`);
      
      if (productJson) {
        try {
          const product = JSON.parse(productJson.textContent);
          this.variants = product.variants || [];
        } catch (e) {
          console.error('[TShirtModal] Failed to parse product JSON:', e);
        }
      }

      // Fallback: Try to get from meta tag or global
      if (this.variants.length === 0 && window.__PRODUCT_VARIANTS__) {
        this.variants = window.__PRODUCT_VARIANTS__;
      }

      // Extract unique colors and sizes from config
      const colorOption = this.config.colorVariantOption || 'Color';
      const sizeOption = this.config.sizeVariantOption || 'Size';

      this.availableColors = [...new Set(
        this.variants.map(v => {
          const opt = v.options?.find(o => o.name === colorOption);
          return opt?.value || v.option1; // Fallback to option1
        }).filter(Boolean)
      )];

      this.availableSizes = [...new Set(
        this.variants.map(v => {
          const opt = v.options?.find(o => o.name === sizeOption);
          return opt?.value || v.option2; // Fallback to option2
        }).filter(Boolean)
      )];

      // Set defaults
      if (this.availableColors.length > 0) {
        this.selectedColor = this.availableColors[0];
      }
      if (this.availableSizes.length > 0) {
        this.selectedSize = this.availableSizes[0];
      }
    },

    /**
     * Render color swatches
     */
    renderColors() {
      const container = this.elements.colorsContainer;
      if (!container) return;

      container.innerHTML = '';

      this.availableColors.forEach((color, index) => {
        const colorLower = color.toLowerCase();
        const hex = this.colorMap[colorLower] || this.stringToColor(color);

        const swatch = document.createElement('button');
        swatch.className = 'tshirt-color-swatch' + (index === 0 ? ' active' : '');
        swatch.style.backgroundColor = hex;
        swatch.title = color;
        swatch.type = 'button';

        // Border for light colors
        if (this.isLightColor(hex)) {
          swatch.style.border = '1px solid #e5e7eb';
        }

        swatch.addEventListener('click', () => {
          container.querySelectorAll('.tshirt-color-swatch').forEach(s => s.classList.remove('active'));
          swatch.classList.add('active');
          this.selectedColor = color;
          this.updateTShirtColor(hex);
          this.updatePrice();
        });

        container.appendChild(swatch);
      });
    },

    /**
     * Render size buttons
     */
    renderSizes() {
      const container = this.elements.sizesContainer;
      if (!container) return;

      container.innerHTML = '';

      this.availableSizes.forEach((size, index) => {
        const btn = document.createElement('button');
        btn.className = 'tshirt-size-btn' + (index === 0 ? ' active' : '');
        btn.textContent = size;
        btn.type = 'button';

        btn.addEventListener('click', () => {
          container.querySelectorAll('.tshirt-size-btn').forEach(s => s.classList.remove('active'));
          btn.classList.add('active');
          this.selectedSize = size;
          this.updatePrice();
        });

        container.appendChild(btn);
      });
    },

    /**
     * Update price display
     */
    updatePrice() {
      // Find matching variant
      const variant = this.variants.find(v => {
        const hasColor = v.option1 === this.selectedColor || v.option2 === this.selectedColor;
        const hasSize = v.option1 === this.selectedSize || v.option2 === this.selectedSize;
        return hasColor && hasSize;
      });

      if (variant) {
        const price = (variant.price / 100).toFixed(2);
        this.elements.priceDisplay.textContent = `$${price}`;
        
        if (this.config.priceAddon > 0) {
          this.elements.priceAddon.textContent = `(includes $${this.config.priceAddon.toFixed(2)} customization fee)`;
        } else {
          this.elements.priceAddon.textContent = '';
        }

        this.elements.addCartBtn.disabled = false;
      } else {
        this.elements.priceDisplay.textContent = 'Select options';
        this.elements.addCartBtn.disabled = true;
      }
    },

    /**
     * Initialize Three.js scene
     */
    async init3D() {
      if (typeof THREE === 'undefined') {
        console.error('[TShirtModal] Three.js not loaded');
        this.show2DFallback();
        return;
      }

      const canvas = this.elements.canvas;
      const container = canvas.parentElement;
      const width = container.clientWidth;
      const height = container.clientHeight;

      // Scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xf0f0f0);

      // Camera
      this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      this.camera.position.set(0, 0, 3);

      // Renderer
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      this.scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 5, 5);
      this.scene.add(directionalLight);

      // Create T-shirt geometry (simple plane for now)
      // In production, load a proper GLB model
      await this.createTShirtMesh();

      // Start render loop
      this.animate();

      // Handle resize
      window.addEventListener('resize', () => this.handleResize());
    },

    /**
     * Create T-shirt mesh
     */
    async createTShirtMesh() {
      // Simple plane geometry (replace with GLB in production)
      const geometry = new THREE.PlaneGeometry(2, 2.5);
      
      // T-shirt material
      const material = new THREE.MeshStandardMaterial({
        color: this.getColorHex(this.selectedColor),
        side: THREE.DoubleSide
      });

      this.tshirt = new THREE.Mesh(geometry, material);
      this.scene.add(this.tshirt);

      // Load and apply decal (uploaded design)
      if (this.uploadData?.url) {
        await this.applyDecal(this.uploadData.url);
      }
    },

    /**
     * Apply decal (uploaded design) to T-shirt
     */
    async applyDecal(imageUrl) {
      return new Promise((resolve) => {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.crossOrigin = 'anonymous';

        textureLoader.load(
          imageUrl,
          (texture) => {
            const decalGeometry = new THREE.PlaneGeometry(0.8, 0.8);
            const decalMaterial = new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true
            });

            this.decal = new THREE.Mesh(decalGeometry, decalMaterial);
            this.decal.position.z = 0.01; // Slightly in front of shirt
            
            if (this.selectedPosition === 'back') {
              this.decal.position.z = -0.01;
              this.decal.rotation.y = Math.PI;
            }

            this.scene.add(this.decal);
            resolve();
          },
          undefined,
          () => {
            console.error('[TShirtModal] Failed to load design texture');
            resolve();
          }
        );
      });
    },

    /**
     * Update T-shirt color
     */
    updateTShirtColor(hex) {
      if (this.tshirt && this.tshirt.material) {
        this.tshirt.material.color.set(hex);
      }
    },

    /**
     * Set print position (front/back)
     */
    setPosition(position) {
      this.selectedPosition = position;

      // Update UI
      this.elements.positionBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.position === position);
      });

      // Update decal position
      if (this.decal) {
        if (position === 'back') {
          this.decal.position.z = -0.01;
          this.decal.rotation.y = Math.PI;
        } else {
          this.decal.position.z = 0.01;
          this.decal.rotation.y = 0;
        }
      }

      // Rotate camera to show correct side
      if (this.camera) {
        const targetZ = position === 'back' ? -3 : 3;
        this.camera.position.z = targetZ;
        this.camera.lookAt(0, 0, 0);
      }
    },

    /**
     * Animation loop
     */
    animate() {
      if (!this.isOpen) return;

      this.animationId = requestAnimationFrame(() => this.animate());

      // Subtle rotation for visual interest
      if (this.tshirt) {
        this.tshirt.rotation.y = Math.sin(Date.now() * 0.001) * 0.1;
      }
      if (this.decal) {
        this.decal.rotation.y = this.tshirt ? this.tshirt.rotation.y : 0;
      }

      this.renderer.render(this.scene, this.camera);
    },

    /**
     * Handle window resize
     */
    handleResize() {
      if (!this.renderer || !this.camera || !this.isOpen) return;

      const container = this.elements.canvas.parentElement;
      const width = container.clientWidth;
      const height = container.clientHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    },

    /**
     * Show 2D fallback if Three.js fails
     */
    show2DFallback() {
      if (!this.uploadData?.url) return;

      const container = this.elements.canvas.parentElement;
      container.innerHTML = `
        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f5f5f5;">
          <img src="${this.uploadData.url}" style="max-width:80%;max-height:80%;object-fit:contain;" alt="Design preview">
        </div>
      `;
    },

    /**
     * Add to cart
     */
    async addToCart() {
      // Find matching variant
      const variant = this.variants.find(v => {
        const hasColor = v.option1 === this.selectedColor || v.option2 === this.selectedColor;
        const hasSize = v.option1 === this.selectedSize || v.option2 === this.selectedSize;
        return hasColor && hasSize;
      });

      if (!variant) {
        alert('Please select color and size');
        return;
      }

      // Prepare cart data
      const cartData = {
        items: [{
          id: variant.id,
          quantity: 1,
          properties: {
            '_upload_id': this.uploadData.id,
            '_upload_url': this.uploadData.url,
            '_upload_name': this.uploadData.name,
            '_tshirt_addon': 'true',
            '_print_position': this.selectedPosition,
            '_color': this.selectedColor,
            '_size': this.selectedSize
          }
        }]
      };

      this.elements.addCartBtn.disabled = true;
      this.elements.addCartBtn.textContent = 'Adding...';

      try {
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cartData)
        });

        if (!response.ok) throw new Error('Failed to add to cart');

        // Success
        this.elements.addCartBtn.textContent = 'Added! ✓';
        
        setTimeout(() => {
          this.close();
          // Refresh cart drawer or redirect
          if (window.Shopify && window.Shopify.theme && window.Shopify.theme.jsCartDrawer) {
            window.Shopify.theme.jsCartDrawer.open();
          } else {
            // Dispatch cart update event
            document.dispatchEvent(new CustomEvent('cart:updated'));
          }
        }, 1000);

      } catch (error) {
        console.error('[TShirtModal] Cart add error:', error);
        this.elements.addCartBtn.disabled = false;
        this.elements.addCartBtn.textContent = 'Failed - Try Again';
      }
    },

    /**
     * Get color hex from name
     */
    getColorHex(colorName) {
      if (!colorName) return 0xffffff;
      const lower = colorName.toLowerCase();
      const hex = this.colorMap[lower];
      if (hex) return parseInt(hex.replace('#', '0x'), 16);
      return this.stringToColorInt(colorName);
    },

    /**
     * Generate color from string (hash)
     */
    stringToColor(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const color = '#' + ((hash >> 24) & 0xFF).toString(16).padStart(2, '0') +
                         ((hash >> 16) & 0xFF).toString(16).padStart(2, '0') +
                         ((hash >> 8) & 0xFF).toString(16).padStart(2, '0');
      return color;
    },

    stringToColorInt(str) {
      const hex = this.stringToColor(str);
      return parseInt(hex.replace('#', '0x'), 16);
    },

    /**
     * Check if color is light
     */
    isLightColor(hex) {
      const color = hex.replace('#', '');
      const r = parseInt(color.substr(0, 2), 16);
      const g = parseInt(color.substr(2, 2), 16);
      const b = parseInt(color.substr(4, 2), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 200;
    }
  };

  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TShirtModal.init());
  } else {
    TShirtModal.init();
  }

  // Expose globally
  window.TShirtModal = TShirtModal;

})();
