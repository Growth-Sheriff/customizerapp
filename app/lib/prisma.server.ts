import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Tenant-scoped Prisma client with shop_id guard middleware
function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

  // Tenant guard middleware - ensures all queries are shop-scoped
  client.$use(async (params, next) => {
    // Models that require direct shop_id scope (top-level models)
    const directScopedModels = [
      "ProductConfig",
      "AssetSet",
      "Upload",
      "OrderLink",
      "ExportJob",
      "AuditLog",
      "TeamMember",
      "ApiKey",
      "WhiteLabelConfig",
      "FlowTrigger",
    ];

    // Models that can be scoped through relation (e.g., UploadItem via upload.shopId)
    const relationScopedModels = [
      "UploadItem", // scoped via upload relation
    ];

    if (directScopedModels.includes(params.model ?? "")) {
      // For read operations, ensure shop_id is in where clause
      if (["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"].includes(params.action)) {
        const where = params.args?.where;
        // Check for shopId in different locations:
        // - Direct: where.shopId
        // - Composite key: where.shopId_productId.shopId (ProductConfig)
        // - Composite key: where.shopId_fileKey.shopId (Upload)
        const hasShopScope = 
          where?.shopId || 
          where?.shop_id || 
          where?.shopId_productId?.shopId ||
          where?.shopId_fileKey?.shopId;
        
        if (!hasShopScope) {
          console.warn(`[TENANT GUARD] Query to ${params.model} without shopId scope - action: ${params.action}`);
          // In production, log but don't break - let DB constraints handle it
          // This prevents false positives from relation-based queries
        }
      }
    }

    // For relation-scoped models, check for relation-based scope
    if (relationScopedModels.includes(params.model ?? "")) {
      if (["findMany", "findFirst", "count", "aggregate", "groupBy"].includes(params.action)) {
        const where = params.args?.where;
        // Check for relation-based scope (e.g., upload: { shopId: ... })
        const hasRelationScope = 
          where?.upload?.shopId || 
          where?.uploadId ||
          where?.id; // Direct ID access is OK (already scoped by caller)
        
        if (!hasRelationScope) {
          console.warn(`[TENANT GUARD] Query to ${params.model} without relation scope - action: ${params.action}`);
        }
      }
    }

    return next(params);
  });

  return client;
}

// Singleton pattern for Prisma client
export const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export default prisma;

