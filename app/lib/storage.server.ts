import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import crypto from "crypto";

/**
 * LOCAL-ONLY STORAGE SYSTEM
 * =========================
 * This app uses ONLY local file storage. R2/S3/Shopify Files are removed.
 * Files are stored on the server filesystem with HMAC-signed download URLs.
 * 
 * Environment Variables:
 * - LOCAL_STORAGE_PATH: Base directory for file storage (default: ./uploads)
 * - SECRET_KEY: HMAC secret for signed URL tokens
 * - HOST: App host URL for generating download URLs
 */

const LOCAL_STORAGE_BASE = process.env.LOCAL_STORAGE_PATH || "./uploads";
const LOCAL_FILE_SECRET = process.env.SECRET_KEY || "fallback-secret-key";

// ============================================================
// SIGNED URL TOKEN GENERATION & VALIDATION
// ============================================================

/**
 * Generate HMAC-SHA256 signed token for secure file access
 */
export function generateLocalFileToken(key: string, expiresAt: number): string {
  const payload = `${key}:${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", LOCAL_FILE_SECRET)
    .update(payload)
    .digest("hex");
  return `${expiresAt}.${signature}`;
}

/**
 * Validate signed token for file access
 */
export function validateLocalFileToken(key: string, token: string): boolean {
  if (!token) return false;
  
  const [expiresAtStr, signature] = token.split(".");
  if (!expiresAtStr || !signature) return false;
  
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt)) return false;
  
  // Check if token is expired
  if (Date.now() > expiresAt) return false;
  
  // Validate signature
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
// STORAGE TYPES (Simplified - Local Only)
// ============================================================

export type StorageProvider = "local";

export interface StorageConfig {
  provider: "local";
  localPath: string;
}

/**
 * Get storage config - always returns local
 */
export function getStorageConfig(_shopConfig?: unknown): StorageConfig {
  return {
    provider: "local",
    localPath: LOCAL_STORAGE_BASE,
  };
}

/**
 * Check if storage is configured - always true for local
 */
export function isStorageConfigured(_config?: unknown): boolean {
  return true;
}

/**
 * Get effective storage provider - always local
 * @deprecated Kept for backward compatibility
 */
export function getEffectiveStorageProvider(): StorageProvider {
  return "local";
}

/**
 * Validate storage credentials - always true for local
 * @deprecated Kept for backward compatibility  
 */
export function isStorageCredentialsValid(): boolean {
  return true;
}

// ============================================================
// UPLOAD & DOWNLOAD URL GENERATION
// ============================================================

/**
 * Generate upload URL - always returns local upload endpoint
 */
export async function getUploadSignedUrl(
  _config: StorageConfig,
  key: string,
  _contentType: string,
  _expiresIn: number = 900
): Promise<{ url: string; key: string; isLocal: boolean }> {
  // Use SHOPIFY_APP_URL (always has https://) or fallback to HOST with protocol handling
  let host = process.env.SHOPIFY_APP_URL || process.env.HOST || "https://customizerapp.dev";
  
  // Ensure host has https:// prefix
  if (!host.startsWith("http://") && !host.startsWith("https://")) {
    host = `https://${host}`;
  }
  
  return {
    url: `${host}/api/upload/local`,
    key,
    isLocal: true,
  };
}

/**
 * Generate download URL with signed token
 */
export async function getDownloadSignedUrl(
  _config: StorageConfig,
  key: string,
  expiresIn: number = 30 * 24 * 3600 // 30 days (was 1 hour) - for Shopify admin orders
): Promise<string> {
  // Use SHOPIFY_APP_URL (always has https://) or fallback to HOST with protocol handling
  let host = process.env.SHOPIFY_APP_URL || process.env.HOST || "https://customizerapp.dev";
  
  // Ensure host has https:// prefix
  if (!host.startsWith("http://") && !host.startsWith("https://")) {
    host = `https://${host}`;
  }
  
  const expiresAt = Date.now() + expiresIn * 1000;
  const token = generateLocalFileToken(key, expiresAt);
  return `${host}/api/files/${encodeURIComponent(key)}?token=${token}`;
}

// ============================================================
// LOCAL FILE OPERATIONS
// ============================================================

/**
 * Save file to local storage
 */
export async function saveLocalFile(key: string, data: Buffer): Promise<string> {
  const filePath = join(LOCAL_STORAGE_BASE, key);
  const dir = dirname(filePath);
  
  // Ensure directory exists
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  
  await writeFile(filePath, data);
  return filePath;
}

/**
 * Read file from local storage
 */
export async function readLocalFile(key: string): Promise<Buffer> {
  const filePath = join(LOCAL_STORAGE_BASE, key);
  return readFile(filePath);
}

/**
 * Delete file from local storage
 */
export async function deleteLocalFile(key: string): Promise<void> {
  const filePath = join(LOCAL_STORAGE_BASE, key);
  try {
    await unlink(filePath);
  } catch (e) {
    // File may not exist, ignore
  }
}

/**
 * Delete file - wrapper for compatibility
 */
export async function deleteFile(_config: StorageConfig, key: string): Promise<void> {
  await deleteLocalFile(key);
}

/**
 * Build storage key path (tenant-scoped)
 */
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

/**
 * Get local file path
 */
export function getLocalFilePath(key: string): string {
  return join(LOCAL_STORAGE_BASE, key);
}

