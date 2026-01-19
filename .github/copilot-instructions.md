# 3D Customizer – Project Rules & Fixed Principles (MASTER DOCUMENT)

> **Version:** 3.3.0  
> **Last Updated:** January 19, 2026  
> **Project:** 3D Customizer - DTF/Print Customizer Shopify App  
> **Domain:** customizerapp.dev

---

## 🔗 Repository & Access

### GitHub Repository
```
git@github.com:Growth-Sheriff/customizerapp.git
```

### Server SSH Access
```powershell
# Windows PowerShell
ssh -i $env:USERPROFILE\.ssh\id_ed25519_customizer_app root@5.78.136.98

# Linux/Mac
ssh -i ~/.ssh/id_ed25519_customizer_app root@5.78.136.98
```

### 3D Reference Repository
```
https://github.com/kt946/ai-threejs-products-app-yt-jsm
```

---

## 🔐 API Keys & Credentials (Test Environment)

### Shopify Dev Dashboard
```
Client ID: <SHOPIFY_CLIENT_ID>
Secret: <SHOPIFY_CLIENT_SECRET>
```

### Custom App
```
API Key: <SHOPIFY_API_KEY>
API Secret: <SHOPIFY_API_SECRET>
```

### Admin API
```
Access Token: <SHOPIFY_ADMIN_ACCESS_TOKEN>
```

### Storefront API
```
Token: <SHOPIFY_STOREFRONT_TOKEN>
```

### Application URLs
```
App URL: https://customizerapp.dev
Admin: https://customizerapp.dev/app
API: https://customizerapp.dev/api
Health: https://customizerapp.dev/health
```

---

## 🌍 Language & Localization

- i18n (multi-language) support enabled
- **All application content in English**
- **All responses to project owner in Turkish**
- Supported locales: `en` (default), `tr`, `de`, `es`

---

## 🔁 Development & Deployment Flow (NON-NEGOTIABLE)

```
LOCAL → GitHub → SERVER → BUILD / DEPLOY
```

### ❌ FORBIDDEN
- SCP / rsync / sftp / ftp
- Manual file transfer
- Direct server code editing
- Bypassing GitHub

### ✅ REQUIRED Workflow
```bash
# Local
pnpm dev && pnpm test && pnpm build

# Push
git push origin main

# Server
cd /var/www/3d-customizer
git pull origin main
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate:deploy
systemctl restart 3d-customizer
```

---

## 🖥️ Server & Infrastructure

| Item | Value |
|------|-------|
| OS | Ubuntu 24 LTS |
| Reverse Proxy | **Caddy** (auto SSL) |
| Node.js | 20 LTS |
| Package Manager | pnpm |
| Database | PostgreSQL 16 |
| Cache/Queue | Redis 7 |
| Storage | Cloudflare R2 (default) / S3 (option) |

### ❌ NGINX IS FORBIDDEN
```bash
systemctl stop nginx && systemctl disable nginx
apt-get remove --purge -y nginx nginx-common nginx-full
rm -rf /etc/nginx
```

---

## 🛍️ Shopify Integration Rules

| Rule | Value |
|------|-------|
| API Type | **GraphQL ONLY** |
| API Version | **2025-10** |
| REST API | ❌ FORBIDDEN |

### Webhooks
```
orders/create, orders/paid, orders/cancelled, orders/fulfilled
products/update, products/delete
app/uninstalled
customers/data_request (GDPR)
customers/redact (GDPR)
shop/redact (GDPR)
```

---

## 📦 Upload Rules

- Direct-to-storage via signed URLs
- Backend NEVER proxies files
- Default: Private access
- Download: Signed URLs (15 min expiry)
- Resumable upload for files > 5MB

---

## 🧩 3D Designer (Mod-1)

| Component | Technology |
|-----------|------------|
| 3D Engine | Three.js |
| React Integration | React Three Fiber |
| Helpers | @react-three/drei |
| State | Valtio / Zustand |

### Print Locations
- front, back, left_sleeve, right_sleeve

### Add to Cart Lock
- Location selected ✓
- File uploaded ✓
- No blocking errors ✓
- Approval checkbox checked ✓

---

## 🎨 UX Rules

### Step-Based Flow
```
LOCATION → UPLOAD → POSITION → CONFIRM
```

- Steps are locked (no skip)
- Visual feedback required after upload
- Validation badges: OK (green) / WARNING (yellow) / ERROR (red)
- Mobile 2D fallback; Desktop 3D 60fps

---

## 🧪 Coding Standards

- TypeScript strict mode
- Max 50 lines per function
- Explicit return types
- No implicit any
- Prisma tenant guard (shop_id scope)

---

## ✅ Absolute Red Lines

### ❌ FORBIDDEN
| Rule | Reason |
|------|--------|
| SCP | GitHub is single source |
| NGINX | Caddy only |
| REST API | GraphQL 2025-10 only |
| Backend file streaming | Direct-to-storage only |
| Skip approval step | UX requirement |
| Bare DB queries | Tenant isolation |
| **DELETE uploads/ folder** | Contains production files, NEVER delete |
| **DELETE /tmp/thumbnails/** | Thumbnails used by merchant panel |

### ✅ REQUIRED
| Rule | Implementation |
|------|----------------|
| GitHub deployment | LOCAL → GitHub → Server |
| Caddy | Auto SSL |
| Shopify GraphQL 2025-10 | All operations |
| Tenant isolation | shop_id in all queries |
| Direct-to-storage | Signed URLs |
| Step-locked UX | 4-step flow |

---

## 📁 Server Storage Rules

### KORUMA ALTINDA - ASLA SİLİNMEYECEK KLASÖRLER

| Klasör | Neden | İçerik |
|--------|-------|--------|
| `/var/www/fast-dtf-transfer/uploads/` | ❌ **ASLA SİLME** | Eski local uploads, fallback storage |
| `Bunny CDN` | ❌ **ASLA SİLME** | Müşteri dosyaları |

### SİLİNEBİLİR - Temp Dosyalar

| Klasör | Silinebilir | Koşul |
|--------|-------------|-------|
| `/tmp/preflight-*` | ✅ Evet | Job tamamlandıktan sonra |
| `/tmp/magick-*` | ✅ Evet | ImageMagick temp files |

### Thumbnail Stratejisi

Thumbnail'lar **Bunny CDN'de** saklanmalı (temp'de değil):
```
Bunny CDN/
├── uploads/           # Orijinal dosyalar
│   └── {shopId}/{uploadId}/original.psd
└── thumbnails/        # Thumbnail'lar (YENİ)
    └── {shopId}/{uploadId}/thumb.webp
```

**Neden Bunny'de?**
- Merchant panel'de gösterilecek
- Sipariş detaylarında görünecek
- Temp silince kaybolmasın

---

## � Visitor Identification Project - Safe Implementation Rules

> **Version:** 1.0.0  
> **Status:** Active Development  
> **Principle:** ADDITIVE ONLY - Mevcut sisteme ekleme, değişiklik değil

### 🎯 Project Scope

Visitor fingerprinting, attribution tracking ve analytics sistemi eklenmesi. **Mevcut upload, cart, webhook sistemlerine DOKUNMADAN** paralel çalışacak.

### 🛡️ KORUMA ALTINDA - DOKUNULMAZ DOSYALAR

Bu dosyalarda **HİÇBİR DEĞİŞİKLİK YAPILAMAZ** (import ekleme dahil):

| Dosya | Neden |
|-------|-------|
| `app/routes/api.upload.intent.tsx` | ❌ Upload flow kritik - DOKUNMA |
| `app/routes/api.upload.complete.tsx` | ❌ Upload completion kritik - DOKUNMA |
| `app/routes/webhooks.*.tsx` | ❌ Webhook handlers kritik - DOKUNMA |
| `extensions/theme-extension/assets/ul-cart.js` | ❌ Cart flow kritik - DOKUNMA |
| `extensions/theme-extension/assets/ul-upload.js` | ❌ Upload flow kritik - DOKUNMA |
| `app/lib/shopify.server.ts` | ❌ Auth flow kritik - DOKUNMA |
| `app/shopify.server.ts` | ❌ Shopify config kritik - DOKUNMA |

### ⚠️ DİKKATLİ DÜZENLEME - Sadece NULLABLE Alan Ekleme

Bu dosyalarda **SADECE nullable FK alanları** eklenebilir:

| Dosya | İzin Verilen |
|-------|-------------|
| `prisma/schema.prisma` → `Upload` model | `visitorId String? @map("visitor_id")` ✅ |
| `prisma/schema.prisma` → `Upload` model | `sessionId String? @map("session_id")` ✅ |
| `prisma/schema.prisma` → Yeni modeller | `Visitor`, `VisitorSession` tabloları ✅ |

### ✅ SERBEST ALAN - Yeni Dosyalar

Bu dosyalar **serbestçe oluşturulabilir**:

```
# Theme Extension - YENİ JS dosyaları
extensions/theme-extension/assets/ul-fingerprint.js    ✅ YENİ
extensions/theme-extension/assets/ul-attribution.js   ✅ YENİ  
extensions/theme-extension/assets/ul-consent.js       ✅ YENİ
extensions/theme-extension/assets/ul-visitor.js       ✅ YENİ

# Backend - YENİ API endpoint'ler
app/routes/api.v1.visitors.tsx                        ✅ YENİ
app/routes/api.v1.visitors.$id.tsx                    ✅ YENİ
app/routes/api.v1.sessions.tsx                        ✅ YENİ
app/routes/api.v1.analytics.tsx                       ✅ YENİ

# Backend - YENİ lib dosyaları
app/lib/visitor.server.ts                             ✅ YENİ
app/lib/fingerprint.server.ts                         ✅ YENİ
app/lib/attribution.server.ts                         ✅ YENİ
app/lib/geo.server.ts                                 ✅ YENİ

# Admin Dashboard - YENİ route'lar
app/routes/app.analytics.visitors.tsx                 ✅ YENİ
app/routes/app.analytics.attribution.tsx              ✅ YENİ
```

### 🔴 MUTLAK YASAKLAR

| Yasak | Neden |
|-------|-------|
| ❌ Upload intent/complete logic değiştirme | Mevcut flow bozulur |
| ❌ Webhook handler logic değiştirme | Sipariş akışı bozulur |
| ❌ Cart JS logic değiştirme | Add to cart bozulur |
| ❌ NOT NULL constraint ekleme | Mevcut veriler bozulur |
| ❌ Mevcut tablo kolonlarını silme | Veri kaybı |
| ❌ Mevcut API response formatını değiştirme | Client uyumsuzluk |
| ❌ ul-analytics.js'in mevcut track fonksiyonunu değiştirme | Analytics bozulur |

### ✅ GÜVENLİ EKLEME KURALLARI

1. **Prisma Migration:**
   ```prisma
   // ✅ DOĞRU - Nullable FK
   model Upload {
     visitorId String? @map("visitor_id")
     visitor   Visitor? @relation(fields: [visitorId], references: [id])
   }
   
   // ❌ YANLIŞ - NOT NULL
   model Upload {
     visitorId String @map("visitor_id")  // YASAK!
   }
   ```

2. **JS Entegrasyonu:**
   ```javascript
   // ✅ DOĞRU - Yeni dosyada, window objesine ekleme
   // ul-visitor.js (YENİ DOSYA)
   window.ULVisitor = { ... };
   
   // ❌ YANLIŞ - Mevcut dosyayı değiştirme
   // ul-analytics.js içinde değişiklik YASAK
   ```

3. **API Entegrasyonu:**
   ```typescript
   // ✅ DOĞRU - Yeni endpoint
   // api.v1.visitors.tsx (YENİ DOSYA)
   export async function action({ request }) { ... }
   
   // ❌ YANLIŞ - Mevcut endpoint'e ekleme
   // api.upload.intent.tsx'e kod ekleme YASAK
   ```

### 📊 Test Kriterleri

Her değişiklik sonrası bu testler PASS olmalı:

| Test | Komut | Beklenen |
|------|-------|----------|
| Upload intent | `curl POST /api/upload/intent` | 200 + uploadId |
| Upload complete | `curl POST /api/upload/complete` | 200 + success |
| Cart add | Storefront'ta sepete ekle | Başarılı |
| Webhook receive | Shopify'dan test webhook | 200 |
| Mevcut upload'lar | DB'de eski upload'lar | visitorId=null, çalışıyor |

### 🔄 Entegrasyon Stratejisi

```
FAZ 1: Database + Yeni API'lar (mevcut sisteme 0 etki)
       └─ Visitor, VisitorSession tabloları
       └─ api.v1.visitors.tsx endpoint'leri
       └─ Upload tablosuna nullable FK'lar

FAZ 2: Client-Side JS (mevcut JS'lere 0 etki)
       └─ ul-fingerprint.js (YENİ)
       └─ ul-attribution.js (YENİ)
       └─ ul-consent.js (YENİ)

FAZ 3: Backend Services (mevcut servislerden BAĞIMSIZ)
       └─ visitor.server.ts (YENİ)
       └─ geo.server.ts (YENİ)

FAZ 4: Dashboard (mevcut dashboard'a YENİ route'lar)
       └─ app.analytics.visitors.tsx (YENİ)
       └─ app.analytics.attribution.tsx (YENİ)
```

### ⚡ Rollback Planı

Sorun çıkarsa:
1. Yeni JS dosyalarını theme'den kaldır
2. Yeni API route'ları sil
3. Migration rollback (sadece yeni tablolar silinir)
4. **Mevcut sistem ETKİLENMEZ**

---

## �️ Multi-Storage Implementasyonu - BEYİN CERRAHİSİ KURALLARI

> **Version:** 1.0.0  
> **Status:** ACTIVE SURGERY  
> **Principle:** MARKDOWN DOKÜMANA %100 SADIK KAL - ASLA SAPMA YOK

### 🎯 Operasyon Kapsamı

3 farklı storage provider desteği eklenmesi:
- **Bunny.net** (PRIMARY) - CDN tabanlı, hızlı, ucuz
- **Local** (FALLBACK) - Sunucu filesystem
- **R2** (OPTIONAL) - Cloudflare S3-uyumlu

### ⚠️ MUTLAK OPERASYON KURALLARI

Bu kurallar **BEYİN CERRAHİSİ** hassasiyetinde uygulanacaktır:

| Kural | Açıklama | Ceza |
|-------|----------|------|
| **ASLA KISALTMA** | Kod bloklarını `...` ile kısaltma | ❌ OPERASYON İPTAL |
| **ASLA ATLAMA** | Hiçbir dosya/satır atlanamaz | ❌ OPERASYON İPTAL |
| **ASLA EKSİLTME** | Dokümandaki her satır uygulanmalı | ❌ OPERASYON İPTAL |
| **ASLA DURAKSAMA** | Yarıda bırakma yok | ❌ OPERASYON İPTAL |
| **ASLA STATİK KOD** | Hardcoded değer yasak | ❌ OPERASYON İPTAL |
| **MARKDOWN'A SADIK KAL** | MULTI_STORAGE_IMPLEMENTATION.md referans | ❌ OPERASYON İPTAL |

### 📋 REFERANS DOKÜMAN

**MULTI_STORAGE_IMPLEMENTATION.md** dosyası tek kaynak (single source of truth):
- FAZ 1-8 tüm değişiklikleri içerir
- Her kod bloğu TAMAMEN kopyalanmalı
- Satır numaraları ve dosya yolları kesin

### 🔴 YASAKLAR - ASLA YAPILMAYACAKLAR

```
❌ // ... existing code ...     → YASAK! Tam kod yazılacak
❌ // ... rest of file ...      → YASAK! Tam kod yazılacak  
❌ // implementation here       → YASAK! Tam implementasyon
❌ /* omitted for brevity */    → YASAK! Hiçbir şey atlanmaz
❌ // TODO: implement           → YASAK! Şimdi implement et
❌ // similar to above          → YASAK! Her şey explicit
❌ Yarım bırakıp "devam?" demek → YASAK! Bitene kadar devam
❌ "Geri kalan aynı" demek      → YASAK! Her satır yazılacak
```

### ✅ ZORUNLU DAVRANIŞLAR

```
✅ Her fonksiyon TAMAMEN yazılacak
✅ Her import EXPLICIT olacak
✅ Her config değeri ENV'den gelecek
✅ Her hata DETAYLI loglanacak
✅ Her dosya BAŞTAN SONA yazılacak
✅ Markdown'daki kod bloğu BİREBİR kopyalanacak
✅ Hiçbir satır atlanmayacak, kısaltılmayacak
✅ İşlem bitene kadar durmak yok
```

### 📁 DEĞİŞECEK DOSYALAR (TAM LİSTE)

**FAZ 1: Core Library**
| Dosya | Eylem | Satır |
|-------|-------|-------|
| `app/lib/storage.server.ts` | REWRITE | ~350 |

**FAZ 2-6: API Routes**
| Dosya | Eylem | Satır |
|-------|-------|-------|
| `app/routes/api.upload.intent.tsx` | UPDATE | ~50 |
| `app/routes/api.upload.complete.tsx` | UPDATE | ~30 |
| `app/routes/api.upload.status.$id.tsx` | UPDATE | ~40 |

**FAZ 4: Theme Extension**
| Dosya | Eylem | Satır |
|-------|-------|-------|
| `extensions/theme-extension/assets/dtf-uploader.js` | UPDATE | ~60 |
| `extensions/theme-extension/assets/tshirt-modal.js` | UPDATE | ~60 |
| `extensions/theme-extension/assets/product-bar-upload.js` | UPDATE | ~60 |
| `extensions/theme-extension/assets/carousel-upload.js` | UPDATE | ~60 |
| `theme-snippets/snippets/dtf-quick-upload-btn.liquid` | UPDATE | ~60 |

**FAZ 5: Environment**
| Dosya | Eylem | Satır |
|-------|-------|-------|
| `.env` | ADD | ~10 |
| `.env.example` | ADD | ~10 |

**FAZ 7: Migration**
| Dosya | Eylem | Satır |
|-------|-------|-------|
| `scripts/migrate-to-bunny.ts` | CREATE | ~150 |

**FAZ 8: FuncLib Discovered (CRITICAL)**
| Dosya | Eylem | Satır |
|-------|-------|-------|
| `workers/preflight.worker.ts` | UPDATE | ~80 |
| `workers/export.worker.ts` | UPDATE | ~60 |
| `app/routes/app.uploads._index.tsx` | UPDATE | ~15 |
| `app/routes/app.uploads.$id.tsx` | UPDATE | ~15 |
| `app/routes/app.queue.tsx` | UPDATE | ~15 |
| `app/routes/app.asset-sets._index.tsx` | UPDATE | ~15 |
| `app/routes/app.asset-sets.$id.tsx` | UPDATE | ~15 |
| `app/routes/api.v1.exports.$id.tsx` | UPDATE | ~15 |
| `app/routes/api.asset-sets.$id.tsx` | UPDATE | ~15 |
| `app/routes/api.gdpr.shop.redact.tsx` | UPDATE | ~15 |
| `app/routes/api.files.$.tsx` | UPDATE | ~30 |
| `app/routes/api.upload.file.$id.tsx` | UPDATE | ~30 |
| `app/routes/api.storage.preview.$.tsx` | UPDATE | ~30 |

**TOPLAM:** ~24 dosya, ~1110 satır değişiklik

### 🔒 Bunny.net Credentials

```env
BUNNY_STORAGE_ZONE=customizerappdev
BUNNY_API_KEY=28f55d96-a471-431c-b9bfa4d25247-3d0d-47e6
BUNNY_CDN_URL=https://customizerappdev.b-cdn.net
BUNNY_STORAGE_URL=https://storage.bunnycdn.com
```

### 📊 Storage Provider Seçimi

```typescript
// Database'den okunacak - HARDCODE YASAK
const provider = shop.storageProvider; // 'bunny' | 'local' | 'r2'
```

### 🧪 Test Kriterleri

Her FAZ sonrası bu testler PASS olmalı:

| Test | Komut | Beklenen |
|------|-------|----------|
| Bunny Upload | `curl PUT bunny-url` | 201 |
| Bunny Download | `curl GET cdn-url` | 200 + file |
| Local Fallback | Bunny down iken | Local'a yaz |
| 5GB Upload | Büyük dosya | Timeout yok |
| Thumbnail | Bunny Optimizer | WebP dönsün |

### 🔄 Operasyon Sırası

```
1. MULTI_STORAGE_IMPLEMENTATION.md oku (REFERANS)
2. FAZ 1: storage.server.ts TAMAMEN yeniden yaz
3. FAZ 2: api.upload.intent.tsx güncelle
4. FAZ 3: api.upload.status.$id.tsx güncelle
5. FAZ 4: Theme JS dosyaları (5 adet) güncelle
6. FAZ 5: .env değişkenleri ekle
7. FAZ 6: api.upload.complete.tsx güncelle
8. FAZ 7: Migration script oluştur
9. FAZ 8: FuncLib discovered dosyalar (13 adet) güncelle
10. TEST: Tüm akışları doğrula
```

### ⚡ Hata Durumunda

Herhangi bir hata olursa:
1. **DURMA** - Devam et, hatayı logla
2. **ROLLBACK YOK** - İleri git
3. **MARKDOWN'A DÖN** - Referansa bak
4. **TAM KOD YAZ** - Kısaltma yok

### 📝 Kod Yazım Standartları

```typescript
// ✅ DOĞRU - Tam fonksiyon
export async function uploadToBunny(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<BunnyUploadResult> {
  const url = `${BUNNY_STORAGE_URL}/${BUNNY_STORAGE_ZONE}/${key}`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'AccessKey': BUNNY_API_KEY,
      'Content-Type': contentType,
    },
    body: buffer,
  });
  
  if (!response.ok) {
    throw new Error(`Bunny upload failed: ${response.status}`);
  }
  
  return {
    success: true,
    cdnUrl: `${BUNNY_CDN_URL}/${key}`,
    storageUrl: url,
  };
}

// ❌ YANLIŞ - Kısaltılmış
export async function uploadToBunny(buffer, key, contentType) {
  // ... implementation
}
```

### 🎯 Başarı Kriteri

Operasyon BAŞARILI sayılır eğer:
1. ✅ Tüm 24 dosya güncellenmiş
2. ✅ ~1110 satır kod yazılmış
3. ✅ Hiçbir kısaltma/atlama yok
4. ✅ Tüm testler geçiyor
5. ✅ Build başarılı
6. ✅ Upload akışı çalışıyor

---

## �📌 Final Note

This document is **binding** for all development, deployment, and AI assistance.

Any implementation violating these rules must be **rejected immediately**.

---

*Version: 3.3.0 | Domain: customizerapp.dev | App: 3D Customizer*
*Visitor Identification Rules: v1.0.0 | Status: Active*
*Multi-Storage Implementation: v1.0.0 | Status: ACTIVE SURGERY*


# 📚 FuncLib v4 - Kullanım Kılavuzu

> **Tree-sitter tabanlı evrensel kod analiz aracı**
> 
> Güncellenme: Ocak 2026

---

## 📋 İçindekiler

1. [Hızlı Başlangıç](#-hızlı-başlangıç)
2. [CLI Kullanımı](#-cli-kullanımı)
3. [REST API](#-rest-api)
4. [MCP Server (AI Entegrasyonu)](#-mcp-server)
5. [Copilot Instructions](#-copilot-instructions)
6. [Desteklenen Diller](#-desteklenen-diller)
7. [Konfigürasyon](#️-konfigürasyon)

---

## 🚀 Hızlı Başlangıç

### Kurulum

```bash
# Clone & Install
git clone https://github.com/Growth-Sheriff/funclip.git funclib
cd funclib
npm install
npm run build

# Global CLI (opsiyonel)
npm link
```

### İlk Kullanım

```bash
# 1. Projeyi indeksle
cd /path/to/your-project
funclib index

# 2. Sembol ara
funclib search handleSubmit

# 3. Referansları bul (EN ÖNEMLİ!)
funclib refs useEditorStore
```

---

## 💻 CLI Kullanımı

### Temel Komutlar

| Komut | Açıklama | Örnek |
|-------|----------|-------|
| `index` | Projeyi indeksle | `funclib index` |
| `search <query>` | Sembol ara | `funclib search handleClick` |
| `refs <name>` | Referansları bul | `funclib refs fetchData` |
| `symbol <name>` | Sembol detayı | `funclib symbol UserService` |
| `file <path>` | Dosyadaki sembolleri listele | `funclib file src/utils.ts` |
| `stats` | İndeks istatistikleri | `funclib stats` |
| `serve` | REST API başlat | `funclib serve` |

### Opsiyonlar

```bash
# Proje yolu belirt
funclib search handleSubmit --project /path/to/project

# Sembol tipine göre filtrele
funclib search User --kind class
funclib search handle --kind function

# Sonuç limiti
funclib search api --limit 10

# JSON çıktı
funclib refs fetchData --json
```

### Örnek Kullanımlar

```bash
# 1. Proje indeksle
funclib index
# ✓ Indexed in 1234ms
#   Files: 156
#   Symbols: 2340
#   References: 8920

# 2. Fonksiyon ara
funclib search handleSubmit
# Search: "handleSubmit" (3 results)
#   handleSubmit (function)
#     src/components/Form.tsx:45
#   handleSubmitForm (method)
#     src/services/formService.ts:23

# 3. Referansları bul (⚠️ DEĞİŞİKLİK ÖNCE ZORUNLU!)
funclib refs useEditorStore
# References for: useEditorStore
# Definitions (1):
#   src/stores/editorStore.ts:15
# References (12):
#   src/components/Editor.vue:34
#   src/pages/editor/index.vue:67
#   ...
```

---

## 🌐 REST API

### Sunucuyu Başlat

```bash
# Varsayılan port: 3456
funclib serve

# Veya özel port/proje
FUNCLIB_PROJECT=/path/to/project PORT=3456 npm run serve
```

### Endpoint'ler

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/` | API bilgisi |
| `GET` | `/health` | Sağlık kontrolü |
| `POST` | `/index` | Projeyi indeksle |
| `POST` | `/index/file` | Tek dosya indeksle |
| `GET` | `/search?q=...` | Sembol ara |
| `GET` | `/refs/:name` | Referansları bul |
| `GET` | `/symbol/:name` | Sembol detayı |
| `GET` | `/file/:path` | Dosyadaki semboller |
| `GET` | `/stats` | İstatistikler |
| `GET` | `/graph` | Call graph |

### Örnek İstekler

```bash
# Projeyi indeksle
curl -X POST http://localhost:3456/index

# Sembol ara
curl "http://localhost:3456/search?q=handleSubmit&kind=function&limit=10"

# Referansları bul (⚠️ EN ÖNEMLİ!)
curl "http://localhost:3456/refs/useEditorStore"

# Sembol detayı
curl "http://localhost:3456/symbol/IndexManager"

# Dosyadaki semboller
curl "http://localhost:3456/file/src%2Fserver.ts"

# İstatistikler
curl "http://localhost:3456/stats"
```

### Yanıt Formatları

```json
// GET /search?q=handleSubmit
{
  "query": "handleSubmit",
  "count": 3,
  "results": [
    {
      "symbol": {
        "name": "handleSubmit",
        "kind": "function",
        "file": "src/components/Form.tsx",
        "range": { "start": { "line": 45, "column": 0 }, "end": { "line": 52, "column": 1 } }
      },
      "score": 100
    }
  ]
}

// GET /refs/useEditorStore
{
  "name": "useEditorStore",
  "definitions": [
    { "file": "src/stores/editorStore.ts", "line": 15, "kind": "function" }
  ],
  "references": [
    { "file": "src/components/Editor.vue", "line": 34 },
    { "file": "src/pages/editor/index.vue", "line": 67 }
  ],
  "definitionCount": 1,
  "referenceCount": 12
}
```

---

## 🤖 MCP Server

### MCP Nedir?

Model Context Protocol - AI asistanlarının (Claude, Copilot) external tool'ları kullanmasını sağlayan protokol.

### Sunucuyu Başlat

```bash
# Varsayılan port: 3457
npm run mcp

# Veya
MCP_PORT=3457 FUNCLIB_PROJECT=/path/to/project node dist/mcp.js
```

### Mevcut Tool'lar

| Tool | Açıklama |
|------|----------|
| `search_symbols` | Sembol ara |
| `find_references` | Referansları bul (⚠️ KRİTİK) |
| `get_symbol` | Sembol detayı |
| `list_symbols_in_file` | Dosyadaki semboller |
| `index_project` | Projeyi indeksle |
| `get_stats` | İstatistikler |

### Claude Desktop / VS Code Konfigürasyonu

```json
// claude_desktop_config.json veya settings.json
{
  "mcpServers": {
    "funclib": {
      "url": "http://localhost:3457"
    }
  }
}
```

### Tool Kullanım Örnekleri

```json
// search_symbols
{
  "name": "search_symbols",
  "arguments": {
    "query": "handleSubmit",
    "kind": "function",
    "limit": 10
  }
}

// find_references (⚠️ HER DEĞİŞİKLİKTEN ÖNCE!)
{
  "name": "find_references",
  "arguments": {
    "name": "useEditorStore"
  }
}

// get_symbol
{
  "name": "get_symbol",
  "arguments": {
    "name": "IndexManager"
  }
}

// list_symbols_in_file
{
  "name": "list_symbols_in_file",
  "arguments": {
    "file": "src/server.ts"
  }
}

// index_project
{
  "name": "index_project",
  "arguments": {
    "incremental": true
  }
}
```

---

## 📝 Copilot Instructions

Projenize `.github/copilot-instructions.md` ekleyin:

```markdown
# Copilot Instructions - FuncLib

## ⚠️ KRİTİK KURAL

**Bir fonksiyonu/method'u değiştirmeden ÖNCE mutlaka `find_references` kullan!**

## MCP Tool Kullanımı

### 1. search_symbols
Sembolleri ara (fonksiyon, class, method, vb.)

### 2. find_references ⚠️ EN ÖNEMLİ
Bir sembolün TÜM kullanım yerlerini bul

### 3. get_symbol
Sembol detaylarını getir

### 4. list_symbols_in_file
Dosyadaki tüm sembolleri listele

### 5. index_project
Projeyi yeniden indeksle

## Düzeltme Workflow'u

### DOĞRU ✅
1. `find_references` ile tüm kullanımları bul
2. Kaç yerde kullanıldığını not et
3. Fonksiyon tanımını değiştir
4. TÜM kullanım yerlerini güncelle
5. Tekrar `find_references` ile kontrol et

### YANLIŞ ❌
1. Sadece fonksiyon tanımını değiştir
2. Çağrı yerlerini unutmak
3. Build hatası!
```

---

## 🌍 Desteklenen Diller

| Dil | Uzantılar | Symbol Türleri |
|-----|-----------|----------------|
| **JavaScript** | `.js`, `.mjs`, `.cjs` | function, class, variable, const |
| **TypeScript** | `.ts`, `.tsx` | function, class, interface, type, enum |
| **Python** | `.py` | function, class, method, variable |
| **Vue** | `.vue` | component, composable, emit |
| **Go** | `.go` | func, struct, interface |
| **Rust** | `.rs` | fn, struct, impl, trait |
| **Java** | `.java` | class, interface, method |
| **Kotlin** | `.kt` | class, fun, object |
| **C#** | `.cs` | class, interface, method |
| **C/C++** | `.c`, `.cpp`, `.h` | function, struct, class |
| **PHP** | `.php` | function, class, method |
| **Ruby** | `.rb` | def, class, module |
| **Swift** | `.swift` | func, class, struct |
| **Dart** | `.dart` | class, function, mixin |

---

## ⚙️ Konfigürasyon

### Index Konumu

```
your-project/
├── .funclib/
│   └── index.json    # Otomatik oluşturulur
├── src/
└── ...
```

### Exclude Patterns

Varsayılan olarak şunlar hariç tutulur:
- `node_modules`
- `dist`, `build`, `out`
- `.git`
- `coverage`
- `vendor`
- `__pycache__`
- `.next`, `.nuxt`

### Environment Variables

| Variable | Default | Açıklama |
|----------|---------|----------|
| `FUNCLIB_PROJECT` | `cwd` | Proje yolu |
| `PORT` | `3456` | REST API portu |
| `MCP_PORT` | `3457` | MCP Server portu |

---

## 🔧 Troubleshooting

### Index Yenileme

```bash
# Incremental (sadece değişenler)
funclib index

# Full rebuild (tümünü)
rm -rf .funclib && funclib index
```

### Tree-sitter Hataları

```bash
# Parser'ı yeniden kur
npm rebuild web-tree-sitter
npm rebuild tree-sitter-wasms
```

### Port Çakışması

```bash
# Farklı port kullan
PORT=3460 funclib serve
MCP_PORT=3461 npm run mcp
```

---

## 📊 Performans

| Metrik | Değer |
|--------|-------|
| İndeksleme Hızı | ~1000 dosya/saniye |
| Arama Hızı | < 10ms |
| Referans Bulma | < 50ms |
| Bellek Kullanımı | ~100MB / 10K sembol |

---

## 🔗 Linkler

- **GitHub**: https://github.com/Growth-Sheriff/funclip
- **REST API**: http://localhost:3456
- **MCP Server**: http://localhost:3457

---

## 📜 Changelog

### v4.0.0
- Tree-sitter tabanlı yeni parser
- MCP Server desteği
- Call graph analizi
- 30+ dil desteği
- Incremental indexing
- Fuzzy search

---

> **Önemli Hatırlatma**: Herhangi bir fonksiyon/method/class değişikliği yapmadan önce **mutlaka** `find_references` kullanın!
