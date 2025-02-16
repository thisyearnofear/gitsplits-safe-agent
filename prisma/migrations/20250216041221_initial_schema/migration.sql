-- CreateTable
CREATE TABLE "SafeAccount" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitsContract" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "controller" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "safeId" TEXT NOT NULL,

    CONSTRAINT "SplitsContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "githubUsername" TEXT NOT NULL,
    "walletAddress" TEXT,
    "percentage" DOUBLE PRECISION NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "splitsContractId" TEXT NOT NULL,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationSession" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contributorId" TEXT NOT NULL,

    CONSTRAINT "VerificationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "safeId" TEXT NOT NULL,

    CONSTRAINT "AccessKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessKeyId" TEXT NOT NULL,
    "safeId" TEXT NOT NULL,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SafeAccount_address_key" ON "SafeAccount"("address");

-- CreateIndex
CREATE INDEX "SafeAccount_address_idx" ON "SafeAccount"("address");

-- CreateIndex
CREATE INDEX "SafeAccount_ownerAddress_idx" ON "SafeAccount"("ownerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "SplitsContract_address_key" ON "SplitsContract"("address");

-- CreateIndex
CREATE INDEX "SplitsContract_address_idx" ON "SplitsContract"("address");

-- CreateIndex
CREATE INDEX "SplitsContract_controller_idx" ON "SplitsContract"("controller");

-- CreateIndex
CREATE INDEX "SplitsContract_safeId_idx" ON "SplitsContract"("safeId");

-- CreateIndex
CREATE INDEX "Contributor_githubUsername_idx" ON "Contributor"("githubUsername");

-- CreateIndex
CREATE INDEX "Contributor_walletAddress_idx" ON "Contributor"("walletAddress");

-- CreateIndex
CREATE INDEX "Contributor_splitsContractId_idx" ON "Contributor"("splitsContractId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationSession_nonce_key" ON "VerificationSession"("nonce");

-- CreateIndex
CREATE INDEX "VerificationSession_nonce_idx" ON "VerificationSession"("nonce");

-- CreateIndex
CREATE INDEX "VerificationSession_contributorId_idx" ON "VerificationSession"("contributorId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessKey_key_key" ON "AccessKey"("key");

-- CreateIndex
CREATE INDEX "AccessKey_key_idx" ON "AccessKey"("key");

-- CreateIndex
CREATE INDEX "AccessKey_safeId_idx" ON "AccessKey"("safeId");

-- CreateIndex
CREATE INDEX "AccessLog_accessKeyId_idx" ON "AccessLog"("accessKeyId");

-- CreateIndex
CREATE INDEX "AccessLog_safeId_idx" ON "AccessLog"("safeId");

-- AddForeignKey
ALTER TABLE "SplitsContract" ADD CONSTRAINT "SplitsContract_safeId_fkey" FOREIGN KEY ("safeId") REFERENCES "SafeAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contributor" ADD CONSTRAINT "Contributor_splitsContractId_fkey" FOREIGN KEY ("splitsContractId") REFERENCES "SplitsContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessKey" ADD CONSTRAINT "AccessKey_safeId_fkey" FOREIGN KEY ("safeId") REFERENCES "SafeAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_accessKeyId_fkey" FOREIGN KEY ("accessKeyId") REFERENCES "AccessKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_safeId_fkey" FOREIGN KEY ("safeId") REFERENCES "SafeAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
