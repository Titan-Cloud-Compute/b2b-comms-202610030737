-- Customer invite (Story: customer-invite): single-use, expiring activation tokens.
-- Plain FK columns only — auth tables and the Customer table are not altered.
CREATE TYPE "CustomerInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED');

CREATE TABLE "CustomerInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "CustomerInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "acceptedUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerInvitation_token_key" ON "CustomerInvitation"("token");
CREATE INDEX "CustomerInvitation_email_idx" ON "CustomerInvitation"("email");
CREATE INDEX "CustomerInvitation_invitedByUserId_createdAt_idx" ON "CustomerInvitation"("invitedByUserId", "createdAt");
