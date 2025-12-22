# 🎯 UL DTF Transfer + T-Shirt Modal - Derin Mimari Tasarım

> **Version:** 1.0.0  
> **Last Updated:** December 22, 2025  
> **Status:** Design Complete - Ready for Implementation

---

## 📍 GENEL BAKIŞ

```
┌─────────────────────────────────────────────────────────────┐
│                    STOREFRONT PRODUCT PAGE                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              UL DTF TRANSFER BLOCK                  │   │
│   │         ({% render 'dtf-uploader' %})               │   │
│   │                                                     │   │
│   │  ┌─────────────────────────────────────────────┐   │   │
│   │  │         DTF UPLOADER SNIPPET                │   │   │
│   │  │  - Upload Area                              │   │   │
│   │  │  - Size (Shopify Variants)                  │   │   │
│   │  │  - Quantity                                 │   │   │
│   │  │  - Extra Questions                          │   │   │
│   │  │  - [Customize on T-Shirt] Button            │   │   │
│   │  │  - [Add to Cart] Button                     │   │   │
│   │  └─────────────────────────────────────────────┘   │   │
│   │                                                     │   │
│   │         ({% render 'tshirt-modal' %})               │   │
│   │  ┌─────────────────────────────────────────────┐   │   │
│   │  │         T-SHIRT MODAL (Hidden)              │   │   │
│   │  │  - Step 1: Upload                           │   │   │
│   │  │  - Step 2: 3D Preview + Options             │   │   │
│   │  │  - Step 3: Extra Questions                  │   │   │
│   │  │  - Step 4: Review                           │   │   │
│   │  └─────────────────────────────────────────────┘   │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# FAZ 1: DTF UPLOADER SNIPPET

## 1.1 Veri Kaynakları

```
MERCHANT CONFIG (API'den gelir):
├── shopId: string
├── productId: string
├── tshirtEnabled: boolean (T-Shirt butonu göster/gizle)
├── allowedFileTypes: ["png", "jpg", "svg", "pdf", "ai", "eps"]
├── maxFileSizeMB: 50
├── minDPI: 150
├── extraQuestions: [
│   ├── { id, type, label, required, options }
│   └── ...
│   ]
├── sizeVariants: Shopify'dan çekilir (product.variants)
└── basePricing: { perLocation, perSquareInch, rush, etc. }

SHOPIFY PRODUCT DATA:
├── product.id
├── product.title
├── product.variants[] (boyutlar: 4x6, 8x10, 11x14, etc.)
├── variant.price
├── variant.inventory_quantity
└── variant.available
```

## 1.2 DTF Uploader UI Bileşenleri

### 1.2.1 Upload Area

```
┌─────────────────────────────────────────────────────────────┐
│                      UPLOAD AREA                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│         ┌───────────────────────────────────────┐           │
│         │                                       │           │
│         │       ☁️ Drag & Drop                  │           │
│         │                                       │           │
│         │    or click to browse                 │           │
│         │                                       │           │
│         │    PNG, JPG, SVG, PDF, AI, EPS        │           │
│         │    Max 50MB • Min 150 DPI             │           │
│         │                                       │           │
│         └───────────────────────────────────────┘           │
│                                                             │
│  STATES:                                                    │
│  ├── EMPTY: Drag & drop placeholder                         │
│  ├── DRAGOVER: Border dashed, highlight                     │
│  ├── UPLOADING: Progress bar (0-100%)                       │
│  ├── PROCESSING: Spinner "Analyzing file..."                │
│  ├── SUCCESS: Thumbnail + file info                         │
│  └── ERROR: Red border + error message                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2.2 Upload Success State

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────┐  design-final.png                      [✕ Remove] │
│  │ 🖼️   │  2400 x 3200 px • 300 DPI • 2.4 MB               │
│  │thumb │  ✅ High quality - Ready for print               │
│  └──────┘                                                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2.3 Size Selection (Shopify Variants)

```
┌─────────────────────────────────────────────────────────────┐
│  SIZE *                                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    4x6      │  │    6x8      │  │    8x10     │         │
│  │   $12.99    │  │   $18.99    │  │   $24.99    │         │
│  │  ○ Select   │  │  ● Selected │  │  ○ Select   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   11x14     │  │   12x16     │  │   16x20     │         │
│  │   $34.99    │  │   $44.99    │  │   $59.99    │         │
│  │  ○ Select   │  │  ○ Select   │  │  ⊘ Sold Out │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  💡 Tip: Choose a size close to your design dimensions     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2.4 Quantity

```
┌─────────────────────────────────────────────────────────────┐
│  QUANTITY *                                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     [ - ]     10      [ + ]                                 │
│                                                             │
│  💰 Bulk discount: 10+ sheets = 10% off                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2.5 Extra Questions (Merchant Tanımlı)

```
SORU TİPLERİ:
├── text: Tek satır input
├── textarea: Çok satır input  
├── select: Dropdown
├── radio: Tek seçim
├── checkbox: Çoklu seçim
├── number: Sayı input
├── date: Tarih seçici
└── file: Ek dosya yükleme

ÖRNEK SORULAR:
┌─────────────────────────────────────────────────────────────┐
│  EXTRA OPTIONS                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Finish Type *                                              │
│  ┌──────────────────────────────────────┐                  │
│  │ ▼ Matte                              │                  │
│  └──────────────────────────────────────┘                  │
│  Options: Matte / Glossy / Soft-touch                      │
│                                                             │
│  Special Instructions                                       │
│  ┌──────────────────────────────────────┐                  │
│  │ Please mirror the design for...      │                  │
│  └──────────────────────────────────────┘                  │
│                                                             │
│  Rush Order? (+$10)                                        │
│  ☐ Yes, I need this ASAP                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2.6 Action Buttons

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  👕 CUSTOMIZE ON T-SHIRT                            │   │  ← Sadece tshirtEnabled=true ise görünür
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🛒 ADD TO CART • $18.99                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  BUTTON STATES:                                             │
│  ├── DISABLED: Gri, tıklanamaz (validation fail)           │
│  ├── ENABLED: Primary color, tıklanabilir                  │
│  ├── LOADING: Spinner + "Adding..."                        │
│  └── SUCCESS: "✓ Added!" → Reset after 2s                  │
│                                                             │
│  VALIDATION (Add to Cart aktif olması için):               │
│  ├── ✓ Dosya yüklendi                                      │
│  ├── ✓ Boyut seçildi                                       │
│  ├── ✓ Miktar > 0                                          │
│  └── ✓ Required sorular cevaplandı                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 1.3 DTF Upload Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    UPLOAD FLOW                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. USER SELECTS FILE                                       │
│     │                                                       │
│     ▼                                                       │
│  2. CLIENT-SIDE VALIDATION                                  │
│     ├── File type check                                     │
│     ├── File size check (< maxFileSizeMB)                  │
│     └── Basic format validation                             │
│     │                                                       │
│     ▼ (Fail? → Show error, stop)                           │
│                                                             │
│  3. REQUEST UPLOAD INTENT                                   │
│     POST /api/upload/intent                                 │
│     Body: { fileName, fileSize, mimeType, productId }      │
│     Response: { uploadId, signedUrl, fields }              │
│     │                                                       │
│     ▼                                                       │
│                                                             │
│  4. DIRECT UPLOAD TO R2/S3                                  │
│     PUT signedUrl (with fields)                            │
│     Show progress bar (XMLHttpRequest.upload.onprogress)   │
│     │                                                       │
│     ▼                                                       │
│                                                             │
│  5. COMPLETE UPLOAD                                         │
│     POST /api/upload/complete                              │
│     Body: { uploadId }                                     │
│     │                                                       │
│     ▼                                                       │
│                                                             │
│  6. PREFLIGHT WORKER TRIGGERS (Async)                       │
│     ├── Validate file integrity                            │
│     ├── Extract metadata (dimensions, DPI, color mode)     │
│     ├── Generate thumbnail                                 │
│     ├── Check print readiness                              │
│     └── Update upload status                               │
│     │                                                       │
│     ▼                                                       │
│                                                             │
│  7. POLL STATUS                                             │
│     GET /api/upload/status/{uploadId}                      │
│     Every 1s until status = READY | FAILED                 │
│     │                                                       │
│     ▼                                                       │
│                                                             │
│  8. SHOW RESULT                                             │
│     ├── SUCCESS: Thumbnail + metadata + quality badge      │
│     └── ERROR: Error message + retry option                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 1.4 State Management (DTF Uploader)

```javascript
// dtf-uploader.js state
const dtfState = {
  // Upload State
  upload: {
    status: 'idle' | 'uploading' | 'processing' | 'ready' | 'error',
    progress: 0,
    uploadId: null,
    file: {
      name: '',
      size: 0,
      type: ''
    },
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
  
  // Form State
  form: {
    selectedVariantId: null,
    quantity: 1,
    extraAnswers: {}, // { questionId: answer }
    isValid: false
  },
  
  // Config (API'den)
  config: {
    tshirtEnabled: false,
    allowedFileTypes: [],
    maxFileSizeMB: 50,
    minDPI: 150,
    extraQuestions: []
  }
};
```

---

# FAZ 2: T-SHIRT MODAL OVERLAY

## 2.0 Modal Genel Yapısı

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UL T-SHIRT DESIGNER                                           [✕]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ STEP 1      STEP 2        STEP 3        STEP 4                 │    │
│  │ Upload  ──▶ Design    ──▶ Details   ──▶ Review                 │    │
│  │   ●           ○             ○             ○                    │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                │    │
│  │                     STEP CONTENT AREA                          │    │
│  │                   (değişken içerik)                            │    │
│  │                                                                │    │
│  │                                                                │    │
│  │                                                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    NAVIGATION FOOTER                           │    │
│  │  [← Back]                                      [Next Step →]   │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

MODAL PROPERTIES:
├── Width: 90vw (max 1200px)
├── Height: 90vh
├── Overlay: rgba(0,0,0,0.7)
├── Animation: Fade-in + scale
├── Close: X button, ESC key, overlay click
└── Z-index: 9999
```

## 2.1 STEP 1: Upload

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         STEP 1: UPLOAD                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Choose how to add your design:                                         │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                │    │
│  │  OPTION A: USE DESIGN FROM DTF                                 │    │
│  │                                                                │    │
│  │  ┌──────┐  design-final.png                                   │    │
│  │  │ 🖼️   │  2400 x 3200 px • 300 DPI                          │    │
│  │  │thumb │  ✅ Already uploaded                                │    │
│  │  └──────┘                                                     │    │
│  │                                                                │    │
│  │  ┌───────────────────────────────────────────────────────┐   │    │
│  │  │  ✓ USE THIS DESIGN                                     │   │    │
│  │  └───────────────────────────────────────────────────────┘   │    │
│  │                                                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ─────────────────────── OR ───────────────────────                    │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                                                                │    │
│  │  OPTION B: UPLOAD NEW DESIGN                                   │    │
│  │                                                                │    │
│  │         ┌───────────────────────────────────────┐             │    │
│  │         │       ☁️ Drag & Drop                  │             │    │
│  │         │    or click to browse                 │             │    │
│  │         │    PNG, JPG, SVG • Max 50MB           │             │    │
│  │         └───────────────────────────────────────┘             │    │
│  │                                                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ⚠️ DTF transfer'dan modal açıldıysa Option A gösterilir,              │
│     boş modal açıldıysa sadece Option B gösterilir.                    │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                              [Next: Design →]           │
└─────────────────────────────────────────────────────────────────────────┘

STEP 1 VALIDATION:
├── En az bir tasarım seçilmeli/yüklenmeli
└── Next butonu disabled until valid
```

## 2.2 STEP 2: 3D Preview + Options (CORE FEATURE)

### 2.2.1 Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      STEP 2: DESIGN YOUR T-SHIRT                        │
├──────────────────────────────────────────┬──────────────────────────────┤
│                                          │                              │
│           3D PREVIEW AREA                │      OPTIONS PANEL           │
│              (65%)                       │         (35%)                │
│                                          │                              │
│   ┌──────────────────────────────────┐  │  ┌────────────────────────┐  │
│   │                                  │  │  │    T-SHIRT OPTIONS     │  │
│   │                                  │  │  ├────────────────────────┤  │
│   │                                  │  │  │                        │  │
│   │         THREE.JS CANVAS          │  │  │  COLOR                 │  │
│   │                                  │  │  │  ○ ⚪ ○ ⚫ ○ 🔴 ○ 🔵   │  │
│   │         (OrbitControls)          │  │  │  ○ 🟢 ○ 🟡 ○ 🟣 ○ 🟠   │  │
│   │                                  │  │  │                        │  │
│   │      👆 Drag to rotate           │  │  │  SIZE                  │  │
│   │      🔍 Scroll to zoom           │  │  │  ┌──────────────────┐  │  │
│   │                                  │  │  │  │ ▼ Large          │  │  │
│   │                                  │  │  │  └──────────────────┘  │  │
│   │                                  │  │  │                        │  │
│   └──────────────────────────────────┘  │  │  PRINT LOCATIONS       │  │
│                                          │  │  ☑ Front      +$0     │  │
│   ┌──────────────────────────────────┐  │  │  ☐ Back       +$5     │  │
│   │ Quick Views:                     │  │  │  ☐ Left Sleeve +$3   │  │
│   │ [Front] [Back] [Left] [Right]    │  │  │  ☐ Right Sleeve +$3  │  │
│   └──────────────────────────────────┘  │  │                        │  │
│                                          │  │  ────────────────────  │  │
│                                          │  │                        │  │
│                                          │  │  LOCATION SETTINGS     │  │
│                                          │  │  (for: FRONT)          │  │
│                                          │  │                        │  │
│                                          │  │  Scale: [────●───] 80% │  │
│                                          │  │                        │  │
│                                          │  │  Position              │  │
│                                          │  │  X: [───●────] 0       │  │
│                                          │  │  Y: [────●───] 0       │  │
│                                          │  │                        │  │
│                                          │  │  ────────────────────  │  │
│                                          │  │                        │  │
│                                          │  │  SUBTOTAL: $24.99      │  │
│                                          │  │  (1 location selected) │  │
│                                          │  └────────────────────────┘  │
│                                          │                              │
├──────────────────────────────────────────┴──────────────────────────────┤
│  [← Back]                                            [Next: Details →]  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2.2 3D Preview - Teknik Detaylar

```
THREE.JS SCENE SETUP:
├── Renderer: WebGLRenderer (antialias: true, alpha: true)
├── Camera: PerspectiveCamera (FOV: 45, near: 0.1, far: 1000)
├── Controls: OrbitControls
│   ├── enableDamping: true
│   ├── dampingFactor: 0.05
│   ├── minDistance: 2
│   ├── maxDistance: 10
│   ├── enablePan: false
│   └── autoRotate: false
├── Lighting:
│   ├── AmbientLight (0xffffff, 0.6)
│   ├── DirectionalLight (0xffffff, 0.8) @ position(5, 5, 5)
│   └── DirectionalLight (0xffffff, 0.3) @ position(-5, 5, -5)
└── Model: GLTF T-Shirt with UV mapping

T-SHIRT MODEL:
├── File: /assets/models/tshirt.glb (optimized, ~500KB)
├── Meshes:
│   ├── body: Ana gövde
│   ├── front_print_area: Ön baskı alanı (UV mapped)
│   ├── back_print_area: Arka baskı alanı (UV mapped)
│   ├── left_sleeve_print: Sol kol baskı alanı
│   └── right_sleeve_print: Sağ kol baskı alanı
└── Materials:
    ├── tshirt_material: MeshStandardMaterial
    │   ├── color: Seçilen renk
    │   └── roughness: 0.8
    └── print_material: MeshBasicMaterial
        ├── map: Design texture
        ├── transparent: true
        └── opacity: 1.0

DESIGN TEXTURE APPLICATION:
├── Load design image as THREE.Texture
├── Configure texture:
│   ├── wrapS: ClampToEdgeWrapping
│   ├── wrapT: ClampToEdgeWrapping
│   ├── minFilter: LinearFilter
│   └── magFilter: LinearFilter
├── Apply scale transform:
│   └── texture.repeat.set(scale, scale)
├── Apply position transform:
│   └── texture.offset.set(offsetX, offsetY)
└── Assign to print_area mesh
```

### 2.2.3 Location Settings - Her Lokasyon İçin

```
LOCATION DATA STRUCTURE:
{
  locationId: 'front' | 'back' | 'left_sleeve' | 'right_sleeve',
  enabled: boolean,
  settings: {
    scale: 0.1 - 2.0 (default: 1.0),
    positionX: -1.0 - 1.0 (default: 0),
    positionY: -1.0 - 1.0 (default: 0)
  },
  pricing: {
    base: 0 | 5 | 3 | 3,  // İlk lokasyon ücretsiz
    calculated: number
  }
}

SLIDER CONTROLS:
├── Scale Slider:
│   ├── Min: 10% (0.1)
│   ├── Max: 200% (2.0)
│   ├── Step: 5%
│   ├── Default: 100% (1.0)
│   └── Live preview update
├── Position X Slider:
│   ├── Min: -100 (sol)
│   ├── Max: +100 (sağ)
│   ├── Step: 1
│   ├── Default: 0 (merkez)
│   └── Live preview update
└── Position Y Slider:
    ├── Min: -100 (aşağı)
    ├── Max: +100 (yukarı)
    ├── Step: 1
    ├── Default: 0 (merkez)
    └── Live preview update

UI BEHAVIOR:
├── Lokasyon checkbox tıklandığında:
│   ├── enabled = !enabled
│   ├── 3D'de texture göster/gizle
│   └── Fiyat güncelle
├── Location Settings sadece seçili lokasyon için:
│   ├── Multi-select durumunda tab/dropdown ile seç
│   └── Seçili lokasyona kamera otomatik döner
└── Quick View buttons:
    ├── Front: Camera → (0, 0, 5)
    ├── Back: Camera → (0, 0, -5)
    ├── Left: Camera → (-5, 0, 0)
    └── Right: Camera → (5, 0, 0)
```

### 2.2.4 Dynamic Pricing

```
PRICING CALCULATION:
├── Base T-Shirt Price: $19.99 (variant'tan gelir)
├── Location Pricing:
│   ├── First location: +$0 (included)
│   ├── Back: +$5
│   ├── Left Sleeve: +$3
│   └── Right Sleeve: +$3
├── Size Modifier:
│   ├── XS-M: +$0
│   ├── L-XL: +$2
│   └── 2XL+: +$5
└── Total = Base + Locations + Size

LIVE PRICE UPDATE:
├── Her checkbox change'de
├── Her size change'de
└── Subtotal anlık gösterilir

PRICING DISPLAY:
┌────────────────────────────────┐
│  PRICE BREAKDOWN               │
├────────────────────────────────┤
│  T-Shirt (Large):     $21.99   │
│  Front Print:          $0.00   │
│  Back Print:           $5.00   │
│  ──────────────────────────    │
│  SUBTOTAL:            $26.99   │
└────────────────────────────────┘
```

## 2.3 STEP 3: Extra Questions (T-Shirt Specific)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      STEP 3: ADDITIONAL DETAILS                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  PREVIEW SUMMARY                                               │    │
│  │  ┌──────┐  ┌──────┐                                           │    │
│  │  │Front │  │Back  │  White T-Shirt, Large                     │    │
│  │  │ 🖼️  │  │ 🖼️  │  Locations: Front, Back                   │    │
│  │  └──────┘  └──────┘  Subtotal: $26.99                         │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  T-SHIRT OPTIONS                                               │    │
│  ├────────────────────────────────────────────────────────────────┤    │
│  │                                                                │    │
│  │  Print Method *                                                │    │
│  │  ○ DTF Transfer (Recommended for detailed designs)            │    │
│  │  ○ Screen Print (Best for simple, bulk orders)                │    │
│  │  ○ Vinyl (Great for names and numbers)                        │    │
│  │                                                                │    │
│  │  Quantity *                                                    │    │
│  │     [ - ]     1      [ + ]                                    │    │
│  │                                                                │    │
│  │  Gift Wrapping? (+$3)                                         │    │
│  │  ☐ Yes, wrap this item                                        │    │
│  │                                                                │    │
│  │  Special Instructions                                          │    │
│  │  ┌────────────────────────────────────────────────────────┐   │    │
│  │  │ Please make sure colors are vibrant...                 │   │    │
│  │  └────────────────────────────────────────────────────────┘   │    │
│  │                                                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ℹ️ These questions are configured by the merchant for T-Shirt orders  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  [← Back]                                          [Next: Review →]     │
└─────────────────────────────────────────────────────────────────────────┘

NOT: Extra questions merchant tarafından T-Shirt ürünü için ayrı tanımlanır.
DTF için ayrı, T-Shirt için ayrı soru setleri olabilir.
```

## 2.4 STEP 4: Review & Actions

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      STEP 4: REVIEW YOUR ORDER                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      ORDER PREVIEW                              │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                 │   │
│  │  ┌────────────────────────────────────────────────────────┐    │   │
│  │  │                                                        │    │   │
│  │  │    ┌──────────┐      ┌──────────┐                     │    │   │
│  │  │    │  FRONT   │      │   BACK   │                     │    │   │
│  │  │    │   🖼️    │      │   🖼️    │                     │    │   │
│  │  │    │ preview  │      │ preview  │                     │    │   │
│  │  │    └──────────┘      └──────────┘                     │    │   │
│  │  │                                                        │    │   │
│  │  │    T-Shirt Details:                                   │    │   │
│  │  │    • Color: White                                     │    │   │
│  │  │    • Size: Large                                      │    │   │
│  │  │    • Quantity: 1                                      │    │   │
│  │  │    • Print Locations: Front, Back                     │    │   │
│  │  │    • Print Method: DTF Transfer                       │    │   │
│  │  │                                                        │    │   │
│  │  └────────────────────────────────────────────────────────┘    │   │
│  │                                                                 │   │
│  │  PRICE BREAKDOWN                                                │   │
│  │  ├── Base T-Shirt (Large):              $21.99                 │   │
│  │  ├── Front Print:                        $0.00                 │   │
│  │  ├── Back Print:                         $5.00                 │   │
│  │  ├── Gift Wrapping:                      $3.00                 │   │
│  │  └────────────────────────────────────────────                 │   │
│  │      TOTAL:                             $29.99                 │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ☑ I confirm this design is correct and ready for printing     │   │
│  │    I understand returns are limited for custom items.          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  🎨 ADD TO CART & DESIGN ANOTHER                        │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  🛒 ADD TO CART & CHECKOUT                              │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  [← Back to Details]                                                    │
└─────────────────────────────────────────────────────────────────────────┘

BUTTON BEHAVIORS:

1. "ADD TO CART & DESIGN ANOTHER":
   ├── T-Shirt'ı Shopify cart'a ekle
   ├── Modal içinde Step 1'e dön
   ├── Önceki tasarımı temizle
   ├── Mini toast: "✓ Added! Design another item"
   └── Cart badge güncelle

2. "ADD TO CART & CHECKOUT":
   ├── T-Shirt'ı Shopify cart'a ekle
   ├── Modal'ı kapat
   ├── Confirmation screen göster (aşağıda detay)
   └── Cart badge güncelle

VALIDATION:
├── Checkbox MUST be checked
└── Buttons disabled until checked
```

---

# FAZ 3: CONFIRMATION SCREEN

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ✅ ITEMS ADDED TO CART                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  YOUR CART (3 items)                                            │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                 │   │
│  │  ┌────────────────────────────────────────────────────────┐    │   │
│  │  │ 🖼️ DTF Transfer 8x10                                  │    │   │
│  │  │    Qty: 10 • $189.90                                   │    │   │
│  │  └────────────────────────────────────────────────────────┘    │   │
│  │                                                                 │   │
│  │  ┌────────────────────────────────────────────────────────┐    │   │
│  │  │ 👕 Custom T-Shirt (White, Large)                       │    │   │
│  │  │    Front + Back Print                                  │    │   │
│  │  │    Qty: 1 • $29.99                                     │    │   │
│  │  └────────────────────────────────────────────────────────┘    │   │
│  │                                                                 │   │
│  │  ┌────────────────────────────────────────────────────────┐    │   │
│  │  │ 👕 Custom T-Shirt (Black, Medium)                      │    │   │
│  │  │    Front Print Only                                    │    │   │
│  │  │    Qty: 2 • $43.98                                     │    │   │
│  │  └────────────────────────────────────────────────────────┘    │   │
│  │                                                                 │   │
│  │  ─────────────────────────────────────────────────────────     │   │
│  │                                                                 │   │
│  │  CART TOTAL:                                      $263.87      │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  🛒 PROCEED TO CHECKOUT                                  │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │  ← CONTINUE SHOPPING                                     │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

BUTTON BEHAVIORS:

1. "PROCEED TO CHECKOUT":
   ├── window.location.href = '/checkout'
   └── Modal/Screen kapanır

2. "CONTINUE SHOPPING":
   ├── Confirmation screen kapat
   ├── Kullanıcı product sayfasında kalır
   └── Normal Shopify akışına devam
```

---

# FAZ 4: STATE MANAGEMENT (Tüm Sistem)

## 4.1 Global State

```javascript
// tshirt-modal.js - Complete State
const tshirtModalState = {
  // Modal State
  modal: {
    isOpen: false,
    currentStep: 1,
    canProceed: false
  },
  
  // Design from DTF (if any)
  inheritedDesign: {
    uploadId: null,
    thumbnailUrl: null,
    originalUrl: null,
    dimensions: { width: 0, height: 0, dpi: 0 }
  },
  
  // Step 1: Upload
  step1: {
    useInheritedDesign: false,
    newUpload: {
      status: 'idle',
      uploadId: null,
      thumbnailUrl: null,
      originalUrl: null
    }
  },
  
  // Step 2: Design
  step2: {
    tshirtColor: '#FFFFFF',
    tshirtSize: 'M',
    locations: {
      front: {
        enabled: true,
        scale: 1.0,
        positionX: 0,
        positionY: 0,
        price: 0
      },
      back: {
        enabled: false,
        scale: 1.0,
        positionX: 0,
        positionY: 0,
        price: 5
      },
      left_sleeve: {
        enabled: false,
        scale: 1.0,
        positionX: 0,
        positionY: 0,
        price: 3
      },
      right_sleeve: {
        enabled: false,
        scale: 1.0,
        positionX: 0,
        positionY: 0,
        price: 3
      }
    },
    activeLocationTab: 'front',
    calculatedPrice: 0
  },
  
  // Step 3: Details
  step3: {
    quantity: 1,
    extraAnswers: {},
    addOns: {}
  },
  
  // Step 4: Review
  step4: {
    confirmationChecked: false
  },
  
  // 3D Scene Reference
  threeScene: {
    renderer: null,
    scene: null,
    camera: null,
    controls: null,
    tshirtModel: null,
    textures: {} // { front: Texture, back: Texture, ... }
  },
  
  // Cart Items (for "Design Another" flow)
  pendingCartItems: []
};
```

## 4.2 Event Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EVENT FLOW                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  DTF UPLOADER                                                          │
│  ├── onUploadComplete → Store uploadId, thumbnailUrl                   │
│  ├── onCustomizeClick → Open modal with inheritedDesign                │
│  └── onAddToCart → Direct to Shopify cart (no modal)                   │
│                                                                         │
│  T-SHIRT MODAL - STEP 1                                                │
│  ├── onUseInheritedDesign → step1.useInheritedDesign = true           │
│  ├── onNewUploadComplete → step1.newUpload = data                      │
│  └── onNext → Validate → Go to Step 2                                  │
│                                                                         │
│  T-SHIRT MODAL - STEP 2                                                │
│  ├── onColorChange → Update 3D model material                          │
│  ├── onSizeChange → Update pricing                                     │
│  ├── onLocationToggle → Update 3D textures, pricing                    │
│  ├── onScaleChange → Update texture.repeat, live preview               │
│  ├── onPositionChange → Update texture.offset, live preview            │
│  ├── onQuickView → Animate camera to position                          │
│  └── onNext → Validate → Go to Step 3                                  │
│                                                                         │
│  T-SHIRT MODAL - STEP 3                                                │
│  ├── onAnswerChange → Update extraAnswers                              │
│  ├── onQuantityChange → Update quantity, pricing                       │
│  └── onNext → Validate → Go to Step 4                                  │
│                                                                         │
│  T-SHIRT MODAL - STEP 4                                                │
│  ├── onConfirmCheck → Enable buttons                                   │
│  ├── onDesignAnother:                                                  │
│  │   ├── Add item to Shopify cart (AJAX)                              │
│  │   ├── Add to pendingCartItems (for confirmation)                   │
│  │   ├── Reset to Step 1                                              │
│  │   └── Clear form state                                             │
│  └── onCheckout:                                                       │
│      ├── Add item to Shopify cart (AJAX)                              │
│      ├── Close modal                                                   │
│      └── Show Confirmation Screen                                      │
│                                                                         │
│  CONFIRMATION SCREEN                                                   │
│  ├── onProceedCheckout → Redirect to /checkout                        │
│  └── onContinueShopping → Close screen                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# FAZ 5: API ENDPOINTS

## 5.1 Required Endpoints

```
EXISTING:
├── POST /api/upload/intent → Signed URL for upload
├── POST /api/upload/complete → Mark upload complete
├── GET  /api/upload/status/:id → Upload status & metadata

NEW/ENHANCED:
├── GET  /api/product-config/:productId
│   └── Returns: tshirtEnabled, extraQuestions, pricing rules, colors, sizes
│
├── POST /api/cart/add-custom
│   Body: {
│     productId,
│     variantId,
│     quantity,
│     customizations: {
│       type: 'dtf' | 'tshirt',
│       uploadId,
│       locations: [...],
│       extraAnswers: {...}
│     }
│   }
│   Returns: { success, cartItem, cartCount }
│
├── GET  /api/tshirt/colors
│   Returns: [{ id, name, hex, available }]
│
├── GET  /api/tshirt/sizes/:productId
│   Returns: [{ id, name, price, available }]
│
└── GET  /api/pricing/calculate
    Query: { productId, locations, size, addOns }
    Returns: { breakdown, total }
```

## 5.2 Shopify Cart Integration

```javascript
// Add to Shopify Cart (Storefront API / AJAX API)
async function addToCart(item) {
  const cartData = {
    items: [{
      id: item.variantId,
      quantity: item.quantity,
      properties: {
        '_ul_upload_id': item.uploadId,
        '_ul_design_type': item.type, // 'dtf' | 'tshirt'
        '_ul_thumbnail': item.thumbnailUrl,
        '_ul_locations': JSON.stringify(item.locations),
        '_ul_custom_data': JSON.stringify(item.extraAnswers)
      }
    }]
  };
  
  const response = await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cartData)
  });
  
  return response.json();
}
```

---

# FAZ 6: MOBILE EXPERIENCE

```
MOBILE ADAPTATIONS (< 768px):
├── Modal: Full screen (100vw x 100vh)
├── Step 2 Layout: Stacked (3D top, options bottom)
├── 3D Preview: 50vh height, touch controls enabled
├── Options Panel: Scrollable, accordion style
├── Location Settings: Collapsible per location
├── Quick Views: Horizontal scroll buttons
└── Confirmation: Bottom sheet style

3D FALLBACK (Low-end devices):
├── Detect: navigator.hardwareConcurrency < 4 || !WebGL2
├── Fallback: Static images with design overlay
│   ├── Front view image
│   ├── Back view image
│   └── CSS transform for scale/position
└── Message: "3D preview not available on this device"
```

---

# FAZ 7: ERROR HANDLING

```
ERROR SCENARIOS & RESPONSES:

UPLOAD ERRORS:
├── File too large → "File exceeds 50MB limit. Please compress or use a smaller file."
├── Invalid type → "This file type is not supported. Please use PNG, JPG, SVG, PDF, AI, or EPS."
├── Upload failed → "Upload failed. Please check your connection and try again." [Retry]
├── Processing failed → "We couldn't process this file. Please try a different file." [Retry]
└── Low DPI → ⚠️ "Warning: This image is 72 DPI. For best print quality, use at least 150 DPI."

3D ERRORS:
├── Model load failed → "3D preview unavailable. You can still complete your order."
├── Texture apply failed → "Design preview failed. Your design will still print correctly."
└── WebGL not supported → Switch to 2D fallback mode

CART ERRORS:
├── Add failed → "Couldn't add to cart. Please try again." [Retry]
├── Variant out of stock → "This size is currently out of stock. Please select another."
└── Session expired → "Your session has expired. Please refresh the page."

VALIDATION ERRORS:
├── Required field missing → Red border + "This field is required"
├── Invalid input → Red border + specific message
└── Confirmation unchecked → "Please confirm your order before proceeding"
```

---

# FAZ 8: ANALYTICS & TRACKING

```
EVENTS TO TRACK:

DTF UPLOADER:
├── ul_dtf_upload_started
├── ul_dtf_upload_completed
├── ul_dtf_upload_failed
├── ul_dtf_size_selected
├── ul_dtf_add_to_cart
└── ul_dtf_customize_clicked (opens modal)

T-SHIRT MODAL:
├── ul_tshirt_modal_opened
├── ul_tshirt_modal_closed (with step reached)
├── ul_tshirt_step_1_completed
├── ul_tshirt_step_2_completed
├── ul_tshirt_step_3_completed
├── ul_tshirt_color_changed
├── ul_tshirt_size_changed
├── ul_tshirt_location_toggled
├── ul_tshirt_design_another_clicked
├── ul_tshirt_checkout_clicked
└── ul_tshirt_add_to_cart (with full details)

CONFIRMATION:
├── ul_confirmation_shown
├── ul_proceed_checkout_clicked
└── ul_continue_shopping_clicked

SEND TO:
├── Shopify Analytics (native)
├── Custom webhook (for merchant dashboard)
└── Optional: GA4, Meta Pixel via Shopify App Proxy
```

---

# FAZ 9: DOSYA YAPISI

```
extensions/theme-extension/
├── blocks/
│   ├── 3d-designer.liquid      (Mod-2 - Ayrı product tipi)
│   └── dtf-transfer.liquid     (Mod-1 - Bu tasarım)
│
├── snippets/
│   ├── dtf-uploader.liquid     → DTF Upload UI
│   ├── tshirt-modal.liquid     → T-Shirt Modal (4 steps)
│   ├── tshirt-step-1.liquid    → Step 1: Upload
│   ├── tshirt-step-2.liquid    → Step 2: 3D Preview + Options
│   ├── tshirt-step-3.liquid    → Step 3: Extra Questions
│   ├── tshirt-step-4.liquid    → Step 4: Review
│   └── confirmation-screen.liquid → Final confirmation
│
├── assets/
│   ├── dtf-uploader.js         → DTF widget logic
│   ├── tshirt-modal.js         → Modal controller + state
│   ├── tshirt-3d.js            → Three.js scene management
│   ├── ul-common.css           → Shared styles
│   ├── dtf-uploader.css        → DTF specific styles
│   ├── tshirt-modal.css        → Modal + step styles
│   └── models/
│       └── tshirt.glb          → 3D T-Shirt model
│
└── locales/
    ├── en.default.json
    ├── tr.json
    ├── de.json
    └── es.json
```

---

# FAZ 10: IMPLEMENTATION PRIORITY

```
PHASE 1 - Core DTF (Week 1):
├── ✅ DTF Uploader snippet (upload only)
├── ✅ Size variants from Shopify
├── ✅ Add to cart (DTF only)
└── ✅ Basic validation

PHASE 2 - T-Shirt Modal Basic (Week 2):
├── Modal structure
├── Step 1: Upload (inherit or new)
├── Step 2: Static options (no 3D yet)
└── Step 4: Review + Add to Cart

PHASE 3 - 3D Preview (Week 3):
├── Three.js integration
├── T-Shirt model loading
├── Design texture application
├── Scale/Position sliders
└── OrbitControls

PHASE 4 - Multi-location (Week 4):
├── Multi-select locations
├── Per-location settings
├── Dynamic pricing
└── Quick camera views

PHASE 5 - Polish (Week 5):
├── Step 3: Extra questions
├── Design Another flow
├── Confirmation screen
├── Mobile optimization
├── Error handling
└── Analytics
```

---

# ÖZET

Bu döküman, UL DTF Transfer + T-Shirt Modal sisteminin tam mimari tasarımını içermektedir:

| Faz | İçerik | Durum |
|-----|--------|-------|
| FAZ 1 | DTF Uploader Snippet - Upload, Size, Quantity, Extra Questions | ✅ Tamamlandı |
| FAZ 2 | T-Shirt Modal - 4 Step Wizard (Upload, 3D Design, Details, Review) | ✅ Tamamlandı |
| FAZ 3 | Confirmation Screen - Cart summary ve checkout | ✅ Tamamlandı |
| FAZ 4 | State Management - Global state ve event flow (ULState, ULEvents) | ✅ Tamamlandı |
| FAZ 5 | API Endpoints - Backend integration | ✅ Tamamlandı |
| FAZ 6 | Mobile Experience - Responsive ve 2D fallback | ✅ Tamamlandı |
| FAZ 7 | Error Handling - ULErrorHandler, tüm hata senaryoları | ✅ Tamamlandı (v32) |
| FAZ 8 | Analytics - ULAnalytics, event tracking, multi-destination | ✅ Tamamlandı (v33) |
| FAZ 9 | Dosya Yapısı - Theme extension organizasyonu | ✅ Tamamlandı |
| FAZ 10 | Implementation Priority - 5 haftalık plan | ✅ Tamamlandı |

---

*Version: 1.1.0 | Updated: December 22, 2025 | Deploy: v33 | Project: 3D Customizer*
