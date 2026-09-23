-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag_overrides" (
    "id" TEXT NOT NULL,
    "flagId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "feature_flag_overrides_flagId_idx" ON "feature_flag_overrides"("flagId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flag_overrides_flagId_userId_key" ON "feature_flag_overrides"("flagId", "userId");

-- AddForeignKey
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_flagId_fkey" FOREIGN KEY ("flagId") REFERENCES "feature_flags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
