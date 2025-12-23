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
    // Models that require shop_id scope
    const tenantScopedModels = [
      "ProductConfig",
      "AssetSet",
      "Upload",
      "UploadItem",
      "OrderLink",
      "ExportJob",
      "AuditLog",
      "TeamMember",
      "ApiKey",
      "WhiteLabelConfig",
      "FlowTrigger",
    ];

    if (tenantScopedModels.includes(params.model ?? "")) {
      // For read operations, ensure shop_id is in where clause
      if (["findMany", "findFirst", "findUnique", "count", "aggregate"].includes(params.action)) {
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
          console.error(`[TENANT GUARD] Query to ${params.model} without shopId scope!`);
          if (process.env.NODE_ENV === "production") {
            throw new Error(`Tenant scope required for ${params.model}`);
          }
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

