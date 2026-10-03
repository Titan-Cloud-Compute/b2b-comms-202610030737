-- Shared channels: Customer, Channel, ChannelMember, Message (Story: shared-channel).
-- Plain userId columns only — auth tables are not altered.
CREATE TYPE "ChannelMemberRole" AS ENUM ('VENDOR', 'CUSTOMER');

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Channel_createdByUserId_idx" ON "Channel"("createdByUserId");

CREATE TABLE "ChannelMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChannelMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChannelMember_channelId_userId_key" ON "ChannelMember"("channelId", "userId");
CREATE INDEX "ChannelMember_userId_idx" ON "ChannelMember"("userId");
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
