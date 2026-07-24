-- AlterTable
ALTER TABLE "AntinukeConfig" ADD COLUMN "autoLockOnTrigger" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LockdownState" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'No reason provided',
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "priorVerificationLevel" INTEGER,
    "invitesPausedByUs" BOOLEAN NOT NULL DEFAULT false,
    "caseNumber" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "LockdownState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LockdownSnapshot" (
    "id" TEXT NOT NULL,
    "lockdownId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "channelId" TEXT,
    "targetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "priorAllow" BOOLEAN NOT NULL,
    "priorDeny" BOOLEAN NOT NULL,
    "addedByUs" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LockdownSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LockdownState_guildId_key" ON "LockdownState"("guildId");

-- CreateIndex
CREATE INDEX "LockdownState_expiresAt_idx" ON "LockdownState"("expiresAt");

-- CreateIndex
CREATE INDEX "LockdownSnapshot_lockdownId_idx" ON "LockdownSnapshot"("lockdownId");

-- AddForeignKey
ALTER TABLE "LockdownState" ADD CONSTRAINT "LockdownState_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LockdownSnapshot" ADD CONSTRAINT "LockdownSnapshot_lockdownId_fkey" FOREIGN KEY ("lockdownId") REFERENCES "LockdownState"("id") ON DELETE CASCADE ON UPDATE CASCADE;
