# 🐛 BUGFIX ROADMAP - Simülasyon Analizi Düzeltme Planı

> **Oluşturulma:** 26 Aralık 2025  
> **Toplam Tespit:** 30 Sorun  
> **Kritik:** 1 | **Yüksek:** 5 | **Orta:** 15 | **Düşük:** 9

---

## 📋 GENEL BAKIŞ

Bu döküman, ultra derin simülasyon analizi sonucu tespit edilen tüm hata ve kurgu hatalarının düzeltilmesi için faz faz çalışma planını içerir.

### Öncelik Sıralaması
- 🔴 **KRİTİK**: Müşteri deneyimini tamamen bozan, acil düzeltilmesi gereken
- 🟠 **YÜKSEK**: Ciddi UX sorunu yaratan, öncelikli düzeltilmesi gereken
- 🟡 **ORTA**: İşlevselliği etkileyen ama workaround mümkün olan
- 🟢 **DÜŞÜK**: Kozmetik veya edge case sorunları

---

## 🚀 FAZ 1: KRİTİK VE YÜKSEK ÖNCELİKLİ HATALAR
**Tahmini Süre:** 2-3 saat  
**Hedef:** Müşteri journey'sini engelleyen tüm blokerleri kaldır

### 1.1 T-Shirt Ürün Bulunamama Sorunu (C-001) 🔴
**Dosya:** `extensions/theme-extension/assets/tshirt-modal.js`  
**Satır:** 1024-1080

**Sorun:**
- `loadProductVariants()` T-Shirt ürününü handle ile arar
- Ürün bulunamazsa `this.product.variants = []` kalır
- `addToCart()` çağrıldığında "Error: T-Shirt product not configured" hatası

**Çözüm:**
```javascript
// 1. loadProductVariants() sonunda variant kontrolü ekle
if (this.product.variants.length === 0) {
  console.error('[ULTShirtModal] No T-Shirt variants found!');
  // Modal açılmadan önce uyarı göster
  this.showConfigurationError();
  return;
}

// 2. showConfigurationError() fonksiyonu ekle
showConfigurationError() {
  // Step 1'de uyarı banner'ı göster
  const banner = document.createElement('div');
  banner.className = 'ul-config-error-banner';
  banner.innerHTML = `
    <div class="ul-error-icon">⚠️</div>
    <div class="ul-error-text">
      T-Shirt product is not configured. Please contact store support.
    </div>
  `;
  this.el.overlay.querySelector('.ul-tshirt-body').prepend(banner);
  
  // Next butonunu disable et
  if (this.el.navNext) {
    this.el.navNext.disabled = true;
  }
}
```

**Test:**
- [ ] T-Shirt ürünü olmadan modal aç
- [ ] Hata mesajı gösterildiğini doğrula
- [ ] Next butonu disabled olmalı

---

### 1.2 Step 3 Extra Questions Render Edilmiyor (C-009) 🟠
**Dosya:** `extensions/theme-extension/assets/tshirt-modal.js`  
**Satır:** 470-480 (`initStep3()` fonksiyonu)

**Sorun:**
- `initStep3()` içinde extra questions render kodu yok
- Merchant'ın T-Shirt için eklediği sorular müşteriye gösterilmiyor

**Çözüm:**
```javascript
initStep3() {
  // Mevcut kod...
  
  // Extra Questions render et
  this.renderExtraQuestions();
  
  // Quantity display...
}

renderExtraQuestions() {
  if (!this.el.extraQuestions) return;
  
  const questions = this.config.extraQuestions || [];
  if (questions.length === 0) {
    this.el.extraQuestions.style.display = 'none';
    return;
  }
  
  this.el.extraQuestions.style.display = 'block';
  this.el.extraQuestions.innerHTML = '';
  
  questions.forEach((q, index) => {
    const fieldId = `ul-tshirt-q-${q.id || index}`;
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'ul-extra-field';
    
    // Label
    const label = document.createElement('label');
    label.setAttribute('for', fieldId);
    label.textContent = q.label;
    if (q.required) {
      label.innerHTML += ' <span class="ul-required">*</span>';
    }
    
    // Input based on type
    let input;
    switch (q.type) {
      case 'select':
        input = document.createElement('select');
        input.innerHTML = '<option value="">Select...</option>';
        (q.options || []).forEach(opt => {
          input.innerHTML += `<option value="${opt}">${opt}</option>`;
        });
        break;
      case 'textarea':
        input = document.createElement('textarea');
        input.rows = 3;
        break;
      case 'checkbox':
        input = document.createElement('input');
        input.type = 'checkbox';
        break;
      default:
        input = document.createElement('input');
        input.type = 'text';
    }
    
    input.id = fieldId;
    input.name = q.label;
    if (q.required) input.required = true;
    
    // Change listener
    input.addEventListener('change', () => {
      this.step3.extraAnswers[q.label] = 
        input.type === 'checkbox' ? input.checked : input.value;
    });
    
    fieldDiv.appendChild(label);
    fieldDiv.appendChild(input);
    this.el.extraQuestions.appendChild(fieldDiv);
  });
}
```

**Test:**
- [ ] Admin'den extra question ekle
- [ ] T-Shirt modal Step 3'te soruların gösterildiğini doğrula
- [ ] Cevapların cart properties'e eklendiğini doğrula

---

### 1.3 Variant Eşleştirme Mantığı (C-002) 🟠
**Dosya:** `extensions/theme-extension/assets/tshirt-modal.js`  
**Satır:** 2571-2590 (`addToCart()` fonksiyonu)

**Sorun:**
- `title.includes()` kullanılıyor
- "Medium / White" formatı ile "M" veya "White" ayrı ayrı match edilemiyor

**Çözüm:**
```javascript
// Daha akıllı variant matching fonksiyonu
findMatchingVariant(size, color) {
  const variants = this.product.variants || [];
  
  // Normalize helper
  const normalize = (str) => (str || '').toLowerCase().trim();
  const sizeNorm = normalize(size);
  const colorNorm = normalize(color);
  
  // Size aliases (M = Medium, L = Large, etc.)
  const sizeAliases = {
    'xs': ['xs', 'x-small', 'extra small'],
    's': ['s', 'small'],
    'm': ['m', 'medium', 'med'],
    'l': ['l', 'large'],
    'xl': ['xl', 'x-large', 'extra large'],
    '2xl': ['2xl', 'xxl', '2x', 'xx-large'],
    '3xl': ['3xl', 'xxxl', '3x', 'xxx-large']
  };
  
  const matchesSize = (value) => {
    const valNorm = normalize(value);
    if (valNorm === sizeNorm) return true;
    const aliases = sizeAliases[sizeNorm] || [];
    return aliases.some(a => valNorm.includes(a));
  };
  
  const matchesColor = (value) => {
    const valNorm = normalize(value);
    return valNorm === colorNorm || valNorm.includes(colorNorm);
  };
  
  // Try exact match first (size + color)
  let match = variants.find(v => {
    const opt1 = normalize(v.option1);
    const opt2 = normalize(v.option2);
    const opt3 = normalize(v.option3);
    
    const hasSize = matchesSize(opt1) || matchesSize(opt2) || matchesSize(opt3);
    const hasColor = matchesColor(opt1) || matchesColor(opt2) || matchesColor(opt3);
    
    return hasSize && hasColor && v.available !== false;
  });
  
  // Fallback: size only
  if (!match) {
    match = variants.find(v => {
      const opt1 = normalize(v.option1);
      const opt2 = normalize(v.option2);
      return (matchesSize(opt1) || matchesSize(opt2)) && v.available !== false;
    });
  }
  
  // Final fallback: first available
  if (!match) {
    match = variants.find(v => v.available !== false) || variants[0];
  }
  
  return match;
}
```

**Test:**
- [ ] "M" size + "White" color seçip doğru variant'ın bulunduğunu doğrula
- [ ] "Medium" ve "M" aynı variant'ı bulmalı
- [ ] Color sadece seçilmişse doğru eşleşme

---

### 1.4 performUpload shopDomain null Sorunu (C-003) 🟠
**Dosya:** `extensions/theme-extension/assets/tshirt-modal.js`  
**Satır:** 806

**Sorun:**
- `this.shopDomain` event ile set edilmezse `'unknown'` kullanılıyor
- Backend bu shop'u bulamaz → 404 hatası

**Çözüm:**
```javascript
// open() fonksiyonunda shopDomain'i daha güvenilir al
open(detail = {}) {
  // Önce event'ten al
  if (detail.shopDomain) {
    this.shopDomain = detail.shopDomain;
  }
  // Yoksa Shopify global'den
  else if (window.Shopify?.shop) {
    this.shopDomain = window.Shopify.shop;
  }
  // Yoksa DOM'dan
  else {
    const container = document.querySelector('[data-shop-domain]');
    this.shopDomain = container?.dataset.shopDomain || null;
  }
  
  // Hala yoksa uyarı göster
  if (!this.shopDomain) {
    console.error('[ULTShirtModal] shopDomain not found!');
    this.showToast('Configuration error. Please refresh the page.', 'error');
    return; // Modal'ı açma
  }
  
  // ... rest of open()
}
```

**Test:**
- [ ] shopDomain olmadan modal açmayı dene
- [ ] Hata mesajı gösterilmeli
- [ ] Modal açılmamalı

---

### 1.5 Admin Variant Status Yanıltıcı (A-001) 🟠
**Dosya:** `app/routes/app.products.$id.configure.tsx`  
**Satır:** 555-580

**Sorun:**
- `colorValues` ve `sizeValues` ürün options'larından çekiliyor
- Variants'ın gerçekten mevcut olup olmadığı kontrol edilmiyor

**Çözüm:**
```tsx
// loader'da variant sayısını da çek
const allProducts = allProductsData.data?.products?.edges?.map((edge: any) => {
  const p = edge.node;
  // ... mevcut kod ...
  
  // Gerçek variant sayısını hesapla
  const availableVariants = p.variants?.edges?.filter(
    (v: any) => v.node.availableForSale !== false
  ).length || 0;
  
  return {
    // ... mevcut alanlar ...
    totalVariants: p.variants?.edges?.length || 0,
    availableVariants,
  };
}) || [];

// UI'da göster
<Banner tone={selectedProduct.availableVariants > 0 ? "success" : "warning"}>
  <p>
    ✅ Selected: <strong>{tshirtConfig.tshirtProductTitle}</strong>
    <br />
    📦 Variants: {selectedProduct.availableVariants} available / {selectedProduct.totalVariants} total
  </p>
</Banner>
```

**Test:**
- [ ] 3 variant'lı ürün seç, "3 available" gösterilmeli
- [ ] Sold out variant'lar ayrı gösterilmeli

---

### 1.6 selectLocation() Fonksiyonu Eksik (T-002) 🟠
**Dosya:** `extensions/theme-extension/assets/tshirt-modal.js`  
**Satır:** 1440-1480

**Sorun:**
- `applyAllowedLocations()` içinde `this.selectLocation()` çağrılıyor
- Bu fonksiyon tanımlı değil → Console error

**Çözüm:**
```javascript
// selectLocation fonksiyonunu ekle (setActiveLocation ile aynı mantık)
selectLocation(locationId) {
  // Location item'ı seçili yap
  const item = document.querySelector(`.ul-location-item[data-location="${locationId}"]`);
  if (item) {
    // Diğerlerini kaldır
    document.querySelectorAll('.ul-location-item.selected').forEach(i => {
      i.classList.remove('selected');
    });
    item.classList.add('selected');
    
    // Checkbox'ı işaretle
    const checkbox = item.querySelector('.ul-location-checkbox');
    if (checkbox) checkbox.checked = true;
  }
  
  // State güncelle
  this.step2.locations[locationId].enabled = true;
  this.setActiveLocation(locationId);
}
```

**Test:**
- [ ] Console'da "selectLocation is not defined" hatası olmamalı
- [ ] Allowed locations doğru seçilmeli

---

## 🔧 FAZ 2: ORTA ÖNCELİKLİ HATALAR
**Tahmini Süre:** 3-4 saat  
**Hedef:** İşlevselliği tam çalışır hale getir

### 2.1 Thumbnail URL / lastFile Sorunu (C-004)
**Dosya:** `extensions/theme-extension/assets/dtf-uploader.js`  
**Satır:** 862-880

**Çözüm:**
```javascript
// handleFileSelect başında dosyayı sakla
async handleFileSelect(productId, file) {
  const instance = this.instances[productId];
  instance.lastFile = file; // EKLE
  // ... rest of function
}

// showPreview'da kullan
if (file.type.startsWith('image/')) {
  const reader = new FileReader();
  reader.onload = (e) => { elements.thumb.src = e.target.result; };
  reader.readAsDataURL(instance.lastFile); // lastFile kullan
}
```

---

### 2.2 Inherited Design URL Expire Sorunu (C-005)
**Dosya:** `extensions/theme-extension/assets/tshirt-modal.js`  
**Satır:** 862

**Çözüm:**
```javascript
// Design URL'i blob olarak sakla
async useInheritedDesign() {
  this.step1.useInheritedDesign = true;
  
  // Eğer thumbnailUrl server URL ise, blob'a çevir
  if (this.inheritedDesign.thumbnailUrl && 
      !this.inheritedDesign.thumbnailUrl.startsWith('blob:')) {
    try {
      const res = await fetch(this.inheritedDesign.thumbnailUrl);
      const blob = await res.blob();
      this.inheritedDesign.blobUrl = URL.createObjectURL(blob);
    } catch (e) {
      console.warn('[ULTShirtModal] Could not cache inherited design');
    }
  }
  
  // ... rest of function
}
```

---

### 2.3 Variant Dropdown First Available (C-006)
**Dosya:** `extensions/theme-extension/snippets/dtf-uploader.liquid`  
**Satır:** 450-480

**Çözüm:**
```liquid
{% assign first_available_selected = false %}
{% for variant in product.variants %}
  <option 
    value="{{ variant.id }}"
    data-price="{{ variant.price | money_without_trailing_zeros }}"
    data-price-raw="{{ variant.price }}"
    data-title="{{ variant.title | escape }}"
    {% if variant.available == false %}disabled{% endif %}
    {% if variant.available and first_available_selected == false %}
      selected
      {% assign first_available_selected = true %}
    {% endif %}
  >
    {{ variant.title }} - {{ variant.price | money_without_trailing_zeros }}
    {%- unless variant.available %} (Sold Out){% endunless %}
  </option>
{% endfor %}
```

---

### 2.4 Extra Questions Required Validation (C-008)
**Dosya:** `extensions/theme-extension/assets/dtf-uploader.js`  
**Satır:** 1035-1070

**Çözüm:**
```javascript
// validateForm içinde düzelt
for (const q of config.extraQuestions) {
  if (q.required) {
    const answer = form.extraAnswers[q.label];
    // Checkbox için 'No' veya unchecked
    if (q.type === 'checkbox') {
      if (!answer || answer === 'No' || answer === false) {
        isValid = false;
        errors.push(`Please check "${q.label}"`);
      }
    } 
    // Diğer tipler için boş string kontrolü
    else {
      if (!answer || answer.trim() === '') {
        isValid = false;
        errors.push(`Please fill in "${q.label}"`);
      }
    }
  }
}
```

---

### 2.5 sizeGrid/sizeSelect null Check (C-011)
**Dosya:** `extensions/theme-extension/assets/dtf-uploader.js`  
**Satır:** 380-400

**Çözüm:**
```javascript
// Variant seçimi için fallback ekle
if (elements.sizeSelect) {
  // Dropdown version
  const selectedOption = elements.sizeSelect.options[elements.sizeSelect.selectedIndex];
  // ...
} else if (elements.sizeGrid) {
  // Legacy radio grid
  // ...
} else {
  // Ne dropdown ne grid var - ilk variant'ı seç
  console.warn('[UL] No size selector found, selecting first variant');
  const container = instance.container;
  const variantInput = container.querySelector('input[name*="variant"]');
  if (variantInput) {
    state.form.selectedVariantId = variantInput.value;
    // Price ve title'ı data attribute'lardan al
  }
}
```

---

### 2.6 ALL_PRODUCTS_QUERY 100 Limit (A-002)
**Dosya:** `app/routes/app.products.$id.configure.tsx`  
**Satır:** 100-110

**Çözüm:**
```tsx
// Pagination ile tüm ürünleri çek
async function fetchAllProducts(admin: any) {
  let products: any[] = [];
  let hasNextPage = true;
  let cursor = null;
  
  while (hasNextPage && products.length < 500) { // Max 500 ürün
    const query = `
      query getAllProducts($cursor: String) {
        products(first: 100, after: $cursor, sortKey: TITLE) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              handle
              options { name values }
            }
          }
        }
      }
    `;
    
    const response = await admin.graphql(query, { variables: { cursor } });
    const data = await response.json();
    
    products = products.concat(data.data.products.edges.map(e => e.node));
    hasNextPage = data.data.products.pageInfo.hasNextPage;
    cursor = data.data.products.pageInfo.endCursor;
  }
  
  return products;
}
```

---

### 2.7 Cache 5 Dakika Sorunu (A-003)
**Dosya:** `app/routes/api.product-config.$id.tsx`  
**Satır:** 40-50

**Çözüm:**
```tsx
// Cache süresini kısalt veya kaldır
// Merchant tarafı için cache istemiyoruz
headers.set('Cache-Control', 'no-cache, max-age=0');

// VEYA Query param ile cache-bust
// Widget'ta: fetch(`${apiBase}/api/product-config/${productId}?shop=${shop}&_t=${Date.now()}`)
```

---

### 2.8 UV Regions Test (T-001)
**Dosya:** `extensions/theme-extension/assets/tshirt-modal.js`  
**Satır:** 1560-1620

**Çözüm:**
```javascript
// Debug mode ile UV grid'i test et
// Geliştirme sırasında DEBUG_UV_GRID: true yap
// Sleeve koordinatlarını gerçek model üzerinde doğrula

// Önerilen güncel değerler (test sonrası ayarlanmalı):
UV_REGIONS: {
  front: {
    bounds: { uMin: 0.05, uMax: 0.45, vMin: 0.10, vMax: 0.50 },
    center: { u: 0.25, v: 0.30 },
    defaultSize: 0.55
  },
  back: {
    bounds: { uMin: 0.50, uMax: 0.95, vMin: 0.10, vMax: 0.50 },
    center: { u: 0.72, v: 0.30 },
    defaultSize: 0.55
  },
  left_sleeve: {
    // TEST EDİLMELİ - mevcut değerler varsayımsal
    bounds: { uMin: 0.0, uMax: 0.20, vMin: 0.55, vMax: 0.85 },
    center: { u: 0.10, v: 0.70 },
    defaultSize: 0.50
  },
  right_sleeve: {
    // TEST EDİLMELİ - mevcut değerler varsayımsal
    bounds: { uMin: 0.80, uMax: 1.0, vMin: 0.55, vMax: 0.85 },
    center: { u: 0.90, v: 0.70 },
    defaultSize: 0.50
  }
}
```

---

### 2.9 Redis Connection Pool (B-002)
**Dosya:** `app/routes/api.upload.complete.tsx`  
**Satır:** 87-100

**Çözüm:**
```tsx
// Singleton Redis connection
let redisConnection: Redis | null = null;

function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    
    redisConnection.on('error', (err) => {
      console.error('[Redis] Connection error:', err);
      redisConnection = null; // Reset on error
    });
  }
  return redisConnection;
}

// NOT: await connection.quit() kaldır - bağlantıyı koru
```

---

### 2.10 2D Fallback CSS (M-001)
**Dosya:** `extensions/theme-extension/assets/tshirt-modal.css` (yeni ekle)

**Çözüm:**
```css
/* 2D Fallback Styles */
.ul-3d-fallback {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
}

.ul-3d-fallback.active {
  display: flex;
}

.ul-3d-fallback-notice {
  background: #fef3c7;
  color: #92400e;
  padding: 8px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.ul-fallback-image-container {
  position: relative;
  width: 200px;
  height: 240px;
}

.ul-fallback-tshirt {
  width: 100%;
  height: 100%;
}

.ul-fallback-design-overlay {
  position: absolute;
  top: 25%;
  left: 50%;
  transform: translate(-50%, 0);
  width: 60%;
  height: 40%;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

.ul-fallback-view-tabs {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.ul-fallback-view-tab {
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: white;
  cursor: pointer;
}

.ul-fallback-view-tab.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}
```

---

### 2.11 File Type Validation (S-001)
**Dosya:** `app/routes/api.upload.intent.tsx`  
**Satır:** 85-100

**Çözüm:**
```tsx
// Backend'de extension + content-type kontrolü
const allowedTypes = [
  "image/png", "image/jpeg", "image/webp",
  "application/pdf", "application/postscript",
  "image/svg+xml",
];

// Content-Type kontrolü
if (!allowedTypes.includes(contentType)) {
  return corsJson({ error: "Unsupported file type" }, request, { status: 400 });
}

// Double extension kontrolü
const dangerousExtensions = ['.php', '.exe', '.sh', '.bat', '.cmd', '.ps1'];
const lowerFileName = fileName.toLowerCase();
if (dangerousExtensions.some(ext => lowerFileName.includes(ext))) {
  return corsJson({ error: "Invalid file name" }, request, { status: 400 });
}
```

---

## 🎨 FAZ 3: DÜŞÜK ÖNCELİKLİ VE KOZMETİK DÜZELTMELER
**Tahmini Süre:** 2 saat  
**Hedef:** Edge case'leri ve küçük UX sorunlarını düzelt

### 3.1 GLB Model URL Konfigürasyonu (C-007)
```javascript
// Merchant'ın kendi GLB URL'i kullanabilmesi için
// config'den al veya default kullan
const glbUrl = this.config.tshirtConfig?.glbModelUrl || 
               window.UL_TSHIRT_GLB_URL || 
               'https://customizerapp.dev/shirt_baked.glb';
```

### 3.2 Snapshot Generation Timing (C-010)
```javascript
// requestAnimationFrame kullanarak render tamamlanmasını bekle
for (const locId of enabledLocs) {
  // ... rotate camera ...
  
  // Wait for next frame to ensure render complete
  await new Promise(resolve => requestAnimationFrame(resolve));
  await new Promise(resolve => requestAnimationFrame(resolve)); // Double frame
  
  // ... capture snapshot ...
}
```

### 3.3 Canvas Memory Optimization (T-004)
```javascript
// Mobil cihazlarda daha küçük canvas
const isMobile = window.innerWidth < 768;
this.baseTextureSize = isMobile ? 1024 : 2048;
```

### 3.4 Order Note Length Check (T-005)
```javascript
generateOrderNote() {
  let note = /* ... generate note ... */;
  
  // Shopify cart note limit: 5000 characters
  if (note.length > 4500) {
    // Truncate special instructions if needed
    note = note.substring(0, 4500) + '\n[Note truncated]';
  }
  
  return note;
}
```

### 3.5 Location Price Flexibility (U-001)
```javascript
// Config'den location fiyatlarını al
const locationPrices = this.config.tshirtConfig?.locationPrices || {
  front: 0,
  back: 5,
  left_sleeve: 3,
  right_sleeve: 3
};

// step2.locations initialize ederken kullan
this.step2.locations = {
  front: { enabled: true, scale: 100, positionX: 0, positionY: 0, price: locationPrices.front },
  // ...
};
```

### 3.6 T-Shirt Button Flash Fix (U-002)
```liquid
<!-- Başlangıçta visibility hidden, JS ile göster -->
<button 
  type="button" 
  class="ul-btn ul-btn-secondary" 
  id="ul-tshirt-btn-{{ product.id }}"
  style="visibility: hidden; opacity: 0; transition: opacity 0.3s;"
  disabled
>
```

```javascript
// Config yüklendikten sonra
if (state.config.tshirtEnabled) {
  elements.tshirtBtn.style.visibility = 'visible';
  elements.tshirtBtn.style.opacity = '1';
}
```

### 3.7 Confirmation Reset (U-003)
```javascript
designAnother() {
  // ... mevcut kod ...
  
  // Confirmation checkbox'ı sıfırla
  this.step4.confirmationChecked = false;
  if (this.el.confirmCheckbox) {
    this.el.confirmCheckbox.checked = false;
  }
  this.updateActionButtons();
}
```

### 3.8 Touch Event Passive (M-002)
```javascript
canvas.addEventListener('touchmove', (e) => {
  if (!self.three.isDragging || e.touches.length !== 1) return;
  
  // Sadece drag sırasında prevent default
  if (self.three.isDragging) {
    e.preventDefault();
  }
  
  // ... rest of handler
}, { passive: false });
```

### 3.9 PLAN_LIMITS Sync (B-003)
```tsx
// Plan limitleri database'den veya config'den çek
const shop = await prisma.shop.findUnique({ where: { shopDomain } });
const planLimits = await getPlanLimits(shop.plan); // Centralized function
```

### 3.10 productId Tracking (S-002)
```javascript
// Modal açılırken productId'yi kaydet
open(detail = {}) {
  this.product.sourceProductId = detail.productId; // DTF ürün ID'si
  // ...
}

// performUpload'da kullan
productId: this.product.sourceProductId || this.product.id || null,
```

---

## 📋 FAZ 4: TEST VE DOĞRULAMA
**Tahmini Süre:** 2 saat  
**Hedef:** Tüm düzeltmelerin çalıştığını doğrula

### 4.1 E2E Test Senaryoları

#### Müşteri Journey Testleri
- [ ] DTF Upload → T-Shirt Modal → Sepete Ekle → Checkout
- [ ] Yeni upload ile T-Shirt Modal → Tüm adımlar → Sepete Ekle
- [ ] Extra questions ile T-Shirt → Cevapları gir → Sepete Ekle
- [ ] Mobil 2D fallback → Tüm adımlar

#### Admin Panel Testleri
- [ ] Ürün configure → T-Shirt ürünü seç → Kaydet
- [ ] Extra question ekle → Müşteri tarafında görüntüle
- [ ] T-Shirt product variants kontrolü

#### Edge Case Testleri
- [ ] T-Shirt ürünü yapılandırılmamış → Hata mesajı
- [ ] Sold out variant seçimi
- [ ] 15 dk sonra inherited design expire
- [ ] 100+ ürün mağazasında T-Shirt seçimi

### 4.2 Browser Testleri
- [ ] Chrome (Desktop)
- [ ] Safari (Desktop)
- [ ] Firefox (Desktop)
- [ ] Chrome (Mobile)
- [ ] Safari (iOS)

### 4.3 Performance Testleri
- [ ] 3D model yükleme süresi < 3sn
- [ ] Texture baking < 500ms
- [ ] Upload completion < 10sn
- [ ] Add to cart < 2sn

---

## 📊 ÖZET TIMELINE

| Faz | Açıklama | Süre | Öncelik |
|-----|----------|------|---------|
| FAZ 1 | Kritik + Yüksek Hatalar | 2-3 saat | 🔴🟠 |
| FAZ 2 | Orta Öncelikli Hatalar | 3-4 saat | 🟡 |
| FAZ 3 | Düşük + Kozmetik | 2 saat | 🟢 |
| FAZ 4 | Test + Doğrulama | 2 saat | ✅ |
| **TOPLAM** | | **9-11 saat** | |

---

## 🚀 BAŞLANGIÇ KOMUTU

```bash
# Faz 1'e başla
git checkout -b fix/simulation-bugs-phase1

# Değişiklikleri yap...

# Test et
pnpm dev
pnpm test

# Deploy
git add .
git commit -m "fix: Phase 1 - Critical and high priority bugs"
git push origin fix/simulation-bugs-phase1

# PR aç veya merge
git checkout main
git merge fix/simulation-bugs-phase1
git push origin main
```

---

*Son Güncelleme: 26 Aralık 2025*  
*Toplam Tespit: 30 Sorun | Çözüm: Faz bazlı roadmap*
