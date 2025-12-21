/**
 * Billing Enforcement
 *
 * Plan limits and usage tracking
 * Soft limit: Warning banner
 * Hard limit: Block action
 */

import prisma from "~/lib/prisma.server";

// Plan configurations
export const PLAN_LIMITS = {
  free: {
    uploadsPerMonth: 100,
    maxFileSizeMB: 25,
    modes: ["classic"],
    features: {
      "3d_designer": false,
      "quick_upload": false,
      "analytics": false,
      "export": false,
      "team": false,
      "api": false,
      "whiteLabel": false,
      "flow": false,
    },
  },
  starter: {
    uploadsPerMonth: 1000,
    maxFileSizeMB: 50,
    modes: ["classic", "quick"],
    features: {
      "3d_designer": false,
      "quick_upload": true,
      "analytics": true,
      "export": true,
      "team": false,
      "api": false,
      "whiteLabel": false,
      "flow": false,
    },
  },
  pro: {
    uploadsPerMonth: -1, // unlimited
    maxFileSizeMB: 150,
    modes: ["3d_designer", "classic", "quick"],
    features: {
      "3d_designer": true,
      "quick_upload": true,
      "analytics": true,
      "export": true,
      "team": true,
      "api": false,
      "whiteLabel": false,
      "flow": true,
    },
  },
  enterprise: {
    uploadsPerMonth: -1, // unlimited
    maxFileSizeMB: 150,
    modes: ["3d_designer", "classic", "quick"],
    features: {
      "3d_designer": true,
      "quick_upload": true,
      "analytics": true,
      "export": true,
      "team": true,
      "api": true,
      "whiteLabel": true,
      "flow": true,
    },
  },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;
export type FeatureName = keyof typeof PLAN_LIMITS.free.features;

interface UsageResult {
  currentUsage: number;
  limit: number;
  percentage: number;
  isUnlimited: boolean;
  isOverLimit: boolean;
  isNearLimit: boolean; // >80%
}

interface BillingStatus {
  plan: PlanName;
  billingStatus: string;
  isActive: boolean;
  usage: UsageResult;
  canUseMode: (mode: string) => boolean;
  hasFeature: (feature: FeatureName) => boolean;
  maxFileSizeMB: number;
}

/**
 * Get current month's upload usage
 */
async function getMonthlyUsage(shopId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const count = await prisma.upload.count({
    where: {
      shopId,
      createdAt: { gte: startOfMonth },
      status: { notIn: ["draft"] },
    },
  });

  return count;
}

/**
 * Get billing status for a shop
 */
export async function getBillingStatus(shopId: string): Promise<BillingStatus> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { plan: true, billingStatus: true },
  });

  if (!shop) {
    throw new Error("Shop not found");
  }

  const plan = (shop.plan as PlanName) || "free";
  const planConfig = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  const currentUsage = await getMonthlyUsage(shopId);
  const limit = planConfig.uploadsPerMonth;
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : Math.round((currentUsage / limit) * 100);
  const isOverLimit = !isUnlimited && currentUsage >= limit;
  const isNearLimit = !isUnlimited && percentage >= 80;

  return {
    plan,
    billingStatus: shop.billingStatus,
    isActive: shop.billingStatus === "active",
    usage: {
      currentUsage,
      limit,
      percentage,
      isUnlimited,
      isOverLimit,
      isNearLimit,
    },
    canUseMode: (mode: string) => planConfig.modes.includes(mode as any),
    hasFeature: (feature: FeatureName) => planConfig.features[feature],
    maxFileSizeMB: planConfig.maxFileSizeMB,
  };
}

/**
 * Check if upload is allowed (returns error message or null)
 */
export async function checkUploadAllowed(
  shopId: string,
  mode: string,
  fileSizeMB: number
): Promise<{ allowed: boolean; error?: string; warning?: string }> {
  const billing = await getBillingStatus(shopId);

  // Check billing active
  if (!billing.isActive) {
    return {
      allowed: false,
      error: "Billing is not active. Please update your payment method."
    };
  }

  // Check mode allowed
  if (!billing.canUseMode(mode)) {
    return {
      allowed: false,
      error: `${mode} mode requires ${mode === "3d_designer" ? "Pro" : "Starter"} plan or higher.`
    };
  }

  // Check file size
  if (fileSizeMB > billing.maxFileSizeMB) {
    return {
      allowed: false,
      error: `File size (${fileSizeMB.toFixed(1)}MB) exceeds plan limit (${billing.maxFileSizeMB}MB).`,
    };
  }

  // Check upload limit
  if (billing.usage.isOverLimit) {
    return {
      allowed: false,
      error: `Monthly upload limit (${billing.usage.limit}) reached. Upgrade to continue.`,
    };
  }

  // Warning for near limit
  if (billing.usage.isNearLimit) {
    const remaining = billing.usage.limit - billing.usage.currentUsage;
    return {
      allowed: true,
      warning: `You have ${remaining} uploads remaining this month.`,
    };
  }

  return { allowed: true };
}

/**
 * Check feature access
 */
export async function checkFeatureAccess(
  shopId: string,
  feature: FeatureName
): Promise<{ allowed: boolean; error?: string }> {
  const billing = await getBillingStatus(shopId);

  if (!billing.isActive) {
    return {
      allowed: false,
      error: "Billing is not active."
    };
  }

  if (!billing.hasFeature(feature)) {
    const requiredPlan = getRequiredPlanForFeature(feature);
    return {
      allowed: false,
      error: `This feature requires ${requiredPlan} plan.`,
    };
  }

  return { allowed: true };
}

/**
 * Get minimum required plan for a feature
 */
function getRequiredPlanForFeature(feature: FeatureName): string {
  for (const [plan, config] of Object.entries(PLAN_LIMITS)) {
    if (config.features[feature]) {
      return plan.charAt(0).toUpperCase() + plan.slice(1);
    }
  }
  return "Enterprise";
}

/**
 * Usage alert check (for dashboard banner)
 */
export async function getUsageAlerts(shopId: string): Promise<Array<{
  type: "warning" | "critical";
  message: string;
  action?: { label: string; url: string };
}>> {
  const billing = await getBillingStatus(shopId);
  const alerts: Array<{
    type: "warning" | "critical";
    message: string;
    action?: { label: string; url: string };
  }> = [];

  if (!billing.isActive) {
    alerts.push({
      type: "critical",
      message: "Your billing is inactive. Uploads are paused.",
      action: { label: "Update Payment", url: "/app/settings/billing" },
    });
  }

  if (billing.usage.isOverLimit) {
    alerts.push({
      type: "critical",
      message: `You've reached your monthly upload limit (${billing.usage.limit}).`,
      action: { label: "Upgrade Plan", url: "/app/settings" },
    });
  } else if (billing.usage.isNearLimit) {
    const remaining = billing.usage.limit - billing.usage.currentUsage;
    alerts.push({
      type: "warning",
      message: `You have ${remaining} uploads remaining this month (${billing.usage.percentage}% used).`,
      action: { label: "Upgrade Plan", url: "/app/settings" },
    });
  }

  return alerts;
}

