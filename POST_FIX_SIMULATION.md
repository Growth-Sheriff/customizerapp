# 🧪 POST-FIX SİMÜLASYON ANALİZİ

> **Oluşturulma:** 26 Aralık 2025  
> **Amaç:** BUGFIX_ROADMAP.md düzeltmeleri yapıldıktan sonra müşteri deneyimini simüle et ve potansiyel yeni hataları tespit et  
> **Metodoloji:** Hayali tarama + Edge case analizi + Entegrasyon noktası kontrolü

---

## 📋 SİMÜLASYON KAPSAMI

Bu döküman, BUGFIX_ROADMAP.md'deki 30 düzeltme yapıldıktan sonra:
1. Müşteri journey'lerini simüle eder
2. Düzeltmelerin yaratabileceği yeni sorunları tespit eder
3. Kaçırılmış edge case'leri ortaya çıkarır
4. Entegrasyon noktalarındaki potansiyel çakışmaları bulur

---

## 🎯 SİMÜLASYON 1: DTF UPLOAD → T-SHIRT MODAL → CHECKOUT

### Senaryo A: Happy Path (Tüm ayarlar doğru)

```
ADIM 1: Müşteri ürün sayfasına gelir
├── dtf-uploader.liquid yüklenir
├── loadConfig() çağrılır
├── T-Shirt butonu gösterilir (tshirtEnabled: true)
└── ✅ BEKLENEN: Widget düzgün render olur
```

#### 🔍 POTANSİYEL SORUN PS-001
**Konum:** `dtf-uploader.js` → `loadConfig()`  
**Düzeltme Sonrası Risk:**
```javascript
// C-003 düzeltmesi shopDomain null kontrolü ekledi
// AMA: loadConfig() henüz ULDTFUploader.init() içinde çağrılıyor
// shopDomain container.dataset.shopDomain'den alınıyor
// SORUN: data-shop-domain attribute'u Liquid'de set edilmeli ama
// current dtf-uploader.liquid'de {{ shop.permanent_domain }} kullanılıyor
// Bu doğru ama bazı custom domain'lerde farklı olabilir
```
**Öneri:** `{{ shop.permanent_domain }}` yerine `{{ shop.myshopify_domain }}` kullan

---

```
ADIM 2: Müşteri dosya yükler (PNG, 5MB)
├── handleFileSelect() çağrılır
├── File validation geçer
├── Upload intent API çağrılır
├── Direct storage upload yapılır
├── Upload complete API çağrılır
├── Poll status başlar
└── ✅ BEKLENEN: Dosya yüklenir, preview gösterilir
```

#### 🔍 POTANSİYEL SORUN PS-002
**Konum:** `dtf-uploader.js` → `handleFileSelect()` (C-004 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```javascript
// Düzeltme: instance.lastFile = file; eklendi
// AMA: lastFile referansı tutulurken File object'i browser tarafından GC yapılabilir mi?
// Large file upload sırasında memory leak riski var mı?

// AYRCA: showPreview() içinde
if (file.type.startsWith('image/')) {
  reader.readAsDataURL(instance.lastFile);
}
// file parametresi ve instance.lastFile farklı obje olabilir mi?
// Deep copy vs reference sorunu
```
**Öneri:** `lastFile` yerine `WeakRef` kullanmayı veya upload sonrası null'lamayı düşün

---

```
ADIM 3: Müşteri "I want this on a T-Shirt too!" butonuna tıklar
├── openTShirtModal() çağrılır
├── ul:openTShirtModal event dispatch edilir
├── tshirt-modal.js → open() çağrılır
├── loadProductVariants() T-Shirt ürünü yükler
└── ✅ BEKLENEN: Modal açılır, Step 1 gösterilir
```

#### 🔍 POTANSİYEL SORUN PS-003
**Konum:** `tshirt-modal.js` → `open()` (C-003 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```javascript
// Düzeltme: shopDomain null ise modal açılmaz ve hata gösterilir
open(detail = {}) {
  // ...
  if (!this.shopDomain) {
    this.showToast('Configuration error. Please refresh the page.', 'error');
    return; // Modal'ı açma
  }
  // ...
}

// SORUN 1: showToast() modal açılmadan çağrılıyor
// Modal overlay henüz active değil, toast görünür mü?
// this.el.toast modal içinde, modal kapalıyken erişilebilir mi?

// SORUN 2: return; sonrası müşteri ne yapacak?
// T-Shirt butonu hala tıklanabilir
// Infinite retry loop olabilir
```
**Öneri:** 
- `showToast()` yerine `alert()` veya page-level notification kullan
- T-Shirt butonunu disable et hata durumunda

---

```
ADIM 4: Müşteri "Use This Design" butonuna tıklar (Step 1)
├── useInheritedDesign() çağrılır
├── step1.useInheritedDesign = true
├── Next butonu enable olur
└── ✅ BEKLENEN: Design seçilir, Step 2'ye geçilebilir
```

#### 🔍 POTANSİYEL SORUN PS-004
**Konum:** `tshirt-modal.js` → `useInheritedDesign()` (C-005 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```javascript
// Düzeltme: URL'i blob'a çevirme eklendi
async useInheritedDesign() {
  // ...
  try {
    const res = await fetch(this.inheritedDesign.thumbnailUrl);
    const blob = await res.blob();
    this.inheritedDesign.blobUrl = URL.createObjectURL(blob);
  } catch (e) {
    console.warn('[ULTShirtModal] Could not cache inherited design');
  }
}

// SORUN 1: fetch() CORS hatası verebilir
// Server'daki signed URL farklı origin'den mi?
// customizerapp.dev → shop.myshopify.com arası CORS

// SORUN 2: blobUrl oluşturuldu ama nereden kullanılacak?
// applyDesignTexture() hala this.inheritedDesign.thumbnailUrl kullanıyor
// blobUrl hiçbir yerde referans edilmiyor!

// SORUN 3: blob URL'leri revoke edilmeli
// Memory leak: URL.revokeObjectURL() çağrılmıyor
```
**Öneri:** 
- `blobUrl`'i `thumbnailUrl` yerine kullanacak şekilde güncelle
- Modal kapanınca `URL.revokeObjectURL()` çağır
- CORS için server tarafında header ekle

---

```
ADIM 5: Step 2 - 3D Preview yüklenir
├── initStep2() çağrılır
├── waitForThreeJS() Three.js bekler
├── init3D() sahne oluşturur
├── createTShirtMesh() GLB model yükler
├── applyDesignTexture() → loadDecalImage() → updateBakedTexture()
└── ✅ BEKLENEN: 3D T-Shirt görsel ile görünür
```

#### 🔍 POTANSİYEL SORUN PS-005
**Konum:** `tshirt-modal.js` → `loadDecalImage()` (Mevcut kod)  
**Düzeltme Sonrası Risk:**
```javascript
// C-005 düzeltmesi blobUrl oluşturdu
// AMA applyDesignTexture() hala şunu kullanıyor:
const designUrl = this.step1.useInheritedDesign 
  ? this.inheritedDesign.thumbnailUrl  // <-- blobUrl değil!
  : this.step1.newUpload.thumbnailUrl;

// Düzeltme eksik: blobUrl kullanılmalı
const designUrl = this.step1.useInheritedDesign 
  ? (this.inheritedDesign.blobUrl || this.inheritedDesign.thumbnailUrl)
  : this.step1.newUpload.thumbnailUrl;
```
**Öneri:** `applyDesignTexture()` fonksiyonunu da güncelle

---

```
ADIM 6: Müşteri renk ve beden seçer
├── setColor() çağrılır
├── setSize() çağrılır
├── update3DColor() → updateBakedTexture()
├── calculatePrice() fiyat günceller
└── ✅ BEKLENEN: T-Shirt rengi değişir, fiyat güncellenir
```

#### 🔍 POTANSİYEL SORUN PS-006
**Konum:** `tshirt-modal.js` → `renderColors()` + `loadProductVariants()` (A-001 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```javascript
// A-001 düzeltmesi: Admin'de variant sayısı gösteriliyor
// AMA: Widget tarafında renk listesi hala options'dan geliyor

// loadProductVariants() içinde:
if (tshirtConfig.colorValues?.length > 0) {
  this.product.colors = tshirtConfig.colorValues.map(name => ({
    name,
    hex: this.getColorHex(name)
  }));
}

// SORUN: colorValues admin'de options'dan çekiliyor
// 10 renk option'ı var ama sadece 3 renk için variant tanımlı
// Müşteri "Purple" seçer ama Purple variant yok
// addToCart() variant bulamaz!

// ÇÖZÜM: Renkleri sadece mevcut variant'lardan çek
```
**Öneri:** `loadProductVariants()` içinde renkleri variant'lardan çıkar, options'dan değil

---

```
ADIM 7: Müşteri lokasyon seçer (Front + Back)
├── toggleLocation('back') çağrılır
├── step2.locations.back.enabled = true
├── update3DDecal() → updateBakedTexture()
├── calculatePrice() fiyat günceller (+$5)
└── ✅ BEKLENEN: Back lokasyonu aktif, fiyat artar
```

#### 🔍 POTANSİYEL SORUN PS-007
**Konum:** `tshirt-modal.js` → `UV_REGIONS` (T-001 düzeltmesi önerisi)  
**Düzeltme Sonrası Risk:**
```javascript
// T-001 önerisi: UV koordinatlarını test et ve güncelle
// AMA: Güncellenmiş koordinatlar test edilmeden deploy edilirse
// Back veya sleeve baskılar tamamen yanlış yerde görünebilir

// AYRICA: drawDecalToTexture() içinde flip mantığı var
ctx.scale(-1, -1); // 180 derece döndür

// Eğer UV koordinatları değişirse bu flip mantığı da değişmeli mi?
// Front için doğru olan Back için yanlış olabilir
```
**Öneri:** Her lokasyon için ayrı flip/rotation ayarı ekle

---

```
ADIM 8: Step 3 - Adet ve Extra Questions
├── initStep3() çağrılır
├── renderExtraQuestions() extra soruları render eder (C-009 düzeltmesi)
├── Müşteri adet girer
├── Müşteri soruları cevaplar
└── ✅ BEKLENEN: Sorular görünür, cevaplar kaydedilir
```

#### 🔍 POTANSİYEL SORUN PS-008
**Konum:** `tshirt-modal.js` → `renderExtraQuestions()` (C-009 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```javascript
// Düzeltme: renderExtraQuestions() fonksiyonu eklendi
// AMA: Bu fonksiyon this.config.extraQuestions kullanıyor

// SORUN 1: this.config nereden geliyor?
// open() içinde: Object.assign(this.config, config);
// config parametresi detail.config'den geliyor
// detail DTF uploader'dan geliyor
// DTF uploader state.config.extraQuestions T-Shirt değil DTF soruları!

// T-Shirt için ayrı extraQuestions olmalı:
// tshirtConfig.extraQuestions vs config.extraQuestions

// SORUN 2: Müşteri Step 3'te geri gidip Step 2'ye dönerse
// ve sonra tekrar Step 3'e gelirse
// renderExtraQuestions() tekrar çağrılır
// Eski cevaplar kaybolur!
```
**Öneri:** 
- T-Shirt için ayrı `tshirtExtraQuestions` kullan
- `renderExtraQuestions()` içinde mevcut cevapları koru

---

```
ADIM 9: Step 4 - Review ve Onay
├── initStep4() çağrılır
├── generateLocationSnapshots() snapshot'lar oluşturur
├── Müşteri checkbox'ı işaretler
├── step4.confirmationChecked = true
├── Checkout butonu enable olur
└── ✅ BEKLENEN: Özet gösterilir, checkout yapılabilir
```

#### 🔍 POTANSİYEL SORUN PS-009
**Konum:** `tshirt-modal.js` → `generateLocationSnapshots()` (C-010 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```javascript
// Düzeltme: Double requestAnimationFrame eklendi
await new Promise(resolve => requestAnimationFrame(resolve));
await new Promise(resolve => requestAnimationFrame(resolve));

// SORUN: requestAnimationFrame async değil
// Promise resolve edilse bile render tamamlanmamış olabilir
// Özellikle yavaş GPU'larda

// DAHA GÜVENLI ÇÖZÜM:
await new Promise(resolve => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Render pass 2 kez tamamlandı
      this.three.renderer.render(this.three.scene, this.three.camera);
      resolve();
    });
  });
});
```
**Öneri:** `renderer.render()` çağrısını Promise içine al

---

```
ADIM 10: Müşteri "Checkout" butonuna tıklar
├── checkout() çağrılır
├── addToCart() çağrılır
├── findMatchingVariant() variant bulur (C-002 düzeltmesi)
├── /cart/add.js API çağrılır
├── updateCartNote() order note ekler
├── Modal kapanır
├── Confirmation screen gösterilir
└── ✅ BEKLENEN: Ürün sepete eklenir, müşteri checkout'a yönlendirilir
```

#### 🔍 POTANSİYEL SORUN PS-010
**Konum:** `tshirt-modal.js` → `findMatchingVariant()` (C-002 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```javascript
// Düzeltme: Akıllı variant matching eklendi
// AMA: sizeAliases sadece standart bedenleri içeriyor

const sizeAliases = {
  'xs': ['xs', 'x-small', 'extra small'],
  's': ['s', 'small'],
  // ...
};

// SORUN: Sayısal bedenler desteklenmiyor
// Bazı ürünler: 36, 38, 40, 42... kullanıyor
// Veya: 6, 8, 10, 12... (kadın giyim)

// SORUN 2: Renk aliases yok
// "Beyaz" vs "White" eşleşmez
// Türkçe mağazalarda sorun
```
**Öneri:** 
- Sayısal beden desteği ekle
- Renk aliases ekle (çoklu dil)

---

#### 🔍 POTANSİYEL SORUN PS-011
**Konum:** `tshirt-modal.js` → `addToCart()` → `updateCartNote()` (T-005 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```javascript
// Düzeltme: Order note 4500 karakterde kesilecek
if (note.length > 4500) {
  note = note.substring(0, 4500) + '\n[Note truncated]';
}

// SORUN 1: updateCartNote() mevcut note'a append ediyor
async updateCartNote(note) {
  const cart = await cartResponse.json();
  let fullNote = cart.note || '';
  if (fullNote) {
    fullNote += '\n\n';
  }
  fullNote += note;
  // ...
}

// Müşteri 3 T-Shirt eklerse:
// Note 1: 1500 char + Note 2: 1500 char + Note 3: 1500 char = 4500+ char
// AMA kesme sadece generateOrderNote() içinde
// fullNote kesme kontrolü yok!

// SORUN 2: Cart note zaten doluysa
// Mağaza owner'ı note kullanıyorsa çakışma olur
```
**Öneri:** `updateCartNote()` içinde de toplam uzunluk kontrolü yap

---

## 🎯 SİMÜLASYON 2: YENİ UPLOAD İLE T-SHIRT (Inherited Design Olmadan)

### Senaryo B: Müşteri direkt T-Shirt modal açar

```
ADIM 1: Müşteri modal'da dosya yükler
├── uploadZone click → fileInput.click()
├── handleFileSelect() → uploadFile()
├── performUpload() API çağrıları
└── ✅ BEKLENEN: Yeni dosya yüklenir
```

#### 🔍 POTANSİYEL SORUN PS-012
**Konum:** `tshirt-modal.js` → `performUpload()` (Mevcut kod + S-002 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```javascript
// performUpload içinde:
const response = await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': file.type || 'application/octet-stream' },
  body: file
});

// SORUN: uploadUrl R2/S3 signed URL ise CORS gerekli
// Local storage için bu sorun yok
// AMA: Backend R2'ye fallback yapıyorsa CORS hatası alınabilir

// Storage provider belirsizliği:
// - Intent API → local storage için URL dönüyor
// - Shop ayarlarında R2 seçili ama credentials yanlış
// - Fallback local'e yapılıyor
// - AMA signed URL formatı farklı olabilir
```
**Öneri:** Storage provider'a göre upload method'u seç (PUT vs POST)

---

## 🎯 SİMÜLASYON 3: MOBİL DENEYİM (2D FALLBACK)

### Senaryo C: WebGL desteklemeyen cihaz

```
ADIM 1: Step 2'ye geçiş
├── initStep2() çağrılır
├── waitForThreeJS() → init3D()
├── supports3D() false döner (WebGL yok)
├── initFallback2D() çağrılır
├── createFallbackUI() 2D preview oluşturur
└── ✅ BEKLENEN: 2D fallback gösterilir
```

#### 🔍 POTANSİYEL SORUN PS-013
**Konum:** `tshirt-modal.js` → `initFallback2D()` (M-001 düzeltmesi CSS eklendi)  
**Düzeltme Sonrası Risk:**
```javascript
// createFallbackUI() inline SVG oluşturuyor
container.innerHTML = `
  <svg class="ul-fallback-tshirt" viewBox="0 0 200 240">
    <path d="..." fill="${this.step2.tshirtColor}" />
  </svg>
`;

// SORUN 1: SVG path sadece front view
// Back view için farklı path gerekli
// Fallback view tabs "Front" ve "Back" var ama aynı SVG

// SORUN 2: Design overlay pozisyonu sadece front için ayarlı
// .ul-fallback-design-overlay { top: 25%; }
// Back view'da tasarım yine aynı yerde görünür

// SORUN 3: Sleeve view'lar yok
// Fallback'te sadece Front/Back var
// Allowed positions sleeve içeriyorsa ne olacak?
```
**Öneri:** 
- Her view için ayrı SVG path tanımla
- Design overlay pozisyonunu view'a göre değiştir
- Sleeve için sadece "Not available in 2D mode" göster

---

## 🎯 SİMÜLASYON 4: ADMIN PANEL

### Senaryo D: Merchant T-Shirt yapılandırır

```
ADIM 1: Merchant product configure sayfasını açar
├── loader() ürün bilgilerini çeker
├── fetchAllProducts() tüm ürünleri çeker (A-002 düzeltmesi: pagination)
├── T-Shirt dropdown'ı doldurulur
└── ✅ BEKLENEN: 500'e kadar ürün listelenir
```

#### 🔍 POTANSİYEL SORUN PS-014
**Konum:** `app.products.$id.configure.tsx` → `fetchAllProducts()` (A-002 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```typescript
// Düzeltme: Pagination ile 500 ürüne kadar çek
while (hasNextPage && products.length < 500) {
  // GraphQL query...
}

// SORUN 1: 500 ürün çok fazla veri
// Admin sayfası yüklenirken timeout olabilir
// Shopify GraphQL rate limit'e takılabilir

// SORUN 2: Her sayfa yüklemesinde 5 GraphQL query
// (100 + 100 + 100 + 100 + 100 = 500 ürün)
// Billing için API call sayısı önemli

// SORUN 3: Dropdown'da 500 ürün UX olarak kötü
// Arama/filtreleme yok
```
**Öneri:** 
- Lazy loading veya search-on-type kullan
- Sadece T-Shirt olabilecek ürünleri filtrele (tag veya type ile)
- Cache mekanizması ekle

---

```
ADIM 2: Merchant T-Shirt ürünü seçer
├── Select onChange → setTshirtConfig() günceller
├── Variant status gösterilir (A-001 düzeltmesi)
├── ✅ BEKLENEN: Seçilen ürün bilgileri gösterilir
```

#### 🔍 POTANSİYEL SORUN PS-015
**Konum:** `app.products.$id.configure.tsx` → variant status (A-001 düzeltmesi)  
**Düzeltme Sonrası Risk:**
```typescript
// Düzeltme: availableVariants sayısını göster
// AMA: allProducts query'si variants içermiyor!

const ALL_PRODUCTS_QUERY = `
  query getAllProducts {
    products(first: 100) {
      edges {
        node {
          id
          title
          options { name values }
          // variants YOK!
        }
      }
    }
  }
`;

// Düzeltme için variants da çekilmeli:
// variants(first: 100) { edges { node { id availableForSale } } }

// SORUN: Bu query'yi büyütmek rate limit'i artırır
```
**Öneri:** Ürün seçildiğinde ayrı bir query ile variant bilgisi çek (lazy loading)

---

```
ADIM 3: Merchant Extra Question ekler
├── Modal açılır
├── Question tipi, label, options girilir
├── Save → extraQuestions array'e eklenir
├── Form submit → action() çağrılır
└── ✅ BEKLENEN: Soru kaydedilir
```

#### 🔍 POTANSİYEL SORUN PS-016
**Konum:** `app.products.$id.configure.tsx` → action (Mevcut kod)  
**Düzeltme Sonrası Risk:**
```typescript
// extraQuestionsJson string olarak gönderiliyor
const extraQuestionsJson = formData.get("extraQuestions") as string;
extraQuestions = JSON.parse(extraQuestionsJson);

// SORUN 1: JSON.parse hata verebilir
// Özel karakterler escape edilmemiş olabilir

// SORUN 2: extraQuestions validation yok
// label boş olabilir, options array yerine string olabilir
// type geçersiz değer içerebilir

// SORUN 3: XSS riski
// label içinde <script> olabilir
// Widget'ta sanitize edilmeden render ediliyor
```
**Öneri:** 
- Zod veya Yup ile şema validasyonu ekle
- HTML sanitization uygula

---

## 🎯 SİMÜLASYON 5: EDGE CASES

### EC-001: Çoklu Browser Tab
```
Senaryo: Müşteri 2 tab'da aynı ürünü açar
├── Tab 1: Dosya yükler, T-Shirt modal açar
├── Tab 2: Farklı dosya yükler
├── Tab 1: Checkout'a tıklar
└── ❓ SORUN: Hangi dosya sepete eklenir?

// Global state (ULState) tab'lar arası senkronize değil
// Ama localStorage veya sessionStorage kullanılırsa çakışabilir
```

### EC-002: Sayfa Yenileme
```
Senaryo: Müşteri Step 3'te iken sayfayı yeniler
├── Modal state kaybolur
├── Yüklenen dosya bilgisi kaybolur
├── T-Shirt butonu tekrar tıklanır
├── inheritedDesign null
└── ❓ SORUN: Müşteri baştan başlamak zorunda

// Öneri: sessionStorage'a progress kaydet
// Modal açıldığında restore et
```

### EC-003: Ağ Kesintisi
```
Senaryo: Upload sırasında internet kesilir
├── uploadToStorage() XHR error event'i
├── UPLOAD_NETWORK_ERROR gösterilir
├── Retry butonu gösterilir
├── Müşteri retry tıklar
└── ❓ SORUN: Yarım kalan upload temizleniyor mu?

// uploadId ile draft upload DB'de kalır
// Cleanup job gerekli
```

### EC-004: Concurrent Requests
```
Senaryo: Müşteri hızlıca renk değiştirir
├── setColor('Red') → updateBakedTexture()
├── setColor('Blue') → updateBakedTexture()
├── setColor('Green') → updateBakedTexture()
└── ❓ SORUN: Race condition - son renk hangisi?

// updateBakedTexture() senkron
// Ama async texture loading var
// loadDecalImage() henüz bitmeden çağrılırsa?
```

### EC-005: Memory Pressure
```
Senaryo: Düşük RAM'li cihazda büyük dosya
├── 50MB PNG yüklenir
├── FileReader.readAsDataURL() çağrılır
├── 2048x2048 Canvas oluşturulur
├── Three.js scene + textures
└── ❓ SORUN: Browser crash veya çok yavaşlama

// Öneri:
// - File size'a göre canvas boyutunu küçült
// - Three.js'i lazy load et
// - Large file için warning göster
```

### EC-006: Stale Variant Data
```
Senaryo: Admin ürün seçerken variant silinir
├── Admin T-Shirt ürünü seçer (10 variant)
├── Aynı anda başka admin 5 variant siler
├── Config kaydedilir (10 renk)
├── Müşteri modal açar
├── 10 renk gösterilir ama 5'i variant yok
└── ❓ SORUN: Checkout hata verir

// Öneri: Real-time variant check veya
// Cart add öncesi variant availability kontrolü
```

---

## 📊 TESPİT EDİLEN YENİ SORUNLAR ÖZET

| # | Sorun | Önem | Kategori | Düzeltme Fazı |
|---|-------|------|----------|---------------|
| PS-001 | shop.permanent_domain vs myshopify_domain | 🟡 | Config | FAZ 2 |
| PS-002 | File reference memory leak | 🟡 | Memory | FAZ 3 |
| PS-003 | showToast modal kapalıyken çalışmaz | 🟠 | UX | FAZ 1 |
| PS-004 | blobUrl oluşturuluyor ama kullanılmıyor | 🔴 | Logic | FAZ 1 |
| PS-005 | applyDesignTexture blobUrl kullanmıyor | 🔴 | Logic | FAZ 1 |
| PS-006 | Renk listesi variant'tan değil option'dan | 🟠 | Logic | FAZ 1 |
| PS-007 | UV flip mantığı lokasyona göre değişmeli | 🟡 | 3D | FAZ 2 |
| PS-008 | extraQuestions T-Shirt vs DTF karışıklığı | 🟠 | Logic | FAZ 1 |
| PS-009 | Snapshot timing hala güvenilir değil | 🟡 | 3D | FAZ 2 |
| PS-010 | Sayısal beden ve çoklu dil renk desteği | 🟡 | I18n | FAZ 2 |
| PS-011 | Cart note toplam uzunluk kontrolü | 🟡 | Validation | FAZ 2 |
| PS-012 | Storage provider CORS/method uyumsuzluğu | 🟠 | Upload | FAZ 1 |
| PS-013 | 2D fallback view'lar eksik/yanlış | 🟡 | Mobile | FAZ 2 |
| PS-014 | 500 ürün pagination performans sorunu | 🟡 | Performance | FAZ 2 |
| PS-015 | allProducts query variants içermiyor | 🔴 | Logic | FAZ 1 |
| PS-016 | Extra questions XSS/validation eksik | 🟠 | Security | FAZ 1 |

---

## 🔄 GÜNCELLENMİŞ FAZ PLANI

### FAZ 1 EK GÖREVLER (Kritik Düzeltmeler)
| # | Görev | Dosya | Öncelik |
|---|-------|-------|---------|
| PS-003 | Modal kapalı hata handling | tshirt-modal.js | 🟠 |
| PS-004 | blobUrl referansını kullan | tshirt-modal.js | 🔴 |
| PS-005 | applyDesignTexture blobUrl | tshirt-modal.js | 🔴 |
| PS-006 | Renkleri variant'tan al | tshirt-modal.js | 🟠 |
| PS-008 | tshirtExtraQuestions ayrı al | tshirt-modal.js | 🟠 |
| PS-012 | Storage method uyumsuzluğu | tshirt-modal.js | 🟠 |
| PS-015 | allProducts variants query | app.products.$id.configure.tsx | 🔴 |
| PS-016 | XSS sanitization | app.products.$id.configure.tsx | 🟠 |

### FAZ 2 EK GÖREVLER
| # | Görev | Dosya | Öncelik |
|---|-------|-------|---------|
| PS-001 | Shop domain doğru attribute | dtf-uploader.liquid | 🟡 |
| PS-007 | UV flip per-location | tshirt-modal.js | 🟡 |
| PS-009 | Snapshot timing geliştirilmesi | tshirt-modal.js | 🟡 |
| PS-010 | Sayısal beden + çoklu dil | tshirt-modal.js | 🟡 |
| PS-011 | Cart note total length | tshirt-modal.js | 🟡 |
| PS-013 | 2D fallback multi-view | tshirt-modal.js | 🟡 |
| PS-014 | Ürün listesi lazy loading | app.products.$id.configure.tsx | 🟡 |

### FAZ 3 EK GÖREVLER
| # | Görev | Dosya | Öncelik |
|---|-------|-------|---------|
| PS-002 | File memory yönetimi | dtf-uploader.js | 🟢 |
| EC-002 | Session persistence | tshirt-modal.js | 🟢 |
| EC-003 | Upload cleanup job | workers/cleanup.worker.ts | 🟢 |

---

## ✅ SONRAKİ ADIMLAR

1. **Bu dökümandaki PS-004, PS-005, PS-015 düzeltmelerini BUGFIX_ROADMAP'e ekle**
2. **FAZ 1'e başlamadan önce bu sorunları da dahil et**
3. **Her düzeltme sonrası bu simülasyonu tekrar çalıştır**
4. **Edge case'ler için automated test yaz**

---

*Son Güncelleme: 26 Aralık 2025*  
*Simülasyon Tipi: Post-Fix Hayali Tarama*  
*Tespit Edilen Yeni Sorun: 16*  
*Kritik: 3 | Yüksek: 6 | Orta: 6 | Düşük: 1*
