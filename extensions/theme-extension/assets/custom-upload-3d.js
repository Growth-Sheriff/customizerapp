/**
 * Custom Upload 3D Module
 * 
 * Three.js powered 3D viewer with:
 * - T-shirt model loading (GLB)
 * - DecalGeometry for print preview
 * - 4 mini preview scenes for each location
 * - OrbitControls for interaction
 * - Real-time position adjustment
 * 
 * IMPORTANT: Three.js is loaded synchronously in product-customizer.liquid
 * This module expects THREE, GLTFLoader, OrbitControls, DecalGeometry to be available
 */

(function() {
  'use strict';

  // Wait for Three.js to load, then setup event handlers
  waitForThreeJS();

  // ============================================================
  // THREE.JS DEPENDENCY CHECK
  // ============================================================
  function waitForThreeJS() {
    if (typeof THREE !== 'undefined' && 
        typeof THREE.GLTFLoader !== 'undefined' &&
        typeof THREE.OrbitControls !== 'undefined') {
      console.log('[CustomUpload3D] Three.js ready');
      
      // Wait for DOM ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDOMReady);
      } else {
        onDOMReady();
      }
    } else {
      console.log('[CustomUpload3D] Waiting for Three.js...');
      setTimeout(waitForThreeJS, 100);
    }
  }

  function onDOMReady() {
    console.log('[CustomUpload3D] DOM ready, setting up handlers');
    initPositionItemClicks();
    initSliders();
    
    // Expose global state
    window.CustomizerState = window.CustomizerState || {};
  }

  // ============================================================
  // CONFIGURATION
  // ============================================================
  const Config = {
    // GLB model URL - will be set from widget or default
    modelUrl: null,
    fallbackModelUrl: 'https://threejs.org/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf',
    
    // Camera settings
    cameraFov: 45,
    cameraPosition: { x: 0, y: 0, z: 3 },
    
    // Default colors
    defaultShirtColor: 0xFFFFFF,
    defaultBackgroundGradient: ['#667eea', '#764ba2'],
    
    // Print locations with mesh coordinates
    locations: {
      front: { 
        position: { x: 0, y: 0.2, z: 0.15 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 0.3, y: 0.4 },
        cameraAngle: 0
      },
      back: { 
        position: { x: 0, y: 0.2, z: -0.15 },
        rotation: { x: 0, y: Math.PI, z: 0 },
        scale: { x: 0.3, y: 0.4 },
        cameraAngle: Math.PI
      },
      left_sleeve: { 
        position: { x: -0.25, y: 0.35, z: 0 },
        rotation: { x: 0, y: Math.PI / 2, z: 0 },
        scale: { x: 0.1, y: 0.1 },
        cameraAngle: Math.PI / 2
      },
      right_sleeve: { 
        position: { x: 0.25, y: 0.35, z: 0 },
        rotation: { x: 0, y: -Math.PI / 2, z: 0 },
        scale: { x: 0.1, y: 0.1 },
        cameraAngle: -Math.PI / 2
      }
    },
    
    // Unit conversion: 1 inch = 0.0254 meters, but we scale for visibility
    inchToUnit: 0.025
  };

  // ============================================================
  // STATE
  // ============================================================
  const State = {
    initialized: false,
    
    // Main scene
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    
    // Model
    model: null,
    shirtMesh: null,
    
    // Decals
    decals: {},
    designTexture: null,
    
    // Mini scenes (one per location)
    miniScenes: {},
    miniRenderers: {},
    miniCameras: {},
    miniModels: {},
    
    // Animation
    animationFrameId: null,
    autoRotate: false
  };

  // ============================================================
  // MAIN INITIALIZATION
  // ============================================================
  function init() {
    if (State.initialized) {
      console.log('[CustomUpload3D] Already initialized');
      return;
    }

    // Try multiple canvas IDs for compatibility
    let canvas = document.getElementById('cu-3d-canvas');
    if (!canvas) {
      canvas = document.getElementById('ul-3d-canvas');
    }
    
    if (!canvas) {
      console.error('[CustomUpload3D] Canvas not found (tried cu-3d-canvas and ul-3d-canvas)');
      return;
    }

    // Make sure canvas container is visible before getting dimensions
    const section = canvas.closest('.cu-3d-section, #cu-3d-section, .ul-3d-canvas-wrapper');
    if (section && section.style.display === 'none') {
      console.log('[CustomUpload3D] Canvas section is hidden, showing temporarily for init');
    }

    console.log('[CustomUpload3D] Initializing...');

    // Get model URL from widget data
    const widget = document.getElementById('custom-upload-widget') || 
                   document.getElementById('upload-lift-3d-designer');
    if (widget && widget.dataset.modelUrl) {
      Config.modelUrl = widget.dataset.modelUrl;
    }
    
    // Get GLB model URL from global variable if set
    if (window.GLB_MODEL_URL) {
      Config.modelUrl = window.GLB_MODEL_URL;
    }

    // Setup main scene
    setupMainScene(canvas);

    // Setup mini preview scenes
    setupMiniScenes();

    // Load model
    loadModel();

    // Start render loop
    animate();

    // Setup position item clicks
    initPositionItemClicks();

    // Setup sliders
    initSliders();

    State.initialized = true;
    console.log('[CustomUpload3D] Initialization complete');
  }

  // ============================================================
  // MAIN SCENE SETUP
  // ============================================================
  function setupMainScene(canvas) {
    // Scene
    State.scene = new THREE.Scene();
    
    // Gradient background
    const bgColor = new THREE.Color(0x667eea);
    State.scene.background = bgColor;

    // Get dimensions - use defaults if canvas is hidden
    let width = canvas.clientWidth || 800;
    let height = canvas.clientHeight || 500;
    
    // If still 0, try parent dimensions
    if (width === 0 || height === 0) {
      const parent = canvas.parentElement;
      if (parent) {
        width = parent.clientWidth || 800;
        height = parent.clientHeight || 500;
      }
    }
    
    // Final fallback
    if (width === 0) width = 800;
    if (height === 0) height = 500;
    
    console.log('[CustomUpload3D] Canvas dimensions:', width, 'x', height);

    // Camera
    const aspect = width / height;
    State.camera = new THREE.PerspectiveCamera(Config.cameraFov, aspect, 0.1, 100);
    State.camera.position.set(
      Config.cameraPosition.x,
      Config.cameraPosition.y,
      Config.cameraPosition.z
    );

    // Renderer
    State.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false
    });
    State.renderer.setSize(width, height);
    State.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    State.renderer.outputEncoding = THREE.sRGBEncoding;
    State.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    State.renderer.toneMappingExposure = 1;

    // Controls
    State.controls = new THREE.OrbitControls(State.camera, canvas);
    State.controls.enableDamping = true;
    State.controls.dampingFactor = 0.05;
    State.controls.enablePan = false;
    State.controls.minDistance = 1.5;
    State.controls.maxDistance = 5;
    State.controls.autoRotate = false;
    State.controls.autoRotateSpeed = 2;

    // Lighting
    setupLighting(State.scene);

    // Handle resize
    window.addEventListener('resize', handleResize);
    handleResize();

    // Camera control buttons
    setupCameraControls();
  }

  function setupLighting(scene) {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);

    // Key light
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(5, 5, 5);
    scene.add(keyLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 0, 5);
    scene.add(fillLight);

    // Rim light
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, 5, -5);
    scene.add(rimLight);
  }

  function handleResize() {
    const canvas = State.renderer.domElement;
    const container = canvas.parentElement;
    
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;

    State.camera.aspect = width / height;
    State.camera.updateProjectionMatrix();
    State.renderer.setSize(width, height);
  }

  function setupCameraControls() {
    const controls = document.querySelectorAll('.cu-cam-btn');
    controls.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        switch (action) {
          case 'rotate-left':
            rotateCameraTo(State.controls.getAzimuthalAngle() + Math.PI / 4);
            break;
          case 'rotate-right':
            rotateCameraTo(State.controls.getAzimuthalAngle() - Math.PI / 4);
            break;
          case 'reset':
            resetCamera();
            break;
        }
      });
    });
  }

  function rotateCameraTo(angle) {
    // Simple rotation (could be animated)
    const radius = State.camera.position.length();
    State.camera.position.x = Math.sin(angle) * radius;
    State.camera.position.z = Math.cos(angle) * radius;
    State.camera.lookAt(0, 0, 0);
    State.controls.update();
  }

  function resetCamera() {
    State.camera.position.set(
      Config.cameraPosition.x,
      Config.cameraPosition.y,
      Config.cameraPosition.z
    );
    State.controls.reset();
  }

  // ============================================================
  // MINI PREVIEW SCENES
  // ============================================================
  function setupMiniScenes() {
    const locations = Object.keys(Config.locations);
    
    locations.forEach(location => {
      const canvas = document.getElementById(`cu-mini-${location}`);
      if (!canvas) return;

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf5f5f5);

      // Camera
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.set(0, 0, 2);

      // Renderer
      const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true
      });
      renderer.setSize(120, 120);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;

      // Lighting
      setupLighting(scene);

      // Store references
      State.miniScenes[location] = scene;
      State.miniCameras[location] = camera;
      State.miniRenderers[location] = renderer;
    });
  }

  // ============================================================
  // MODEL LOADING
  // ============================================================
  function loadModel() {
    const loader = new THREE.GLTFLoader();
    
    // Try multiple loading element IDs for compatibility
    let loadingEl = document.getElementById('cu-3d-loading');
    if (!loadingEl) {
      loadingEl = document.querySelector('.cu-3d-loading');
    }
    if (!loadingEl) {
      loadingEl = document.querySelector('.ul-3d-loading');
    }

    // Try to load custom model, fallback to default
    const modelUrl = Config.modelUrl || getDefaultModelUrl();

    console.log('[CustomUpload3D] Loading model:', modelUrl);

    loader.load(
      modelUrl,
      (gltf) => {
        console.log('[CustomUpload3D] Model loaded successfully');
        
        State.model = gltf.scene;
        
        // Find and store the shirt mesh
        State.model.traverse((child) => {
          if (child.isMesh) {
            State.shirtMesh = child;
            
            // Enable shadow
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Ensure proper encoding
            if (child.material && child.material.map) {
              child.material.map.encoding = THREE.sRGBEncoding;
            }
          }
        });

        // Center and scale model
        const box = new THREE.Box3().setFromObject(State.model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.5 / maxDim;
        
        State.model.scale.setScalar(scale);
        State.model.position.sub(center.multiplyScalar(scale));

        // Add to main scene
        State.scene.add(State.model);

        // Clone for mini scenes
        cloneModelForMiniScenes();

        // Hide loading
        if (loadingEl) loadingEl.style.display = 'none';

        // Mark 3D as ready
        if (window.CustomizerState) {
          window.CustomizerState.is3DReady = true;
        }
      },
      (progress) => {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        if (loadingEl) {
          const pEl = loadingEl.querySelector('p');
          if (pEl) pEl.textContent = `Loading 3D Model... ${percent}%`;
        }
      },
      (error) => {
        console.error('[CustomUpload3D] Model load error:', error);
        
        // Try fallback model
        if (modelUrl !== Config.fallbackModelUrl) {
          console.log('[CustomUpload3D] Trying fallback model...');
          Config.modelUrl = Config.fallbackModelUrl;
          loadModel();
        } else {
          // Show error
          if (loadingEl) {
            loadingEl.innerHTML = `
              <p style="color: #ea5455;">Failed to load 3D model</p>
              <button onclick="window.CustomUpload3D.reload()" class="cu-btn-small">Retry</button>
            `;
          }
        }
      }
    );
  }

  function getDefaultModelUrl() {
    // Check if there's a model URL in the page
    if (window.GLB_MODEL_URL) {
      return window.GLB_MODEL_URL;
    }
    
    // Return a default t-shirt model URL
    return Config.fallbackModelUrl;
  }

  function cloneModelForMiniScenes() {
    Object.keys(State.miniScenes).forEach(location => {
      const scene = State.miniScenes[location];
      const camera = State.miniCameras[location];
      const locationConfig = Config.locations[location];

      // Clone the model
      const clone = State.model.clone();
      scene.add(clone);
      State.miniModels[location] = clone;

      // Position camera to focus on location
      const angle = locationConfig.cameraAngle;
      camera.position.set(
        Math.sin(angle) * 2,
        0.2,
        Math.cos(angle) * 2
      );
      camera.lookAt(0, 0.2, 0);
    });
  }

  // ============================================================
  // DESIGN/DECAL MANAGEMENT
  // ============================================================
  function updateDesign(imageData) {
    console.log('[CustomUpload3D] Updating design');

    // Load texture
    const loader = new THREE.TextureLoader();
    loader.load(imageData, (texture) => {
      texture.encoding = THREE.sRGBEncoding;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      
      State.designTexture = texture;

      // Apply to all selected locations
      if (window.CustomizerState) {
        window.CustomizerState.selectedLocations.forEach(loc => {
          applyDecal(loc.location);
        });
      }
    });
  }

  function applyDecal(location) {
    if (!State.designTexture || !State.shirtMesh) {
      console.warn('[CustomUpload3D] Cannot apply decal - missing texture or mesh');
      return;
    }

    const locationConfig = Config.locations[location];
    if (!locationConfig) return;

    // Remove existing decal for this location
    if (State.decals[location]) {
      State.scene.remove(State.decals[location]);
      State.decals[location].geometry.dispose();
      State.decals[location].material.dispose();
    }

    // Get position/scale from state if available
    let pos = locationConfig.position;
    let scale = locationConfig.scale;
    
    if (window.CustomizerState) {
      const locData = window.CustomizerState.selectedLocations.find(l => l.location === location);
      if (locData) {
        const xOffset = (locData.x || 0) * 0.001;
        const yOffset = (locData.y || 0) * 0.001;
        
        pos = {
          x: locationConfig.position.x + xOffset,
          y: locationConfig.position.y + yOffset,
          z: locationConfig.position.z
        };
        
        const widthInch = locData.width || 8;
        const heightInch = locData.height || 10;
        
        scale = {
          x: widthInch * Config.inchToUnit,
          y: heightInch * Config.inchToUnit
        };
      }
    }

    // Create decal geometry
    const position = new THREE.Vector3(pos.x, pos.y, pos.z);
    const orientation = new THREE.Euler(
      locationConfig.rotation.x,
      locationConfig.rotation.y,
      locationConfig.rotation.z
    );
    const size = new THREE.Vector3(scale.x, scale.y, 0.1);

    const decalGeometry = new THREE.DecalGeometry(
      State.shirtMesh,
      position,
      orientation,
      size
    );

    // Create material
    const decalMaterial = new THREE.MeshStandardMaterial({
      map: State.designTexture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4
    });

    // Create mesh
    const decal = new THREE.Mesh(decalGeometry, decalMaterial);
    State.scene.add(decal);
    State.decals[location] = decal;

    console.log('[CustomUpload3D] Decal applied to:', location);

    // Also apply to mini scene
    applyDecalToMiniScene(location);
  }

  function applyDecalToMiniScene(location) {
    const miniScene = State.miniScenes[location];
    const miniModel = State.miniModels[location];
    
    if (!miniScene || !miniModel || !State.designTexture) return;

    // Find shirt mesh in mini model
    let miniShirtMesh = null;
    miniModel.traverse((child) => {
      if (child.isMesh) {
        miniShirtMesh = child;
      }
    });

    if (!miniShirtMesh) return;

    const locationConfig = Config.locations[location];
    const position = new THREE.Vector3(
      locationConfig.position.x,
      locationConfig.position.y,
      locationConfig.position.z
    );
    const orientation = new THREE.Euler(
      locationConfig.rotation.x,
      locationConfig.rotation.y,
      locationConfig.rotation.z
    );
    const size = new THREE.Vector3(
      locationConfig.scale.x,
      locationConfig.scale.y,
      0.1
    );

    const decalGeometry = new THREE.DecalGeometry(
      miniShirtMesh,
      position,
      orientation,
      size
    );

    const decalMaterial = new THREE.MeshStandardMaterial({
      map: State.designTexture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4
    });

    const decal = new THREE.Mesh(decalGeometry, decalMaterial);
    miniScene.add(decal);
  }

  function clearDesign() {
    // Remove all decals
    Object.keys(State.decals).forEach(location => {
      const decal = State.decals[location];
      if (decal) {
        State.scene.remove(decal);
        decal.geometry.dispose();
        decal.material.dispose();
      }
    });
    State.decals = {};
    State.designTexture = null;
  }

  // ============================================================
  // LOCATION FOCUS
  // ============================================================
  function focusLocation(location) {
    const locationConfig = Config.locations[location];
    if (!locationConfig || !State.controls) return;

    const angle = locationConfig.cameraAngle;
    const targetPos = new THREE.Vector3(
      Math.sin(angle) * 3,
      0.2,
      Math.cos(angle) * 3
    );

    // Animate camera (simple approach)
    animateCameraTo(targetPos);

    // Update coordinates display
    updateCoordinatesDisplay(location);
  }

  function animateCameraTo(targetPos) {
    const startPos = State.camera.position.clone();
    const duration = 500;
    const startTime = Date.now();

    function animateCamera() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      State.camera.position.lerpVectors(startPos, targetPos, eased);
      State.camera.lookAt(0, 0, 0);
      State.controls.update();

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      }
    }
    animateCamera();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function updateCoordinatesDisplay(location) {
    const locData = window.CustomizerState?.selectedLocations?.find(l => l.location === location);
    if (!locData) return;

    const xEl = document.getElementById('cu-coord-x');
    const yEl = document.getElementById('cu-coord-y');
    const zEl = document.getElementById('cu-coord-z');

    if (xEl) xEl.textContent = (locData.x || 0).toFixed(2);
    if (yEl) yEl.textContent = (locData.y || 0).toFixed(2);
    if (zEl) zEl.textContent = (locData.z || 0).toFixed(2);
  }

  // ============================================================
  // T-SHIRT COLOR
  // ============================================================
  function changeShirtColor(color) {
    if (!State.shirtMesh) return;

    const hexColor = typeof color === 'string' ? parseInt(color.replace('#', '0x')) : color;
    
    if (State.shirtMesh.material) {
      State.shirtMesh.material.color.setHex(hexColor);
    }

    // Also update mini models
    Object.values(State.miniModels).forEach(model => {
      model.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.color.setHex(hexColor);
        }
      });
    });

    // Update state
    if (window.CustomizerState) {
      window.CustomizerState.tshirtColor = color;
    }
  }

  // ============================================================
  // POSITION/SIZE SLIDERS
  // ============================================================
  function initSliders() {
    // Position X
    const posXSlider = document.getElementById('cu-pos-x');
    if (posXSlider) {
      posXSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const valEl = document.getElementById('cu-pos-x-val');
        if (valEl) valEl.textContent = value;
        updateActiveLocationPosition('x', value);
      });
    }

    // Position Y
    const posYSlider = document.getElementById('cu-pos-y');
    if (posYSlider) {
      posYSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const valEl = document.getElementById('cu-pos-y-val');
        if (valEl) valEl.textContent = value;
        updateActiveLocationPosition('y', value);
      });
    }

    // Width
    const widthSlider = document.getElementById('cu-width');
    if (widthSlider) {
      widthSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        const valEl = document.getElementById('cu-width-val');
        if (valEl) valEl.textContent = value + '"';
        updateActiveLocationSize('width', value);
      });
    }

    // Height
    const heightSlider = document.getElementById('cu-height');
    if (heightSlider) {
      heightSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        const valEl = document.getElementById('cu-height-val');
        if (valEl) valEl.textContent = value + '"';
        updateActiveLocationSize('height', value);
      });
    }
  }

  function updateActiveLocationPosition(axis, value) {
    if (!window.CustomizerState?.activeLocation) return;

    const locData = window.CustomizerState.selectedLocations.find(
      l => l.location === window.CustomizerState.activeLocation
    );
    
    if (locData) {
      locData[axis] = value;
      applyDecal(locData.location);
      updateCoordinatesDisplay(locData.location);
    }
  }

  function updateActiveLocationSize(dimension, value) {
    if (!window.CustomizerState?.activeLocation) return;

    const locData = window.CustomizerState.selectedLocations.find(
      l => l.location === window.CustomizerState.activeLocation
    );
    
    if (locData) {
      locData[dimension] = value;
      applyDecal(locData.location);
    }
  }

  // ============================================================
  // POSITION ITEM CLICKS
  // ============================================================
  function initPositionItemClicks() {
    document.querySelectorAll('.cu-position-item').forEach(item => {
      item.addEventListener('click', () => {
        const location = item.dataset.position;
        
        if (window.CustomUploadMain) {
          // Check if already selected
          const isSelected = window.CustomizerState?.selectedLocations?.find(l => l.location === location);
          
          if (!isSelected) {
            // Add location
            window.CustomUploadMain.addLocation(location);
          } else {
            // Set as active
            window.CustomUploadMain.setActiveLocation(location);
          }
        }
      });
    });
  }

  // ============================================================
  // ANIMATION LOOP
  // ============================================================
  function animate() {
    State.animationFrameId = requestAnimationFrame(animate);

    // Update controls
    if (State.controls) {
      State.controls.update();
    }

    // Render main scene
    if (State.renderer && State.scene && State.camera) {
      State.renderer.render(State.scene, State.camera);
    }

    // Render mini scenes
    Object.keys(State.miniScenes).forEach(location => {
      const scene = State.miniScenes[location];
      const camera = State.miniCameras[location];
      const renderer = State.miniRenderers[location];
      
      if (scene && camera && renderer) {
        // Slowly rotate mini models
        if (State.miniModels[location]) {
          State.miniModels[location].rotation.y += 0.005;
        }
        renderer.render(scene, camera);
      }
    });
  }

  // ============================================================
  // CLEANUP
  // ============================================================
  function dispose() {
    if (State.animationFrameId) {
      cancelAnimationFrame(State.animationFrameId);
    }

    // Dispose main scene
    if (State.renderer) {
      State.renderer.dispose();
    }
    if (State.controls) {
      State.controls.dispose();
    }

    // Dispose mini scenes
    Object.values(State.miniRenderers).forEach(renderer => renderer.dispose());

    // Clear state
    State.initialized = false;
    State.scene = null;
    State.camera = null;
    State.renderer = null;
    State.controls = null;
    State.model = null;
  }

  // ============================================================
  // EXPORTS
  // ============================================================
  window.CustomUpload3D = {
    init,
    updateDesign,
    clearDesign,
    focusLocation,
    changeShirtColor,
    reload: () => {
      dispose();
      init();
    },
    getState: () => State
  };

})();
