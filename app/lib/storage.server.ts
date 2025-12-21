import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageProvider = "r2" | "s3";

export interface StorageConfig {
  provider: StorageProvider;
  bucket: string;
  region?: string;
  accountId?: string; // R2 only
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl?: string;
}

// Get storage config from environment or shop settings
export function getStorageConfig(shopConfig?: Partial<StorageConfig>): StorageConfig {
  const provider = (shopConfig?.provider ?? process.env.STORAGE_PROVIDER ?? "r2") as StorageProvider;

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
export function createStorageClient(config: StorageConfig): S3Client {
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

// Generate upload signed URL
export async function getUploadSignedUrl(
  config: StorageConfig,
  key: string,
  contentType: string,
  expiresIn: number = 900 // 15 minutes
): Promise<{ url: string; key: string }> {
  const client = createStorageClient(config);

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  return { url, key };
}

// Generate download signed URL
export async function getDownloadSignedUrl(
  config: StorageConfig,
  key: string,
  expiresIn: number = 3600 // 1 hour
): Promise<string> {
  const client = createStorageClient(config);

  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
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

