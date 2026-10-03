-- Invoice generation: one Invoice per confirmed Order (Story: invoice-generation).
-- Plain FK columns only — auth tables and the Order table are not altered.
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorUserId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX "Invoice_vendorUserId_idx" ON "Invoice"("vendorUserId");
CREATE INDEX "Invoice_customerUserId_idx" ON "Invoice"("customerUserId");
