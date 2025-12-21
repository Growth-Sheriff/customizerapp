// Preflight check utilities
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

// Preflight check result types
export interface PreflightCheck {
  name: string;
  status: "ok" | "warning" | "error";
  value?: string | number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface PreflightResult {
  overall: "ok" | "warning" | "error";
  checks: PreflightCheck[];
  thumbnailPath?: string;
  convertedPath?: string;
}

// Plan-based configuration
export interface PreflightConfig {
  maxFileSizeMB: number;
  minDPI: number;
  requiredDPI: number;
  maxPages: number;
  allowedFormats: string[];
  requireTransparency: boolean;
}

export const PLAN_CONFIGS: Record<string, PreflightConfig> = {
  free: {
    maxFileSizeMB: 25,
    minDPI: 150,
    requiredDPI: 300,
    maxPages: 1,
    allowedFormats: ["image/png", "image/jpeg", "image/webp"],
    requireTransparency: false,
  },
  starter: {
    maxFileSizeMB: 50,
    minDPI: 150,
    requiredDPI: 300,
    maxPages: 1,
    allowedFormats: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
    requireTransparency: false,
  },
  pro: {
    maxFileSizeMB: 150,
    minDPI: 150,
    requiredDPI: 300,
    maxPages: 5,
    allowedFormats: ["image/png", "image/jpeg", "image/webp", "application/pdf", "application/postscript", "image/svg+xml"],
    requireTransparency: false,
  },
  enterprise: {
    maxFileSizeMB: 150,
    minDPI: 150,
    requiredDPI: 300,
    maxPages: 10,
    allowedFormats: ["image/png", "image/jpeg", "image/webp", "application/pdf", "application/postscript", "image/svg+xml"],
    requireTransparency: false,
  },
};

// Magic bytes for file type detection
const MAGIC_BYTES: Record<string, Buffer> = {
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  "image/webp": Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF header
  "application/pdf": Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  "image/svg+xml": Buffer.from([0x3c, 0x3f, 0x78, 0x6d, 0x6c]), // <?xml or <svg
};

// Detect file type from magic bytes
export async function detectFileType(filePath: string): Promise<string | null> {
  const buffer = Buffer.alloc(16);
  const fd = await fs.open(filePath, "r");
  await fd.read(buffer, 0, 16, 0);
  await fd.close();

  for (const [mimeType, magic] of Object.entries(MAGIC_BYTES)) {
    if (buffer.subarray(0, magic.length).equals(magic)) {
      return mimeType;
    }
  }

  // Check for SVG (might start with <svg instead of <?xml)
  const start = buffer.toString("utf8", 0, 4);
  if (start === "<svg" || start === "<?xm") {
    return "image/svg+xml";
  }

  // Check for AI/EPS (PostScript)
  if (buffer.toString("utf8", 0, 2) === "%!") {
    return "application/postscript";
  }

  return null;
}

// Get image info using ImageMagick identify
export async function getImageInfo(filePath: string): Promise<{
  width: number;
  height: number;
  dpi: number;
  colorspace: string;
  hasAlpha: boolean;
  format: string;
}> {
  try {
    const { stdout } = await execAsync(
      `identify -format "%w|%h|%x|%y|%[colorspace]|%[channels]|%m" "${filePath}[0]"`,
      { timeout: 30000 }
    );

    const parts = stdout.trim().split("|");
    const width = parseInt(parts[0]) || 0;
    const height = parseInt(parts[1]) || 0;
    const xDpi = parseFloat(parts[2]) || 72;
    const yDpi = parseFloat(parts[3]) || 72;
    const colorspace = parts[4] || "unknown";
    const channels = parts[5] || "";
    const format = parts[6] || "unknown";

    // Average DPI
    const dpi = Math.round((xDpi + yDpi) / 2);

    // Check for alpha channel
    const hasAlpha = channels.toLowerCase().includes("a") || channels.toLowerCase().includes("alpha");

    return { width, height, dpi, colorspace, hasAlpha, format };
  } catch (error) {
    console.error("[Preflight] ImageMagick identify failed:", error);
    throw new Error("Failed to analyze image");
  }
}

// Get PDF info using pdfinfo
export async function getPdfInfo(filePath: string): Promise<{
  pages: number;
  width: number;
  height: number;
}> {
  try {
    const { stdout } = await execAsync(`pdfinfo "${filePath}"`, { timeout: 10000 });

    const pagesMatch = stdout.match(/Pages:\s+(\d+)/);
    const sizeMatch = stdout.match(/Page size:\s+([\d.]+)\s+x\s+([\d.]+)/);

    const pages = pagesMatch ? parseInt(pagesMatch[1]) : 1;
    // PDF points to pixels (72 dpi base)
    const width = sizeMatch ? Math.round(parseFloat(sizeMatch[1]) * 300 / 72) : 0;
    const height = sizeMatch ? Math.round(parseFloat(sizeMatch[2]) * 300 / 72) : 0;

    return { pages, width, height };
  } catch (error) {
    console.error("[Preflight] pdfinfo failed:", error);
    return { pages: 1, width: 0, height: 0 };
  }
}

// Convert PDF to PNG using Ghostscript
// Security: -dSAFER prevents file system access, -dNOCACHE prevents disk caching
// -dNOPLATFONTS disables platform font access, -dSANDBOX enables full sandbox mode
export async function convertPdfToPng(inputPath: string, outputPath: string, dpi: number = 300): Promise<void> {
  const cmd = `gs -dSAFER -dBATCH -dNOPAUSE -dNOCACHE -dNOPLATFONTS -dPARANOIDSAFER -sDEVICE=png16m -r${dpi} -dFirstPage=1 -dLastPage=1 -dMaxBitmap=500000000 -dBufferSpace=1000000 -sOutputFile="${outputPath}" "${inputPath}"`;

  try {
    await execAsync(cmd, { timeout: 30000 }); // Reduced timeout for security
  } catch (error) {
    console.error("[Preflight] Ghostscript conversion failed:", error);
    throw new Error("PDF conversion failed");
  }
}

// Convert AI/EPS to PNG using Ghostscript
export async function convertEpsToPng(inputPath: string, outputPath: string, dpi: number = 300): Promise<void> {
  const cmd = `gs -dSAFER -dBATCH -dNOPAUSE -dNOCACHE -dNOPLATFONTS -dPARANOIDSAFER -sDEVICE=png16m -r${dpi} -dEPSCrop -dMaxBitmap=500000000 -dBufferSpace=1000000 -sOutputFile="${outputPath}" "${inputPath}"`;

  try {
    await execAsync(cmd, { timeout: 30000 }); // Reduced timeout for security
  } catch (error) {
    console.error("[Preflight] Ghostscript EPS conversion failed:", error);
    throw new Error("EPS/AI conversion failed");
  }
}

// Generate WebP thumbnail
export async function generateThumbnail(inputPath: string, outputPath: string, maxSize: number = 400): Promise<void> {
  const cmd = `convert "${inputPath}[0]" -thumbnail ${maxSize}x${maxSize}\\> -quality 85 "${outputPath}"`;

  try {
    await execAsync(cmd, { timeout: 30000 });
  } catch (error) {
    console.error("[Preflight] Thumbnail generation failed:", error);
    throw new Error("Thumbnail generation failed");
  }
}

// Run all preflight checks
export async function runPreflightChecks(
  filePath: string,
  mimeType: string,
  fileSize: number,
  config: PreflightConfig
): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  let overall: "ok" | "warning" | "error" = "ok";

  // 1. File size check
  const sizeMB = fileSize / (1024 * 1024);
  if (sizeMB > config.maxFileSizeMB) {
    checks.push({
      name: "fileSize",
      status: "error",
      value: sizeMB.toFixed(2),
      message: `File size (${sizeMB.toFixed(2)}MB) exceeds limit (${config.maxFileSizeMB}MB)`,
    });
    overall = "error";
  } else {
    checks.push({
      name: "fileSize",
      status: "ok",
      value: sizeMB.toFixed(2),
      message: `File size: ${sizeMB.toFixed(2)}MB`,
    });
  }

  // 2. Format check (magic bytes)
  const detectedType = await detectFileType(filePath);
  if (!detectedType || !config.allowedFormats.includes(detectedType)) {
    checks.push({
      name: "format",
      status: "error",
      value: detectedType || "unknown",
      message: `Unsupported file format: ${detectedType || "unknown"}`,
    });
    overall = "error";
    return { overall, checks };
  }
  checks.push({
    name: "format",
    status: "ok",
    value: detectedType,
    message: `Format: ${detectedType}`,
  });

  // 3. PDF-specific checks
  if (detectedType === "application/pdf") {
    const pdfInfo = await getPdfInfo(filePath);

    if (pdfInfo.pages > config.maxPages) {
      checks.push({
        name: "pageCount",
        status: "error",
        value: pdfInfo.pages,
        message: `PDF has ${pdfInfo.pages} pages (max: ${config.maxPages})`,
      });
      overall = "error";
    } else if (pdfInfo.pages > 1) {
      checks.push({
        name: "pageCount",
        status: "warning",
        value: pdfInfo.pages,
        message: `PDF has ${pdfInfo.pages} pages. Only first page will be used.`,
      });
      if (overall === "ok") overall = "warning";
    } else {
      checks.push({
        name: "pageCount",
        status: "ok",
        value: 1,
        message: "Single page PDF",
      });
    }
  }

  // 4. Image info checks (DPI, dimensions, transparency, color)
  try {
    const imageInfo = await getImageInfo(filePath);

    // DPI check
    if (imageInfo.dpi < config.minDPI * 0.7) {
      checks.push({
        name: "dpi",
        status: "error",
        value: imageInfo.dpi,
        message: `DPI (${imageInfo.dpi}) is too low. Minimum: ${config.minDPI}`,
      });
      overall = "error";
    } else if (imageInfo.dpi < config.requiredDPI) {
      checks.push({
        name: "dpi",
        status: "warning",
        value: imageInfo.dpi,
        message: `DPI (${imageInfo.dpi}) is below recommended (${config.requiredDPI})`,
      });
      if (overall === "ok") overall = "warning";
    } else {
      checks.push({
        name: "dpi",
        status: "ok",
        value: imageInfo.dpi,
        message: `DPI: ${imageInfo.dpi}`,
      });
    }

    // Dimensions check
    checks.push({
      name: "dimensions",
      status: "ok",
      value: `${imageInfo.width}x${imageInfo.height}`,
      message: `Dimensions: ${imageInfo.width} x ${imageInfo.height} px`,
      details: { width: imageInfo.width, height: imageInfo.height },
    });

    // Transparency check
    checks.push({
      name: "transparency",
      status: imageInfo.hasAlpha ? "ok" : "warning",
      value: imageInfo.hasAlpha,
      message: imageInfo.hasAlpha ? "Has transparency (alpha channel)" : "No transparency detected",
    });
    if (!imageInfo.hasAlpha && config.requireTransparency && overall === "ok") {
      overall = "warning";
    }

    // Color profile check
    const goodColorspaces = ["sRGB", "RGB", "CMYK"];
    const colorOk = goodColorspaces.some(cs =>
      imageInfo.colorspace.toLowerCase().includes(cs.toLowerCase())
    );
    checks.push({
      name: "colorProfile",
      status: colorOk ? "ok" : "warning",
      value: imageInfo.colorspace,
      message: `Color profile: ${imageInfo.colorspace}`,
    });
    if (!colorOk && overall === "ok") overall = "warning";

  } catch (error) {
    checks.push({
      name: "imageAnalysis",
      status: "error",
      message: "Failed to analyze image properties",
    });
    overall = "error";
  }

  return { overall, checks };
}

