import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  runPreflightChecks,
  convertPdfToPng,
  convertEpsToPng,
  generateThumbnail,
  detectFileType,
  PLAN_CONFIGS,
  type PreflightConfig,
} from "../app/lib/preflight.server";

// Initialize Prisma
const prisma = new PrismaClient();

// Redis connection for queue
const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// Preflight job data
interface PreflightJobData {
  uploadId: string;
  shopId: string;
  itemId: string;
  storageKey: string;
}

// Get S3/R2 client
function getStorageClient(): S3Client {
  const provider = process.env.STORAGE_PROVIDER || "r2";

  if (provider === "r2") {
    return new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
      },
    });
  }

  return new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
  });
}

// Download file from storage
async function downloadFile(client: S3Client, key: string, localPath: string): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME || "upload-lift";

  const response = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }));

  if (!response.Body) {
    throw new Error("Empty response body");
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  await fs.writeFile(localPath, Buffer.concat(chunks));
}

// Upload file to storage
async function uploadFile(client: S3Client, key: string, localPath: string, contentType: string): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME || process.env.S3_BUCKET_NAME || "upload-lift";
  const content = await fs.readFile(localPath);

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: contentType,
  }));
}

// Create queue
export const preflightQueue = new Queue<PreflightJobData>("preflight", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

// Worker processor
const preflightWorker = new Worker<PreflightJobData>(
  "preflight",
  async (job: Job<PreflightJobData>) => {
    const { uploadId, shopId, itemId, storageKey } = job.data;
    console.log(`[Preflight Worker] Processing job ${job.id} for upload ${uploadId}, item ${itemId}`);

    const tempDir = path.join(os.tmpdir(), `preflight-${itemId}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Get shop info for plan config
      const shop = await prisma.shop.findUnique({ where: { id: shopId } });
      if (!shop) {
        throw new Error(`Shop not found: ${shopId}`);
      }

      const config: PreflightConfig = PLAN_CONFIGS[shop.plan] || PLAN_CONFIGS.free;

      // Get upload item
      const item = await prisma.uploadItem.findUnique({ where: { id: itemId } });
      if (!item) {
        throw new Error(`Upload item not found: ${itemId}`);
      }

      await job.updateProgress(10);
      console.log(`[Preflight] Downloading ${storageKey}`);

      // Download file
      const client = getStorageClient();
      const ext = path.extname(storageKey) || ".tmp";
      const originalPath = path.join(tempDir, `original${ext}`);
      await downloadFile(client, storageKey, originalPath);

      await job.updateProgress(20);

      // Get file stats
      const stats = await fs.stat(originalPath);
      const fileSize = stats.size;

      // Detect file type
      const detectedType = await detectFileType(originalPath);
      console.log(`[Preflight] Detected type: ${detectedType}`);

      await job.updateProgress(30);

      // Convert if needed (PDF, AI, EPS)
      let processedPath = originalPath;
      let convertedKey: string | null = null;

      if (detectedType === "application/pdf") {
        console.log(`[Preflight] Converting PDF to PNG`);
        const pngPath = path.join(tempDir, "converted.png");
        await convertPdfToPng(originalPath, pngPath, 300);
        processedPath = pngPath;

        // Upload converted file
        convertedKey = storageKey.replace(/\.[^.]+$/, "_converted.png");
        await uploadFile(client, convertedKey, pngPath, "image/png");
      } else if (detectedType === "application/postscript") {
        console.log(`[Preflight] Converting AI/EPS to PNG`);
        const pngPath = path.join(tempDir, "converted.png");
        await convertEpsToPng(originalPath, pngPath, 300);
        processedPath = pngPath;

        // Upload converted file
        convertedKey = storageKey.replace(/\.[^.]+$/, "_converted.png");
        await uploadFile(client, convertedKey, pngPath, "image/png");
      }

      await job.updateProgress(50);

      // Run preflight checks
      console.log(`[Preflight] Running checks`);
      const result = await runPreflightChecks(processedPath, detectedType || "", fileSize, config);

      await job.updateProgress(70);

      // Generate thumbnail
      console.log(`[Preflight] Generating thumbnail`);
      const thumbnailPath = path.join(tempDir, "thumbnail.webp");
      await generateThumbnail(processedPath, thumbnailPath, 400);

      // Upload thumbnail
      const thumbnailKey = storageKey.replace(/\.[^.]+$/, "_thumb.webp");
      await uploadFile(client, thumbnailKey, thumbnailPath, "image/webp");

      await job.updateProgress(90);

      // Update database
      await prisma.uploadItem.update({
        where: { id: itemId },
        data: {
          preflightStatus: result.overall,
          preflightResult: result as any,
          thumbnailKey,
          previewKey: convertedKey || storageKey,
        },
      });

      // Update upload status
      const allItems = await prisma.uploadItem.findMany({
        where: { uploadId },
        select: { preflightStatus: true },
      });

      const hasError = allItems.some(i => i.preflightStatus === "error");
      const hasWarning = allItems.some(i => i.preflightStatus === "warning");
      const allDone = allItems.every(i => i.preflightStatus !== "pending");

      if (allDone) {
        let uploadStatus = "needs_review";
        if (hasError) {
          uploadStatus = "blocked";
        } else if (!hasWarning) {
          // All OK - could auto-approve based on rules
          uploadStatus = "needs_review";
        }

        await prisma.upload.update({
          where: { id: uploadId },
          data: {
            status: uploadStatus,
            preflightSummary: {
              overall: hasError ? "error" : hasWarning ? "warning" : "ok",
              completedAt: new Date().toISOString(),
              itemCount: allItems.length,
            },
          },
        });
      }

      await job.updateProgress(100);
      console.log(`[Preflight] Completed for ${uploadId}/${itemId}: ${result.overall}`);

      return {
        status: result.overall,
        checks: result.checks,
        thumbnailKey,
        convertedKey,
      };
    } catch (error) {
      console.error(`[Preflight Worker] Error:`, error);

      // Update item with error status
      await prisma.uploadItem.update({
        where: { id: itemId },
        data: {
          preflightStatus: "error",
          preflightResult: {
            overall: "error",
            checks: [{
              name: "processing",
              status: "error",
              message: error instanceof Error ? error.message : "Unknown error",
            }],
          },
        },
      });

      throw error;
    } finally {
      // Cleanup temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  },
  {
    connection,
    concurrency: 3,
    limiter: {
      max: 20,
      duration: 60000,
    },
  }
);

preflightWorker.on("completed", (job) => {
  console.log(`[Preflight Worker] Job ${job.id} completed`);
});

preflightWorker.on("failed", (job, err) => {
  console.error(`[Preflight Worker] Job ${job?.id} failed:`, err.message);
});

console.log("[Preflight Worker] Started and waiting for jobs...");

export default preflightWorker;

