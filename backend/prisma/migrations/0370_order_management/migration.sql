-- Order management: Product catalog, Order, OrderItem, OrderNotification (Story: order-management).
-- Plain userId columns only — auth tables are not altered.
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED');

CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Product_vendorUserId_idx" ON "Product"("vendorUserId");

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "estimatedDeliveryDate" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Order_vendorUserId_status_idx" ON "Order"("vendorUserId", "status");
CREATE INDEX "Order_customerUserId_idx" ON "Order"("customerUserId");

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrderNotification" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderNotification_userId_createdAt_idx" ON "OrderNotification"("userId", "createdAt");
ALTER TABLE "OrderNotification" ADD CONSTRAINT "OrderNotification_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
