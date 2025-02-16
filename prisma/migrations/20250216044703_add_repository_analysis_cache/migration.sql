-- CreateTable
CREATE TABLE "repository_analysis_cache" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "analysis" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_analysis_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repository_analysis_cache_owner_repo_key" ON "repository_analysis_cache"("owner", "repo");
