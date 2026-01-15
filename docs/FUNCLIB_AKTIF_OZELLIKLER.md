# FuncLib v4 - Aktif Özellikler Kullanım Kılavuzu

**3D Customizer Projesi için Kod Analiz Sistemi**

> **Son Güncelleme:** 3 Ocak 2026  
> **Proje:** customizer-app  
> **İndeks:** 124 dosya, 600 sembol, 5038 referans

---

## 📌 Temel Kural

**Herhangi bir fonksiyon, method, class veya component değiştirmeden ÖNCE:**

```bash
funclib refs <sembol_adı>
```

Bu kural tüm refactoring ve değişiklik işlemlerinde uygulanmalıdır.

---

## 🚀 Aktif Komutlar

### 1️⃣ `funclib index` - Projeyi İndeksle

Proje dosyalarını tarayıp sembol indeksi oluşturur.

```bash
funclib index
```

**Çıktı:**
```
✓ Indexed in 114ms
Files: 124, Symbols: 600, References: 5038
```

**Ne zaman kullanılır:**
- Proje ilk kez açıldığında
- Yeni dosyalar eklendikten sonra
- Büyük refactoring sonrası

---

### 2️⃣ `funclib search <query>` - Sembol Ara

Tüm sembollerde arama yapar.

```bash
# Fonksiyon ara
funclib search handleSubmit

# Upload ile ilgili tüm semboller
funclib search upload

# Hook ara
funclib search useApp
```

**Örnek Çıktı:**
```
Found 5 symbols matching "upload":

  uploadFile         function    app/lib/storage.server.ts:45
  uploadToR2         function    app/lib/storage.server.ts:120
  handleUpload       function    app/routes/api.upload.intent.tsx:25
  UploadStatus       type        app/types/global.d.ts:15
  useUploadProgress  function    extensions/theme-extension/assets/dtf-uploader.js:200
```

---

### 3️⃣ `funclib refs <name>` - Referansları Bul ⚠️ EN ÖNEMLİ

Bir sembolün tüm kullanım yerlerini bulur.

```bash
# Bir fonksiyonun tüm kullanım yerleri
funclib refs uploadFile

# Bir component'ın kullanımları
funclib refs SettingsPage

# Bir type'ın kullanımları
funclib refs UploadStatus
```

**Örnek Çıktı:**
```
References to "uploadFile" (12 found):

Definition:
  app/lib/storage.server.ts:45  export async function uploadFile(...)

Usages:
  app/routes/api.upload.intent.tsx:78      await uploadFile(buffer, key)
  app/routes/api.upload.complete.tsx:134   const result = await uploadFile(...)
  workers/preflight.worker.ts:89           uploadFile(thumbnail, thumbKey)
  workers/export.worker.ts:156             await uploadFile(zipBuffer, exportKey)
  ...
```

**⚠️ Kritik Kullanım Senaryoları:**

| Senaryo | Komut |
|---------|-------|
| Fonksiyon parametrelerini değiştirmeden önce | `funclib refs functionName` |
| Type/Interface değiştirmeden önce | `funclib refs TypeName` |
| Component prop'larını değiştirmeden önce | `funclib refs ComponentName` |
| Hook dönüş değerini değiştirmeden önce | `funclib refs useHookName` |

---

### 4️⃣ `funclib symbol <name>` - Sembol Detayları

Bir sembolün tam tanımını gösterir.

```bash
funclib symbol uploadFile
```

**Çıktı:**
```
Symbol: uploadFile
Kind:   function
File:   app/lib/storage.server.ts
Line:   45-89
Export: named

Parameters:
  buffer: Buffer
  key: string
  options?: UploadOptions

Returns: Promise<UploadResult>

References: 12
```

---

### 5️⃣ `funclib file <path>` - Dosyadaki Semboller

Bir dosyadaki tüm sembolleri listeler.

```bash
# Dosyadaki tüm fonksiyonlar, class'lar, type'lar
funclib file app/lib/storage.server.ts

# Routes dosyası
funclib file app/routes/api.upload.intent.tsx
```

**Çıktı:**
```
Symbols in app/lib/storage.server.ts:

  Functions:
    uploadFile           line 45    export
    downloadFile         line 92    export
    deleteFile           line 130   export
    getSignedUrl         line 158   export
    createUploadIntent   line 190   export

  Types:
    UploadOptions        line 12    export
    UploadResult         line 20    export
    StorageProvider      line 28    export

  Constants:
    BUCKET_NAME          line 8     const
    MAX_FILE_SIZE        line 9     const
```

---

### 6️⃣ `funclib stats` - İndeks İstatistikleri

Mevcut indeks durumunu gösterir.

```bash
funclib stats
```

**Çıktı:**
```
Index Statistics:

  Files:      124
  Symbols:    600
  References: 5038
  Languages:  typescript(122), json(0), bash(0), tsx(206), javascript(272), css(0)
```

---

### 7️⃣ `funclib serve` - REST API Sunucusu

FuncLib'i REST API olarak çalıştırır (port 3456).

```bash
funclib serve
```

**Endpoints:**
- `GET /search?q=<query>` - Sembol ara
- `GET /refs/<name>` - Referansları bul
- `GET /symbol/<name>` - Sembol detayları
- `GET /file/<path>` - Dosya sembolleri
- `GET /stats` - İstatistikler

---

## 📁 Proje Konfigürasyonu

### `.funclibignore`

İndekslenmeyecek dosya/klasörler:

```
node_modules/
build/
dist/
.git/
.next/
*.md
*.log
```

### `funclib.config.json`

Proje özel ayarları:

```json
{
  "project": {
    "name": "customizer-app",
    "type": "shopify-remix"
  },
  "languages": {
    "typescript": { "enabled": true },
    "javascript": { "enabled": true },
    "liquid": { "enabled": true }
  }
}
```

---

## 🎯 Pratik Kullanım Senaryoları

### Senaryo 1: Fonksiyon İmzası Değiştirme

```bash
# 1. Önce referansları kontrol et
funclib refs uploadFile

# 2. Kaç yerde kullanıldığını gör
# 3. Tüm kullanım yerlerini not al
# 4. Değişikliği yap
# 5. Tüm kullanım yerlerini güncelle
```

### Senaryo 2: Component Prop Ekleme

```bash
# 1. Component referanslarını bul
funclib refs SettingsCard

# 2. Tüm kullanım yerlerini incele
# 3. Yeni prop'u ekle
# 4. Tüm kullanım yerlerinde güncelle
```

### Senaryo 3: Type/Interface Değiştirme

```bash
# 1. Type kullanımlarını bul
funclib refs UploadStatus

# 2. Hangi dosyalarda kullanıldığını gör
# 3. Type'ı güncelle
# 4. Tüm kullanım yerlerini düzelt
```

### Senaryo 4: Hook Refactoring

```bash
# 1. Hook kullanımlarını bul
funclib refs useAppBridge

# 2. Return type değişirse etkilenen yerleri gör
# 3. Değişikliği yap
# 4. Tüm consumer'ları güncelle
```

### Senaryo 5: Dosya İçeriğini Anlama

```bash
# Dosyadaki tüm sembolleri gör
funclib file app/routes/api.upload.complete.tsx

# Sonra her birinin referanslarına bak
funclib refs handleComplete
funclib refs validateUpload
```

---

## 🔍 Filtreleme Seçenekleri

```bash
# Sadece fonksiyonları listele
funclib search upload --kind function

# Sonuç sayısını sınırla
funclib search handle --limit 10

# JSON çıktı (script'ler için)
funclib refs uploadFile --json

# Farklı proje yolu
funclib index --project /path/to/project
```

---

## 📊 Desteklenen Diller

| Dil | Uzantılar | Durum |
|-----|-----------|-------|
| TypeScript | `.ts`, `.tsx` | ✅ Aktif |
| JavaScript | `.js`, `.jsx` | ✅ Aktif |
| Liquid | `.liquid` | ✅ Aktif |
| GraphQL | `.graphql`, `.gql` | ✅ Aktif |
| Prisma | `.prisma` | ✅ Aktif |
| JSON | `.json` | ✅ Aktif |
| CSS | `.css` | ✅ Aktif |

---

## ⚡ Hızlı Referans

```bash
# İndeksle
funclib index

# Ara
funclib search <query>

# Referanslar (EN ÖNEMLİ!)
funclib refs <name>

# Sembol detay
funclib symbol <name>

# Dosya sembolleri
funclib file <path>

# İstatistikler
funclib stats
```

---

## 🛠️ Sorun Giderme

### "Symbol not found" hatası

```bash
# Projeyi yeniden indeksle
funclib index
```

### Yavaş arama

```bash
# .funclibignore ile gereksiz dosyaları hariç tut
echo "node_modules/" >> .funclibignore
echo "build/" >> .funclibignore
funclib index
```

### Eksik referanslar

```bash
# Tüm projeyi tazeleyerek indeksle
rm -rf .funclib
funclib index
```

---

## �️ Shopify Projesi için Özel Özellikler

### Konfigüre Edilmiş Shopify Bileşenleri

`funclib.config.json` dosyasında Shopify-spesifik özellikler tanımlı:

#### 1. Theme Extension Tracking

```json
"themeExtension": {
  "path": "extensions/theme-extension",
  "sections": "blocks/*.liquid",
  "snippets": "snippets/*.liquid",
  "assets": "assets/*.{js,css}",
  "locales": "locales/*.json"
}
```

**Kullanım:**
```bash
# Theme extension dosyalarını listele
funclib file extensions/theme-extension/assets/dtf-uploader.js

# Liquid block sembolleri
funclib search dtf-customizer
```

---

#### 2. Webhook Mapping

Tüm webhook handler'lar otomatik izlenir:

| Webhook | Dosya |
|---------|-------|
| `orders/create` | `webhooks.orders-create.tsx` |
| `orders/paid` | `webhooks.orders-paid.tsx` |
| `orders/cancelled` | `webhooks.orders-cancelled.tsx` |
| `orders/fulfilled` | `webhooks.orders-fulfilled.tsx` |
| `products/update` | `webhooks.products-update.tsx` |
| `products/delete` | `webhooks.products-delete.tsx` |
| `app/uninstalled` | `webhooks.app-uninstalled.tsx` |

**Kullanım:**
```bash
# Webhook handler bul
funclib search webhooks
funclib file app/routes/webhooks.orders-create.tsx

# Handler fonksiyonunun referansları
funclib refs action  # webhooks.*.tsx içindeki action'lar
```

---

#### 3. Liquid Pattern Tanıma

FuncLib Liquid dosyalarında şunları otomatik algılar:

| Pattern | Regex | Açıklama |
|---------|-------|----------|
| Snippet Render | `{% render 'name' %}` | Snippet çağrıları |
| Variables | `{{ variable }}` | Liquid değişkenleri |
| Assigns | `{% assign var = %}` | Değişken atamaları |
| Captures | `{% capture name %}` | Capture blokları |
| For Loops | `{% for item in %}` | Döngü değişkenleri |
| Schema | `{% schema %}` | Section şemaları |

**Kullanım:**
```bash
# Liquid dosyasındaki sembolleri gör
funclib file extensions/theme-extension/blocks/dtf-customizer.liquid

# Bir Liquid değişkeninin kullanımları
funclib refs product_image
```

---

#### 4. GraphQL Inline Algılama

TypeScript içindeki GraphQL sorguları otomatik parse edilir:

```typescript
// Bu pattern'lar algılanır:
const QUERY = `#graphql
  query GetProduct($id: ID!) {
    product(id: $id) { ... }
  }
`;

// veya
const mutation = gql`
  mutation UpdateProduct { ... }
`;
```

**Kullanım:**
```bash
# GraphQL operasyonlarını ara
funclib search GetProduct
funclib search mutation
```

---

#### 5. Remix Route Tracking

| Pattern | Açıklama |
|---------|----------|
| `app/routes/*.tsx` | Tüm route'lar |
| `loader` fonksiyonları | Otomatik extract |
| `action` fonksiyonları | Otomatik extract |
| Link bağlantıları | Cross-reference |

**Kullanım:**
```bash
# Route dosyasının sembollerini gör
funclib file app/routes/api.upload.intent.tsx

# Loader kullanımları
funclib refs loader

# Action kullanımları
funclib refs action
```

---

#### 6. Prisma Model Tracking

```prisma
model Upload { ... }
model Shop { ... }
model ExportJob { ... }
```

**Kullanım:**
```bash
# Prisma modellerini ara
funclib search Upload

# Bir modelin kullanım yerlerini bul
funclib refs Upload
funclib refs Shop
funclib refs ExportJob

# Schema dosyasını incele
funclib file prisma/schema.prisma
```

---

#### 7. API Endpoint Tracking

Konfigüre edilmiş API pattern'ları:

```
/api/upload/*
/api/v1/*
/api/gdpr/*
```

**Kullanım:**
```bash
# Upload API route'larını bul
funclib search api.upload

# V1 API endpointleri
funclib search api.v1

# GDPR handler'ları
funclib search gdpr
```

---

### Cross-Reference Özellikleri

FuncLib şu bağlantıları otomatik izler:

| Kaynak | Hedef | Açıklama |
|--------|-------|----------|
| Liquid | JavaScript | Asset referansları |
| Route | API | Internal API çağrıları |
| Webhook | Handler | Event → Function mapping |
| Prisma | Usage | Model → Query kullanımları |

---

### Shopify API Versiyonu

```json
"api": {
  "version": "2025-10",
  "type": "graphql"
}
```

> ⚠️ **Önemli:** Tüm Shopify API çağrıları `2025-10` versiyonu kullanmalıdır.
> Versiyon kontrolü için: `pnpm shopify:check`

---

## 🔗 Entegrasyon: shopify-check ile Birlikte Kullanım

```bash
# 1. Önce indeksle
funclib index

# 2. Shopify best practices kontrolü
pnpm shopify:check

# 3. Hatalı dosyaları incele
funclib file app/routes/problem-file.tsx

# 4. Değişiklik öncesi referansları kontrol et
funclib refs functionToFix

# 5. Düzelt ve tekrar kontrol et
pnpm shopify:check
```

---

*Bu kılavuz FuncLib v4 için hazırlanmıştır.*
*Proje: 3D Customizer - customizerapp.dev*
*Shopify API: 2025-10 | GraphQL Only*
