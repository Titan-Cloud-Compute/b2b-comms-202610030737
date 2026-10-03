-- Vendor onboarding: company profile + compliance document library.
CREATE TYPE "VendorDocumentStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "VendorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "website" TEXT,
    "address" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VendorProfile_userId_key" ON "VendorProfile"("userId");

CREATE TABLE "VendorDocument" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "status" "VendorDocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VendorDocument_profileId_idx" ON "VendorDocument"("profileId");
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "VendorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
