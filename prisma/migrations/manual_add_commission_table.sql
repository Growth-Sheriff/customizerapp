-- Migration: Add Commission table for per-order commission tracking
-- Commission rate: 1.5% of order total
-- Payment method: PayPal (manual)

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" TEXT,
    "order_total" DECIMAL(10,2) NOT NULL,
    "order_currency" TEXT NOT NULL DEFAULT 'USD',
    "commission_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.015,
    "commission_amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "payment_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique: one commission per order per shop)
CREATE UNIQUE INDEX "commission_shop_order" ON "commissions"("shop_id", "order_id");

-- CreateIndex (filter by status)
CREATE INDEX "commissions_shop_id_status_idx" ON "commissions"("shop_id", "status");

-- CreateIndex (filter by date)
CREATE INDEX "commissions_shop_id_created_at_idx" ON "commissions"("shop_id", "created_at");

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
