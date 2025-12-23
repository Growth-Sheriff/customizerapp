/**
 * T-Shirt Modal v5.0 - Texture Baking Strategy
 * =============================================
 * 
 * STRATEJI: Decal'ı ayrı mesh olarak eklemek yerine,
 * Canvas API ile T-shirt texture'ına doğrudan çiziyoruz.
 * Bu sayede kumaş kıvrımlarını %100 takip eder.
 * 
 * UV MAPPING (shirt_baked.glb):
 * - FRONT:  U(0.078-0.439) V(0.112-0.425) Center(0.259, 0.268)
 * - BACK:   U(0.564-0.930) V(0.095-0.414) Center(0.747, 0.254)
 * 
 * Version: 5.0.0
 * Author: Claude AI
 */

(function() {
  'use strict';

  console.log('[TShirtModal] v5.0 - Texture Baking Strategy - Loading...');

  // ===========================================================================
  // UV REGION CONFIGURATION (Corrected based on visual testing)
  // LEFT side of UV map = BACK of shirt
  // RIGHT side of UV map = FRONT of shirt
  // ===========================================================================
  const UV_REGIONS = {
    front: {
      // RIGHT side of UV map = Front of shirt
      bounds: { uMin: 0.55, uMax: 1.0, vMin: 0.1, vMax: 0.85 },
      center: { u: 0.77, v: 0.45 },
      defaultSize: 0.6
    },
    back: {
      // LEFT side of UV map = Back of shirt
      bounds: { uMin: 0.0, uMax: 0.45, vMin: 0.1, vMax: 0.85 },
      center: { u: 0.22, v: 0.45 },
      defaultSize: 0.6
    },
    left_sleeve: {
      bounds: { uMin: 0.85, uMax: 1.0, vMin: 0.0, vMax: 0.3 },
      center: { u: 0.925, v: 0.15 },
      defaultSize: 0.4
    },
    right_sleeve: {
      bounds: { uMin: 0.0, uMax: 0.15, vMin: 0.0, vMax: 0.3 },
      center: { u: 0.075, v: 0.15 },
      defaultSize: 0.4
    }
  };

  // ===========================================================================
  // COLOR PRESETS
  // ===========================================================================
  const COLOR_PRESETS = [
    { name: 'White', hex: '#ffffff' },
    { name: 'Black', hex: '#1a1a1a' },
    { name: 'Navy', hex: '#1e3a5f' },
    { name: 'Red', hex: '#dc2626' },
    { name: 'Royal Blue', hex: '#3b82f6' },
    { name: 'Forest Green', hex: '#22c55e' },
    { name: 'Gray', hex: '#6b7280' },
    { name: 'Pink', hex: '#ec4899' }
  ];

  const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

  // ===========================================================================
  // MAIN MODULE
  // ===========================================================================
  const TShirtModal = {

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------
    isOpen: false,
    currentStep: 1,

    // Design from parent uploader
    inheritedDesign: {
      imageUrl: null,
      thumbnailUrl: null,
      name: null,
      dimensions: { width: 0, height: 0 }
    },

    // Step 1: Upload
    upload: {
      useInherited: false,
      newImage: null,
      newImageUrl: null,
      newImageName: null
    },

    // Step 2: Customization
    design: {
      color: '#ffffff',
      colorName: 'White',
      size: 'M',
      locations: {
        front: { enabled: true, scale: 100, offsetX: 0, offsetY: 0 },
        back: { enabled: false, scale: 100, offsetX: 0, offsetY: 0 },
        left_sleeve: { enabled: false, scale: 100, offsetX: 0, offsetY: 0 },
        right_sleeve: { enabled: false, scale: 100, offsetX: 0, offsetY: 0 }
      },
      activeLocation: 'front'
    },

    // Step 3: Details
    details: {
      quantity: 1,
      notes: ''
    },

    // Step 4: Confirm
    confirmed: false,

    // Three.js objects
    three: {
      scene: null,
      camera: null,
      renderer: null,
      model: null,
      mesh: null,
      animationId: null,
      targetRotationY: 0,
      currentRotationY: 0,
      isDragging: false,
      lastMouseX: 0
    },

    // Texture baking
    textureCanvas: null,
    textureCtx: null,
    baseTextureSize: 2048,
    decalImage: null,
    currentTexture: null,

    // DOM cache
    el: {},

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------
    init() {
      console.log('[TShirtModal] Initializing...');
      this.cacheElements();
      this.bindEvents();
      this.createTextureCanvas();
      console.log('[TShirtModal] Ready!');
    },

    cacheElements() {
      this.el = {
        overlay: document.getElementById('ul-tshirt-overlay'),
        modal: document.querySelector('.ul-tshirt-modal'),
        closeBtn: document.getElementById('ul-tshirt-close'),
        toast: document.getElementById('ul-toast'),
        navBack: document.getElementById('ul-nav-back'),
        navNext: document.getElementById('ul-nav-next'),
        stepItems: document.querySelectorAll('.ul-step-item'),
        stepConnectors: document.querySelectorAll('.ul-step-connector'),
        stepPanels: document.querySelectorAll('.ul-step-panel'),
        inheritedSection: document.getElementById('ul-inherited-section'),
        inheritedThumb: document.getElementById('ul-inherited-thumb'),
        inheritedName: document.getElementById('ul-inherited-name'),
        inheritedMeta: document.getElementById('ul-inherited-meta'),
        useInheritedBtn: document.getElementById('ul-use-inherited-btn'),
        uploadZone: document.getElementById('ul-tshirt-upload-zone'),
        fileInput: document.getElementById('ul-tshirt-file-input'),
        newUploadPreview: document.getElementById('ul-new-upload-preview'),
        newUploadThumb: document.getElementById('ul-new-upload-thumb'),
        newUploadName: document.getElementById('ul-new-upload-name'),
        canvas: document.getElementById('ul-3d-canvas'),
        loading3d: document.getElementById('ul-3d-loading'),
        colorGrid: document.getElementById('ul-color-grid'),
        sizeSelect: document.getElementById('ul-size-select'),
        locationList: document.getElementById('ul-location-list'),
        settingsLocationName: document.getElementById('ul-settings-location-name'),
        scaleSlider: document.getElementById('ul-scale-slider'),
        scaleValue: document.getElementById('ul-scale-value'),
        posXSlider: document.getElementById('ul-pos-x-slider'),
        posXValue: document.getElementById('ul-pos-x-value'),
        posYSlider: document.getElementById('ul-pos-y-slider'),
        posYValue: document.getElementById('ul-pos-y-value'),
        quickViewBtns: document.querySelectorAll('.ul-quick-view-btn'),
        priceDisplay: document.getElementById('ul-price-total'),
        qtyMinus: document.getElementById('ul-qty-minus'),
        qtyPlus: document.getElementById('ul-qty-plus'),
        qtyValue: document.getElementById('ul-qty-value'),
        specialNotes: document.getElementById('ul-special-instructions'),
        confirmCheckbox: document.getElementById('ul-confirm-checkbox'),
        reviewSummary: document.getElementById('ul-review-summary'),
        btnAddToCart: document.getElementById('ul-btn-add-cart'),
        btnDesignAnother: document.getElementById('ul-btn-design-another'),
        btnCheckout: document.getElementById('ul-btn-checkout')
      };
    },

    bindEvents() {
      this.el.closeBtn?.addEventListener('click', () => this.close());
      this.el.overlay?.addEventListener('click', (e) => {
        if (e.target === this.el.overlay) this.close();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) this.close();
      });

      this.el.navBack?.addEventListener('click', () => this.prevStep());
      this.el.navNext?.addEventListener('click', () => this.nextStep());

      this.el.useInheritedBtn?.addEventListener('click', () => this.selectInheritedDesign());
      this.el.uploadZone?.addEventListener('click', () => this.el.fileInput?.click());
      this.el.uploadZone?.addEventListener('dragover', (e) => this.handleDragOver(e));
      this.el.uploadZone?.addEventListener('dragleave', () => this.handleDragLeave());
      this.el.uploadZone?.addEventListener('drop', (e) => this.handleDrop(e));
      this.el.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));

      this.el.scaleSlider?.addEventListener('input', (e) => this.setScale(e.target.value));
      this.el.posXSlider?.addEventListener('input', (e) => this.setOffsetX(e.target.value));
      this.el.posYSlider?.addEventListener('input', (e) => this.setOffsetY(e.target.value));
      this.el.sizeSelect?.addEventListener('change', (e) => this.setSize(e.target.value));
      
      this.el.quickViewBtns?.forEach(btn => {
        btn.addEventListener('click', () => this.setQuickView(btn.dataset.view));
      });

      this.el.qtyMinus?.addEventListener('click', () => this.adjustQuantity(-1));
      this.el.qtyPlus?.addEventListener('click', () => this.adjustQuantity(1));
      this.el.specialNotes?.addEventListener('input', (e) => {
        this.details.notes = e.target.value;
      });

      this.el.confirmCheckbox?.addEventListener('change', (e) => {
        this.confirmed = e.target.checked;
        this.updateActionButtons();
      });
      
      this.el.btnAddToCart?.addEventListener('click', () => this.addToCart());
      this.el.btnDesignAnother?.addEventListener('click', () => this.designAnother());
      this.el.btnCheckout?.addEventListener('click', () => this.checkout());

      document.addEventListener('ul:openTShirtModal', (e) => this.open(e.detail));
    },

    createTextureCanvas() {
      this.textureCanvas = document.createElement('canvas');
      this.textureCanvas.width = this.baseTextureSize;
      this.textureCanvas.height = this.baseTextureSize;
      this.textureCtx = this.textureCanvas.getContext('2d');
      console.log('[TShirtModal] Texture canvas created:', this.baseTextureSize + 'x' + this.baseTextureSize);
    },

    // -------------------------------------------------------------------------
    // Modal Open/Close
    // -------------------------------------------------------------------------
    open(data = {}) {
      console.log('[TShirtModal] Opening with data:', data);

      if (data.imageUrl || data.thumbnailUrl) {
        this.inheritedDesign = {
          imageUrl: data.imageUrl || data.thumbnailUrl,
          thumbnailUrl: data.thumbnailUrl || data.imageUrl,
          name: data.name || 'Uploaded Design',
          dimensions: data.dimensions || { width: 0, height: 0 }
        };
        this.showInheritedDesign();
      }

      this.currentStep = 1;
      this.upload.useInherited = false;
      this.upload.newImage = null;
      this.confirmed = false;

      this.el.overlay?.classList.add('active');
      this.isOpen = true;
      document.body.style.overflow = 'hidden';

      this.goToStep(1);
    },

    close() {
      this.el.overlay?.classList.remove('active');
      this.isOpen = false;
      document.body.style.overflow = '';
      this.cleanup3D();
    },

    // -------------------------------------------------------------------------
    // Step Navigation
    // -------------------------------------------------------------------------
    goToStep(step) {
      this.currentStep = step;

      this.el.stepItems?.forEach((item, idx) => {
        item.classList.remove('active', 'completed');
        if (idx + 1 === step) item.classList.add('active');
        else if (idx + 1 < step) item.classList.add('completed');
      });

      this.el.stepConnectors?.forEach((conn, idx) => {
        conn.classList.toggle('completed', idx < step - 1);
      });

      this.el.stepPanels?.forEach((panel, idx) => {
        panel.classList.toggle('active', idx + 1 === step);
      });

      if (step === 2) this.initStep2();
      else if (step === 3) this.initStep3();
      else if (step === 4) this.initStep4();

      this.updateNavButtons();
    },

    nextStep() {
      if (this.validateCurrentStep() && this.currentStep < 4) {
        this.goToStep(this.currentStep + 1);
      }
    },

    prevStep() {
      if (this.currentStep > 1) {
        this.goToStep(this.currentStep - 1);
      }
    },

    validateCurrentStep() {
      switch (this.currentStep) {
        case 1:
          if (!this.upload.useInherited && !this.upload.newImage) {
            this.showToast('Please select or upload a design', 'error');
            return false;
          }
          return true;
        case 2:
          const hasLocation = Object.values(this.design.locations).some(l => l.enabled);
          if (!hasLocation) {
            this.showToast('Please select at least one print location', 'error');
            return false;
          }
          return true;
        case 3:
          return this.details.quantity > 0;
        case 4:
          if (!this.confirmed) {
            this.showToast('Please confirm your order details', 'error');
            return false;
          }
          return true;
        default:
          return true;
      }
    },

    updateNavButtons() {
      if (this.el.navBack) {
        this.el.navBack.style.display = this.currentStep === 1 ? 'none' : '';
      }

      if (this.el.navNext) {
        if (this.currentStep === 4) {
          this.el.navNext.style.display = 'none';
        } else {
          this.el.navNext.style.display = '';
          const labels = ['', 'Customize', 'Details', 'Review'];
          this.el.navNext.innerHTML = `Next: ${labels[this.currentStep]} →`;
        }
      }
    },

    // -------------------------------------------------------------------------
    // Step 1: Upload
    // -------------------------------------------------------------------------
    showInheritedDesign() {
      if (!this.el.inheritedSection) return;
      
      this.el.inheritedSection.style.display = 'block';
      
      if (this.el.inheritedThumb) {
        this.el.inheritedThumb.src = this.inheritedDesign.thumbnailUrl;
      }
      if (this.el.inheritedName) {
        this.el.inheritedName.textContent = this.inheritedDesign.name;
      }
      if (this.el.inheritedMeta && this.inheritedDesign.dimensions.width) {
        this.el.inheritedMeta.textContent = 
          `${this.inheritedDesign.dimensions.width} x ${this.inheritedDesign.dimensions.height} px`;
      }
    },

    selectInheritedDesign() {
      this.upload.useInherited = true;
      this.upload.newImage = null;

      this.loadDecalImage(this.inheritedDesign.imageUrl);

      this.el.useInheritedBtn.textContent = '✓ Selected';
      this.el.useInheritedBtn.classList.add('selected');
      document.querySelector('.ul-inherited-design')?.classList.add('selected');

      this.updateNavButtons();
    },

    handleDragOver(e) {
      e.preventDefault();
      e.stopPropagation();
      this.el.uploadZone?.classList.add('dragover');
    },

    handleDragLeave() {
      this.el.uploadZone?.classList.remove('dragover');
    },

    handleDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      this.el.uploadZone?.classList.remove('dragover');

      const files = e.dataTransfer?.files;
      if (files?.length > 0) {
        this.processUploadedFile(files[0]);
      }
    },

    handleFileSelect(e) {
      const files = e.target?.files;
      if (files?.length > 0) {
        this.processUploadedFile(files[0]);
      }
    },

    processUploadedFile(file) {
      if (!file.type.startsWith('image/')) {
        this.showToast('Please upload an image file', 'error');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        this.showToast('File size must be less than 10MB', 'error');
        return;
      }

      console.log('[TShirtModal] Processing file:', file.name);

      const imageUrl = URL.createObjectURL(file);

      this.loadDecalImage(imageUrl).then(() => {
        this.upload.useInherited = false;
        this.upload.newImage = file;
        this.upload.newImageUrl = imageUrl;
        this.upload.newImageName = file.name;

        if (this.el.newUploadPreview) {
          this.el.newUploadPreview.style.display = 'block';
        }
        if (this.el.newUploadThumb) {
          this.el.newUploadThumb.src = imageUrl;
        }
        if (this.el.newUploadName) {
          this.el.newUploadName.textContent = file.name;
        }

        this.el.useInheritedBtn?.classList.remove('selected');
        document.querySelector('.ul-inherited-design')?.classList.remove('selected');
        if (this.el.useInheritedBtn) {
          this.el.useInheritedBtn.textContent = 'Use This Design';
        }

        this.updateNavButtons();
        this.showToast('Design uploaded successfully!', 'success');
      });
    },

    loadDecalImage(url) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          this.decalImage = img;
          console.log('[TShirtModal] Decal image loaded:', img.width, 'x', img.height);
          resolve(img);
        };
        
        img.onerror = (err) => {
          console.error('[TShirtModal] Failed to load decal image:', err);
          reject(err);
        };
        
        img.src = url;
      });
    },

    // -------------------------------------------------------------------------
    // Step 2: Design Customization
    // -------------------------------------------------------------------------
    initStep2() {
      console.log('[TShirtModal] Initializing Step 2...');
      
      this.renderColorGrid();
      this.renderSizeOptions();
      this.renderLocationList();
      this.updateLocationSettings();
      
      this.init3D();
    },

    renderColorGrid() {
      if (!this.el.colorGrid) return;

      this.el.colorGrid.innerHTML = '';
      
      COLOR_PRESETS.forEach((color) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'ul-color-swatch' + (color.hex === this.design.color ? ' active' : '');
        swatch.style.backgroundColor = color.hex;
        swatch.title = color.name;
        
        if (this.isLightColor(color.hex)) {
          swatch.classList.add('light');
        }
        
        swatch.addEventListener('click', () => this.setColor(color.name, color.hex));
        this.el.colorGrid.appendChild(swatch);
      });
    },

    renderSizeOptions() {
      if (!this.el.sizeSelect) return;

      this.el.sizeSelect.innerHTML = '';
      
      SIZE_OPTIONS.forEach(size => {
        const option = document.createElement('option');
        option.value = size;
        option.textContent = size;
        option.selected = size === this.design.size;
        this.el.sizeSelect.appendChild(option);
      });
    },

    renderLocationList() {
      if (!this.el.locationList) return;

      this.el.locationList.innerHTML = '';

      const locations = [
        { id: 'front', name: 'Front', price: 'Included' },
        { id: 'back', name: 'Back', price: '+$5.00' },
        { id: 'left_sleeve', name: 'Left Sleeve', price: '+$3.00' },
        { id: 'right_sleeve', name: 'Right Sleeve', price: '+$3.00' }
      ];

      locations.forEach(loc => {
        const item = document.createElement('div');
        item.className = 'ul-location-item' + (this.design.locations[loc.id].enabled ? ' selected' : '');
        item.dataset.location = loc.id;
        
        item.innerHTML = `
          <label class="ul-location-checkbox">
            <input type="checkbox" ${this.design.locations[loc.id].enabled ? 'checked' : ''}>
            <span class="ul-location-name">${loc.name}</span>
          </label>
          <span class="ul-location-price">${loc.price}</span>
        `;
        
        const checkbox = item.querySelector('input');
        checkbox.addEventListener('change', () => this.toggleLocation(loc.id));
        item.addEventListener('click', (e) => {
          if (e.target !== checkbox) {
            this.setActiveLocation(loc.id);
          }
        });
        
        this.el.locationList.appendChild(item);
      });
    },

    toggleLocation(locationId) {
      const loc = this.design.locations[locationId];
      loc.enabled = !loc.enabled;

      const item = this.el.locationList?.querySelector(`[data-location="${locationId}"]`);
      item?.classList.toggle('selected', loc.enabled);
      
      const checkbox = item?.querySelector('input');
      if (checkbox) checkbox.checked = loc.enabled;

      if (loc.enabled) {
        this.setActiveLocation(locationId);
      }

      this.updateTexture();
      this.updateNavButtons();
    },

    setActiveLocation(locationId) {
      this.design.activeLocation = locationId;

      this.el.locationList?.querySelectorAll('.ul-location-item').forEach(item => {
        item.classList.toggle('active', item.dataset.location === locationId);
      });

      this.updateLocationSettings();
      
      // Auto-rotate to show the location
      const rotations = {
        front: 0,
        back: Math.PI,
        left_sleeve: -Math.PI / 2,
        right_sleeve: Math.PI / 2
      };
      this.three.targetRotationY = rotations[locationId] || 0;
    },

    updateLocationSettings() {
      const locationId = this.design.activeLocation;
      const loc = this.design.locations[locationId];

      if (this.el.settingsLocationName) {
        const names = { front: 'Front', back: 'Back', left_sleeve: 'Left Sleeve', right_sleeve: 'Right Sleeve' };
        this.el.settingsLocationName.textContent = names[locationId] || locationId;
      }

      if (this.el.scaleSlider) this.el.scaleSlider.value = loc.scale;
      if (this.el.scaleValue) this.el.scaleValue.textContent = loc.scale + '%';
      if (this.el.posXSlider) this.el.posXSlider.value = loc.offsetX;
      if (this.el.posXValue) this.el.posXValue.textContent = loc.offsetX;
      if (this.el.posYSlider) this.el.posYSlider.value = loc.offsetY;
      if (this.el.posYValue) this.el.posYValue.textContent = loc.offsetY;
    },

    setColor(name, hex) {
      this.design.color = hex;
      this.design.colorName = name;

      this.el.colorGrid?.querySelectorAll('.ul-color-swatch').forEach(swatch => {
        swatch.classList.toggle('active', swatch.title === name);
      });

      this.updateTexture();
    },

    setSize(size) {
      this.design.size = size;
    },

    setScale(value) {
      const loc = this.design.locations[this.design.activeLocation];
      loc.scale = parseInt(value);
      
      if (this.el.scaleValue) this.el.scaleValue.textContent = value + '%';

      this.debouncedUpdateTexture();
    },

    setOffsetX(value) {
      const loc = this.design.locations[this.design.activeLocation];
      loc.offsetX = parseInt(value);
      
      if (this.el.posXValue) this.el.posXValue.textContent = value;

      this.debouncedUpdateTexture();
    },

    setOffsetY(value) {
      const loc = this.design.locations[this.design.activeLocation];
      loc.offsetY = parseInt(value);
      
      if (this.el.posYValue) this.el.posYValue.textContent = value;

      this.debouncedUpdateTexture();
    },

    setQuickView(view) {
      this.el.quickViewBtns?.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
      });

      const rotations = {
        front: 0,
        back: Math.PI,
        left: -Math.PI / 2,
        right: Math.PI / 2
      };

      this.three.targetRotationY = rotations[view] || 0;
    },

    _textureUpdateTimeout: null,
    debouncedUpdateTexture() {
      if (this._textureUpdateTimeout) {
        clearTimeout(this._textureUpdateTimeout);
      }
      this._textureUpdateTimeout = setTimeout(() => {
        this.updateTexture();
      }, 50);
    },

    // -------------------------------------------------------------------------
    // TEXTURE BAKING - The Core Strategy
    // -------------------------------------------------------------------------
    updateTexture() {
      if (!this.textureCtx || !this.decalImage) {
        console.warn('[TShirtModal] Cannot update texture - missing context or decal');
        return;
      }

      const ctx = this.textureCtx;
      const size = this.baseTextureSize;

      // Clear canvas with t-shirt color
      ctx.fillStyle = this.design.color;
      ctx.fillRect(0, 0, size, size);

      // Draw decals for each enabled location
      Object.entries(this.design.locations).forEach(([locationId, loc]) => {
        if (loc.enabled) {
          this.drawDecalToTexture(locationId, loc);
        }
      });

      // Update Three.js texture
      this.applyTextureToMesh();

      console.log('[TShirtModal] Texture updated');
    },

    drawDecalToTexture(locationId, locSettings) {
      const ctx = this.textureCtx;
      const size = this.baseTextureSize;
      const region = UV_REGIONS[locationId];

      if (!region || !this.decalImage) return;

      // Calculate region dimensions in pixels
      const regionW = (region.bounds.uMax - region.bounds.uMin) * size;
      const regionH = (region.bounds.vMax - region.bounds.vMin) * size;

      // Calculate decal size based on scale
      const scaleFactor = (locSettings.scale / 100) * region.defaultSize;
      const aspectRatio = this.decalImage.width / this.decalImage.height;

      let decalW, decalH;
      if (aspectRatio > 1) {
        decalW = regionW * scaleFactor;
        decalH = decalW / aspectRatio;
      } else {
        decalH = regionH * scaleFactor;
        decalW = decalH * aspectRatio;
      }

      // Calculate center position with offsets
      // UV coordinates: U = horizontal (0=left, 1=right), V = vertical (0=bottom, 1=top in UV, but canvas is 0=top)
      const offsetMultiplier = regionW * 0.003;
      const centerX = region.center.u * size + (locSettings.offsetX * offsetMultiplier);
      const centerY = region.center.v * size - (locSettings.offsetY * offsetMultiplier);

      // Draw decal centered at position
      const drawX = centerX - decalW / 2;
      const drawY = centerY - decalH / 2;

      ctx.drawImage(this.decalImage, drawX, drawY, decalW, decalH);

      console.log(`[TShirtModal] Drew decal for ${locationId}:`, {
        position: [drawX.toFixed(0), drawY.toFixed(0)],
        size: [decalW.toFixed(0), decalH.toFixed(0)]
      });
    },

    applyTextureToMesh() {
      if (!this.three.mesh || !this.three.mesh.material) return;

      // Dispose old texture
      if (this.currentTexture) {
        this.currentTexture.dispose();
      }

      // Create new texture from canvas
      const texture = new THREE.CanvasTexture(this.textureCanvas);
      texture.flipY = true; // GLB model needs flipped texture
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      // Store reference
      this.currentTexture = texture;

      // Apply to mesh material
      this.three.mesh.material.map = texture;
      this.three.mesh.material.needsUpdate = true;
    },

    // -------------------------------------------------------------------------
    // Three.js 3D Viewer
    // -------------------------------------------------------------------------
    async init3D() {
      if (typeof THREE === 'undefined') {
        console.warn('[TShirtModal] Three.js not loaded');
        this.show2DFallback();
        return;
      }

      const canvas = this.el.canvas;
      if (!canvas) return;

      const container = canvas.parentElement;
      const width = container.clientWidth;
      const height = container.clientHeight;

      try {
        // Scene
        this.three.scene = new THREE.Scene();
        this.three.scene.background = new THREE.Color(0xf5f5f5);

        // Camera
        this.three.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
        this.three.camera.position.set(0, 0, 2.5);

        // Renderer
        this.three.renderer = new THREE.WebGLRenderer({ 
          canvas, 
          antialias: true,
          preserveDrawingBuffer: true
        });
        this.three.renderer.setSize(width, height);
        this.three.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.three.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.three.scene.add(ambientLight);

        const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight1.position.set(5, 5, 5);
        this.three.scene.add(directionalLight1);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight2.position.set(-5, 3, -5);
        this.three.scene.add(directionalLight2);

        // Load model
        await this.loadModel();

        // Initial texture
        this.updateTexture();

        // Setup interaction
        this.setupMouseInteraction(canvas);

        // Hide loading
        if (this.el.loading3d) {
          this.el.loading3d.style.display = 'none';
        }

        // Start animation
        this.animate();

        console.log('[TShirtModal] 3D initialized successfully');

      } catch (error) {
        console.error('[TShirtModal] 3D init error:', error);
        this.show2DFallback();
      }
    },

    async loadModel() {
      return new Promise((resolve, reject) => {
        const checkLoader = () => {
          if (typeof THREE.GLTFLoader !== 'undefined') {
            const loader = new THREE.GLTFLoader();
            const modelUrl = window.UL_TSHIRT_GLB_URL || 'https://customizerapp.dev/shirt_baked.glb';

            console.log('[TShirtModal] Loading model:', modelUrl);

            loader.load(
              modelUrl,
              (gltf) => {
                this.three.model = gltf.scene;

                gltf.scene.traverse((child) => {
                  if (child.isMesh) {
                    this.three.mesh = child;

                    child.material = new THREE.MeshStandardMaterial({
                      map: null,
                      roughness: 0.8,
                      metalness: 0.0,
                      side: THREE.DoubleSide
                    });

                    console.log('[TShirtModal] Found mesh:', child.name);
                  }
                });

                this.three.model.scale.set(2, 2, 2);
                this.three.model.position.set(0, -0.1, 0);

                this.three.scene.add(this.three.model);
                resolve();
              },
              (progress) => {
                if (progress.total) {
                  const pct = Math.round((progress.loaded / progress.total) * 100);
                  console.log('[TShirtModal] Loading:', pct + '%');
                }
              },
              (error) => {
                console.error('[TShirtModal] Model load error:', error);
                reject(error);
              }
            );
          } else {
            setTimeout(checkLoader, 100);
          }
        };

        checkLoader();
      });
    },

    setupMouseInteraction(canvas) {
      canvas.addEventListener('mousedown', (e) => {
        this.three.isDragging = true;
        this.three.lastMouseX = e.clientX;
        canvas.style.cursor = 'grabbing';
      });

      canvas.addEventListener('mousemove', (e) => {
        if (!this.three.isDragging) return;
        
        const deltaX = e.clientX - this.three.lastMouseX;
        this.three.lastMouseX = e.clientX;
        this.three.targetRotationY += deltaX * 0.01;
      });

      canvas.addEventListener('mouseup', () => {
        this.three.isDragging = false;
        canvas.style.cursor = 'grab';
      });

      canvas.addEventListener('mouseleave', () => {
        this.three.isDragging = false;
        canvas.style.cursor = 'grab';
      });

      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          this.three.isDragging = true;
          this.three.lastMouseX = e.touches[0].clientX;
        }
      });

      canvas.addEventListener('touchmove', (e) => {
        if (!this.three.isDragging || e.touches.length !== 1) return;
        
        const deltaX = e.touches[0].clientX - this.three.lastMouseX;
        this.three.lastMouseX = e.touches[0].clientX;
        this.three.targetRotationY += deltaX * 0.01;
        e.preventDefault();
      }, { passive: false });

      canvas.addEventListener('touchend', () => {
        this.three.isDragging = false;
      });

      canvas.style.cursor = 'grab';
    },

    animate() {
      if (!this.isOpen || this.currentStep !== 2) return;

      this.three.animationId = requestAnimationFrame(() => this.animate());

      if (this.three.model) {
        this.three.currentRotationY += (this.three.targetRotationY - this.three.currentRotationY) * 0.1;
        this.three.model.rotation.y = this.three.currentRotationY;
      }

      this.three.renderer?.render(this.three.scene, this.three.camera);
    },

    show2DFallback() {
      if (this.el.loading3d) {
        this.el.loading3d.innerHTML = `
          <div style="text-align:center; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 16px;">👕</div>
            <div style="color: #666;">3D Preview unavailable</div>
          </div>
        `;
      }
    },

    cleanup3D() {
      if (this.three.animationId) {
        cancelAnimationFrame(this.three.animationId);
        this.three.animationId = null;
      }

      if (this.currentTexture) {
        this.currentTexture.dispose();
        this.currentTexture = null;
      }

      if (this.three.renderer) {
        this.three.renderer.dispose();
      }

      this.three = {
        scene: null,
        camera: null,
        renderer: null,
        model: null,
        mesh: null,
        animationId: null,
        targetRotationY: 0,
        currentRotationY: 0,
        isDragging: false,
        lastMouseX: 0
      };
    },

    // -------------------------------------------------------------------------
    // Step 3 & 4
    // -------------------------------------------------------------------------
    initStep3() {
      if (this.el.qtyValue) this.el.qtyValue.textContent = this.details.quantity;
      if (this.el.specialNotes) this.el.specialNotes.value = this.details.notes;
    },

    adjustQuantity(delta) {
      const newQty = Math.max(1, this.details.quantity + delta);
      this.details.quantity = newQty;
      if (this.el.qtyValue) this.el.qtyValue.textContent = newQty;
    },

    initStep4() {
      this.renderReviewSummary();
      this.updateActionButtons();
    },

    renderReviewSummary() {
      if (!this.el.reviewSummary) return;

      const enabledLocations = Object.entries(this.design.locations)
        .filter(([_, loc]) => loc.enabled)
        .map(([id]) => {
          const names = { front: 'Front', back: 'Back', left_sleeve: 'Left Sleeve', right_sleeve: 'Right Sleeve' };
          return names[id];
        });

      this.el.reviewSummary.innerHTML = `
        <div class="ul-review-item">
          <span class="ul-review-label">Color:</span>
          <span class="ul-review-value">${this.design.colorName}</span>
        </div>
        <div class="ul-review-item">
          <span class="ul-review-label">Size:</span>
          <span class="ul-review-value">${this.design.size}</span>
        </div>
        <div class="ul-review-item">
          <span class="ul-review-label">Locations:</span>
          <span class="ul-review-value">${enabledLocations.join(', ')}</span>
        </div>
        <div class="ul-review-item">
          <span class="ul-review-label">Quantity:</span>
          <span class="ul-review-value">${this.details.quantity}</span>
        </div>
      `;
    },

    updateActionButtons() {
      const enabled = this.confirmed;
      if (this.el.btnAddToCart) this.el.btnAddToCart.disabled = !enabled;
      if (this.el.btnDesignAnother) this.el.btnDesignAnother.disabled = !enabled;
      if (this.el.btnCheckout) this.el.btnCheckout.disabled = !enabled;
    },

    async addToCart() {
      console.log('[TShirtModal] Adding to cart:', { design: this.design, details: this.details });
      this.showToast('Added to cart!', 'success');
      
      document.dispatchEvent(new CustomEvent('ul:tshirtAddedToCart', {
        detail: {
          color: this.design.colorName,
          size: this.design.size,
          locations: this.design.locations,
          quantity: this.details.quantity
        }
      }));

      return true;
    },

    async designAnother() {
      await this.addToCart();
      this.confirmed = false;
      if (this.el.confirmCheckbox) this.el.confirmCheckbox.checked = false;
      this.goToStep(1);
    },

    async checkout() {
      await this.addToCart();
      this.close();
      document.dispatchEvent(new CustomEvent('ul:tshirtCheckout'));
    },

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------
    isLightColor(hex) {
      const color = hex.replace('#', '');
      const r = parseInt(color.substr(0, 2), 16);
      const g = parseInt(color.substr(2, 2), 16);
      const b = parseInt(color.substr(4, 2), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 > 200;
    },

    showToast(message, type = 'success') {
      if (!this.el.toast) return;
      this.el.toast.textContent = message;
      this.el.toast.className = 'ul-toast ' + type;
      setTimeout(() => this.el.toast.classList.add('show'), 10);
      setTimeout(() => this.el.toast.classList.remove('show'), 3000);
    }
  };

  // ===========================================================================
  // Initialize
  // ===========================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TShirtModal.init());
  } else {
    TShirtModal.init();
  }

  window.TShirtModal = TShirtModal;
  window.ULTShirtModal = TShirtModal;

  console.log('[TShirtModal] v5.0 loaded!');

})();