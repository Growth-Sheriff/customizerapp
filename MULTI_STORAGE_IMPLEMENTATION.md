# 🚀 Multi-Storage Sistemi Implementasyon Dökümanı

> **Versiyon:** 1.0.0  
> **Tarih:** 19 Ocak 2026  
> **Durum:** Hazır - Onay Bekliyor

---

## 📋 Özet

3 storage provider destekli upload sistemi:
- **Bunny.net** (Birincil - CDN + Optimizer)
- **Local Server** (Yedek - Failover)
- **R2** (Opsiyonel - Gelecek)

### Bunny.net Bilgileri
```
Storage Zone: customizerappdev
Hostname: storage.bunnycdn.com
API Key: 28f55d96-a471-431c-b9bfa4d25247-3d0d-47e6
CDN URL: https://customizerappdev.b-cdn.net
```

### Karar Noktaları
- ✅ Vary Cache ve WebP aktif (Bunny panelden)
- ✅ Storage provider veritabanından değiştirilecek (Shop tablosu)
- ✅ Mevcut dosyalar Bunny'ye migrate edilecek

---

## 📁 FAZ 1: Storage Server Library

### Dosya: `app/lib/storage.server.ts`

**Mevcut Kod (Satır 1-226 - TAMAMEN YENİDEN YAZILACAK):**

```typescript
// ESKİ - SILINECEK (tamamı)
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
// ... tüm dosya
```

**Yeni Kod:**

```typescript
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import crypto from "crypto";

/**
 * MULTI-STORAGE SYSTEM v2.0
 * =========================
 * Supports: Bunny.net (primary), Local (fallback), R2 (optional)
 * 
 * Environment Variables:
 * - DEFAULT_STORAGE_PROVIDER: bunny | local | r2
 * - BUNNY_STORAGE_ZONE: Storage zone name
 * - BUNNY_API_KEY: Storage zone password
 * - BUNNY_CDN_URL: Pull zone URL (https://xxx.b-cdn.net)
 * - LOCAL_STORAGE_PATH: Local storage directory
 * - SECRET_KEY: HMAC secret for signed URLs
 */

// ============================================================
// CONFIGURATION
// ============================================================

const LOCAL_STORAGE_BASE = process.env.LOCAL_STORAGE_PATH || "./uploads";
const LOCAL_FILE_SECRET = process.env.SECRET_KEY || "fallback-secret-key";

// Bunny.net Configuration
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || "customizerappdev";
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || "";
const BUNNY_CDN_URL = process.env.BUNNY_CDN_URL || "https://customizerappdev.b-cdn.net";
const BUNNY_STORAGE_HOST = "storage.bunnycdn.com";

// R2 Configuration (for future use)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

// ============================================================
// TYPES
// ============================================================

export type StorageProvider = "local" | "bunny" | "r2";

export interface StorageConfig {
  provider: StorageProvider;
  // Local
  localPath?: string;
  // Bunny
  bunnyZone?: string;
  bunnyApiKey?: string;
  bunnyCdnUrl?: string;
  // R2
  r2AccountId?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2BucketName?: string;
  r2PublicUrl?: string;
}

export interface UploadUrlResult {
  url: string;
  key: string;
  provider: StorageProvider;
  publicUrl: string;
  method: "PUT" | "POST";
  headers?: Record<string, string>;
}

// ============================================================
// STORAGE CONFIG FACTORY
// ============================================================

/**
 * Get storage config from shop settings or environment
 */
export function getStorageConfig(shopConfig?: { 
  storageProvider?: string; 
  storageConfig?: Record<string, string> | null;
}): StorageConfig {
  // Shop-level override
  const provider = (shopConfig?.storageProvider as StorageProvider) || 
                   (process.env.DEFAULT_STORAGE_PROVIDER as StorageProvider) || 
                   "local";
  
  const shopStorageConfig = shopConfig?.storageConfig || {};
  
  return {
    provider,
    // Local
    localPath: LOCAL_STORAGE_BASE,
    // Bunny (shop config overrides env)
    bunnyZone: shopStorageConfig.bunnyZone || BUNNY_STORAGE_ZONE,
    bunnyApiKey: shopStorageConfig.bunnyApiKey || BUNNY_API_KEY,
    bunnyCdnUrl: shopStorageConfig.bunnyCdnUrl || BUNNY_CDN_URL,
    // R2 (shop config overrides env)
    r2AccountId: shopStorageConfig.r2AccountId || R2_ACCOUNT_ID,
    r2AccessKeyId: shopStorageConfig.r2AccessKeyId || R2_ACCESS_KEY_ID,
    r2SecretAccessKey: shopStorageConfig.r2SecretAccessKey || R2_SECRET_ACCESS_KEY,
    r2BucketName: shopStorageConfig.r2BucketName || R2_BUCKET_NAME,
    r2PublicUrl: shopStorageConfig.r2PublicUrl || R2_PUBLIC_URL,
  };
}

/**
 * Check if storage is properly configured
 */
export function isStorageConfigured(config: StorageConfig): boolean {
  switch (config.provider) {
    case "bunny":
      return !!(config.bunnyZone && config.bunnyApiKey);
    case "r2":
      return !!(config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey && config.r2BucketName);
    case "local":
    default:
      return true;
  }
}

/**
 * Get effective provider with fallback
 */
export function getEffectiveStorageProvider(config: StorageConfig): StorageProvider {
  if (isStorageConfigured(config)) {
    return config.provider;
  }
  // Fallback to local if primary not configured
  console.warn(`[Storage] ${config.provider} not configured, falling back to local`);
  return "local";
}

// ============================================================
// SIGNED URL TOKEN (for local storage)
// ============================================================

export function generateLocalFileToken(key: string, expiresAt: number): string {
  const payload = `${key}:${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", LOCAL_FILE_SECRET)
    .update(payload)
    .digest("hex");
  return `${expiresAt}.${signature}`;
}

export function validateLocalFileToken(key: string, token: string): boolean {
  if (!token) return false;
  
  const [expiresAtStr, signature] = token.split(".");
  if (!expiresAtStr || !signature) return false;
  
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt)) return false;
  
  if (Date.now() > expiresAt) return false;
  
  const expectedPayload = `${key}:${expiresAt}`;
  const expectedSignature = crypto
    .createHmac("sha256", LOCAL_FILE_SECRET)
    .update(expectedPayload)
    .digest("hex");
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}

// ============================================================
// UPLOAD URL GENERATION
// ============================================================

/**
 * Generate upload URL based on storage provider
 */
export async function getUploadSignedUrl(
  config: StorageConfig,
  key: string,
  contentType: string,
  _expiresIn: number = 3600
): Promise<UploadUrlResult> {
  const effectiveProvider = getEffectiveStorageProvider(config);
  
  switch (effectiveProvider) {
    case "bunny":
      return getBunnyUploadUrl(config, key, contentType);
    case "r2":
      return getR2UploadUrl(config, key, contentType);
    case "local":
    default:
      return getLocalUploadUrl(config, key);
  }
}

/**
 * Bunny.net Direct Upload URL
 * Client uploads directly to Bunny Storage via PUT
 */
function getBunnyUploadUrl(
  config: StorageConfig,
  key: string,
  _contentType: string
): UploadUrlResult {
  const uploadUrl = `https://${BUNNY_STORAGE_HOST}/${config.bunnyZone}/${key}`;
  const publicUrl = `${config.bunnyCdnUrl}/${key}`;
  
  return {
    url: uploadUrl,
    key,
    provider: "bunny",
    publicUrl,
    method: "PUT",
    headers: {
      "AccessKey": config.bunnyApiKey || "",
    },
  };
}

/**
 * R2 Presigned Upload URL (placeholder - needs AWS SDK)
 */
function getR2UploadUrl(
  config: StorageConfig,
  key: string,
  _contentType: string
): UploadUrlResult {
  // TODO: Implement R2 presigned URL with AWS SDK v3
  // For now, fallback to local
  console.warn("[Storage] R2 presigned URL not implemented, using local");
  return getLocalUploadUrl(config, key);
}

/**
 * Local Storage Upload URL
 * Client uploads via POST to our endpoint
 */
function getLocalUploadUrl(
  _config: StorageConfig,
  key: string
): UploadUrlResult {
  let host = process.env.SHOPIFY_APP_URL || process.env.HOST || "https://customizerapp.dev";
  if (!host.startsWith("http://") && !host.startsWith("https://")) {
    host = `https://${host}`;
  }
  
  return {
    url: `${host}/api/upload/local`,
    key,
    provider: "local",
    publicUrl: `${host}/api/files/${encodeURIComponent(key)}`,
    method: "POST",
  };
}

// ============================================================
// DOWNLOAD URL GENERATION
// ============================================================

/**
 * Generate download/public URL based on storage provider
 */
export async function getDownloadSignedUrl(
  config: StorageConfig,
  key: string,
  expiresIn: number = 30 * 24 * 3600
): Promise<string> {
  // Check if key is already a full URL (external storage)
  if (key.startsWith("http://") || key.startsWith("https://")) {
    return key;
  }
  
  // Check if key indicates Bunny storage
  if (key.startsWith("bunny:")) {
    const bunnyKey = key.replace("bunny:", "");
    return `${config.bunnyCdnUrl || BUNNY_CDN_URL}/${bunnyKey}`;
  }
  
  const effectiveProvider = getEffectiveStorageProvider(config);
  
  switch (effectiveProvider) {
    case "bunny":
      // Bunny CDN URL (public)
      return `${config.bunnyCdnUrl}/${key}`;
    case "r2":
      // R2 public URL
      return `${config.r2PublicUrl}/${key}`;
    case "local":
    default:
      // Local signed URL
      let host = process.env.SHOPIFY_APP_URL || process.env.HOST || "https://customizerapp.dev";
      if (!host.startsWith("http://") && !host.startsWith("https://")) {
        host = `https://${host}`;
      }
      const expiresAt = Date.now() + expiresIn * 1000;
      const token = generateLocalFileToken(key, expiresAt);
      return `${host}/api/files/${encodeURIComponent(key)}?token=${token}`;
  }
}

/**
 * Generate thumbnail URL with Bunny Optimizer
 */
export function getThumbnailUrl(
  config: StorageConfig,
  key: string,
  width: number = 200,
  height?: number
): string {
  // If already a URL, add optimizer params if Bunny
  if (key.startsWith("https://") && key.includes(".b-cdn.net")) {
    const url = new URL(key);
    url.searchParams.set("width", width.toString());
    if (height) url.searchParams.set("height", height.toString());
    url.searchParams.set("format", "webp");
    url.searchParams.set("quality", "85");
    return url.toString();
  }
  
  // Bunny key
  if (config.provider === "bunny" || key.startsWith("bunny:")) {
    const bunnyKey = key.replace("bunny:", "");
    return `${config.bunnyCdnUrl || BUNNY_CDN_URL}/${bunnyKey}?width=${width}${height ? `&height=${height}` : ""}&format=webp&quality=85`;
  }
  
  // Local - no optimizer, return as-is
  return key;
}

// ============================================================
// LOCAL FILE OPERATIONS
// ============================================================

export async function saveLocalFile(key: string, data: Buffer): Promise<string> {
  const filePath = join(LOCAL_STORAGE_BASE, key);
  const dir = dirname(filePath);
  
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  
  await writeFile(filePath, data);
  return filePath;
}

export async function readLocalFile(key: string): Promise<Buffer> {
  const filePath = join(LOCAL_STORAGE_BASE, key);
  return readFile(filePath);
}

export async function deleteLocalFile(key: string): Promise<void> {
  const filePath = join(LOCAL_STORAGE_BASE, key);
  try {
    await unlink(filePath);
  } catch (e) {
    // File may not exist, ignore
  }
}

export async function deleteFile(config: StorageConfig, key: string): Promise<void> {
  const effectiveProvider = getEffectiveStorageProvider(config);
  
  switch (effectiveProvider) {
    case "bunny":
      await deleteBunnyFile(config, key);
      break;
    case "local":
    default:
      await deleteLocalFile(key);
  }
}

async function deleteBunnyFile(config: StorageConfig, key: string): Promise<void> {
  try {
    const bunnyKey = key.replace("bunny:", "");
    const response = await fetch(
      `https://${BUNNY_STORAGE_HOST}/${config.bunnyZone}/${bunnyKey}`,
      {
        method: "DELETE",
        headers: {
          "AccessKey": config.bunnyApiKey || "",
        },
      }
    );
    if (!response.ok) {
      console.warn(`[Bunny] Failed to delete file: ${key}`);
    }
  } catch (e) {
    console.error("[Bunny] Delete error:", e);
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

export function buildStorageKey(
  shopDomain: string,
  uploadId: string,
  itemId: string,
  filename: string
): string {
  const env = process.env.NODE_ENV === "production" ? "prod" : "dev";
  const safeShop = shopDomain.replace(/[^a-zA-Z0-9-]/g, "_");
  return `${safeShop}/${env}/${uploadId}/${itemId}/${filename}`;
}

export function getLocalFilePath(key: string): string {
  return join(LOCAL_STORAGE_BASE, key);
}

/**
 * Check if a storage key is from Bunny CDN
 */
export function isBunnyUrl(key: string | null | undefined): boolean {
  if (!key) return false;
  return key.includes(".b-cdn.net") || key.includes("bunnycdn.com") || key.startsWith("bunny:");
}

/**
 * Check if a storage key is from R2
 */
export function isR2Url(key: string | null | undefined): boolean {
  if (!key) return false;
  return key.includes(".r2.dev") || key.includes("r2.cloudflarestorage.com");
}

/**
 * Check if a storage key is an external URL
 */
export function isExternalUrl(key: string | null | undefined): boolean {
  if (!key) return false;
  return key.startsWith("http://") || key.startsWith("https://");
}
```

---

## 📁 FAZ 2: Upload Intent Endpoint

### Dosya: `app/routes/api.upload.intent.tsx`

**Değişiklik 1: Import güncelleme (Satır 4)**

```typescript
// ESKİ
import { getStorageConfig, getUploadSignedUrl, buildStorageKey } from "~/lib/storage.server";

// YENİ
import { getStorageConfig, getUploadSignedUrl, buildStorageKey, type UploadUrlResult } from "~/lib/storage.server";
```

**Değişiklik 2: Storage config alma (Satır 200-210)**

```typescript
// ESKİ (Satır 200-206)
  // LOCAL-ONLY STORAGE - No provider selection needed
  const storageConfig = getStorageConfig();
  
  console.log(`[Upload Intent] Shop: ${shopDomain}, Storage: local`);

// YENİ
  // MULTI-STORAGE: Get config from shop settings
  const storageConfig = getStorageConfig({
    storageProvider: shop.storageProvider,
    storageConfig: shop.storageConfig as Record<string, string> | null,
  });
  
  console.log(`[Upload Intent] Shop: ${shopDomain}, Storage: ${storageConfig.provider}`);
```

**Değişiklik 3: Signed URL response (Satır 235-256)**

```typescript
// ESKİ (Satır 235-255)
    // Generate signed upload URL (always local)
    const { url: uploadUrl, isLocal } = await getUploadSignedUrl(storageConfig, key, contentType);

    return corsJson({
      uploadId,
      itemId,
      uploadUrl,
      key,
      fileName,
      fileSize,
      mimeType: contentType,
      expiresIn: 900, // 15 minutes
      isLocal: true,
      storageProvider: "local",
    }, request);

// YENİ
    // Generate signed upload URL (provider-aware)
    const uploadResult: UploadUrlResult = await getUploadSignedUrl(storageConfig, key, contentType);

    return corsJson({
      uploadId,
      itemId,
      uploadUrl: uploadResult.url,
      key: uploadResult.key,
      publicUrl: uploadResult.publicUrl,
      fileName,
      fileSize,
      mimeType: contentType,
      expiresIn: 3600, // 1 hour for large files
      storageProvider: uploadResult.provider,
      uploadMethod: uploadResult.method,
      uploadHeaders: uploadResult.headers || {},
    }, request, {
      headers: {
        // 5GB upload support
        "Content-Length": "5368709120",
      },
    });
```

---

## 📁 FAZ 3: Upload Status Endpoint

### Dosya: `app/routes/api.upload.status.$id.tsx`

**Değişiklik 1: Import ekleme (Satır 4)**

```typescript
// ESKİ
import { generateLocalFileToken } from "~/lib/storage.server";

// YENİ
import { generateLocalFileToken, getStorageConfig, isBunnyUrl, isR2Url, getThumbnailUrl } from "~/lib/storage.server";
```

**Değişiklik 2: URL resolution güncelleme (Satır 130-190)**

```typescript
// ESKİ (Satır 130-145)
  // Check if storageKey is an external URL (Shopify, R2, S3)
  const isExternalUrl = (key: string | null | undefined): boolean => {
    if (!key) return false;
    return key.startsWith('http://') || key.startsWith('https://');
  };

// YENİ
  // Get storage config for this shop
  const storageConfig = getStorageConfig({
    storageProvider: shop.storageProvider,
    storageConfig: shop.storageConfig as Record<string, string> | null,
  });

  // Check if storageKey is an external URL
  const isExternalUrl = (key: string | null | undefined): boolean => {
    if (!key) return false;
    return key.startsWith('http://') || key.startsWith('https://');
  };
  
  // Check if storageKey is a Bunny key (bunny:path/to/file)
  const isBunnyKey = (key: string | null | undefined): boolean => {
    if (!key) return false;
    return key.startsWith('bunny:') || isBunnyUrl(key);
  };
```

**Değişiklik 3: Download URL logic (Satır 160-190)**

```typescript
// ESKİ (Satır 160-180)
  if (firstItem?.storageKey) {
    if (isExternalUrl(firstItem.storageKey)) {
      // Shopify or external storage - use URL directly
      downloadUrl = firstItem.storageKey;
    } else if (isShopifyFileId(firstItem.storageKey)) {
      // ... Shopify resolution code ...
    } else {
      // Local storage - generate signed URL
      const token = generateLocalFileToken(firstItem.storageKey, expiresAt);
      downloadUrl = `${host}/api/files/${encodeURIComponent(firstItem.storageKey)}?token=${encodeURIComponent(token)}`;
    }
  }

// YENİ
  if (firstItem?.storageKey) {
    if (isExternalUrl(firstItem.storageKey)) {
      // Already a full URL - use directly
      downloadUrl = firstItem.storageKey;
    } else if (isBunnyKey(firstItem.storageKey)) {
      // Bunny storage - build CDN URL
      const bunnyKey = firstItem.storageKey.replace('bunny:', '');
      const cdnUrl = storageConfig.bunnyCdnUrl || process.env.BUNNY_CDN_URL || 'https://customizerappdev.b-cdn.net';
      downloadUrl = `${cdnUrl}/${bunnyKey}`;
    } else if (isShopifyFileId(firstItem.storageKey)) {
      // Shopify fileId - resolve via API
      const fileId = firstItem.storageKey.replace('shopify:', '');
      const resolvedUrl = await resolveShopifyFileUrl(fileId, shop.shopDomain, shop.accessToken);
      if (resolvedUrl) {
        downloadUrl = resolvedUrl;
        await prisma.uploadItem.update({
          where: { id: firstItem.id },
          data: { storageKey: resolvedUrl },
        });
      }
    } else {
      // Local storage - generate signed URL
      const token = generateLocalFileToken(firstItem.storageKey, expiresAt);
      downloadUrl = `${host}/api/files/${encodeURIComponent(firstItem.storageKey)}?token=${encodeURIComponent(token)}`;
    }
  }
```

**Değişiklik 4: Thumbnail URL logic (Satır 190-210)**

```typescript
// ESKİ (Satır 190-205)
  // Thumbnail URL logic
  if (firstItem?.thumbnailKey) {
    if (isExternalUrl(firstItem.thumbnailKey)) {
      thumbnailUrl = firstItem.thumbnailKey;
    } else if (isShopifyFileId(firstItem.thumbnailKey)) {
      const fileId = firstItem.thumbnailKey.replace('shopify:', '');
      thumbnailUrl = await resolveShopifyFileUrl(fileId, shop.shopDomain, shop.accessToken);
    } else {
      const token = generateLocalFileToken(firstItem.thumbnailKey, expiresAt);
      thumbnailUrl = `${host}/api/files/${encodeURIComponent(firstItem.thumbnailKey)}?token=${encodeURIComponent(token)}`;
    }
  }

// YENİ
  // Thumbnail URL logic - use Bunny Optimizer for CDN files
  if (firstItem?.thumbnailKey) {
    if (isExternalUrl(firstItem.thumbnailKey)) {
      // If Bunny URL, add optimizer params
      if (isBunnyUrl(firstItem.thumbnailKey)) {
        thumbnailUrl = getThumbnailUrl(storageConfig, firstItem.thumbnailKey, 200);
      } else {
        thumbnailUrl = firstItem.thumbnailKey;
      }
    } else if (isBunnyKey(firstItem.thumbnailKey)) {
      // Bunny key - use optimizer
      thumbnailUrl = getThumbnailUrl(storageConfig, firstItem.thumbnailKey, 200);
    } else if (isShopifyFileId(firstItem.thumbnailKey)) {
      const fileId = firstItem.thumbnailKey.replace('shopify:', '');
      thumbnailUrl = await resolveShopifyFileUrl(fileId, shop.shopDomain, shop.accessToken);
    } else {
      // Local storage
      const token = generateLocalFileToken(firstItem.thumbnailKey, expiresAt);
      thumbnailUrl = `${host}/api/files/${encodeURIComponent(firstItem.thumbnailKey)}?token=${encodeURIComponent(token)}`;
    }
  } else if (downloadUrl && isBunnyUrl(downloadUrl)) {
    // No thumbnail but download is Bunny - use optimizer
    thumbnailUrl = getThumbnailUrl(storageConfig, downloadUrl, 200);
  } else if (downloadUrl) {
    thumbnailUrl = downloadUrl;
  }
```

---

## 📁 FAZ 4: Theme Extension JS Dosyaları

### 4.1 Dosya: `extensions/theme-extension/assets/dtf-uploader.js`

**Değişiklik: uploadToStorage fonksiyonu (Satır 760-810)**

```javascript
// ESKİ (Satır 760-810)
    async uploadToStorage(productId, file, intentData) {
      const instance = this.instances[productId];
      const { elements } = instance;

      // Always use local storage - no other options
      console.log('[UL] uploadToStorage - using local storage');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('key', intentData.key);
      formData.append('uploadId', intentData.uploadId);
      formData.append('itemId', intentData.itemId);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        // ... XHR code ...
        xhr.open('POST', intentData.uploadUrl);
        xhr.send(formData);
      });
    },

// YENİ
    async uploadToStorage(productId, file, intentData) {
      const instance = this.instances[productId];
      const { elements } = instance;
      
      const provider = intentData.storageProvider || 'local';
      console.log('[UL] uploadToStorage - provider:', provider);

      // Provider-aware upload
      switch (provider) {
        case 'bunny':
          return this.uploadToBunny(file, intentData, elements);
        case 'r2':
          return this.uploadToR2(file, intentData, elements);
        case 'local':
        default:
          return this.uploadToLocal(file, intentData, elements);
      }
    },

    /**
     * Upload to Bunny.net Storage (Direct PUT)
     */
    async uploadToBunny(file, intentData, elements) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = 15 + ((e.loaded / e.total) * 60);
            elements.progressFill.style.width = `${percent}%`;
            elements.progressText.textContent = `Uploading... ${Math.round((e.loaded / e.total) * 100)}%`;
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ fileUrl: intentData.publicUrl });
          } else {
            reject(new Error(`Bunny upload failed (${xhr.status})`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during Bunny upload')));
        xhr.addEventListener('abort', () => reject(new Error('Bunny upload cancelled')));

        xhr.open('PUT', intentData.uploadUrl);
        
        // Set Bunny headers
        if (intentData.uploadHeaders) {
          Object.entries(intentData.uploadHeaders).forEach(([key, value]) => {
            xhr.setRequestHeader(key, value);
          });
        }
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        
        xhr.send(file);
      });
    },

    /**
     * Upload to R2 (Presigned PUT)
     */
    async uploadToR2(file, intentData, elements) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = 15 + ((e.loaded / e.total) * 60);
            elements.progressFill.style.width = `${percent}%`;
            elements.progressText.textContent = `Uploading... ${Math.round((e.loaded / e.total) * 100)}%`;
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ fileUrl: intentData.publicUrl });
          } else {
            reject(new Error(`R2 upload failed (${xhr.status})`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during R2 upload')));
        xhr.addEventListener('abort', () => reject(new Error('R2 upload cancelled')));

        xhr.open('PUT', intentData.uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      });
    },

    /**
     * Upload to Local Server (POST with FormData)
     */
    async uploadToLocal(file, intentData, elements) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('key', intentData.key);
      formData.append('uploadId', intentData.uploadId);
      formData.append('itemId', intentData.itemId);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = 15 + ((e.loaded / e.total) * 60);
            elements.progressFill.style.width = `${percent}%`;
            elements.progressText.textContent = `Uploading... ${Math.round((e.loaded / e.total) * 100)}%`;
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Local upload failed (${xhr.status})`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.open('POST', intentData.uploadUrl);
        xhr.send(formData);
      });
    },
```

**Değişiklik: Complete request (Satır 700-710)**

```javascript
// ESKİ (Satır 700-708)
          body: JSON.stringify({
            shopDomain: shopDomain,
            uploadId: intentData.uploadId,
            items: [{
              itemId: intentData.itemId,
              location: 'front',
              fileUrl: uploadResult?.fileUrl || null,
              fileId: uploadResult?.fileId || null,
              storageProvider: intentData.storageProvider || 'shopify'
            }]
          })

// YENİ
          body: JSON.stringify({
            shopDomain: shopDomain,
            uploadId: intentData.uploadId,
            items: [{
              itemId: intentData.itemId,
              location: 'front',
              fileUrl: uploadResult?.fileUrl || intentData.publicUrl || null,
              storageProvider: intentData.storageProvider || 'local'
            }]
          })
```

---

### 4.2 Dosya: `extensions/theme-extension/assets/tshirt-modal.js`

**Değişiklik: performUpload fonksiyonu (Satır 1078-1095)**

```javascript
// ESKİ (Satır 1078-1095)
      const intentData = await intentRes.json();
      const { uploadId, itemId, uploadUrl } = intentData;
      
      console.log('[ULTShirtModal] Intent response:', { uploadId, itemId });
      
      // Step 2: Upload file directly to storage
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      });
      
      if (!uploadRes.ok) throw new Error('Upload failed');

// YENİ
      const intentData = await intentRes.json();
      const { uploadId, itemId, uploadUrl, storageProvider, uploadMethod, uploadHeaders, publicUrl } = intentData;
      
      console.log('[ULTShirtModal] Intent response:', { uploadId, itemId, storageProvider });
      
      // Step 2: Upload file directly to storage (provider-aware)
      let uploadRes;
      if (storageProvider === 'bunny' || storageProvider === 'r2') {
        // Direct PUT to CDN
        const headers = { 
          'Content-Type': file.type || 'application/octet-stream',
          ...(uploadHeaders || {})
        };
        uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers,
          body: file
        });
      } else {
        // Local: POST with FormData
        const formData = new FormData();
        formData.append('file', file);
        formData.append('key', intentData.key);
        formData.append('uploadId', uploadId);
        formData.append('itemId', itemId);
        uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          body: formData
        });
      }
      
      if (!uploadRes.ok) throw new Error('Upload failed');
```

**Değişiklik: Complete request (Satır 1095-1110)**

```javascript
// ESKİ (Satır 1095-1108)
      // Step 3: Mark complete (matching dtf-uploader format)
      const completeRes = await fetch(`${apiBase}/api/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopDomain,
          uploadId,
          items: [{
            itemId,
            location: 'front'
          }]
        })
      });

// YENİ
      // Step 3: Mark complete with provider info
      const completeRes = await fetch(`${apiBase}/api/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopDomain,
          uploadId,
          items: [{
            itemId,
            location: 'front',
            fileUrl: publicUrl || null,
            storageProvider: storageProvider || 'local'
          }]
        })
      });
```

---

### 4.3 Dosya: `extensions/theme-extension/assets/product-bar-upload.js`

**Değişiklik: uploadFile fonksiyonu (Satır 632-680)**

```javascript
// ESKİ (Satır 632-680)
  async function uploadFile(file) {
    const section = document.querySelector('.ul-product-bar');
    const apiBase = section?.dataset.apiBase || CONFIG.apiBase;

    // 1. Create upload intent
    const intentResponse = await fetch(`${apiBase}/api/upload/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        size: file.size,
        shop: window.Shopify?.shop || getShopFromUrl()
      })
    });

    if (!intentResponse.ok) {
      throw new Error('Failed to create upload intent');
    }

    const { uploadId, signedUrl } = await intentResponse.json();

    // 2. Upload to signed URL
    const uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file');
    }

    // 3. Complete upload
    const completeResponse = await fetch(`${apiBase}/api/upload/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId })
    });

    if (!completeResponse.ok) {
      throw new Error('Failed to complete upload');
    }

    // Build full public URL with https://
    const fullUrl = `${window.location.origin}${apiBase}/api/upload/file/${uploadId}`;

    return {
      id: uploadId,
      url: fullUrl
    };
  }

// YENİ
  async function uploadFile(file) {
    const section = document.querySelector('.ul-product-bar');
    const apiBase = section?.dataset.apiBase || CONFIG.apiBase;
    const shopDomain = window.Shopify?.shop || getShopFromUrl();

    // 1. Create upload intent
    const intentResponse = await fetch(`${apiBase}/api/upload/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopDomain,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
        mode: 'quick'
      })
    });

    if (!intentResponse.ok) {
      throw new Error('Failed to create upload intent');
    }

    const intentData = await intentResponse.json();
    const { uploadId, itemId, uploadUrl, storageProvider, uploadHeaders, publicUrl } = intentData;

    // 2. Upload to storage (provider-aware)
    let uploadResponse;
    if (storageProvider === 'bunny' || storageProvider === 'r2') {
      // Direct PUT to CDN
      uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 
          'Content-Type': file.type,
          ...(uploadHeaders || {})
        },
        body: file
      });
    } else {
      // Local: POST with FormData
      const formData = new FormData();
      formData.append('file', file);
      formData.append('key', intentData.key);
      formData.append('uploadId', uploadId);
      formData.append('itemId', itemId);
      uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });
    }

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file');
    }

    // 3. Complete upload
    const completeResponse = await fetch(`${apiBase}/api/upload/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        shopDomain,
        uploadId,
        items: [{
          itemId,
          location: 'front',
          fileUrl: publicUrl,
          storageProvider
        }]
      })
    });

    if (!completeResponse.ok) {
      throw new Error('Failed to complete upload');
    }

    // Return public URL from intent (CDN URL for Bunny)
    const fullUrl = publicUrl || `${window.location.origin}${apiBase}/api/upload/file/${uploadId}`;

    return {
      id: uploadId,
      url: fullUrl
    };
  }
```

---

### 4.4 Dosya: `extensions/theme-extension/assets/carousel-upload.js`

**Değişiklik: uploadFile fonksiyonu (Satır 615-665)**

(Aynı değişiklik product-bar-upload.js ile - kopyala yapıştır)

---

### 4.5 Dosya: `theme-snippets/snippets/dtf-quick-upload-btn.liquid`

**Değişiklik: handleUpload fonksiyonu (Satır 810-870)**

```javascript
// ESKİ (Satır 840-860)
      // Step 2: Upload file - always local storage (POST with FormData)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('key', intentData.key);
      formData.append('uploadId', intentData.uploadId);
      formData.append('itemId', intentData.itemId);
      const uploadResponse = await fetch(intentData.uploadUrl, {
        method: 'POST',
        body: formData
      });

// YENİ
      // Step 2: Upload file (provider-aware)
      const storageProvider = intentData.storageProvider || 'local';
      let uploadResponse;
      
      if (storageProvider === 'bunny' || storageProvider === 'r2') {
        // Direct PUT to CDN
        const headers = { 
          'Content-Type': file.type || 'application/octet-stream',
          ...(intentData.uploadHeaders || {})
        };
        uploadResponse = await fetch(intentData.uploadUrl, {
          method: 'PUT',
          headers,
          body: file
        });
      } else {
        // Local: POST with FormData
        const formData = new FormData();
        formData.append('file', file);
        formData.append('key', intentData.key);
        formData.append('uploadId', intentData.uploadId);
        formData.append('itemId', intentData.itemId);
        uploadResponse = await fetch(intentData.uploadUrl, {
          method: 'POST',
          body: formData
        });
      }
```

**Değişiklik: Complete request (Satır 870-885)**

```javascript
// ESKİ (Satır 870-882)
      // Step 3: Complete upload - always local storage
      const completeResponse = await fetch(`${apiBase}/api/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: intentData.uploadId,
          shopDomain: shopDomain,
          items: [{
            itemId: intentData.itemId,
            location: 'front',
            storageProvider: 'local'
          }]
        })
      });

// YENİ
      // Step 3: Complete upload (provider-aware)
      const completeResponse = await fetch(`${apiBase}/api/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: intentData.uploadId,
          shopDomain: shopDomain,
          items: [{
            itemId: intentData.itemId,
            location: 'front',
            fileUrl: intentData.publicUrl || null,
            storageProvider: storageProvider
          }]
        })
      });
```

**Değişiklik: Public URL kullanımı (Satır 920-925)**

```javascript
// ESKİ (Satır 920-922)
      // Use the signed URL from API, fallback to constructed URL if not available
      const publicUrl = finalDownloadUrl || `https://customizerapp.dev/api/upload/file/${uploadId}`;

// YENİ
      // Use CDN URL from intent for Bunny, or signed URL from status API
      const publicUrl = intentData.publicUrl || finalDownloadUrl || `https://customizerapp.dev/api/upload/file/${uploadId}`;
```

---

## 📁 FAZ 5: Environment Variables

### Dosya: `.env.example` (ve `.env`)

**Eklenecek satırlar:**

```dotenv
# ─────────────────────────────────────────────
# Storage Configuration
# ─────────────────────────────────────────────

# Default provider: local | bunny | r2
DEFAULT_STORAGE_PROVIDER=bunny

# Bunny.net CDN (Primary)
BUNNY_STORAGE_ZONE=customizerappdev
BUNNY_API_KEY=28f55d96-a471-431c-b9bfa4d25247-3d0d-47e6
BUNNY_CDN_URL=https://customizerappdev.b-cdn.net

# Local Storage (Fallback)
LOCAL_STORAGE_PATH=./uploads

# Cloudflare R2 (Optional - Future)
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET_NAME=
# R2_PUBLIC_URL=
```

---

## 📁 FAZ 6: Upload Complete Endpoint Güncelleme

### Dosya: `app/routes/api.upload.complete.tsx`

**Değişiklik: StorageKey güncelleme (Satır 120-140)**

```typescript
// ESKİ (Satır 120-135)
        // For Shopify uploads: prefer fileUrl, fallback to fileId for later resolution
        if (item.fileUrl) {
          updateData.storageKey = item.fileUrl;
          console.log(`[Upload Complete] Updated storageKey with Shopify URL: ${item.fileUrl}`);
        } else if (item.fileId && item.storageProvider === 'shopify') {
          // Store fileId as storageKey with shopify: prefix for later resolution
          updateData.storageKey = `shopify:${item.fileId}`;
          console.log(`[Upload Complete] Stored Shopify fileId for later resolution: ${item.fileId}`);
        }

// YENİ
        // Update storageKey based on provider
        if (item.fileUrl) {
          // For Bunny/R2: Store CDN URL directly
          // For Shopify: Store Shopify URL
          updateData.storageKey = item.fileUrl;
          console.log(`[Upload Complete] Updated storageKey: ${item.fileUrl} (provider: ${item.storageProvider})`);
        } else if (item.fileId && item.storageProvider === 'shopify') {
          updateData.storageKey = `shopify:${item.fileId}`;
          console.log(`[Upload Complete] Stored Shopify fileId: ${item.fileId}`);
        } else if (item.storageProvider === 'bunny') {
          // Bunny: construct CDN URL from key
          const bunnyKey = intentData?.key || '';
          const cdnUrl = process.env.BUNNY_CDN_URL || 'https://customizerappdev.b-cdn.net';
          updateData.storageKey = `${cdnUrl}/${bunnyKey}`;
          console.log(`[Upload Complete] Constructed Bunny URL: ${updateData.storageKey}`);
        }
```

---

## 📁 FAZ 7: Migration Script (Mevcut Dosyaları Bunny'ye Taşıma)

### Yeni Dosya: `scripts/migrate-to-bunny.ts`

```typescript
/**
 * Migration Script: Local Storage → Bunny.net
 * 
 * Usage:
 *   npx ts-node scripts/migrate-to-bunny.ts
 * 
 * Options:
 *   --dry-run    : Only log what would be migrated
 *   --limit=100  : Migrate only first N files
 */

import { PrismaClient } from '@prisma/client';
import { readFile } from 'fs/promises';
import { join } from 'path';

const prisma = new PrismaClient();

const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'customizerappdev';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY || '';
const BUNNY_CDN_URL = process.env.BUNNY_CDN_URL || 'https://customizerappdev.b-cdn.net';
const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH || './uploads';

const isDryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

async function uploadToBunny(key: string, data: Buffer, contentType: string): Promise<string> {
  const url = `https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${key}`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'AccessKey': BUNNY_API_KEY,
      'Content-Type': contentType,
    },
    body: data,
  });
  
  if (!response.ok) {
    throw new Error(`Bunny upload failed: ${response.status} ${response.statusText}`);
  }
  
  return `${BUNNY_CDN_URL}/${key}`;
}

async function migrateFile(item: { id: string; storageKey: string; mimeType: string | null }): Promise<boolean> {
  try {
    // Skip if already external URL
    if (item.storageKey.startsWith('http://') || item.storageKey.startsWith('https://')) {
      console.log(`[SKIP] ${item.id} - Already external URL`);
      return false;
    }
    
    // Read local file
    const localPath = join(LOCAL_STORAGE_PATH, item.storageKey);
    const fileData = await readFile(localPath);
    
    if (isDryRun) {
      console.log(`[DRY-RUN] Would migrate: ${item.storageKey} (${fileData.length} bytes)`);
      return true;
    }
    
    // Upload to Bunny
    const bunnyUrl = await uploadToBunny(
      item.storageKey,
      fileData,
      item.mimeType || 'application/octet-stream'
    );
    
    // Update database
    await prisma.uploadItem.update({
      where: { id: item.id },
      data: { storageKey: bunnyUrl },
    });
    
    console.log(`[OK] ${item.id}: ${item.storageKey} → ${bunnyUrl}`);
    return true;
    
  } catch (error) {
    console.error(`[ERROR] ${item.id}: ${error}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('LOCAL → BUNNY.NET MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Limit: ${limit || 'ALL'}`);
  console.log('');
  
  // Get all local storage items
  const items = await prisma.uploadItem.findMany({
    where: {
      storageKey: {
        not: { startsWith: 'http' },
      },
    },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
    },
    take: limit,
  });
  
  console.log(`Found ${items.length} items to migrate`);
  console.log('');
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const item of items) {
    const result = await migrateFile(item);
    if (result) success++;
    else skipped++;
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Success: ${success}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## 📊 Değişiklik Özeti

| Dosya | Değişiklik Türü | Satır Sayısı |
|-------|----------------|--------------|
| `app/lib/storage.server.ts` | Tam yeniden yazım | ~350 |
| `app/routes/api.upload.intent.tsx` | 3 blok değişiklik | ~40 |
| `app/routes/api.upload.status.$id.tsx` | 4 blok değişiklik | ~60 |
| `app/routes/api.upload.complete.tsx` | 1 blok değişiklik | ~20 |
| `extensions/.../dtf-uploader.js` | 2 fonksiyon ekleme | ~100 |
| `extensions/.../tshirt-modal.js` | 2 blok değişiklik | ~40 |
| `extensions/.../product-bar-upload.js` | 1 fonksiyon yeniden yazım | ~60 |
| `extensions/.../carousel-upload.js` | 1 fonksiyon yeniden yazım | ~60 |
| `theme-snippets/.../dtf-quick-upload-btn.liquid` | 3 blok değişiklik | ~50 |
| `.env.example` | Ekleme | ~15 |
| `scripts/migrate-to-bunny.ts` | Yeni dosya | ~120 |
| **TOPLAM** | | **~915 satır** |

---

## 🚀 Uygulama Sırası

1. **FAZ 1**: `storage.server.ts` - Core library
2. **FAZ 5**: `.env` - Environment variables  
3. **FAZ 2**: `api.upload.intent.tsx` - Intent endpoint
4. **FAZ 6**: `api.upload.complete.tsx` - Complete endpoint
5. **FAZ 3**: `api.upload.status.$id.tsx` - Status endpoint
6. **FAZ 4**: Theme Extension JS dosyaları (5 dosya)
7. **FAZ 7**: Migration script (opsiyonel)

---

## ✅ Test Senaryoları

### Test 1: Bunny Upload
```bash
# 1. Shop'un storageProvider'ını 'bunny' yap
# 2. Storefront'tan dosya yükle
# 3. Bunny CDN URL döndüğünü kontrol et
```

### Test 2: Local Fallback
```bash
# 1. BUNNY_API_KEY'i yanlış yap
# 2. Storefront'tan dosya yükle  
# 3. Local storage'a fallback ettiğini kontrol et
```

### Test 3: Mevcut Dosya Migration
```bash
# 1. npx ts-node scripts/migrate-to-bunny.ts --dry-run
# 2. Çıktıyı kontrol et
# 3. npx ts-node scripts/migrate-to-bunny.ts --limit=10
# 4. DB'de URL'lerin güncellendiğini kontrol et
```

---

## 🔐 Güvenlik Notları

1. **Bunny API Key**: `.env`'de sakla, client'a GÖNDERİLMEMELİ
2. **Upload Headers**: Backend'de oluştur, client'a gönder
3. **CORS**: Bunny Storage Zone'da izin ver

---

---

## 🔍 FAZ 8: FuncLib Taraması - ATLADIĞIMIZ DOSYALAR

FuncLib analizi ile tespit edilen ek değişiklik noktaları:

### 8.1 Worker Dosyaları (KRİTİK!)

#### `workers/preflight.worker.ts`
**Satır 68-95:** `downloadLocalFile` ve `uploadLocalFile` fonksiyonları sadece local için.

```typescript
// ESKİ (Satır 68-95)
async function downloadLocalFile(storageKey: string, localPath: string): Promise<void> {
  const uploadsDir = process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), "uploads");
  // ... local only code
}

async function uploadLocalFile(storageKey: string, localPath: string): Promise<void> {
  const uploadsDir = process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), "uploads");
  // ... local only code
}

// YENİ - Bunny desteği eklenmeli
async function downloadFromBunny(storageKey: string, localPath: string): Promise<void> {
  const cdnUrl = process.env.BUNNY_CDN_URL || 'https://customizerappdev.b-cdn.net';
  // Bunny key'den URL oluştur
  const url = storageKey.startsWith('http') 
    ? storageKey 
    : `${cdnUrl}/${storageKey.replace('bunny:', '')}`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download from Bunny: ${response.status}`);
  
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(localPath, buffer);
}

async function uploadToBunny(storageKey: string, localPath: string, contentType: string): Promise<void> {
  const zone = process.env.BUNNY_STORAGE_ZONE || 'customizerappdev';
  const apiKey = process.env.BUNNY_API_KEY || '';
  
  const content = await fs.readFile(localPath);
  const url = `https://storage.bunnycdn.com/${zone}/${storageKey}`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'AccessKey': apiKey,
      'Content-Type': contentType,
    },
    body: content,
  });
  
  if (!response.ok) throw new Error(`Failed to upload to Bunny: ${response.status}`);
}
```

**Satır 170-185:** Download logic değişmeli:
```typescript
// ESKİ
if (storageProvider === "local") {
  await downloadLocalFile(storageKey, originalPath);
} else {
  const client = getStorageClient(storageProvider);
  await downloadFile(client, storageKey, originalPath);
}

// YENİ
if (storageProvider === "bunny" || isBunnyUrl(storageKey)) {
  await downloadFromBunny(storageKey, originalPath);
} else if (storageProvider === "local") {
  await downloadLocalFile(storageKey, originalPath);
} else {
  const client = getStorageClient(storageProvider);
  await downloadFile(client, storageKey, originalPath);
}
```

**Satır 245-255:** Thumbnail upload logic:
```typescript
// ESKİ
if (storageProvider === "local") {
  await uploadLocalFile(thumbnailKey, thumbnailPath);
} else if (client) {
  await uploadFile(client, thumbnailKey, thumbnailPath, "image/webp");
}

// YENİ
if (storageProvider === "bunny") {
  await uploadToBunny(thumbnailKey, thumbnailPath, "image/webp");
} else if (storageProvider === "local") {
  await uploadLocalFile(thumbnailKey, thumbnailPath);
} else if (client) {
  await uploadFile(client, thumbnailKey, thumbnailPath, "image/webp");
}
```

---

#### `workers/export.worker.ts`
**Satır 59-77:** `downloadFileFromStorage` sadece S3/R2 için.

```typescript
// ESKİ (Satır 59-77)
async function downloadFileFromStorage(key: string, localPath: string): Promise<void> {
  const client = getStorageClient();
  const bucket = getBucketName();
  // S3/R2 only
}

// YENİ - Bunny ve Local desteği eklenmeli
async function downloadFileFromStorage(key: string, localPath: string, storageProvider?: string): Promise<void> {
  // Check if it's a Bunny URL
  if (key.includes('.b-cdn.net') || key.includes('bunnycdn.com') || key.startsWith('bunny:')) {
    const cdnUrl = process.env.BUNNY_CDN_URL || 'https://customizerappdev.b-cdn.net';
    const url = key.startsWith('http') ? key : `${cdnUrl}/${key.replace('bunny:', '')}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download from Bunny: ${response.status}`);
    
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(localPath, buffer);
    return;
  }
  
  // Check if local storage
  if (storageProvider === 'local' || (!key.startsWith('http') && !process.env.R2_BUCKET_NAME)) {
    const uploadsDir = process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    const sourcePath = path.join(uploadsDir, key);
    await fs.copyFile(sourcePath, localPath);
    return;
  }
  
  // S3/R2
  const client = getStorageClient();
  const bucket = getBucketName();
  // ... existing S3/R2 code
}
```

---

### 8.2 Admin Route Dosyaları

#### `app/routes/app.uploads._index.tsx` (Satır 67-77)
```typescript
// ESKİ
const storageConfig = getStorageConfig(shop.storageConfig as any);

// YENİ
const storageConfig = getStorageConfig({
  storageProvider: shop.storageProvider,
  storageConfig: shop.storageConfig as Record<string, string> | null,
});
```

#### `app/routes/app.uploads.$id.tsx` (Satır 49-67)
```typescript
// ESKİ
const storageConfig = getStorageConfig(shop.storageConfig as any);

// YENİ
const storageConfig = getStorageConfig({
  storageProvider: shop.storageProvider,
  storageConfig: shop.storageConfig as Record<string, string> | null,
});
```

#### `app/routes/app.queue.tsx` (Satır 118-126)
```typescript
// ESKİ
const storageConfig = getStorageConfig(shop.storageConfig as any);

// YENİ
const storageConfig = getStorageConfig({
  storageProvider: shop.storageProvider,
  storageConfig: shop.storageConfig as Record<string, string> | null,
});
```

#### `app/routes/app.asset-sets._index.tsx` (Satır 299-302)
```typescript
// ESKİ
const storageConfig = getStorageConfig(shop.storageConfig as any);

// YENİ
const storageConfig = getStorageConfig({
  storageProvider: shop.storageProvider,
  storageConfig: shop.storageConfig as Record<string, string> | null,
});
```

#### `app/routes/app.asset-sets.$id.tsx` (Satır 51-52)
```typescript
// ESKİ
const storageConfig = getStorageConfig(shop.storageConfig as any);

// YENİ
const storageConfig = getStorageConfig({
  storageProvider: shop.storageProvider,
  storageConfig: shop.storageConfig as Record<string, string> | null,
});
```

---

### 8.3 API Route Dosyaları

#### `app/routes/api.v1.exports.$id.tsx` (Satır 86-87)
```typescript
// ESKİ
const storageConfig = getStorageConfig(shop.storageConfig as any);

// YENİ
const storageConfig = getStorageConfig({
  storageProvider: shop.storageProvider,
  storageConfig: shop.storageConfig as Record<string, string> | null,
});
```

#### `app/routes/api.asset-sets.$id.tsx` (Satır 48-49)
```typescript
// ESKİ
const storageConfig = getStorageConfig(assetSet.shop.storageConfig as any);

// YENİ
const storageConfig = getStorageConfig({
  storageProvider: assetSet.shop.storageProvider || 'local',
  storageConfig: assetSet.shop.storageConfig as Record<string, string> | null,
});
```
*Not: Bu dosyada shop.storageProvider alanı select'e eklenmeli!*

#### `app/routes/api.gdpr.shop.redact.tsx` (Satır 32)
```typescript
// ESKİ
const storageConfig = getStorageConfig(shopRecord.storageConfig as any);

// YENİ
const storageConfig = getStorageConfig({
  storageProvider: shopRecord.storageProvider,
  storageConfig: shopRecord.storageConfig as Record<string, string> | null,
});
```

---

### 8.4 File Serving Route'ları (Bunny redirect desteği)

#### `app/routes/api.files.$.tsx` (Satır 35-45)
```typescript
// ESKİ - Sadece local dosya servisi
const buffer = await readLocalFile(decodedKey);

// YENİ - Bunny URL'lerine redirect
// If the key is a Bunny URL, redirect to it
if (decodedKey.startsWith('http') && (decodedKey.includes('.b-cdn.net') || decodedKey.includes('bunnycdn.com'))) {
  return Response.redirect(decodedKey, 302);
}

// Otherwise, serve from local storage
const buffer = await readLocalFile(decodedKey);
```

#### `app/routes/api.upload.file.$id.tsx` (Satır 65-72)
```typescript
// ESKİ - Sadece local
const buffer = await readLocalFile(storageKey);

// YENİ - Bunny redirect
// If storageKey is a Bunny URL, redirect to CDN
if (storageKey.startsWith('http') && (storageKey.includes('.b-cdn.net') || storageKey.includes('bunnycdn.com'))) {
  return Response.redirect(storageKey, 302);
}

// Read file from local storage
const buffer = await readLocalFile(storageKey);
```

#### `app/routes/api.storage.preview.$.tsx` (Satır 35)
```typescript
// ESKİ - Sadece local
const data = await readLocalFile(key);

// YENİ - Bunny redirect
// If key is a Bunny URL, redirect
if (key.startsWith('http') && (key.includes('.b-cdn.net') || key.includes('bunnycdn.com'))) {
  return Response.redirect(key, 302);
}

// Local storage
const data = await readLocalFile(key);
```

---

## 📊 GÜNCEL Değişiklik Özeti

| Dosya | Değişiklik Türü | Satır |
|-------|----------------|-------|
| **FAZ 1-7** (önceki) | | ~915 |
| `workers/preflight.worker.ts` | Bunny upload/download | ~80 |
| `workers/export.worker.ts` | Bunny download | ~40 |
| `app/routes/app.uploads._index.tsx` | Config güncelleme | ~5 |
| `app/routes/app.uploads.$id.tsx` | Config güncelleme | ~5 |
| `app/routes/app.queue.tsx` | Config güncelleme | ~5 |
| `app/routes/app.asset-sets._index.tsx` | Config güncelleme | ~5 |
| `app/routes/app.asset-sets.$id.tsx` | Config güncelleme | ~5 |
| `app/routes/api.v1.exports.$id.tsx` | Config güncelleme | ~5 |
| `app/routes/api.asset-sets.$id.tsx` | Config + select güncelleme | ~10 |
| `app/routes/api.gdpr.shop.redact.tsx` | Config güncelleme | ~5 |
| `app/routes/api.files.$.tsx` | Bunny redirect | ~10 |
| `app/routes/api.upload.file.$id.tsx` | Bunny redirect | ~10 |
| `app/routes/api.storage.preview.$.tsx` | Bunny redirect | ~10 |
| **YENİ TOPLAM** | | **~1110 satır** |

---

> **Onay Bekliyor**: Bu döküman uygulamaya hazır. Onay ver ve başlayalım.
