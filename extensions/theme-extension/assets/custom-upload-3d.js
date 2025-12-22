/**
 * Custom Upload for Products Design - 3D Designer Module
 * Three.js based 3D preview with multi-location decal support
 *
 * Based on: kt946/ai-threejs-products-app-yt-jsm
 * Adapted for Custom Upload for Products Design
 *
 * @version 1.0.0
 */

(function() {
  'use strict';

  // CDN URLs with fallbacks
  const THREE_CDNS = [
    'https://unpkg.com/three@0.160.0/build/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js',
  ];

  const ORBIT_CDNS = [
    'https://unpkg.com/three@0.160.0/examples/js/controls/OrbitControls.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js',
  ];

  const GLTF_CDNS = [
    'https://unpkg.com/three@0.160.0/examples/js/loaders/GLTFLoader.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/loaders/GLTFLoader.js',
  ];

  const DECAL_CDNS = [
    'https://unpkg.com/three@0.160.0/examples/js/geometries/DecalGeometry.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/geometries/DecalGeometry.js',
  ];

  // Load script with fallback CDNs
  async function loadScriptWithFallback(cdnUrls, checkFn) {
    for (const url of cdnUrls) {
      try {
        await loadScript(url);
        if (checkFn && checkFn()) return true;
        return true;
      } catch (e) {
        console.warn(`[Custom Upload 3D] Failed to load from ${url}, trying next...`);
      }
    }
    throw new Error('All CDN sources failed');
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Check for Three.js and load if needed
  async function initializeThreeJS() {
    try {
      if (typeof THREE === 'undefined') {
        await loadScriptWithFallback(THREE_CDNS, () => typeof THREE !== 'undefined');
      }
      await Promise.all([
        loadOrbitControls(),
        loadGLTFLoader(),
        loadDecalGeometry(),
      ]);
      init3D();
    } catch (error) {
      console.error('[Custom Upload 3D] Failed to load Three.js dependencies:', error);
      show2DFallback();
    }
  }

  // If THREE already loaded, just initialize
  if (typeof THREE !== 'undefined') {
    loadOrbitControls().then(() => loadGLTFLoader()).then(() => loadDecalGeometry()).then(init3D);
  } else {
    initializeThreeJS();
  }

  function loadOrbitControls() {
    return new Promise(async (resolve) => {
      if (typeof THREE.OrbitControls !== 'undefined') {
        resolve();
        return;
      }
      await loadScriptWithFallback(ORBIT_CDNS, () => typeof THREE.OrbitControls !== 'undefined');
      resolve();
    });
  }

  function loadGLTFLoader() {
    return new Promise(async (resolve) => {
      if (typeof THREE.GLTFLoader !== 'undefined') {
        resolve();
        return;
      }
      await loadScriptWithFallback(GLTF_CDNS, () => typeof THREE.GLTFLoader !== 'undefined');
      resolve();
    });
  }

  function loadDecalGeometry() {
    return new Promise(async (resolve) => {
      if (typeof THREE.DecalGeometry !== 'undefined') {
        resolve();
        return;
      }
      await loadScriptWithFallback(DECAL_CDNS, () => typeof THREE.DecalGeometry !== 'undefined');
      resolve();
    });
  }

  // ══════════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════════

  const state = {
    container: null,
    canvas: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    model: null,
    shirtMesh: null, // Specific reference to T-shirt mesh
    decals: new Map(), // location -> decal mesh
    designs: new Map(), // location -> { texture, transform }
    currentLocation: 'front',
    assetSet: null,
    isWebGL2: true,
    animationId: null,
    uploadId: null,
    shopDomain: '', // Shop domain for API calls
    lastFailedFile: null, // Store for retry
  };

  // Default print locations - based on kt946/ai-threejs-products-app-yt-jsm
  // Front logo position: [0, 0.04, 0.15] scale: 0.15
  const DEFAULT_LOCATIONS = {
    front: {
      position: new THREE.Vector3(0, 0.04, 0.15),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(0.15, 0.15, 0.15),
      maxScale: 0.25,
    },
    back: {
      position: new THREE.Vector3(0, 0.04, -0.15),
      rotation: new THREE.Euler(0, Math.PI, 0),
      scale: new THREE.Vector3(0.2, 0.2, 0.2),
      maxScale: 0.3,
    },
    left_sleeve: {
      position: new THREE.Vector3(-0.13, 0.12, 0),
      rotation: new THREE.Euler(0, -Math.PI / 2, 0),
      scale: new THREE.Vector3(0.06, 0.06, 0.06),
      maxScale: 0.1,
    },
    right_sleeve: {
      position: new THREE.Vector3(0.13, 0.12, 0),
      rotation: new THREE.Euler(0, Math.PI / 2, 0),
      scale: new THREE.Vector3(0.06, 0.06, 0.06),
      maxScale: 0.1,
    },
  };

  // Camera presets
  const CAMERA_PRESETS = {
    front: { position: [0, 0, 2.5], target: [0, 0, 0] },
    back: { position: [0, 0, -2.5], target: [0, 0, 0] },
    left: { position: [-2.5, 0, 0], target: [0, 0, 0] },
    right: { position: [2.5, 0, 0], target: [0, 0, 0] },
    reset: { position: [0, 0, 2.5], target: [0, 0, 0] },
  };

  // ══════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════════════════

  async function init3D() {
    const container = document.getElementById('upload-lift-3d-designer');
    if (!container) return;

    state.container = container;

    // Read shop domain from data attribute (priority) or fallback to Shopify global
    state.shopDomain = container.dataset.shopDomain || window.Shopify?.shop || '';

    // Check WebGL2 support
    state.isWebGL2 = checkWebGL2Support();

    if (!state.isWebGL2) {
      // Show 2D fallback for mobile/old browsers
      show2DFallback();
      return;
    }

    // Load dependencies
    await Promise.all([
      loadOrbitControls(),
      loadGLTFLoader(),
      loadDecalGeometry(),
    ]);

    // Parse asset set from data attribute
    const assetSetId = container.dataset.assetSetId;
    if (assetSetId) {
      await loadAssetSet(assetSetId);
    }

    // Initialize Three.js scene
    initScene();

    // Load model
    await loadModel();

    // Bind UI events
    bindEvents();

    // Start render loop
    animate();

    console.log('[Custom Upload 3D] Initialized');
  }

  function checkWebGL2Support() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
    } catch (e) {
      return false;
    }
  }

  function show2DFallback() {
    const canvas3d = document.getElementById('ul-3d-canvas');
    const fallback = document.getElementById('ul-2d-fallback');

    if (canvas3d) canvas3d.style.display = 'none';
    if (fallback) fallback.style.display = 'flex';

    console.log('[Custom Upload 3D] Using 2D fallback (WebGL2 not supported)');
  }

  async function loadAssetSet(assetSetId) {
    try {
      const appUrl = state.container.dataset.appUrl || 'https://customizerapp.dev';
      const response = await fetch(`${appUrl}/api/asset-sets/${assetSetId}`, {
        credentials: 'include',
      });

      if (response.ok) {
        state.assetSet = await response.json();
      }
    } catch (error) {
      console.error('[Custom Upload 3D] Failed to load asset set:', error);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // THREE.JS SCENE SETUP
  // ══════════════════════════════════════════════════════════════

  function initScene() {
    const canvasContainer = document.getElementById('ul-3d-canvas');
    if (!canvasContainer) return;

    // Clear loading indicator
    canvasContainer.innerHTML = '';

    // Create scene
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x1a1a2e);

    // Create camera
    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    state.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    state.camera.position.set(0, 0, 2.5);

    // Create renderer
    state.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    state.renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1;

    canvasContainer.appendChild(state.renderer.domElement);
    state.canvas = state.renderer.domElement;

    // Create controls
    state.controls = new THREE.OrbitControls(state.camera, state.canvas);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.minDistance = 1.5;
    state.controls.maxDistance = 5;
    state.controls.enablePan = false;
    state.controls.target.set(0, 0, 0);

    // Lighting
    setupLighting();

    // Handle resize
    window.addEventListener('resize', onWindowResize);
  }

  function setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    state.scene.add(ambientLight);

    // Main directional light
    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(5, 5, 5);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    state.scene.add(mainLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-5, 0, -5);
    state.scene.add(fillLight);

    // Rim light
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
    rimLight.position.set(0, 5, -5);
    state.scene.add(rimLight);
  }

  function onWindowResize() {
    const canvasContainer = document.getElementById('ul-3d-canvas');
    if (!canvasContainer || !state.camera || !state.renderer) return;

    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;

    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height);
  }

  // ══════════════════════════════════════════════════════════════
  // MODEL LOADING
  // ══════════════════════════════════════════════════════════════

  async function loadModel() {
    const loader = new THREE.GLTFLoader();

    // Get model URL from asset set or use default
    // Try multiple paths for the GLB model
    const appUrl = state.container?.dataset?.appUrl || 'https://customizerapp.dev';
    let modelUrl = `${appUrl}/shirt_baked.glb`; // Default model path

    if (state.assetSet?.model?.url) {
      modelUrl = state.assetSet.model.url;
    }

    console.log('[Custom Upload 3D] Loading model from:', modelUrl);

    return new Promise((resolve, reject) => {
      loader.load(
        modelUrl,
        (gltf) => {
          state.model = gltf.scene;

          // Find the T-Shirt mesh specifically (from kt946 repo structure)
          state.model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;

              // Store specific mesh name for decal (T_Shirt_male is the mesh name in shirt_baked.glb)
              if (child.name === 'T_Shirt_male' || child.geometry) {
                state.shirtMesh = child;
                child.userData.isMainMesh = true;
                console.log('[Custom Upload 3D] Found shirt mesh:', child.name);
              }
            }
          });

          // Center and scale model
          const box = new THREE.Box3().setFromObject(state.model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());

          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 1.5 / maxDim;
          state.model.scale.setScalar(scale);

          state.model.position.x = -center.x * scale;
          state.model.position.y = -center.y * scale;
          state.model.position.z = -center.z * scale;

          state.scene.add(state.model);

          console.log('[Custom Upload 3D] Model loaded successfully');
          resolve();
        },
        (progress) => {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`[Custom Upload 3D] Loading model: ${percent.toFixed(0)}%`);
        },
        (error) => {
          console.error('[Custom Upload 3D] Model load error:', error);
          reject(error);
        }
      );
    });
  }

  // ══════════════════════════════════════════════════════════════
  // DECAL SYSTEM
  // ══════════════════════════════════════════════════════════════

  function applyDecal(location, textureUrl, transform = {}) {
    if (!state.model) return;

    // Remove existing decal for this location
    removeDecal(location);

    // Load texture
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(textureUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 16; // Better quality

      // Get location config
      const locConfig = DEFAULT_LOCATIONS[location] || DEFAULT_LOCATIONS.front;

      // Calculate decal parameters
      const position = locConfig.position.clone();
      const rotation = locConfig.rotation.clone();
      const scale = locConfig.scale.clone();

      // Apply user transform
      if (transform.scale !== undefined) {
        const userScale = transform.scale / 50; // Normalize: 50 = 1x
        scale.multiplyScalar(userScale);
      }
      if (transform.rotation !== undefined) {
        rotation.z = THREE.MathUtils.degToRad(transform.rotation);
      }
      // Apply X/Y position offset (normalized to model space)
      if (transform.positionX !== undefined) {
        const offsetX = (transform.positionX / 50) * 0.1; // Max ±0.1 units
        position.x += offsetX;
      }
      if (transform.positionY !== undefined) {
        const offsetY = (transform.positionY / 50) * 0.1; // Max ±0.1 units
        position.y += offsetY;
      }

      // Use stored shirtMesh or find it
      let targetMesh = state.shirtMesh;
      if (!targetMesh) {
        state.model.traverse((child) => {
          if (child.isMesh && child.userData.isMainMesh) {
            targetMesh = child;
          }
        });
      }

      if (!targetMesh) {
        console.warn('[Custom Upload 3D] No mesh found for decal');
        return;
      }

      console.log('[Custom Upload 3D] Applying decal to:', targetMesh.name, 'at position:', position);

      // Create decal material - matching kt946 style
      const decalMaterial = new THREE.MeshPhongMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });

      // Create decal geometry
      const decalGeometry = new THREE.DecalGeometry(
        targetMesh,
        position,
        rotation,
        scale
      );

      // Create decal mesh
      const decalMesh = new THREE.Mesh(decalGeometry, decalMaterial);
      decalMesh.userData.location = location;

      state.scene.add(decalMesh);
      state.decals.set(location, decalMesh);

      // Store design info
      state.designs.set(location, {
        textureUrl,
        transform: { ...transform },
      });

      // Update UI
      updateLocationButtons();
      updateDesignSummary();

      console.log(`[Custom Upload 3D] Decal applied: ${location}`);
    });
  }

  function removeDecal(location) {
    const decal = state.decals.get(location);
    if (decal) {
      state.scene.remove(decal);
      decal.geometry.dispose();
      decal.material.dispose();
      if (decal.material.map) decal.material.map.dispose();
      state.decals.delete(location);
    }
    state.designs.delete(location);
    updateLocationButtons();
    updateDesignSummary();
  }

  function updateDecalTransform(location, transform) {
    const design = state.designs.get(location);
    if (design) {
      applyDecal(location, design.textureUrl, transform);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ANIMATION LOOP
  // ══════════════════════════════════════════════════════════════

  function animate() {
    state.animationId = requestAnimationFrame(animate);

    if (state.controls) {
      state.controls.update();
    }

    if (state.renderer && state.scene && state.camera) {
      state.renderer.render(state.scene, state.camera);
    }
  }

  function stopAnimation() {
    if (state.animationId) {
      cancelAnimationFrame(state.animationId);
      state.animationId = null;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CAMERA CONTROLS
  // ══════════════════════════════════════════════════════════════

  function setCameraView(view) {
    const preset = CAMERA_PRESETS[view];
    if (!preset || !state.camera || !state.controls) return;

    // Animate camera position
    const duration = 500;
    const startPos = state.camera.position.clone();
    const endPos = new THREE.Vector3(...preset.position);
    const startTime = Date.now();

    function animateCamera() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      state.camera.position.lerpVectors(startPos, endPos, eased);
      state.controls.update();

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      }
    }

    animateCamera();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // ══════════════════════════════════════════════════════════════
  // EVENT BINDINGS
  // ══════════════════════════════════════════════════════════════

  function bindEvents() {
    // Camera controls
    document.querySelectorAll('.ul-camera-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        setCameraView(view);

        // Update active state
        document.querySelectorAll('.ul-camera-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Location selection
    document.querySelectorAll('.ul-location-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const location = btn.dataset.location;
        state.currentLocation = location;

        // Update UI
        document.querySelectorAll('.ul-location-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Move camera to location
        const cameraMap = {
          front: 'front',
          back: 'back',
          left_sleeve: 'left',
          right_sleeve: 'right',
        };
        setCameraView(cameraMap[location] || 'front');
      });
    });

    // File upload
    const dropzone = document.getElementById('ul-3d-dropzone');
    const fileInput = document.getElementById('ul-3d-file-input');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
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
        if (e.dataTransfer?.files?.[0]) {
          handleFileUpload(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target?.files?.[0]) {
          handleFileUpload(e.target.files[0]);
        }
      });
    }

    // Transform sliders
    const scaleSlider = document.getElementById('ul-scale-slider');
    const rotationSlider = document.getElementById('ul-rotation-slider');
    const positionXSlider = document.getElementById('ul-position-x-slider');
    const positionYSlider = document.getElementById('ul-position-y-slider');

    if (scaleSlider) {
      scaleSlider.addEventListener('input', (e) => {
        const scale = parseInt(e.target.value);
        document.getElementById('ul-scale-value').textContent = `${scale}%`;
        updateCurrentDecalTransform();
      });
    }

    if (rotationSlider) {
      rotationSlider.addEventListener('input', (e) => {
        const rotation = parseInt(e.target.value);
        document.getElementById('ul-rotation-value').textContent = `${rotation}°`;
        updateCurrentDecalTransform();
      });
    }

    if (positionXSlider) {
      positionXSlider.addEventListener('input', (e) => {
        const x = parseInt(e.target.value);
        document.getElementById('ul-position-x-value').textContent = `${x}`;
        updateCurrentDecalTransform();
      });
    }

    if (positionYSlider) {
      positionYSlider.addEventListener('input', (e) => {
        const y = parseInt(e.target.value);
        document.getElementById('ul-position-y-value').textContent = `${y}`;
        updateCurrentDecalTransform();
      });
    }

    // Reset/center buttons
    document.getElementById('ul-center-design')?.addEventListener('click', () => {
      document.getElementById('ul-scale-slider').value = 50;
      document.getElementById('ul-rotation-slider').value = 0;
      document.getElementById('ul-position-x-slider').value = 0;
      document.getElementById('ul-position-y-slider').value = 0;
      document.getElementById('ul-scale-value').textContent = '50%';
      document.getElementById('ul-rotation-value').textContent = '0°';
      document.getElementById('ul-position-x-value').textContent = '0';
      document.getElementById('ul-position-y-value').textContent = '0';
      updateCurrentDecalTransform();
    });

    document.getElementById('ul-reset-transform')?.addEventListener('click', () => {
      removeDecal(state.currentLocation);
      document.getElementById('ul-transform-section').style.display = 'none';
      document.getElementById('ul-design-preview').style.display = 'none';
      document.getElementById('ul-3d-dropzone').style.display = 'block';
    });

    // Remove design button
    document.getElementById('ul-remove-design')?.addEventListener('click', () => {
      removeDecal(state.currentLocation);
      document.getElementById('ul-design-preview').style.display = 'none';
      document.getElementById('ul-3d-dropzone').style.display = 'block';
      document.getElementById('ul-transform-section').style.display = 'none';
    });

    // Approval checkbox
    document.getElementById('ul-3d-approval')?.addEventListener('change', updateAddToCartButton);

    // Add to cart
    document.getElementById('ul-add-to-cart-3d')?.addEventListener('click', handleAddToCart);
  }

  function updateCurrentDecalTransform() {
    const scale = parseInt(document.getElementById('ul-scale-slider')?.value || 50);
    const rotation = parseInt(document.getElementById('ul-rotation-slider')?.value || 0);
    const positionX = parseInt(document.getElementById('ul-position-x-slider')?.value || 0);
    const positionY = parseInt(document.getElementById('ul-position-y-slider')?.value || 0);
    updateDecalTransform(state.currentLocation, { scale, rotation, positionX, positionY });
  }

  // ══════════════════════════════════════════════════════════════
  // FILE UPLOAD HANDLING
  // ══════════════════════════════════════════════════════════════

  async function handleFileUpload(file) {
    console.log('[Custom Upload 3D] Uploading:', file.name);

    const container = state.container;
    const appUrl = container.dataset.appUrl || 'https://customizerapp.dev';
    const productId = container.dataset.productId;
    const variantId = container.dataset.variantId;

    // Show progress
    document.getElementById('ul-3d-dropzone').style.display = 'none';
    document.getElementById('ul-upload-progress').style.display = 'block';
    updateProgress(0);

    try {
      // Get upload intent
      updateProgress(10);
      const shopDomain = state.shopDomain || window.Shopify?.shop || '';
      const intentResponse = await fetch(`${appUrl}/api/upload/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          shopDomain,
          productId,
          variantId,
          mode: '3d_designer',
          contentType: file.type || 'application/octet-stream',
          fileName: file.name,
          fileSize: file.size,
          location: state.currentLocation,
        }),
      });

      if (!intentResponse.ok) throw new Error('Failed to get upload URL');
      const intent = await intentResponse.json();
      state.uploadId = intent.uploadId;

      // Upload to storage
      updateProgress(30);
      await fetch(intent.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      updateProgress(60);

      // Complete upload
      const completeResponse = await fetch(`${appUrl}/api/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          shopDomain,
          uploadId: intent.uploadId,
          items: [{
            itemId: intent.itemId,
            location: state.currentLocation,
            transform: { scale: 50, rotation: 0 },
          }],
        }),
      });

      updateProgress(80);

      // Wait for preflight and get preview URL
      const statusData = await pollUploadStatus(intent.uploadId, appUrl);

      updateProgress(100);

      // Show design preview
      const previewUrl = statusData.items?.[0]?.previewUrl || URL.createObjectURL(file);
      showDesignPreview(file.name, previewUrl);

      // Apply decal to 3D model
      applyDecal(state.currentLocation, previewUrl, { scale: 50, rotation: 0 });

      // Show transform controls
      document.getElementById('ul-transform-section').style.display = 'block';

      // Update preflight status
      showPreflightStatus(statusData.items?.[0]?.preflightStatus || 'ok');

    } catch (error) {
      console.error('[Custom Upload 3D] Upload failed:', error);
      state.lastFailedFile = file; // Store for retry
      showPreflightStatus('error', 'Upload failed: ' + error.message, true);
      document.getElementById('ul-3d-dropzone').style.display = 'block';
    } finally {
      document.getElementById('ul-upload-progress').style.display = 'none';
    }
  }

  function updateProgress(percent) {
    const fill = document.getElementById('ul-progress-fill');
    const text = document.getElementById('ul-progress-text');
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `Uploading... ${percent}%`;
  }

  async function pollUploadStatus(uploadId, appUrl) {
    const maxAttempts = 30;
    let attempts = 0;
    const shopDomain = state.shopDomain || window.Shopify?.shop || '';

    while (attempts < maxAttempts) {
      const response = await fetch(`${appUrl}/api/upload/status/${uploadId}?shopDomain=${encodeURIComponent(shopDomain)}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to get status');
      const data = await response.json();

      if (data.status !== 'uploaded' && data.status !== 'processing') {
        return data;
      }

      attempts++;
      await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error('Timeout waiting for preflight');
  }

  function showDesignPreview(fileName, previewUrl) {
    const preview = document.getElementById('ul-design-preview');
    const thumbnail = document.getElementById('ul-design-thumbnail');
    const name = document.getElementById('ul-design-name');
    const dropzone = document.getElementById('ul-3d-dropzone');

    if (thumbnail) thumbnail.src = previewUrl;
    if (name) name.textContent = fileName;
    if (preview) preview.style.display = 'flex';
    if (dropzone) dropzone.style.display = 'none';
  }

  function showPreflightStatus(status, message, canRetry = false) {
    const statusEl = document.getElementById('ul-preflight-status');
    const messageEl = document.getElementById('ul-preflight-message');
    const iconEl = document.getElementById('ul-preflight-icon');

    if (!statusEl) return;

    statusEl.className = 'ul-preflight-status ' + status;
    statusEl.style.display = 'flex';

    const icons = {
      ok: '✓',
      warning: '⚠',
      error: '✗',
    };

    const messages = {
      ok: 'Design ready',
      warning: message || 'Some checks have warnings',
      error: message || 'Design has issues',
    };

    if (iconEl) iconEl.textContent = icons[status] || '•';
    if (messageEl) messageEl.textContent = messages[status];

    // Handle retry button
    let retryBtn = statusEl.querySelector('.ul-retry-btn');
    if (canRetry && state.lastFailedFile) {
      if (!retryBtn) {
        retryBtn = document.createElement('button');
        retryBtn.className = 'ul-retry-btn';
        retryBtn.textContent = 'Retry';
        retryBtn.type = 'button';
        retryBtn.addEventListener('click', () => {
          if (state.lastFailedFile) {
            statusEl.style.display = 'none';
            handleFileUpload(state.lastFailedFile);
          }
        });
        statusEl.appendChild(retryBtn);
      }
      retryBtn.style.display = 'inline-block';
    } else if (retryBtn) {
      retryBtn.style.display = 'none';
    }
  }

  // ══════════════════════════════════════════════════════════════
  // UI UPDATES
  // ══════════════════════════════════════════════════════════════

  function updateLocationButtons() {
    document.querySelectorAll('.ul-location-btn').forEach(btn => {
      const location = btn.dataset.location;
      if (state.designs.has(location)) {
        btn.classList.add('has-design');
      } else {
        btn.classList.remove('has-design');
      }
    });
  }

  function updateDesignSummary() {
    const container = document.getElementById('ul-summary-locations');
    if (!container) return;

    container.innerHTML = '';

    state.designs.forEach((design, location) => {
      const badge = document.createElement('span');
      badge.className = 'ul-summary-location-badge';
      badge.textContent = location.replace('_', ' ');
      container.appendChild(badge);
    });

    if (state.designs.size === 0) {
      container.innerHTML = '<span style="color: #637381; font-size: 13px;">No designs added yet</span>';
    }

    updateAddToCartButton();
  }

  function updateAddToCartButton() {
    const btn = document.getElementById('ul-add-to-cart-3d');
    const approval = document.getElementById('ul-3d-approval');

    if (!btn) return;

    const hasDesigns = state.designs.size > 0;
    const isApproved = approval?.checked || false;

    btn.disabled = !(hasDesigns && isApproved);
  }

  // ══════════════════════════════════════════════════════════════
  // ADD TO CART
  // ══════════════════════════════════════════════════════════════

  async function handleAddToCart() {
    const container = state.container;
    const variantId = container.dataset.variantId;

    // Prepare location data
    const locations = [];
    state.designs.forEach((design, location) => {
      locations.push({
        location,
        transform: design.transform,
      });
    });

    // Set hidden properties
    document.getElementById('ul-3d-prop-id').value = state.uploadId || '';
    document.getElementById('ul-3d-prop-locations').value = JSON.stringify(locations);

    // Get first design preview for cart display
    const firstDesign = state.designs.values().next().value;
    if (firstDesign) {
      document.getElementById('ul-3d-prop-preview').value = firstDesign.textureUrl || '';
    }

    // Add to cart via Shopify AJAX
    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: variantId,
          quantity: 1,
          properties: {
            '_upload_lift_id': state.uploadId || '',
            '_upload_lift_mode': '3d_designer',
            '_upload_lift_preview': firstDesign?.textureUrl || '',
            '_upload_lift_locations': JSON.stringify(locations),
            'Customization': `${locations.length} location(s) customized`,
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to add to cart');

      // Redirect to cart
      window.location.href = '/cart';
    } catch (error) {
      console.error('[Custom Upload 3D] Add to cart failed:', error);
      alert('Failed to add to cart. Please try again.');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CLEANUP
  // ══════════════════════════════════════════════════════════════

  function cleanup() {
    stopAnimation();

    if (state.renderer) {
      state.renderer.dispose();
    }

    if (state.scene) {
      state.scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }

    window.removeEventListener('resize', onWindowResize);
  }

  // ══════════════════════════════════════════════════════════════
  // BOOT
  // ══════════════════════════════════════════════════════════════

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init3D);
  } else {
    init3D();
  }

  // Expose cleanup for SPA navigation
  window.uploadLift3DCleanup = cleanup;

})();

