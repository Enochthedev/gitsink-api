-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "githubId" TEXT,
    "githubToken" TEXT,
    "accessToken" TEXT,
    "apiKey" TEXT,
    "apiKeyUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password" TEXT,
    "resetToken" TEXT,
    "resetTokenExpires" TIMESTAMP(3),
    "username" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "tier" TEXT NOT NULL DEFAULT 'free',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "profileConfig" JSONB NOT NULL DEFAULT '{}',
    "platformTokens" JSONB NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "syncCount" INTEGER NOT NULL DEFAULT 0,
    "apiCallCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyApiCalls" INTEGER NOT NULL DEFAULT 0,
    "lastApiCallReset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "icon" TEXT,
    "image" TEXT,
    "demoUrl" TEXT,
    "repoUrl" TEXT,
    "featured" BOOLEAN DEFAULT false,
    "published" BOOLEAN DEFAULT false,
    "order" INTEGER,
    "category" TEXT,
    "githubSync" BOOLEAN DEFAULT true,
    "blacklisted" BOOLEAN DEFAULT false,
    "markdown" TEXT,
    "valid" BOOLEAN NOT NULL DEFAULT true,
    "validationErrors" TEXT[],
    "collaborators" TEXT[],
    "firstCommitAt" TIMESTAMP(3),
    "lastCommitAt" TIMESTAMP(3),
    "githubMetadata" JSONB,
    "customMetadata" JSONB,
    "syncedAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "platform" TEXT NOT NULL DEFAULT 'github',
    "platformId" TEXT,
    "defaultBranch" TEXT DEFAULT 'main',
    "language" TEXT,
    "languages" JSONB NOT NULL DEFAULT '{}',
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "forkCount" INTEGER NOT NULL DEFAULT 0,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "license" TEXT,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "size" INTEGER,
    "openIssues" INTEGER NOT NULL DEFAULT 0,
    "hasWiki" BOOLEAN NOT NULL DEFAULT false,
    "hasPages" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "pushedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deviceId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "avatar" TEXT,
    "location" TEXT,
    "website" TEXT,
    "socialLinks" JSONB NOT NULL DEFAULT '[]',
    "theme" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "customDomain" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "platformUsername" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "operation" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,

    CONSTRAINT "SyncHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "analysis" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "apiKey" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemMetric" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenBlacklist" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "userId" TEXT,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenBlacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "repositoryName" TEXT NOT NULL,
    "repositoryFullName" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomMetadata" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "fieldCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailBounce" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "bounceType" TEXT NOT NULL,
    "bounceSubType" TEXT NOT NULL,
    "diagnosticCode" TEXT,
    "feedbackId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailBounce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailComplaint" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "complaintType" TEXT NOT NULL,
    "feedbackId" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailComplaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "processingTimeMillis" INTEGER,
    "smtpResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailedEmailJob" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailedEmailJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKeyToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY['read', 'write']::TEXT[],
    "rateLimit" INTEGER NOT NULL DEFAULT 1000,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "allowedIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "ApiKeyToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "yearlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "projectLimit" INTEGER NOT NULL DEFAULT 5,
    "apiKeyLimit" INTEGER NOT NULL DEFAULT 1,
    "apiCallsPerMonth" INTEGER NOT NULL DEFAULT 1000,
    "syncFrequency" TEXT NOT NULL DEFAULT 'daily',
    "webhookLimit" INTEGER NOT NULL DEFAULT 1,
    "teamMemberLimit" INTEGER NOT NULL DEFAULT 0,
    "storageLimit" INTEGER NOT NULL DEFAULT 100,
    "aiEnrichment" BOOLEAN NOT NULL DEFAULT false,
    "customDomain" BOOLEAN NOT NULL DEFAULT false,
    "prioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "exportData" BOOLEAN NOT NULL DEFAULT false,
    "whiteLabel" BOOLEAN NOT NULL DEFAULT false,
    "sso" BOOLEAN NOT NULL DEFAULT false,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeProductId" TEXT,
    "stripePriceIdMonthly" TEXT,
    "stripePriceIdYearly" TEXT,
    "paypalPlanIdMonthly" TEXT,
    "paypalPlanIdYearly" TEXT,
    "lemonSqueezyVariantIdMonthly" TEXT,
    "lemonSqueezyVariantIdYearly" TEXT,

    CONSTRAINT "Tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "paymentProvider" TEXT,
    "externalSubscriptionId" TEXT,
    "externalCustomerId" TEXT,
    "currentApiCalls" INTEGER NOT NULL DEFAULT 0,
    "currentProjects" INTEGER NOT NULL DEFAULT 0,
    "currentStorage" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'subscription',
    "paymentProvider" TEXT NOT NULL,
    "externalPaymentId" TEXT,
    "externalInvoiceId" TEXT,
    "invoiceUrl" TEXT,
    "receiptUrl" TEXT,
    "hostedInvoiceUrl" TEXT,
    "description" TEXT,
    "billingReason" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "refundedAmount" DECIMAL(10,2),
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_tier_idx" ON "User"("tier");

-- CreateIndex
CREATE INDEX "User_lastSyncAt_idx" ON "User"("lastSyncAt");

-- CreateIndex
CREATE INDEX "User_monthlyApiCalls_idx" ON "User"("monthlyApiCalls");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "Project_published_featured_idx" ON "Project"("published", "featured");

-- CreateIndex
CREATE INDEX "Project_category_idx" ON "Project"("category");

-- CreateIndex
CREATE INDEX "Project_title_idx" ON "Project"("title");

-- CreateIndex
CREATE INDEX "Project_tags_idx" ON "Project"("tags");

-- CreateIndex
CREATE INDEX "Project_lastCommitAt_idx" ON "Project"("lastCommitAt");

-- CreateIndex
CREATE INDEX "Project_platform_idx" ON "Project"("platform");

-- CreateIndex
CREATE INDEX "Project_language_idx" ON "Project"("language");

-- CreateIndex
CREATE INDEX "Project_starCount_idx" ON "Project"("starCount");

-- CreateIndex
CREATE INDEX "Project_pushedAt_idx" ON "Project"("pushedAt");

-- CreateIndex
CREATE INDEX "Project_topics_idx" ON "Project"("topics");

-- CreateIndex
CREATE INDEX "Project_isPrivate_idx" ON "Project"("isPrivate");

-- CreateIndex
CREATE INDEX "Project_archived_idx" ON "Project"("archived");

-- CreateIndex
CREATE UNIQUE INDEX "Project_ownerId_repoUrl_key" ON "Project"("ownerId", "repoUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Project_platform_platformId_key" ON "Project"("platform", "platformId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_email_key" ON "WaitlistEntry"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "RefreshToken_createdAt_idx" ON "RefreshToken"("createdAt");

-- CreateIndex
CREATE INDEX "RefreshToken_lastUsedAt_idx" ON "RefreshToken"("lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLinkToken_email_idx" ON "MagicLinkToken"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PublicProfile_userId_key" ON "PublicProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicProfile_username_key" ON "PublicProfile"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PublicProfile_customDomain_key" ON "PublicProfile"("customDomain");

-- CreateIndex
CREATE INDEX "PublicProfile_username_idx" ON "PublicProfile"("username");

-- CreateIndex
CREATE INDEX "PublicProfile_isPublic_idx" ON "PublicProfile"("isPublic");

-- CreateIndex
CREATE INDEX "PublicProfile_customDomain_idx" ON "PublicProfile"("customDomain");

-- CreateIndex
CREATE INDEX "PublicProfile_viewCount_idx" ON "PublicProfile"("viewCount");

-- CreateIndex
CREATE INDEX "PlatformConnection_userId_idx" ON "PlatformConnection"("userId");

-- CreateIndex
CREATE INDEX "PlatformConnection_platform_idx" ON "PlatformConnection"("platform");

-- CreateIndex
CREATE INDEX "PlatformConnection_isActive_idx" ON "PlatformConnection"("isActive");

-- CreateIndex
CREATE INDEX "PlatformConnection_lastSyncAt_idx" ON "PlatformConnection"("lastSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConnection_userId_platform_key" ON "PlatformConnection"("userId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConnection_platform_platformUserId_key" ON "PlatformConnection"("platform", "platformUserId");

-- CreateIndex
CREATE INDEX "SyncHistory_userId_startedAt_idx" ON "SyncHistory"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "SyncHistory_projectId_idx" ON "SyncHistory"("projectId");

-- CreateIndex
CREATE INDEX "SyncHistory_status_idx" ON "SyncHistory"("status");

-- CreateIndex
CREATE INDEX "SyncHistory_platform_idx" ON "SyncHistory"("platform");

-- CreateIndex
CREATE INDEX "SyncHistory_startedAt_idx" ON "SyncHistory"("startedAt");

-- CreateIndex
CREATE INDEX "AIAnalysis_projectId_idx" ON "AIAnalysis"("projectId");

-- CreateIndex
CREATE INDEX "AIAnalysis_confidence_idx" ON "AIAnalysis"("confidence");

-- CreateIndex
CREATE INDEX "AIAnalysis_createdAt_idx" ON "AIAnalysis"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIAnalysis_projectId_version_key" ON "AIAnalysis"("projectId", "version");

-- CreateIndex
CREATE INDEX "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_resource_idx" ON "AuditLog"("resource");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_success_idx" ON "AuditLog"("success");

-- CreateIndex
CREATE INDEX "ApiUsage_userId_timestamp_idx" ON "ApiUsage"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "ApiUsage_apiKey_timestamp_idx" ON "ApiUsage"("apiKey", "timestamp");

-- CreateIndex
CREATE INDEX "ApiUsage_endpoint_idx" ON "ApiUsage"("endpoint");

-- CreateIndex
CREATE INDEX "ApiUsage_timestamp_idx" ON "ApiUsage"("timestamp");

-- CreateIndex
CREATE INDEX "ApiUsage_statusCode_idx" ON "ApiUsage"("statusCode");

-- CreateIndex
CREATE INDEX "SystemMetric_metric_timestamp_idx" ON "SystemMetric"("metric", "timestamp");

-- CreateIndex
CREATE INDEX "SystemMetric_timestamp_idx" ON "SystemMetric"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBlacklist_jti_key" ON "TokenBlacklist"("jti");

-- CreateIndex
CREATE INDEX "TokenBlacklist_jti_idx" ON "TokenBlacklist"("jti");

-- CreateIndex
CREATE INDEX "TokenBlacklist_userId_idx" ON "TokenBlacklist"("userId");

-- CreateIndex
CREATE INDEX "TokenBlacklist_expiresAt_idx" ON "TokenBlacklist"("expiresAt");

-- CreateIndex
CREATE INDEX "TokenBlacklist_createdAt_idx" ON "TokenBlacklist"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_platform_eventType_idx" ON "WebhookEvent"("platform", "eventType");

-- CreateIndex
CREATE INDEX "WebhookEvent_repositoryId_idx" ON "WebhookEvent"("repositoryId");

-- CreateIndex
CREATE INDEX "WebhookEvent_ownerId_idx" ON "WebhookEvent"("ownerId");

-- CreateIndex
CREATE INDEX "WebhookEvent_timestamp_idx" ON "WebhookEvent"("timestamp");

-- CreateIndex
CREATE INDEX "WebhookEvent_processed_idx" ON "WebhookEvent"("processed");

-- CreateIndex
CREATE INDEX "WebhookEvent_retryCount_idx" ON "WebhookEvent"("retryCount");

-- CreateIndex
CREATE INDEX "WebhookEvent_platform_repositoryId_timestamp_idx" ON "WebhookEvent"("platform", "repositoryId", "timestamp");

-- CreateIndex
CREATE INDEX "CustomMetadata_projectId_idx" ON "CustomMetadata"("projectId");

-- CreateIndex
CREATE INDEX "CustomMetadata_userId_idx" ON "CustomMetadata"("userId");

-- CreateIndex
CREATE INDEX "CustomMetadata_hash_idx" ON "CustomMetadata"("hash");

-- CreateIndex
CREATE INDEX "CustomMetadata_createdAt_idx" ON "CustomMetadata"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomMetadata_projectId_version_key" ON "CustomMetadata"("projectId", "version");

-- CreateIndex
CREATE INDEX "EmailBounce_email_idx" ON "EmailBounce"("email");

-- CreateIndex
CREATE INDEX "EmailBounce_messageId_idx" ON "EmailBounce"("messageId");

-- CreateIndex
CREATE INDEX "EmailBounce_timestamp_idx" ON "EmailBounce"("timestamp");

-- CreateIndex
CREATE INDEX "EmailBounce_bounceType_idx" ON "EmailBounce"("bounceType");

-- CreateIndex
CREATE INDEX "EmailComplaint_email_idx" ON "EmailComplaint"("email");

-- CreateIndex
CREATE INDEX "EmailComplaint_messageId_idx" ON "EmailComplaint"("messageId");

-- CreateIndex
CREATE INDEX "EmailComplaint_timestamp_idx" ON "EmailComplaint"("timestamp");

-- CreateIndex
CREATE INDEX "EmailComplaint_complaintType_idx" ON "EmailComplaint"("complaintType");

-- CreateIndex
CREATE INDEX "EmailDelivery_email_idx" ON "EmailDelivery"("email");

-- CreateIndex
CREATE INDEX "EmailDelivery_messageId_idx" ON "EmailDelivery"("messageId");

-- CreateIndex
CREATE INDEX "EmailDelivery_timestamp_idx" ON "EmailDelivery"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "EmailSuppression"("email");

-- CreateIndex
CREATE INDEX "EmailSuppression_isActive_idx" ON "EmailSuppression"("isActive");

-- CreateIndex
CREATE INDEX "FailedEmailJob_nextRetryAt_attempts_idx" ON "FailedEmailJob"("nextRetryAt", "attempts");

-- CreateIndex
CREATE INDEX "FailedEmailJob_email_idx" ON "FailedEmailJob"("email");

-- CreateIndex
CREATE INDEX "FailedEmailJob_type_idx" ON "FailedEmailJob"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKeyToken_keyHash_key" ON "ApiKeyToken"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKeyToken_userId_idx" ON "ApiKeyToken"("userId");

-- CreateIndex
CREATE INDEX "ApiKeyToken_keyPrefix_idx" ON "ApiKeyToken"("keyPrefix");

-- CreateIndex
CREATE INDEX "ApiKeyToken_isActive_idx" ON "ApiKeyToken"("isActive");

-- CreateIndex
CREATE INDEX "ApiKeyToken_lastUsedAt_idx" ON "ApiKeyToken"("lastUsedAt");

-- CreateIndex
CREATE INDEX "ApiKeyToken_environment_idx" ON "ApiKeyToken"("environment");

-- CreateIndex
CREATE INDEX "ApiKeyToken_createdAt_idx" ON "ApiKeyToken"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tier_name_key" ON "Tier"("name");

-- CreateIndex
CREATE INDEX "Tier_name_idx" ON "Tier"("name");

-- CreateIndex
CREATE INDEX "Tier_isActive_idx" ON "Tier"("isActive");

-- CreateIndex
CREATE INDEX "Tier_sortOrder_idx" ON "Tier"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_tierId_idx" ON "Subscription"("tierId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Subscription_paymentProvider_idx" ON "Subscription"("paymentProvider");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_paymentProvider_idx" ON "Payment"("paymentProvider");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicProfile" ADD CONSTRAINT "PublicProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformConnection" ADD CONSTRAINT "PlatformConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncHistory" ADD CONSTRAINT "SyncHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncHistory" ADD CONSTRAINT "SyncHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomMetadata" ADD CONSTRAINT "CustomMetadata_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomMetadata" ADD CONSTRAINT "CustomMetadata_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKeyToken" ADD CONSTRAINT "ApiKeyToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

