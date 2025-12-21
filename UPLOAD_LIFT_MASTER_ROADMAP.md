# 🚀 UPLOAD LIFT PRO — MASTER ROADMAP (v3.1.0)

**Tarih:** 21 Aralık 2025  \
**API:** Shopify GraphQL 2025-10  \
**App Tipi:** Custom (Public-ready altyapı)  \
**Tenant Modeli:** Shop domain izolasyonlu multi-tenant  \
**Varsayılan Storage:** Cloudflare R2 (merchant panelinden R2/S3 seçilebilir)

---

## 🎯 Kısa Öz (TL;DR)
- **Hedef:** DTF/özel baskıda hatayı %95 azaltan, 3D/2D canlı önizleme + akıllı preflight + üretim kuyruğu sunan Shopify customizer.  
- **Tenant izolasyonu:** Tüm DB/queue/storage erişimi `shop_id`/`shop_domain` ile scope edilir; bare sorgu yasak.  
- **Public-ready:** OAuth, billing, GDPR, rate limit, Flow triggers hazır; custom app bugün, public yarın.  
- **Storage:** Default R2 (egress free); merchant panelinden S3/R2 seçimi, test connection.  
- **MVP (Faz 0–3):** OAuth, upload intent, preflight (PDF/AI/EPS), 3D/2D preview, cart attach, order metafield, mobile fallback.  

---

## 📑 İçindekiler
1. [Vizyon & İlkeler](#1-vizyon--ilkeler)  
2. [Modlar & Kullanım Senaryoları](#2-modlar--kullanım-senaryoları)  
3. [Tenant/Shop İzolasyonu](#3-tenantshop-izolasyonu)  
4. [Mimari & Veri Modeli](#4-mimari--veri-modeli)  
5. [Faz Planı (0–6)](#5-faz-planı-06)  
6. [Ürün & UX Akışları](#6-ürün--ux-akışları)  
7. [Pricing & Paketler](#7-pricing--paketler)  
8. [Güvenlik, Rate Limit, GDPR](#8-güvenlik-rate-limit-gdpr)  
9. [Test & Kalite](#9-test--kalite)  
10. [Monitoring, DR, Backup](#10-monitoring-dr-backup)  
11. [Tamamlanma Kriterleri & KPI’lar](#11-tamamlanma-kriterleri--kpilar)  
12. [Repo Yapısı](#12-repo-yapısı)
13. [Timeline & MVP Scope](#13-timeline--mvp-scope)
14. [Faz Bazlı Uygulama Checklist (Buton/UI/DB/Queue Detaylı)](#14-faz-bazlı-uygulama-checklist-butonui-dbqueue-detaylı)

---

## 1. Vizyon & İlkeler
- **Misyon:** Baskı hatalarını düşüren, müşteri UX’ini premium seviyeye taşıyan, 3D/2D önizleme + akıllı preflight + üretim kuyruğu ile uçtan uca çözüm.  
- **İlkeler:**
  - Tenant izolasyonu (shop domain) ihlal edilemez.  
  - Public-ready: OAuth, billing, GDPR, rate limit hep açık.  
  - Performans: Mobile’da hızlı yükleme, desktop’ta 60fps 3D.  
  - Observability: Log + metric + alert zorunlu.  
  - Extensibility: Storage/AI/queue sağlayıcıları kolay değiştirilebilir.

---

## 2. Modlar & Kullanım Senaryoları
| Mod | Açıklama | Kullanım | UI Teknoloji |
|-----|----------|----------|--------------|
| **Mod-1: 3D Designer** | Gerçek zamanlı 3D, multi-location, transform | Premium UX | React + R3F (lazy bundle) |
| **Mod-2: Classic Upload** | Boyut seç → yükle → doğrula → sepete | Hızlı B2B | Vanilla JS + Lit |
| **Mod-3: Quick Upload** | Collection grid’de tek tık upload | Tekrar müşteriler | Vanilla JS + Lit |

---

## 2.1 Kullanıcı / Merchant Yaşam Döngüsü

**End Customer Journey**
```
DISCOVERY → CONFIGURATION → VALIDATION → CART → CHECKOUT → POST-PURCHASE
    │            │              │          │        │           │
    ▼            ▼              ▼          ▼        ▼           ▼
 Ürüne gel   Mod seç +     Preflight   Line item  Order     Reorder +
             Upload +      OK/WARN/    property   metafield Design
             Preview       BLOCK       attach     attach    Library
```

**Mod Akış Detayları:**
- Mod-1: Lokasyon seç (Front/Back/Sleeves) → Dosya yükle → 3D gör → Transform → Onay + Sepet.
- Mod-2: Preset/custom size → Yükle → 2D preview → Validation sonucu → Sepet.
- Mod-3: Grid’de Upload → Dosya seç → Auto-size/last-used → Sepet.

**Merchant Lifecycle**
```
ONBOARDING → CONFIGURATION → DAILY OPS → ORDER PROCESSING → ANALYTICS
     │             │              │              │              │
     ▼             ▼              ▼              ▼              ▼
  Install +    Product      Uploads       Production      Success
  Setup        settings     dashboard     queue           metrics
  wizard       per mode     approve/      export/
               assign       reject        fulfill
```

---

## 3. Tenant/Shop İzolasyonu
- **Scope:** Tüm DB sorguları `shop_id` şartlı; ORM policy (middleware) ile enforce.  
- **Session:** Signed, HTTP-only cookie; shop domain scope; App Bridge session eşleşmesi.  
- **Storage:** Path: `{shop_domain}/{env}/{upload_id}/{item_id}`; bucket/prefix merchant bazlı.  
- **Config UI:** Merchant storage seçer (R2/S3), bucket/prefix/key/region girer, “Test connection” butonu.  
- **Queue:** Job payload daima `shop_id`; worker başında guard.  
- **Public-ready:** OAuth, billing, GDPR, uninstall cleanup; Flow triggers.

### 3.1 Shopify Entegrasyon Stratejisi
- **API’ler:** Admin GraphQL 2025-10 (product/order metafields, webhooks), Storefront API 2025-10 (cart), App Bridge (embedded), Theme App Extension (blocks), Checkout Extension (opsiyonel Plus).
- **Metafield Şemaları:**
  - Product (`upload_lift/config`): mode, enabled, assetSetId, printLocations, uploadPolicy (maxSizeMB, minDPI, allowedFormats).
  - Order (`upload_lift/designs`): uploadId, items[{location, originalFile, previewUrl, transform}], preflightStatus, totalDesigns.
  - Customer (`upload_lift/design_library`): savedDesigns[{id,name,thumbnailUrl,createdAt}].
- **Webhook Listesi (tam):** orders/create, orders/paid, orders/cancelled, orders/fulfilled, products/update, products/delete, app/uninstalled, customers/data_request (GDPR), customers/redact (GDPR), shop/redact (GDPR).
- **Theme Blocks:** 3d-designer.liquid, classic-upload.liquid, quick-upload-grid.liquid, cart-preview.liquid, order-design-view.liquid; assets: upload-lift-core.js, upload-lift-3d.js, upload-lift-ui.css.

---

## 4. Mimari & Veri Modeli

### 4.1 Stack
- **Admin:** Remix + Polaris (embedded)  
- **Storefront:** Lit (core), React+R3F (3D bundle, code-split)  
- **Backend:** Node.js + TypeScript + Express/Remix server  
- **ORM/DB:** Prisma + PostgreSQL (JSONB, tenant scoped)  
- **Queue:** Redis + BullMQ (preflight, convert, export, webhook retry)  
- **Storage:** Cloudflare R2 (default) / S3 (opsiyon)  
- **Proxy:** Caddy (auto-SSL)  
- **CI/CD:** GitHub Actions (lint/test/build/deploy)  

### 4.2 Veri Modeli (özet)
- `shops`: shop_domain, access_token, plan, storage_config_json, settings_json, billing_status.  
- `products_config`: shop_id, product_id, mode, enabled, asset_set_id, policy_overrides_json.  
- `asset_sets`: shop_id, schema_json (printLocations, camera, render preset), status.  
- `uploads`: shop_id, product_id, variant_id, mode, status, customer_id, preflight_summary_json.  
- `upload_items`: upload_id, location, storage_key, preview_key, thumbnail_key, transform_json, preflight_status/result.  
- `orders_link`: shop_id, order_id, upload_id, line_item_id.  
- `export_jobs`: shop_id, upload_ids, status, download_url, expires_at.  
- `audit_logs`: shop_id, user_id, action, resource_type, metadata_json.  

### 4.3 Storage Politikası
- Varsayılan R2; merchant S3 seçebilir.  
- Signed URL süreleri: upload 15 dk; preview 1 saat; admin download 24 saat.  
- Max dosya boyutu (plan bazlı): Free 25MB, Starter 50MB, Pro+ 150MB.  
- İçerik tipi doğrulama: MIME + sihirli byte.

### 4.4 Queue & Worker
- **Jobs:** preflight, convert (PDF/AI/EPS→PNG 300 DPI), thumbnail (WebP), export ZIP, webhook retry.  
- **Retry:** 3 deneme, exponential backoff, DLQ.  
- **Isolation:** Her job’da `shop_id`; worker başında scope guard.  

### 4.5 Caching & CDN
- Thumbnails/preview cacheable; API no-store.  
- R2 CDN; S3 için CloudFront opsiyonel.  

### 4.6 Status Enum’ları
- **Upload Status:** `draft | uploaded | processing | needs_review | approved | rejected | blocked | printed | archived`
- **Preflight Status:** `pending | ok | warning | error`
- **Export Status:** `pending | processing | completed | failed | expired`

---

## 5. Faz Planı (0–6)
Her fazda: Hedefler, Görevler, Deliverable, Acceptance, Risk & Mitigation.

### Faz 0 — Altyapı & Public Hazırlık (1 Hafta)
- **Hedef:** Güvenli temel, deploy pipeline, tenant-guarded iskelet.  
- **Görevler:**
  - Caddy HTTPS; systemd service; health/status endpoint.  
  - Postgres + Redis kurulum; prisma init; node 20 LTS; pnpm.  
  - Repo iskeleti: admin (Remix), extensions (theme), workers, prisma, docs.  
  - GitHub Actions: lint+test+build+deploy (ssh/rsync).  
  - ORM middleware: tüm sorgularda shop scope zorunlu.  
- **Deliverable:** Çalışan health 200; DB/Redis bağlı; deploy akıyor.  
- **Acceptance:** Caddy HTTPS up; `GET /health` 200; `pnpm test` yeşil; git push→deploy çalışır.  
- **Risk:** SSL/perm; Mitigation: Caddy auto-SSL, systemd env.

### Faz 1 — Core Upload Engine (2-3 Hafta)
- **Hedef:** OAuth, storage intent, upload akışı, cart attach, temel dashboard.  
- **Görevler:**
  - Shopify OAuth (embedded), uninstall webhook cleanup.  
  - Storage intent API (R2 default, S3 opsiyon); signed URL üretimi.  
  - Upload state machine (idle→uploading→processing→ready/warn/error).  
  - Cart line item properties + order metafield temel şema.  
  - Merchant dashboard: uploads list (basic).  
- **Deliverable:** Direct-to-storage upload, status polling, cart properties yazılır.  
- **Acceptance:** OAuth başarılı; uninstall çalışır; upload + complete → DB kayıt; cart properties görülür; dashboard listeler.  
- **Risk:** CORS/storage; Mitigation: presigned URL doğrulama, origin allowlist.

### Faz 2 — Advanced Validation Pipeline (2-3 Hafta)
- **Hedef:** Preflight full; PDF/AI/EPS conversion; continue-with-warnings.  
- **Görevler:**
  - Kontroller: format, size, DPI, dimensions, transparency, color profile, page count.  
  - Converter: PDF/AI/EPS→PNG (300 DPI), thumbnail WebP.  
  - Worker DLQ + retry; job metrics.  
  - UI: Warn/Fail ayrımı; “u yarılarla devam” akışı.  
- **Deliverable:** Preflight raporu + thumbnail; warnings opsiyonel devam.  
- **Acceptance:** PDF first-page preview; DPI warning; transparency detection; AI/EPS→PNG; fail durumunda block.  
- **Risk:** Ghostscript güvenlik; Mitigation: sandbox/limits.

#### Preflight Kontrolleri (Tablo)
| Check | Pass | Warn | Fail |
|-------|------|------|------|
| Format | Whitelist | – | Desteklenmiyor |
| File Size | < Max | – | > Max |
| DPI | ≥ Required | 70-99% | < 70% |
| Dimensions | Fits print area | Biraz büyük | Çok küçük/büyük |
| Transparency | Alpha varsa | – | Alpha yok (gerekliyse) |
| Color Profile | sRGB/CMYK | RGB | Unknown |
| PDF Pages | 1 page | – | > 1 page |

#### Conversion Pipeline
```
PDF/AI/EPS → Ghostscript/pdftoppm → PNG (300 DPI) → Thumbnail (WebP)
```

#### Worker Jobs (örnek)
```typescript
// preflight.worker.ts
Job: { uploadId }
Steps: download → detect → checks → thumbnail → DB update → notify

// converter.worker.ts
Job: { itemId, sourceType }
Steps: download → convert → thumbnail → upload → DB update
```

### Faz 3 — 3D Customizer Pro (4-5 Hafta)
- **Hedef:** R3F sahne, multi-location, asset set yönetimi, mobile fallback.  
- **Görevler:**
  - GLB load, decal sistemi; 4 lokasyon (front/back/sleeves).  
  - Transform panel (scale/rotate/position); camera presets.  
  - Asset Set CRUD (admin): printLocations, camera, render preset, uploadPolicy.  
  - Mobile 2D fallback; tablet simplified 3D; desktop 60fps hedef.  
- **Deliverable:** 3D/2D entegre, asset set admin’den yönetilir.  
- **Acceptance:** Mid-range desktop 60fps; mobile 2D fallback; asset set create/edit; sepet attach.  
- **Risk:** Performans; Mitigation: lazy load, low-poly, texture compress.

#### Print Location Config (örnek)
```typescript
const LOCATIONS = {
  front:  { position: [0,0.15,0.15], rotation: [0,0,0],       maxScale: 0.3 },
  back:   { position: [0,0.15,-0.15], rotation: [0,Math.PI,0], maxScale: 0.35 },
  left_sleeve:  { position: [-0.2,0.25,0], rotation: [0,-Math.PI/2,0], maxScale: 0.1 },
  right_sleeve: { position: [0.2,0.25,0],  rotation: [0, Math.PI/2,0], maxScale: 0.1 },
};
```

#### Asset Set JSON Schema (örnek)
```json
{
  "version": "1.0",
  "id": "uuid",
  "name": "Basic Tee White",
  "model": { "type": "glb", "source": "storage-key" },
  "printLocations": [
    {
      "code": "front",
      "name": "Front",
      "designArea": { "bounds": { "width": 12, "height": 14 }, "position": [0,0.15,0.15] },
      "constraints": { "minScale": 0.1, "maxScale": 1, "allowRotation": true }
    }
  ],
  "cameraPresets": [ { "id": "front", "position": [0,0,2.5], "target": [0,0,0] } ],
  "renderPreset": { "environment": "city", "shadows": true },
  "uploadPolicy": { "maxFileSizeMB": 25, "minDPI": 150 }
}
```

#### Entegrasyon: GitHub `kt946/ai-threejs-products-app-yt-jsm`
- **Kod konumu:** `extensions/theme-extension/assets/upload-lift-3d.js` içinde R3F bundle; bağımlılıklar ana repo `package.json` ile hizalanır (`three`, `@react-three/fiber`, `@react-three/drei`).
- **Adaptasyon:**
  - Canvas/Scene bileşenlerini (OrbitControls, GLB loader, materyal/ışık ayarları) projeye kopyala/uyarla; state yönetimini Upload Lift asset set şemasına (printLocations, camera presets) map et.
  - Asset kaynakları: GLB/texture yollarını R2/S3 signed URL’lere yönlendir; env map/HDri varsa CDN/R2’ye taşı.
  - Lazy load: Core (Lit) üzerinden `upload-lift-3d.js` dinamik import; mobile fallback için feature flag.
  - Theme block: `3d-designer.liquid` R3F bundle’ı çağırır; props olarak asset set JSON + uploadId + storage URL’leri verir.
- **Lisans/uyumluluk:** Repo lisansını kontrol et; gerekirse attribution ekle; sürüm kilitleri `package.json`’da güncelle.
- **Test:** Desktop 60fps, mobile 2D fallback; GLB yükleme, decal yerleşimi, transform kontrolleri; cart/metafield ekinde konum verisi.

### Faz 4 — Merchant Intelligence (2-3 Hafta)
- **Hedef:** Production queue, analytics, batch export.  
- **Görevler:**
  - Queue statüleri: needs_review→approved→printing→printed→shipped; rejected/reupload branch.  
  - Bulk approve/reject; batch export ZIP (manifest).  
  - Analytics: uploads, success rate, DPI hist, location usage, mode breakdown.  
- **Deliverable:** Queue UI + export link + metrik ekranı.  
- **Acceptance:** Bulk işlemler; ZIP indirilebilir; filtreler çalışır; grafikler render.  
- **Risk:** Büyük export; Mitigation: stream ZIP, temp URL, TTL.

#### Production Queue Statuses
```
needs_review → approved → printing → printed → shipped
      ↓
  rejected → reupload_requested
```

#### Analytics & Export Detayı
- **Analytics Metrics:** Total uploads (30d), success rate, avg preflight warnings, popular locations, mode usage, rejection reasons; charts: daily trend, status pie, DPI histogram, location heat map.
- **Export Flow:** Seç → job kaydı → queue → worker tüm dosyaları indir → ZIP (manifest ile) → storage’a yükle → secure download link → merchant’a bildir.
- **ZIP Yapısı:**
```
export_YYYY-MM-DD/
├── order_1234/
│   ├── front_design.png
│   ├── back_design.png
│   └── metadata.json
├── order_1235/
│   └── front_design.png
└── manifest.csv
```

### Faz 5 — Enterprise & Public Readiness (3-4 Hafta)
- **Hedef:** RBAC, white-label, public API, Flow triggers, billing enforcement.  
- **Görevler:**
  - Roles: Owner/Admin/Operator/Viewer; yetki matrisi.  
  - White-label: logo/colors, branding toggle, custom domain preview.  
  - Public API v1 (auth), rate limit, docs; Shopify Flow triggers.  
  - Billing plan enforcement (usage guard, soft/hard).  
- **Deliverable:** RBAC + API + Flow + billing korumaları.  
- **Acceptance:** Role bazlı yetki; Flow event’leri; plan limiti uyarı/stop; API key auth.  
- **Risk:** Billing edge; Mitigation: soft limit + grace.

### Faz 6 — AI & Automation (2-3 Hafta)
- **Hedef:** AI DPI upscale, bg removal, auto-approval rules, smart hints.  
- **Görevler:**
  - AI servis entegrasyonu (upscale, bg remove).  
  - Rule engine: trusted customers, perfect files auto-approve.  
  - Smart suggestions (size/rotate).  
- **Deliverable:** AI destekli kalite ve otomasyon.  
- **Acceptance:** Upscale örnekleri; rules çalışır; öneriler UI’da.  
- **Risk:** Maliyet; Mitigation: plan bazlı kontenjan.

---

## 6. Ürün & UX Akışları
- **Genel:** DISCOVERY → MOD SEÇ → UPLOAD → PREFLIGHT → PREVIEW (2D/3D) → CART → CHECKOUT → ORDER → REORDER.  
- **Mod-1 3D:** Lokasyon seç → Yükle → 3D canlı → Transform → Onay → Sepet.  
- **Mod-2 Classic:** Preset/custom size → Yükle → 2D preview → Preflight sonucu → Sepet.  
- **Mod-3 Quick:** Grid’de Upload → Auto-size/last-used → Sepet.  
- **Performans:** Mobile 2D fallback; tablet simplified 3D; desktop full 3D 60fps hedef.  
- **Hata/Rötuş:** Retry with backoff; offline queue (temel); toast + detay panel; warningsla devam.

---

## 7. Pricing & Paketler
| Plan | Limitler | Özellikler |
|------|----------|------------|
| **Free** | 100 upload/ay, 1 mod, 25MB max, watermark | Basic preflight, R2 only, e-posta destek |
| **Starter ($19/ay)** | 1000 upload/ay, 2 mod, 50MB max | Watermark yok, R2/S3 seçimi, temel analytics |
| **Pro ($49/ay)** | Sınırsız upload, 3 mod, 150MB max | 3D Pro, queue, export, Flow triggers, öncelikli destek |
| **Enterprise ($199/ay)** | Sınırsız | RBAC, white-label, public API, özel SLA, VPC peering opsiyon |
- **Usage guard:** Soft limit uyarı, hard stop opsiyon; plan metafield + admin banner.  

---

## 8. Güvenlik, Rate Limit, GDPR
- **Rate Limit:** Upload intent 10/min/customer; preflight 20/min/shop; admin API 100/min/shop.  
- **File Validation:** MIME+sig; max size; page limit; PDF/AI/EPS parse sandbox.  
- **Auth:** Embedded OAuth; session signed/HTTP-only; shop-scope zorunlu; ORMs guard.  
- **GDPR Endpoints:** POST /api/gdpr/customers/data_request, /customers/redact, /shop/redact.  
- **Webhooks:** orders create/paid/cancelled/fulfilled; products update/delete; app/uninstalled; GDPR.  
- **Logging:** Audit log (shop_id, user, action); PII masking; error tracking (Sentry).  

---

## 9. Test & Kalite
- **Unit (Vitest):** Preflight logic, storage intent, pricing guard.  
- **Integration (Playwright API):** Upload flow, cart attach, metafield yazımı.  
- **E2E (Cypress):** Müşteri yolculuğu (Mod-2/Mod-3), 3D basic; mobile fallback.  
- **Load (k6):** Concurrent uploads, queue throughput.  
- **Contract:** Admin GraphQL/Storefront 2025-10 sorgu şemaları.  
- **CI:** Lint+test+build zorunlu; PR required checks.  

---

## 10. Monitoring, DR, Backup
- **Monitoring:** Uptime ping; Sentry; merkezi log (shop_id tagged); queue lag metric.  
- **Metrics:** Upload success rate; preflight fail/warn oranı; worker failure; storage error; queue latency.  
- **Backup:** Postgres günlük R2; R2 versioning; retention 90 gün; restore runbook.  
- **Recovery:** Export jobs yeniden üretilebilir; DLQ drain prosedürü.  

---

## 11. Tamamlanma Kriterleri & KPI’lar
- **MVP (Faz 0–3) kriterleri:**
  - Caddy+systemd+deploy pipeline aktif; health 200.  
  - OAuth, uninstall, webhooks kayıtlı; tenant guard aktif.  
  - Storage intent (R2 default, S3 opsiyon) + test connection UI.  
  - Upload→preflight→thumbnail; PDF/AI/EPS→PNG; warningsla devam.  
  - Cart line item properties ve order metafield yazılır.  
  - Mod-1 3D (desktop), mobile 2D fallback; Mod-2/3 çalışır.  
  - Plan guard (Free/Starter/Pro) uyarı/stop.  
  - Monitoring+basic alert; günlük backup.  
- **KPI:** Upload success rate >95%; Preflight warning<30%; Avg queue latency <5s (preflight); Crash-free >99%.  

---

## 12. Repo Yapısı (öneri)
```
upload-lift/
├── app/                     # Remix (admin/backend)
├── extensions/
│   └── theme-extension/     # Storefront blocks & assets
├── workers/                 # BullMQ workers
├── prisma/                  # Schema & migrations
├── public/                  # Shared assets
├── docs/                    # Roadmap & specs
├── .github/workflows/       # CI/CD
└── package.json
```

---

**Not:** Bu master roadmap, public-app gereksinimlerini (billing, GDPR, rate limit, Flow, tenant izolasyonu) içerecek şekilde genişletilmiştir. Faz 0–3 tamamlandığında uçtan uca çalışan MVP elde edilir; Faz 4–6 ölçeklenme, enterprise ve AI katmanıdır.

---

## 13. Timeline & MVP Scope

### Toplam Timeline
| Faz | Süre | Kümülatif |
|-----|------|-----------|
| Faz 0: Altyapı | 1 hafta | 1 hafta |
| Faz 1: Core Upload | 2-3 hafta | 4 hafta |
| Faz 2: Validation | 2-3 hafta | 7 hafta |
| Faz 3: 3D Designer | 4-5 hafta | 12 hafta |
| Faz 4: Merchant Suite | 2-3 hafta | 15 hafta |
| Faz 5: Enterprise | 3-4 hafta | 19 hafta |
| Faz 6: AI | 2-3 hafta | 22 hafta |

### 🎯 MVP (Faz 0–3)
- Shopify OAuth + Embedded App + uninstall cleanup.
- Mod-2 Classic Upload tam akış; Mod-1 single-location 3D preview; Mod-3 temel.
- Basic preflight (format, size, DPI) + PDF/AI/EPS→PNG + thumbnail; warningsla devam.
- Cart line item attachment; order metafield yazımı; webhook kayıtları.
- Merchant uploads dashboard; theme extension blocks.
- Mobile 2D fallback; desktop 3D 60fps hedef.

---

## 14. Faz Bazlı Uygulama Checklist (Buton/UI/DB/Queue Detaylı)

### Faz 0 — Altyapı
- Caddy HTTPS + domain: TLS auto; headers (CSP frame-ancestors admin.shopify.com, X-Frame-Options remove). 
- systemd: ExecStart node dist/server.js; User=www-data; Environment NODE_ENV=production; Restart=always. 
- Postgres/Redis: users/roles oluştur; prisma migrate dev/prod; connection string .env. 
- GitHub Actions: lint/test/build/deploy; secrets (SSH_HOST/KEY, R2/S3 vars); deploy komutu `pnpm install && pnpm build && systemctl restart`. 
- Health endpoints: `/health` 200; `/status` DB+Redis ping. 
- Prisma tenant guard middleware aktif; global bare sorgu yok. 

### Faz 1 — Core Upload Engine
- OAuth flow: /auth/install, /auth/callback; state store; HMAC verify; session cookie (Secure, SameSite=None, HTTP-only); uninstall webhook → shop temizliği. 
- Storage intent API: POST /api/upload/intent (provider=R2/S3, key path `{shop}/{env}/{upload}/{item}`); headers (Content-Type, ACL); expiresIn 15dk; test connection UI butonu. 
- Upload complete API: POST /api/upload/complete (uploadId, items) → enqueue preflight; status endpoint /api/upload/status/:id. 
- Cart attach: line item properties `_upload_lift_id`, `_upload_lift_mode`, `_upload_lift_preview`, `_upload_lift_hash`; order metafield taslağı. 
- Dashboard (basic): table columns (uploadId, product, mode, status, createdAt); filters (status, date); pagination; actions (view). 
- UI: Mod-2/3 yükleme formu (dropzone/button), progress bar, status badge; error toast, retry. 

### Faz 2 — Advanced Validation
- Preflight kontroller: format/MIME+sig, size (plan), DPI, dimensions, transparency, color profile, page count. 
- Conversion: PDF/AI/EPS→PNG 300 DPI; thumbnail WebP; Ghostscript sandbox (-dSAFER -dBATCH -dNOPAUSE -dNOCACHE, max pages 5, timeout 10s). 
- Worker queue: preflight timeout 20s; retry 3x backoff 2s/10s/30s; DLQ; metrics. 
- UI: Warn vs Fail; “Uyarılarla devam” butonu; preview thumbnail; detail panel (DPI, size, format). 
- k6 load: 50 vus, intent+complete+status; p95 intent <1s, status <3s. 

### Faz 3 — 3D Customizer Pro
- Asset Set CRUD (admin): fields (name, GLB URL, printLocations array, cameraPresets, renderPreset, uploadPolicy); uploadPolicy maxSize/minDPI. 
- 3D Scene (R3F): GLB loader, OrbitControls, lights, environment; decal placement per location; transform controls (scale/rotate/position sliders). 
- Print locations: front/back/left_sleeve/right_sleeve preset positions/rotations; maxScale/minScale constraints. 
- Lazy load bundle: core Lit → dynamic import `upload-lift-3d.js`; mobile fallback 2D if !WebGL2. 
- Theme block: `3d-designer.liquid` props (assetSet JSON, uploadId, signed URLs, mode); renders canvas + fallback container. 
- Performance: texture compression, low-poly mobile preset; target 60fps desktop; avoid blocking main thread. 
- Cart/metafield: location transform JSON stored; preview URL line item property. 

### Faz 4 — Merchant Intelligence
- Queue UI: status columns (needs_review, approved, printing, printed, shipped, rejected, reupload_requested); bulk approve/reject; per-item notes. 
- Export: select uploads → create job → worker streams ZIP (manifest.csv + per-order folders) → temp signed download URL (24h); job status page. 
- Analytics: metrics (30d uploads, success rate, warning rate, rejection reasons, location popularity, mode usage); charts (daily trend, status pie, DPI histogram, heat map). 
- Filters: date range, status, customer email, mode. 
- Alerts: failure rate >5% 5dk; queue lag >30s. 

### Faz 5 — Enterprise & Public
- RBAC: roles Owner/Admin/Operator/Viewer; permissions matrix (view/approve/export/settings/billing). 
- White-label: logo/color picker, hide branding toggle, optional custom domain for previews. 
- Public API v1: auth (API key); endpoints list (GET uploads, GET upload/:id, POST approve/reject, POST exports); rate limits per key. 
- Flow triggers: upload received/approved/rejected, preflight warning, export completed. Payload örnekleri dahil. 
- Billing enforcement: plan limits (upload/month, max file size); soft limit = uyarı/banner; hard stop = intent 429 + upgrade CTA; Free 25MB blok. 

### Faz 6 — AI & Automation
- AI DPI upscale ve background removal entegrasyonu (provider seç, plan bazlı kota). 
- Auto-approval rules: perfect files (format ok, DPI ≥ required, no warnings); trusted customers (order count≥5, approval rate≥95%). 
- Smart suggestions: “size to 80%”, “rotate 5°”; UI’da hint panel. 

### Ortak Teknik İlaveler
- Rate limit middleware örneği uygulanmış (10/20/100 rpm context-sensitive). 
- File validation: magic byte check; oversize → 413; malformed PDF block. 
- Storage intent flow ve test connection endpoint dokümante. 
- Prisma tenant guard middleware örneği; session cookie ayarları (Secure, SameSite=None). 
- Monitoring: Sentry, queue lag metric, alert eşikleri; backup/restore runbook özet. 
- Cart snippet örneği (preview gösterimi); metafield payload örnekleri (product/order/customer). 

### Referans (Bu maddeler hangi bölümlere bağlı)
- Faz 0: Bölüm 5 Faz 0, Bölüm 4 (stack), Bölüm 3 (tenant guard). 
- Faz 1: Bölüm 5 Faz 1, Bölüm 3.1 (Shopify entegrasyon), Bölüm 4.3 (storage), Bölüm 4.6 (status). 
- Faz 2: Bölüm 5 Faz 2, Preflight tablosu/pipeline, Queue/worker. 
- Faz 3: Bölüm 5 Faz 3, Print locations, Asset Set schema, kt946 entegrasyon notları. 
- Faz 4: Bölüm 5 Faz 4, Queue statuses, Analytics & Export. 
- Faz 5: Bölüm 5 Faz 5, Pricing & Rate limit, RBAC/Flow/Public API. 
- Faz 6: Bölüm 5 Faz 6 (AI). 
- Ortak teknik: Bölüm 8 (Security/Rate limit/GDPR), Bölüm 10 (Monitoring/DR), Bölüm 11 (KPI/MVP), Bölüm 13 (Timeline/MVP scope). 

