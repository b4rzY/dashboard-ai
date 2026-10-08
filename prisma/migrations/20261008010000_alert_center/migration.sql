CREATE UNIQUE INDEX "AlertRule_holdingId_type_key" ON "AlertRule"("holdingId", "type");

CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "companyId" TEXT,
    "connectionId" TEXT,
    "transactionId" TEXT,
    "resourceUrl" TEXT,
    "fingerprint" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlertEvent_fingerprint_key" ON "AlertEvent"("fingerprint");
CREATE INDEX "AlertEvent_holdingId_readAt_createdAt_idx" ON "AlertEvent"("holdingId", "readAt", "createdAt");
CREATE INDEX "AlertEvent_holdingId_type_createdAt_idx" ON "AlertEvent"("holdingId", "type", "createdAt");
