-- CreateTable
CREATE TABLE "WatchVcConfig" (
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchVcConfig_pkey" PRIMARY KEY ("guildId")
);

-- AddForeignKey
ALTER TABLE "WatchVcConfig" ADD CONSTRAINT "WatchVcConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
