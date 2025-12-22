/**
 * Upload Lift Pro - 3D T-Shirt Preview
 * Lazy-loaded Three.js renderer for T-Shirt preview modal
 * 
 * @version 2.0.0
 */

(function() {
  'use strict';

  // Store instances
  const instances = new Map();
  let threeLoaded = false;

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════

  window.ULTshirt3D = {
    init: initPreview,
    updateTexture: updateTexture,
    setPosition: setPosition,
    destroy: destroyPreview,
  };

  // ══════════════════════════════════════════════════════════════
  // LOAD THREE.JS DYNAMICALLY
  // ══════════════════════════════════════════════════════════════

  async function loadThree() {
    if (threeLoaded) return;

    return new Promise((resolve, reject) => {
      // Load Three.js
      const threeScript = document.createElement('script');
      threeScript.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
      threeScript.onload = () => {
        // Load GLTFLoader
        const loaderScript = document.createElement('script');
        loaderScript.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/loaders/GLTFLoader.js';
        loaderScript.onload = () => {
          // Load OrbitControls
          const controlsScript = document.createElement('script');
          controlsScript.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js';
          controlsScript.onload = () => {
            // Load DecalGeometry
            const decalScript = document.createElement('script');
            decalScript.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/geometries/DecalGeometry.js';
            decalScript.onload = () => {
              threeLoaded = true;
              resolve();
            };
            decalScript.onerror = reject;
            document.head.appendChild(decalScript);
          };
          controlsScript.onerror = reject;
          document.head.appendChild(controlsScript);
        };
        loaderScript.onerror = reject;
        document.head.appendChild(loaderScript);
      };
      threeScript.onerror = reject;
      document.head.appendChild(threeScript);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // INITIALIZE 3D PREVIEW
  // ══════════════════════════════════════════════════════════════

  async function initPreview(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('[3D Preview] Container not found:', containerId);
      return null;
    }

    // Show loading
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b7280;">Loading 3D Model...</div>';

    try {
      // Load Three.js if not already loaded
      await loadThree();

      // Clear container
      container.innerHTML = '';

      const width = container.clientWidth || 400;
      const height = container.clientHeight || 350;

      // Create scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf5f7fa);

      // Create camera
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(0, 0, 3);

      // Create renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);

      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 5, 5);
      directionalLight.castShadow = true;
      scene.add(directionalLight);

      // Add controls
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.enablePan = false;
      controls.minDistance = 1.5;
      controls.maxDistance = 5;

      // Instance data
      const instance = {
        container,
        scene,
        camera,
        renderer,
        controls,
        model: null,
        decal: null,
        decalMaterial: null,
        textureUrl: null,
        position: { x: 0, y: 0, z: 0.15 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: 1,
        animationId: null,
      };

      // Animation loop
      function animate() {
        instance.animationId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      // Load T-shirt model
      await loadModel(instance, options.modelUrl);

      // Store instance
      instances.set(containerId, instance);

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      resizeObserver.observe(container);
      instance.resizeObserver = resizeObserver;

      console.log('[3D Preview] Initialized:', containerId);
      return instance;

    } catch (error) {
      console.error('[3D Preview] Init failed:', error);
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ef4444;">Failed to load 3D preview</div>';
      return null;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // LOAD 3D MODEL
  // ══════════════════════════════════════════════════════════════

  async function loadModel(instance, modelUrl) {
    const loader = new THREE.GLTFLoader();
    
    // Default model URL (baked t-shirt)
    const url = modelUrl || 'https://customizerapp.dev/shirt_baked.glb';

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          
          // Center and scale model
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 2 / maxDim;
          model.scale.setScalar(scale);
          
          model.position.x = -center.x * scale;
          model.position.y = -center.y * scale;
          model.position.z = -center.z * scale;

          // Enable shadows
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          instance.scene.add(model);
          instance.model = model;

          console.log('[3D Preview] Model loaded');
          resolve(model);
        },
        undefined,
        (error) => {
          console.error('[3D Preview] Model load error:', error);
          reject(error);
        }
      );
    });
  }

  // ══════════════════════════════════════════════════════════════
  // UPDATE TEXTURE (DECAL)
  // ══════════════════════════════════════════════════════════════

  function updateTexture(containerId, imageUrl) {
    const instance = instances.get(containerId);
    if (!instance || !instance.model) {
      console.warn('[3D Preview] Instance not ready');
      return;
    }

    instance.textureUrl = imageUrl;

    // Load texture
    const textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = 'anonymous';
    
    textureLoader.load(imageUrl, (texture) => {
      // Remove old decal
      if (instance.decal) {
        instance.scene.remove(instance.decal);
        instance.decal.geometry.dispose();
        instance.decal = null;
      }

      // Find mesh to apply decal
      let targetMesh = null;
      instance.model.traverse((child) => {
        if (child.isMesh && !targetMesh) {
          targetMesh = child;
        }
      });

      if (!targetMesh) {
        console.warn('[3D Preview] No mesh found for decal');
        return;
      }

      // Create decal material
      instance.decalMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });

      // Create decal
      applyDecal(instance, targetMesh);
      
      console.log('[3D Preview] Texture applied');
    });
  }

  function applyDecal(instance, targetMesh) {
    if (!instance.decalMaterial) return;

    // Remove old decal
    if (instance.decal) {
      instance.scene.remove(instance.decal);
      instance.decal.geometry.dispose();
    }

    // Decal position and orientation
    const position = new THREE.Vector3(
      instance.position.x,
      instance.position.y,
      instance.position.z
    );
    
    const orientation = new THREE.Euler(
      instance.rotation.x,
      instance.rotation.y,
      instance.rotation.z
    );
    
    const size = new THREE.Vector3(
      0.5 * instance.scale,
      0.5 * instance.scale,
      0.5
    );

    // Create decal geometry
    const decalGeometry = new THREE.DecalGeometry(
      targetMesh,
      position,
      orientation,
      size
    );

    instance.decal = new THREE.Mesh(decalGeometry, instance.decalMaterial);
    instance.scene.add(instance.decal);
  }

  // ══════════════════════════════════════════════════════════════
  // SET POSITION
  // ══════════════════════════════════════════════════════════════

  function setPosition(containerId, position, location = 'front') {
    const instance = instances.get(containerId);
    if (!instance) return;

    // Position offsets for different locations
    const locationOffsets = {
      front: { x: 0, y: 0, z: 0.15, rx: 0, ry: 0 },
      back: { x: 0, y: 0, z: -0.15, rx: 0, ry: Math.PI },
      left_sleeve: { x: -0.4, y: 0.2, z: 0, rx: 0, ry: -Math.PI / 2 },
      right_sleeve: { x: 0.4, y: 0.2, z: 0, rx: 0, ry: Math.PI / 2 },
    };

    const offset = locationOffsets[location] || locationOffsets.front;

    instance.position.x = offset.x + (position.x || 0) * 0.3;
    instance.position.y = offset.y + (position.y || 0) * 0.3;
    instance.position.z = offset.z;
    instance.rotation.y = offset.ry;
    instance.scale = position.scale || 1;

    // Rotate camera to view location
    if (location === 'back') {
      instance.camera.position.set(0, 0, -3);
    } else if (location === 'left_sleeve') {
      instance.camera.position.set(-3, 0, 0);
    } else if (location === 'right_sleeve') {
      instance.camera.position.set(3, 0, 0);
    } else {
      instance.camera.position.set(0, 0, 3);
    }
    instance.camera.lookAt(0, 0, 0);

    // Re-apply decal if texture exists
    if (instance.textureUrl && instance.model) {
      let targetMesh = null;
      instance.model.traverse((child) => {
        if (child.isMesh && !targetMesh) {
          targetMesh = child;
        }
      });
      if (targetMesh) {
        applyDecal(instance, targetMesh);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // DESTROY
  // ══════════════════════════════════════════════════════════════

  function destroyPreview(containerId) {
    const instance = instances.get(containerId);
    if (!instance) return;

    // Stop animation
    if (instance.animationId) {
      cancelAnimationFrame(instance.animationId);
    }

    // Stop resize observer
    if (instance.resizeObserver) {
      instance.resizeObserver.disconnect();
    }

    // Dispose Three.js objects
    if (instance.renderer) {
      instance.renderer.dispose();
    }

    if (instance.decal) {
      instance.decal.geometry.dispose();
    }

    if (instance.decalMaterial) {
      instance.decalMaterial.dispose();
    }

    // Clear container
    if (instance.container) {
      instance.container.innerHTML = '';
    }

    instances.delete(containerId);
    console.log('[3D Preview] Destroyed:', containerId);
  }

})();
