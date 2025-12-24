# 🔬 Upload Lift / Product 3D Customizer - Kapsamlı Ekosistem Analizi

> **Analiz Tarihi:** 24 Aralık 2025  
> **Versiyon:** 5.0.0  
> **Analiz Tipi:** Semantik, Davranışsal ve Zamansal Ekosistem Değerlendirmesi

---

## 📊 YÖNETİCİ ÖZETİ

| Kategori | Toplam Dosya | Kritik | Yüksek | Orta | Düşük |
|----------|-------------|--------|--------|------|-------|
| **Admin Sayfaları** | 16 | 2 | 5 | 8 | 4 |
| **API Endpoint'leri** | 26 | 4 | 4 | 8 | 3 |
| **Webhook Handler'ları** | 7 | 0 | 2 | 3 | 1 |
| **Theme Extension** | 10 | 1 | 4 | 7 | 5 |
| **Backend Servisleri** | 12 | 1 | 2 | 4 | 2 |
| **TOPLAM** | 71 | **8** | **17** | **30** | **15** |

---

## 🚨 FAZ 1: KRİTİK GÜVENLİK AÇIKLARI

### 1.1 GDPR Endpoint'lerinde HMAC Doğrulaması YOK

**Dosyalar:**
- [api.gdpr.customers.data_request.tsx](app/routes/api.gdpr.customers.data_request.tsx)
- [api.gdpr.customers.redact.tsx](app/routes/api.gdpr.customers.redact.tsx)
- [api.gdpr.shop.redact.tsx](app/routes/api.gdpr.shop.redact.tsx)

**Belirti:** GDPR webhook'ları Shopify HMAC signature doğrulaması yapmıyor

**Kök Neden Hipotezi:** Hızlı geliştirme sırasında atlanmış, stub endpoint'ler

**Etkilenen Akışlar:**
- Müşteri veri silme talebi
- Mağaza veri silme (cascade)
- Shopify uygulama incelemesi ❌

**Yeniden Üretme:**
```bash
curl -X POST https://customizerapp.dev/api/gdpr/shop/redact \
  -H "Content-Type: application/json" \
  -d '{"shop_domain": "victim-store.myshopify.com"}'
# → Mağaza silinir! (HMAC kontrolü yok)
```

**Beklenen:** 401 Unauthorized (geçersiz HMAC)  
**Gerçekleşen:** 200 OK + veri silinir

**Önerilen Düzeltme:**
```typescript
import { shopify } from "~/lib/shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { topic, payload } = await shopify.authenticate.webhook(request);
  // topic = "customers/data_request" | "customers/redact" | "shop/redact"
  // ... işlem
}
```

**Olası Yan Etkiler:** Mevcut flow değişmez, sadece güvenlik katmanı eklenir

**Test Planı:**
- Unit: HMAC signature mock ile doğrulama testi
- Integration: Shopify webhook simulator ile test
- E2E: Gerçek webhook trigger (test mağazasında)

**Gözlemlenebilirlik:** 
- Log: `[GDPR] HMAC verification: {success: bool, shop: string}`
- Metric: `gdpr_webhook_verification_failures`

---

### 1.2 Upload Detail'de shop_id Doğrulaması YOK

**Dosya:** [app.uploads.$id.tsx](app/routes/app.uploads.$id.tsx)

**Belirti:** Action fonksiyonları upload'ın mevcut shop'a ait olup olmadığını kontrol etmiyor

**Kök Neden Hipotezi:** Loader'da session.shop mevcut ama action'a taşınmamış

**Etkilenen Akışlar:**
- Upload onaylama
- Upload reddetme
- Çapraz mağaza veri erişimi ⚠️

**Yeniden Üretme:**
1. Mağaza A'da giriş yap
2. Mağaza B'nin upload ID'sini tahmin et
3. `/app/uploads/{B_upload_id}` sayfasına git
4. "Approve" butonuna bas
5. Mağaza B'nin upload'ı onaylanır!

**Beklenen:** 403 Forbidden  
**Gerçekleşen:** Upload onaylanır

**Önerilen Düzeltme:**
```typescript
// Action içinde:
const upload = await prisma.upload.findFirst({
  where: { 
    id: uploadId,
    shop: { shopDomain: session.shop } // ← EKLENMELİ
  }
});
if (!upload) return json({ error: "Not found" }, { status: 404 });
```

**Test Planı:**
- Unit: Farklı shop session ile upload ID testi
- Integration: Çapraz mağaza erişim testi

---

### 1.3 Billing Değişikliği Sadece Owner'a Ait Olmalı

**Dosya:** [app.billing.tsx](app/routes/app.billing.tsx)

**Belirti:** Herhangi bir ekip üyesi plan değiştirebilir

**Kök Neden Hipotezi:** RBAC henüz implement edilmemiş (app.team.tsx TODO)

**Etkilenen Akışlar:**
- Plan yükseltme/düşürme
- Finansal işlemler
- Mağaza sahibi izni atlanır

**Önerilen Düzeltme:**
```typescript
// Action içinde:
const teamMember = await prisma.teamMember.findFirst({
  where: { userId: session.userId, shopId: shop.id }
});
if (teamMember?.role !== "owner") {
  return json({ error: "Only owner can change billing" }, { status: 403 });
}
```

---

### 1.4 Dosya Erişimi Kimlik Doğrulaması YOK

**Dosyalar:**
- [api.files.$.tsx](app/routes/api.files.$.tsx)
- [api.storage.preview.$.tsx](app/routes/api.storage.preview.$.tsx)
- [api.upload.local.tsx](app/routes/api.upload.local.tsx)

**Belirti:** URL'yi bilen herkes dosyalara erişebilir

**Kök Neden Hipotezi:** Storefront (public) erişimi için tasarlanmış ama merchant dosyaları da dahil

**Etkilenen Akışlar:**
- Müşteri tasarımları (PII olabilir)
- İşlenmemiş dosyalar
- Gizli ürün görselleri

**Önerilen Düzeltme:**
1. Signed URL pattern (15 dakika geçerlilik)
2. veya Referer + shop domain kontrolü
3. veya Session-based access (admin sayfaları için)

---

## 🔴 FAZ 2: YÜKSEK ÖNCELİKLİ EKSİKLER

### 2.1 RBAC (Rol Tabanlı Erişim Kontrolü) İMPLEMENTE EDİLMEMİŞ

**Dosya:** [app.team.tsx](app/routes/app.team.tsx#L53)

```typescript
const currentUserRole = "owner" as Role; // TODO: Get from session
```

**Etkilenen Sayfalar:** TÜMÜ (16 admin sayfası)

**Tanımlı Roller:** owner, admin, operator, viewer  
**Kullanılan Roller:** Hiçbiri (hepsi "owner" gibi davranır)

**Düzeltme Yolu:**
1. Session'a userId ekle
2. TeamMember tablosundan role çek
3. Her sayfada rol kontrolü yap

---

### 2.2 Ekip Davet E-postaları GÖNDERİLMİYOR

**Dosya:** [app.team.tsx](app/routes/app.team.tsx#L125)

```typescript
// TODO: Send invite email
```

**Durum:** invite token oluşturuluyor ama e-posta gönderilmiyor

**Düzeltme:**
```typescript
await sendTeamInvite(email, inviteToken, shop.name, role);
```

---

### 2.3 Webhook Idempotency Eksik

**Dosya:** [webhooks.orders-paid.tsx](app/routes/webhooks.orders-paid.tsx)

**Belirti:** Duplicate webhook'lar duplicate OrderLink oluşturur

**Düzeltme:** Upsert pattern veya unique constraint:
```typescript
await prisma.orderLink.upsert({
  where: { orderId_uploadId: { orderId, uploadId } },
  create: { orderId, uploadId, lineItemId, shopId },
  update: {} // zaten varsa bir şey yapma
});
```

---

### 2.4 Storage Cleanup - Mağaza Silindiğinde Dosyalar Kalıyor

**Dosya:** [api.gdpr.shop.redact.tsx](app/routes/api.gdpr.shop.redact.tsx#L30)

```typescript
// TODO: Also delete files from storage
```

**Düzeltme:**
```typescript
// Shop silinmeden önce:
const uploads = await prisma.uploadItem.findMany({
  where: { upload: { shopId: shop.id } },
  select: { storageKey: true }
});
for (const item of uploads) {
  await storage.delete(item.storageKey);
}
```

---

### 2.5 Rate Limiting Eksik Endpoint'ler

| Endpoint | Risk |
|----------|------|
| `/api/files/$` | DoS, bandwidth abuse |
| `/api/storage/preview/$` | DoS |
| `/api/tshirt/colors` | API spam |
| `/api/tshirt/sizes/$productId` | Shopify API limit tüketimi |
| `/api/pricing/calculate` | CPU abuse |
| `/health` | Info disclosure |

**Düzeltme:** `rateLimit.server.ts` ile sarmalama

---

## 🟡 FAZ 3: ORTA ÖNCELİKLİ TUTARSIZLIKLAR

### 3.1 Hardcoded Plan Tanımları

**Dosyalar:** 
- app.billing.tsx (Line 67-70)
- app._index.tsx (Line 67-70)
- app.settings.tsx (Line 429-430)

**Sorun:** PLANS array'i 3 farklı yerde tanımlı, senkronize değil

**Düzeltme:** `lib/plans.server.ts` oluştur, tek kaynak

---

### 3.2 Dashboard Success Rate Bug

**Dosya:** [app._index.tsx](app/routes/app._index.tsx)

```typescript
const successRate = totalMonthly > 0 
  ? Math.round((approvedCount / totalMonthly) * 100) 
  : 100; // ← approvedCount tanımlı değil, undefined/totalMonthly = NaN → 100
```

**Düzeltme:** Loader'dan `approvedCount` çek

---

### 3.3 Products Pagination YOK

**Dosya:** [app.products._index.tsx](app/routes/app.products._index.tsx)

```typescript
query: `first: 50` // ← 50 üzeri ürünü olan mağazalar göremez
```

**Düzeltme:** Cursor-based pagination ekle

---

### 3.4 Duplicate validateApiKey Fonksiyonu

**Dosyalar:**
- api.v1.analytics.tsx
- api.v1.exports.$id.tsx
- api.server.ts (doğru yer)

**Düzeltme:** Diğerlerini kaldır, sadece `api.server.ts` kullan

---

### 3.5 Theme Extension Hardcoded Değerler

| Değer | Yer | Olması Gereken |
|-------|-----|----------------|
| `https://customizerapp.dev` | dtf-uploader.liquid:26 | Schema setting veya metafield |
| `$5 back, $3 sleeves` | tshirt-modal.liquid | API'den |
| `$19.99 base` | tshirt-modal.liquid | Variant fiyatı |
| Three.js v0.160.0 CDN | tshirt-modal.liquid:417 | Self-hosted |
| 50MB max | dtf-uploader.liquid | Merchant config |

---

### 3.6 Analytics Sayfası Full Page Reload

**Dosya:** [app.analytics.tsx](app/routes/app.analytics.tsx#L238)

```typescript
window.location.href = `?period=${newPeriod}`; // ← SPA değil
```

**Düzeltme:** `useSearchParams` hook kullan

---

### 3.7 Shop-Specific Pricing İMPLEMENTE EDİLMEMİŞ

**Dosya:** [api.pricing.calculate.tsx](app/routes/api.pricing.calculate.tsx#L112)

```typescript
// TODO: Load shop-specific pricing from metafields if shopDomain provided
```

**Düzeltme:** Shop settings'den fiyatlandırma çek

---

## 🟢 FAZ 4: DÜŞÜK ÖNCELİKLİ İYİLEŞTİRMELER

### 4.1 Accessibility (a11y) Eksikleri

| Komponent | Sorun |
|-----------|-------|
| T-Shirt Modal | Focus trap yok |
| Confirmation Modal | `role="dialog"` yok |
| Color swatches | `aria-label` yok |
| Quantity buttons | Sadece `−/+` sembol, label eksik |
| Step progress | Screen reader için anlamsız |

---

### 4.2 Remote Logger Production'da Aktif

**Dosya:** [ul-remote-logger.js](extensions/theme-extension/assets/ul-remote-logger.js)

**Sorun:** Debug logları production'da da sunucuya gönderiliyor

**Düzeltme:** 
```javascript
if (window.UL_DEBUG !== true) return;
```

---

### 4.3 GDPR Consent Analytics İçin YOK

**Dosya:** [ul-analytics.js](extensions/theme-extension/assets/ul-analytics.js)

**Sorun:** Kullanıcı consent'i kontrol edilmeden tracking yapılıyor

**Düzeltme:** Shopify Customer Privacy API entegrasyonu

---

### 4.4 Redis Connection Leak

**Dosyalar:** 
- app.queue.tsx
- app.exports.tsx
- api.v1.exports._index.tsx

**Sorun:** `queue.add()` sonrası connection kapatılmıyor

**Düzeltme:**
```typescript
const queue = new Queue("export", { connection: redis });
try {
  await queue.add("export", data);
} finally {
  await queue.close();
}
```

---

## 📋 FAZ 5: STATIK HTML / LEGAL SAYFALAR ANALİZİ

### 5.1 Legal Sayfalar Tutarlılık

| Sayfa | Durum | Sorun |
|-------|-------|-------|
| /legal/privacy | ✅ | - |
| /legal/terms | ✅ | - |
| /legal/gdpr | ✅ | - |
| /legal/docs | ⚠️ | API endpoint listesi güncel değil |
| /legal/contact | ✅ | - |
| /legal/changelog | ⚠️ | Son güncelleme eski |
| /legal/tutorial | ⚠️ | Ekran görüntüleri güncel değil |

### 5.2 Meta Tag Eksikleri

**Dosya:** legal.tsx

| Eksik | Önem |
|-------|------|
| `<meta name="description">` | SEO |
| `<meta property="og:*">` | Social sharing |
| `<link rel="canonical">` | SEO duplicate content |
| `lang` attribute | i18n/a11y |

---

## 📊 FAZ 6: BUTTON → FUNCTION → API FLOW HARİTASI

### Dashboard (app._index.tsx)

| Button | Handler | API/Service | DB Operation | Yan Etki |
|--------|---------|-------------|--------------|----------|
| Skip Setup | form submit | action("skip-onboarding") | shop.update | - |
| Complete Step | handleCompleteStep | action("complete-step") | shop.update | - |
| Configure Product | navigate | - | - | - |
| View Queue | navigate | - | - | - |
| Upgrade to Pro | navigate | - | - | - |

### Queue (app.queue.tsx)

| Button | Handler | API/Service | DB Operation | Yan Etki |
|--------|---------|-------------|--------------|----------|
| Update Status | modal → form | action("update_status") | upload.update | - |
| Bulk Approve | form submit | action("bulk_update") | upload.updateMany | - |
| Export Selected | form submit | action("create_export") | exportJob.create | Redis queue.add |
| View | navigate | - | - | - |

### Uploads Detail (app.uploads.$id.tsx)

| Button | Handler | API/Service | DB Operation | Yan Etki |
|--------|---------|-------------|--------------|----------|
| Approve | form submit | action("approve") | upload.update | ⚠️ shop_id check YOK |
| Reject | modal → form | action("reject") | upload.update | ⚠️ shop_id check YOK |
| Continue with Warnings | form submit | action("continue_with_warnings") | upload.update | - |

### Team (app.team.tsx)

| Button | Handler | API/Service | DB Operation | Yan Etki |
|--------|---------|-------------|--------------|----------|
| Invite Member | form submit | action("invite") | teamMember.create | ⚠️ Email gönderilmiyor |
| Update Role | form submit | action("update_role") | teamMember.update | - |
| Remove | form submit | action("remove") | teamMember.delete | - |
| Resend Invite | form submit | action("resend_invite") | teamMember.update | ⚠️ Email gönderilmiyor |

### Billing (app.billing.tsx)

| Button | Handler | API/Service | DB Operation | Yan Etki |
|--------|---------|-------------|--------------|----------|
| Upgrade to Pro | form submit | billing.request | Shopify API | ⚠️ Owner-only değil |
| Switch to Starter | form submit | billing.request | Shopify API | - |

---

## 🔄 FAZ 7: EXTENSION BUTTON → FLOW HARİTASI

### DTF Uploader (dtf-uploader.js)

| Button/Action | Handler | API Call | Backend Job | Geri Bildirim |
|---------------|---------|----------|-------------|---------------|
| File Drop | handleFileSelect | POST /api/upload/intent | - | Progress bar |
| - | uploadToStorage | PUT (signed URL) | - | Progress % |
| - | - | POST /api/upload/complete | Redis preflight queue | - |
| - | pollUploadStatus | GET /api/upload/status/:id | - | Status badge |
| Add to Cart | addToCart | POST /cart/add.js | - | Confirmation modal |
| T-Shirt Button | openTShirtModal | - | - | Modal açılır |

### T-Shirt Modal (tshirt-modal.js)

| Button/Action | Handler | API Call | Backend Job | Geri Bildirim |
|---------------|---------|----------|-------------|---------------|
| Use Inherited | useInheritedDesign | - | - | Step 2'ye geç |
| Upload New | handleFileSelect | POST /api/upload/intent → complete | Preflight | Progress |
| Color Swatch | setColor | - | - | 3D güncelle |
| Size Select | setSize | - | - | Fiyat güncelle |
| Location Toggle | toggleLocation | - | - | 3D decal ekle/kaldır |
| Sliders | setLocationScale/Pos | - | - | 3D güncelle |
| Add to Cart | checkout | POST /cart/add.js | - | Confirmation |
| Design Another | designAnother | POST /cart/add.js | - | Reset modal |

---

## ⚠️ FAZ 8: PLATFORM KISITLARI UYUMLULUK

### Shopify Rate Limits

| API | Limit | Mevcut Durum |
|-----|-------|--------------|
| Admin GraphQL | 50 points/s | ✅ shopify.server handles |
| REST Admin | 40/s | ❌ Kullanılmıyor (GraphQL-only) |
| Storefront API | 2000/min | ⚠️ Theme extension tracking yok |

### Session Token

| Endpoint | Durum |
|----------|-------|
| Admin API routes | ✅ authenticate.admin |
| Public API routes | ⚠️ Shop validation only |
| GDPR webhooks | ❌ HMAC YOK |

### CORS

| Endpoint | Durum |
|----------|-------|
| /api/upload/* | ✅ cors.server.ts |
| /api/files/* | ✅ Allow all |
| /api/storage/preview/* | ❌ CORS header YOK |

### OAuth Scopes

**Mevcut:** read_products, write_products, read_orders, write_orders, read_files, write_files

**Eksik:** 
- `read_customers` - GDPR data request için gerekebilir
- `read_metafields` - Shop-specific config için

---

## 🧪 FAZ 9: TEST PLANI

### Unit Tests Gerekli

| Dosya | Test Case |
|-------|-----------|
| api.gdpr.*.tsx | HMAC doğrulama (mock webhook) |
| app.uploads.$id.tsx | Shop isolation testi |
| app.billing.tsx | Owner-only rol testi |
| api.storage.preview.$.tsx | Signed URL validation |

### Integration Tests Gerekli

| Flow | Test Case |
|------|-----------|
| Upload → Preflight → Approve | Tam akış |
| Order Create → OrderLink | Webhook → DB |
| Export → Download | Queue → File generation |
| Team Invite → Accept | Token → Session |

### E2E Tests Gerekli

| Scenario | Coverage |
|----------|----------|
| DTF Upload from storefront | Frontend → API → Storage → Preflight |
| T-Shirt customization | Modal → 3D → Cart |
| Admin approval workflow | Login → Queue → Approve → Export |

---

## 📈 FAZ 10: ÖNCELİKLENDİRİLMİŞ DÜZELTME ROADMAP

### Sprint 1: Kritik Güvenlik (1-2 gün)

1. ✅ GDPR webhook'lara HMAC doğrulaması ekle
2. ✅ Upload detail'e shop_id kontrolü ekle
3. ✅ Billing'e owner-only kontrolü ekle
4. ⚠️ Dosya erişimine signed URL ekle

### Sprint 2: Yüksek Öncelik (2-3 gün)

5. RBAC implementasyonu
6. Team invite email entegrasyonu
7. Webhook idempotency (upsert pattern)
8. Storage cleanup on shop delete
9. Rate limiting eksik endpoint'lere

### Sprint 3: Orta Öncelik (3-5 gün)

10. Plan tanımlarını tek dosyaya taşı
11. Dashboard success rate fix
12. Products pagination
13. Duplicate kod temizliği
14. Theme extension hardcoded değerler
15. Shop-specific pricing

### Sprint 4: Düşük Öncelik (ongoing)

16. Accessibility iyileştirmeleri
17. Remote logger production kontrolü
18. GDPR consent management
19. Redis connection yönetimi
20. Legal sayfalar güncellemesi

---

## 📊 SONUÇ

### Ekosistem Sağlık Durumu

| Katman | Skor | Değerlendirme |
|--------|------|---------------|
| Frontend (Theme Extension) | 7/10 | Fonksiyonel ama a11y eksik |
| Backend (API Routes) | 6/10 | Güvenlik açıkları mevcut |
| Admin Panel | 6/10 | RBAC eksik |
| Database | 8/10 | İyi yapılandırılmış |
| Security | 4/10 | Kritik açıklar var |
| Operations | 7/10 | Worker'lar çalışıyor |

### Acil Aksiyon Gerekli

1. **GDPR HMAC** - Shopify uygulama incelemesini geçemez
2. **Cross-shop access** - Veri sızıntısı riski
3. **Owner-only billing** - Finansal risk

### Genel Değerlendirme

Ekosistem fonksiyonel durumda ancak güvenlik ve yetkilendirme katmanları eksik. Mevcut yapı MVP için yeterli olabilir ancak production-ready değil. Sprint 1 ve 2'deki düzeltmeler zorunludur.

---

*Rapor Sonu - FAZ 5 Semantik Analiz v5.0.0*
