import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { writeFile, mkdir, readFile, unlink } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";

export type StorageProvider = "r2" | "s3" | "local" | "none";

export interface StorageConfig {
  provider: StorageProvider;
  bucket: string;
  region?: string;
  accountId?: string; // R2 only
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;
  localPath?: string; // Local storage path
}

// Check if storage is configured
export function isStorageConfigured(config: StorageConfig): boolean {
  if (config.provider === "none") return false;
  if (config.provider === "local") return true;
  
  // For R2/S3, check if credentials are set
  return !!(config.accessKeyId && config.secretAccessKey && config.bucket);
}

// Get storage config from environment or shop settings
export function getStorageConfig(shopConfig?: Partial<StorageConfig>): StorageConfig {
  const provider = (shopConfig?.provider ?? process.env.STORAGE_PROVIDER ?? "none") as StorageProvider;

  // No storage configured - use local fallback
  if (provider === "none" || provider === "local") {
    return {
      provider: provider === "none" ? "local" : provider,
      bucket: "",
      accessKeyId: "",
      secretAccessKey: "",
      localPath: shopConfig?.localPath ?? process.env.LOCAL_STORAGE_PATH ?? "./uploads",
    };
  }

  if (provider === "r2") {
    return {
      provider: "r2",
      bucket: shopConfig?.bucket ?? process.env.R2_BUCKET_NAME ?? "upload-lift",
      accountId: shopConfig?.accountId ?? process.env.R2_ACCOUNT_ID ?? "",
      accessKeyId: shopConfig?.accessKeyId ?? process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: shopConfig?.secretAccessKey ?? process.env.R2_SECRET_ACCESS_KEY ?? "",
      publicUrl: shopConfig?.publicUrl ?? process.env.R2_PUBLIC_URL,
    };
  }

  // S3
  return {
    provider: "s3",
    bucket: shopConfig?.bucket ?? process.env.S3_BUCKET_NAME ?? "",
    region: shopConfig?.region ?? process.env.S3_REGION ?? "us-east-1",
    accessKeyId: shopConfig?.accessKeyId ?? process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: shopConfig?.secretAccessKey ?? process.env.S3_SECRET_ACCESS_KEY ?? "",
    publicUrl: shopConfig?.publicUrl ?? process.env.S3_PUBLIC_URL,
  };
}

// Create S3 client (works for both R2 and S3)
export function createStorageClient(config: StorageConfig): S3Client | null {
  if (config.provider === "local" || config.provider === "none") {
    return null; // No S3 client for local storage
  }

  if (config.provider === "r2") {
    return new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  // S3
  return new S3Client({
    region: config.region ?? "us-east-1",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

// Generate upload signed URL (or local upload endpoint)
export async function getUploadSignedUrl(
  config: StorageConfig,
  key: string,
  contentType: string,
  expiresIn: number = 900 // 15 minutes
): Promise<{ url: string; key: string; isLocal?: boolean }> {
  // Local storage - return local upload endpoint
  if (config.provider === "local" || config.provider === "none") {
    const host = process.env.HOST || "https://customizerapp.dev";
    return {
      url: `${host}/api/upload/local`,
      key,
      isLocal: true,
    };
  }

  const client = createStorageClient(config);
  if (!client) {
    throw new Error("Storage client not available");
  }

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  return { url, key };
}

// Generate download signed URL (or local file path)
export async function getDownloadSignedUrl(
  config: StorageConfig,
  key: string,
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  // Local storage - return local file URL
  if (config.provider === "local" || config.provider === "none") {
    const host = process.env.HOST || "https://customizerapp.dev";
    return `${host}/api/files/${encodeURIComponent(key)}`;
  }

  const client = createStorageClient(config);
  if (!client) {
    throw new Error("Storage client not available");
  }

  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

// ============================================================
// LOCAL STORAGE FUNCTIONS
// ============================================================

const LOCAL_STORAGE_BASE = process.env.LOCAL_STORAGE_PATH || "./uploads";

// Save file to local storage
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

// Read file from local storage
export async function readLocalFile(key: string): Promise<Buffer> {
  const filePath = join(LOCAL_STORAGE_BASE, key);
  return readFile(filePath);
}

// Delete file from local storage
export async function deleteLocalFile(key: string): Promise<void> {
  const filePath = join(LOCAL_STORAGE_BASE, key);
  try {
    await unlink(filePath);
  } catch (e) {
    // File may not exist, ignore
  }
}

// Build storage key path (tenant-scoped)
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

