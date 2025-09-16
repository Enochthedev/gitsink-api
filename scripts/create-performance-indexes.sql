-- Performance optimization indexes for Gitsink database
-- Run this script directly against the database (not through Prisma migrations)
-- because CREATE INDEX CONCURRENTLY cannot run inside a transaction

-- User table performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_tier_active" ON "User" ("tier") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_last_sync" ON "User" ("lastSyncAt") WHERE "lastSyncAt" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_api_calls_reset" ON "User" ("lastApiCallReset", "monthlyApiCalls");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_github_token" ON "User" ("githubId") WHERE "githubToken" IS NOT NULL;

-- Project table performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_owner_published_featured" ON "Project" ("ownerId", "published", "featured") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_platform_active" ON "Project" ("platform", "archived") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_language_stars" ON "Project" ("language", "starCount" DESC) WHERE "language" IS NOT NULL AND "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_category_updated" ON "Project" ("category", "updatedAt" DESC) WHERE "category" IS NOT NULL AND "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_sync_status" ON "Project" ("syncedAt", "published") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_popularity" ON "Project" ("starCount" DESC, "forkCount" DESC) WHERE "published" = true AND "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_recent_activity" ON "Project" ("lastCommitAt" DESC, "pushedAt" DESC) WHERE "deletedAt" IS NULL;

-- Full-text search index for projects
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_search" ON "Project" USING GIN (to_tsvector('english', COALESCE("title", '') || ' ' || COALESCE("description", '') || ' ' || array_to_string("tags", ' '))) WHERE "deletedAt" IS NULL;

-- Composite indexes for common filter combinations
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_owner_platform_published" ON "Project" ("ownerId", "platform", "published") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_owner_category_featured" ON "Project" ("ownerId", "category", "featured") WHERE "deletedAt" IS NULL AND "category" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_tags_gin" ON "Project" USING GIN ("tags") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_topics_gin" ON "Project" USING GIN ("topics") WHERE "deletedAt" IS NULL;

-- PublicProfile performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_public_profile_public_views" ON "PublicProfile" ("isPublic", "viewCount" DESC) WHERE "isPublic" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_public_profile_domain_active" ON "PublicProfile" ("customDomain") WHERE "customDomain" IS NOT NULL AND "isPublic" = true;

-- PlatformConnection performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_platform_connection_user_active" ON "PlatformConnection" ("userId", "isActive", "platform") WHERE "isActive" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_platform_connection_sync_due" ON "PlatformConnection" ("lastSyncAt", "isActive") WHERE "isActive" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_platform_connection_token_expiry" ON "PlatformConnection" ("tokenExpiresAt") WHERE "tokenExpiresAt" IS NOT NULL AND "isActive" = true;

-- SyncHistory performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_user_recent" ON "SyncHistory" ("userId", "startedAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_project_status" ON "SyncHistory" ("projectId", "status", "startedAt" DESC) WHERE "projectId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_platform_status" ON "SyncHistory" ("platform", "status", "startedAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_failed_operations" ON "SyncHistory" ("status", "startedAt" DESC) WHERE "status" = 'failed';
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_duration_analysis" ON "SyncHistory" ("operation", "duration") WHERE "duration" IS NOT NULL;

-- AIAnalysis performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ai_analysis_project_latest" ON "AIAnalysis" ("projectId", "version" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ai_analysis_confidence_recent" ON "AIAnalysis" ("confidence" DESC, "createdAt" DESC) WHERE "confidence" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ai_analysis_model_performance" ON "AIAnalysis" ("model", "createdAt" DESC) WHERE "model" IS NOT NULL;

-- AuditLog performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_user_recent" ON "AuditLog" ("userId", "timestamp" DESC) WHERE "userId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_action_time" ON "AuditLog" ("action", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_resource_time" ON "AuditLog" ("resource", "resourceId", "timestamp" DESC) WHERE "resource" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_failed_actions" ON "AuditLog" ("success", "timestamp" DESC) WHERE "success" = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_ip_analysis" ON "AuditLog" ("ipAddress", "timestamp" DESC) WHERE "ipAddress" IS NOT NULL;

-- ApiUsage performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_user_time" ON "ApiUsage" ("userId", "timestamp" DESC) WHERE "userId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_key_time" ON "ApiUsage" ("apiKey", "timestamp" DESC) WHERE "apiKey" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_endpoint_performance" ON "ApiUsage" ("endpoint", "duration", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_status_analysis" ON "ApiUsage" ("statusCode", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_rate_limiting" ON "ApiUsage" ("userId", "endpoint", "timestamp" DESC) WHERE "userId" IS NOT NULL;

-- SystemMetric performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_system_metric_name_time" ON "SystemMetric" ("metric", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_system_metric_recent" ON "SystemMetric" ("timestamp" DESC);

-- TokenBlacklist performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_token_blacklist_expiry_cleanup" ON "TokenBlacklist" ("expiresAt") WHERE "expiresAt" < NOW();
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_token_blacklist_user_type" ON "TokenBlacklist" ("userId", "tokenType") WHERE "userId" IS NOT NULL;

-- WebhookEvent performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_processing" ON "WebhookEvent" ("processed", "retryCount", "createdAt") WHERE "processed" = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_repository" ON "WebhookEvent" ("platform", "repositoryId", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_owner_recent" ON "WebhookEvent" ("ownerId", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_retry_analysis" ON "WebhookEvent" ("retryCount", "lastRetryAt") WHERE "retryCount" > 0;

-- RefreshToken performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_refresh_token_cleanup" ON "RefreshToken" ("expiresAt") WHERE "expiresAt" < NOW();
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_refresh_token_usage" ON "RefreshToken" ("lastUsedAt", "usageCount") WHERE "lastUsedAt" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_refresh_token_device" ON "RefreshToken" ("deviceId", "userId") WHERE "deviceId" IS NOT NULL;

-- MagicLinkToken performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_magic_link_cleanup" ON "MagicLinkToken" ("expiresAt") WHERE "expiresAt" < NOW();

-- Partial indexes for soft deletes (only index active records)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_active_email" ON "User" ("email") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_active_username" ON "User" ("username") WHERE "deletedAt" IS NULL AND "username" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_active_github" ON "User" ("githubId") WHERE "deletedAt" IS NULL AND "githubId" IS NOT NULL;

-- Update statistics for better query planning
ANALYZE "User";
ANALYZE "Project";
ANALYZE "PublicProfile";
ANALYZE "PlatformConnection";
ANALYZE "SyncHistory";
ANALYZE "AIAnalysis";
ANALYZE "AuditLog";
ANALYZE "ApiUsage";
ANALYZE "SystemMetric";
ANALYZE "TokenBlacklist";
ANALYZE "WebhookEvent";
ANALYZE "RefreshToken";
ANALYZE "MagicLinkToken";