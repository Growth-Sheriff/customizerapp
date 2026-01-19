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
 * NOTE: We read process.env directly here to ensure we get the latest values
 * after dotenv has loaded the .env file
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
  
  // Read env vars directly to ensure we get values after dotenv loads
  const envBunnyZone = process.env.BUNNY_STORAGE_ZONE || "customizerappdev";
  const envBunnyApiKey = process.env.BUNNY_API_KEY || "";
  const envBunnyCdnUrl = process.env.BUNNY_CDN_URL || "https://customizerappdev.b-cdn.net";
  
  return {
    provider,
    // Local
    localPath: LOCAL_STORAGE_BASE,
    // Bunny (shop config overrides env) - read env directly
    bunnyZone: shopStorageConfig.bunnyZone || envBunnyZone,
    bunnyApiKey: shopStorageConfig.bunnyApiKey || envBunnyApiKey,
    bunnyCdnUrl: shopStorageConfig.bunnyCdnUrl || envBunnyCdnUrl,
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
