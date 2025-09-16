-- Database Performance Optimization Script
-- This script adds missing indexes, constraints, and optimizations

-- ============================================================================
-- MISSING INDEXES FOR PERFORMANCE OPTIMIZATION
-- ============================================================================

-- User table indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_email_deleted" ON "User" ("email") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_github_id" ON "User" ("githubId") WHERE "githubId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_api_key_active" ON "User" ("apiKey") WHERE "apiKey" IS NOT NULL AND "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_tier_active" ON "User" ("tier") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_last_sync" ON "User" ("lastSyncAt") WHERE "lastSyncAt" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_monthly_calls" ON "User" ("monthlyApiCalls", "lastApiCallReset");

-- Project table indexes for complex queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_owner_published_featured" ON "Project" ("ownerId", "published", "featured") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_owner_category_published" ON "Project" ("ownerId", "category", "published") WHERE "deletedAt" IS NULL AND "category" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_owner_language_published" ON "Project" ("ownerId", "language", "published") WHERE "deletedAt" IS NULL AND "language" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_platform_published" ON "Project" ("platform", "published") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_stars_published" ON "Project" ("starCount" DESC, "published") WHERE "deletedAt" IS NULL AND "published" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_forks_published" ON "Project" ("forkCount" DESC, "published") WHERE "deletedAt" IS NULL AND "published" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_updated_published" ON "Project" ("updatedAt" DESC, "published") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_pushed_published" ON "Project" ("pushedAt" DESC, "published") WHERE "deletedAt" IS NULL AND "pushedAt" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_created_published" ON "Project" ("createdAt" DESC, "published") WHERE "deletedAt" IS NULL;

-- Composite indexes for trending and popular projects
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_trending_score" ON "Project" ("published", "archived", "starCount" DESC, "forkCount" DESC, "lastCommitAt" DESC) WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_activity_recent" ON "Project" ("lastCommitAt" DESC, "pushedAt" DESC) WHERE "deletedAt" IS NULL AND ("lastCommitAt" > NOW() - INTERVAL '30 days' OR "pushedAt" > NOW() - INTERVAL '30 days');

-- GIN indexes for array and JSON fields
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_tags_gin" ON "Project" USING GIN ("tags") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_topics_gin" ON "Project" USING GIN ("topics") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_github_metadata_gin" ON "Project" USING GIN ("githubMetadata") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_custom_metadata_gin" ON "Project" USING GIN ("customMetadata") WHERE "deletedAt" IS NULL;

-- Full-text search indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_project_search_text" ON "Project" USING GIN (to_tsvector('english', COALESCE("title", '') || ' ' || COALESCE("description", '') || ' ' || array_to_string("tags", ' '))) WHERE "deletedAt" IS NULL;

-- RefreshToken indexes for cleanup and validation
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_refresh_token_user_expires" ON "RefreshToken" ("userId", "expiresAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_refresh_token_expires_cleanup" ON "RefreshToken" ("expiresAt") WHERE "expiresAt" < NOW();
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_refresh_token_device" ON "RefreshToken" ("deviceId") WHERE "deviceId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_refresh_token_usage" ON "RefreshToken" ("lastUsedAt", "usageCount");

-- MagicLinkToken indexes for cleanup
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_magic_link_expires_cleanup" ON "MagicLinkToken" ("expiresAt") WHERE "expiresAt" < NOW();
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_magic_link_email_expires" ON "MagicLinkToken" ("email", "expiresAt");

-- PublicProfile indexes for discovery and performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_public_profile_username_public" ON "PublicProfile" ("username") WHERE "isPublic" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_public_profile_domain_public" ON "PublicProfile" ("customDomain") WHERE "customDomain" IS NOT NULL AND "isPublic" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_public_profile_views_public" ON "PublicProfile" ("viewCount" DESC, "isPublic") WHERE "isPublic" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_public_profile_updated_public" ON "PublicProfile" ("updatedAt" DESC, "isPublic") WHERE "isPublic" = true;

-- PlatformConnection indexes for multi-platform support
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_platform_connection_user_active" ON "PlatformConnection" ("userId", "isActive");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_platform_connection_platform_active" ON "PlatformConnection" ("platform", "isActive");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_platform_connection_sync" ON "PlatformConnection" ("lastSyncAt", "isActive") WHERE "isActive" = true;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_platform_connection_token_expires" ON "PlatformConnection" ("tokenExpiresAt") WHERE "tokenExpiresAt" IS NOT NULL;

-- SyncHistory indexes for audit and reporting
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_user_started_desc" ON "SyncHistory" ("userId", "startedAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_project_started" ON "SyncHistory" ("projectId", "startedAt" DESC) WHERE "projectId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_status_started" ON "SyncHistory" ("status", "startedAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_platform_started" ON "SyncHistory" ("platform", "startedAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_operation_started" ON "SyncHistory" ("operation", "startedAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_duration" ON "SyncHistory" ("duration") WHERE "duration" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_history_failed" ON "SyncHistory" ("status", "error") WHERE "status" = 'failed' AND "error" IS NOT NULL;

-- AIAnalysis indexes for AI features
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ai_analysis_project_version" ON "AIAnalysis" ("projectId", "version" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ai_analysis_confidence" ON "AIAnalysis" ("confidence" DESC) WHERE "confidence" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ai_analysis_model_created" ON "AIAnalysis" ("model", "createdAt" DESC) WHERE "model" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ai_analysis_created" ON "AIAnalysis" ("createdAt" DESC);

-- AuditLog indexes for security and compliance
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_user_timestamp_desc" ON "AuditLog" ("userId", "timestamp" DESC) WHERE "userId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_action_timestamp" ON "AuditLog" ("action", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_resource_timestamp" ON "AuditLog" ("resource", "resourceId", "timestamp" DESC) WHERE "resource" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_success_timestamp" ON "AuditLog" ("success", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_ip_timestamp" ON "AuditLog" ("ipAddress", "timestamp" DESC) WHERE "ipAddress" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_failed_actions" ON "AuditLog" ("action", "success", "timestamp" DESC) WHERE "success" = false;

-- ApiUsage indexes for rate limiting and analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_user_timestamp_desc" ON "ApiUsage" ("userId", "timestamp" DESC) WHERE "userId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_key_timestamp_desc" ON "ApiUsage" ("apiKey", "timestamp" DESC) WHERE "apiKey" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_endpoint_timestamp" ON "ApiUsage" ("endpoint", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_status_timestamp" ON "ApiUsage" ("statusCode", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_duration" ON "ApiUsage" ("duration" DESC) WHERE "duration" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_usage_recent" ON "ApiUsage" ("timestamp" DESC) WHERE "timestamp" > NOW() - INTERVAL '24 hours';

-- SystemMetric indexes for monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_system_metric_name_timestamp" ON "SystemMetric" ("metric", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_system_metric_timestamp_desc" ON "SystemMetric" ("timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_system_metric_recent" ON "SystemMetric" ("metric", "timestamp" DESC) WHERE "timestamp" > NOW() - INTERVAL '7 days';

-- TokenBlacklist indexes for JWT management
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_token_blacklist_jti" ON "TokenBlacklist" ("jti");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_token_blacklist_user_expires" ON "TokenBlacklist" ("userId", "expiresAt") WHERE "userId" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_token_blacklist_expires_cleanup" ON "TokenBlacklist" ("expiresAt") WHERE "expiresAt" < NOW();
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_token_blacklist_type_expires" ON "TokenBlacklist" ("tokenType", "expiresAt");

-- WebhookEvent indexes for webhook processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_platform_type" ON "WebhookEvent" ("platform", "eventType");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_repo_timestamp" ON "WebhookEvent" ("repositoryId", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_owner_timestamp" ON "WebhookEvent" ("ownerId", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_processed" ON "WebhookEvent" ("processed", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_retry" ON "WebhookEvent" ("retryCount", "lastRetryAt") WHERE "retryCount" > 0;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_failed" ON "WebhookEvent" ("processed", "error") WHERE "processed" = false AND "error" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_event_platform_repo_timestamp" ON "WebhookEvent" ("platform", "repositoryId", "timestamp" DESC);

-- CustomMetadata indexes for Portfolio.md enhancements
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_custom_metadata_project_version" ON "CustomMetadata" ("projectId", "version" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_custom_metadata_user_created" ON "CustomMetadata" ("userId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_custom_metadata_hash" ON "CustomMetadata" ("hash");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_custom_metadata_size" ON "CustomMetadata" ("size" DESC) WHERE "size" > 0;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_custom_metadata_field_count" ON "CustomMetadata" ("fieldCount" DESC) WHERE "fieldCount" > 0;

-- ============================================================================
-- MISSING DATABASE CONSTRAINTS AND VALIDATIONS
-- ============================================================================

-- Add check constraints for data validation
ALTER TABLE "User" ADD CONSTRAINT "chk_user_tier" CHECK ("tier" IN ('free', 'premium', 'enterprise'));
ALTER TABLE "User" ADD CONSTRAINT "chk_user_monthly_calls" CHECK ("monthlyApiCalls" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "chk_user_sync_count" CHECK ("syncCount" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "chk_user_api_call_count" CHECK ("apiCallCount" >= 0);

ALTER TABLE "Project" ADD CONSTRAINT "chk_project_platform" CHECK ("platform" IN ('github', 'gitlab', 'bitbucket'));
ALTER TABLE "Project" ADD CONSTRAINT "chk_project_star_count" CHECK ("starCount" >= 0);
ALTER TABLE "Project" ADD CONSTRAINT "chk_project_fork_count" CHECK ("forkCount" >= 0);
ALTER TABLE "Project" ADD CONSTRAINT "chk_project_open_issues" CHECK ("openIssues" >= 0);
ALTER TABLE "Project" ADD CONSTRAINT "chk_project_size" CHECK ("size" IS NULL OR "size" >= 0);

ALTER TABLE "RefreshToken" ADD CONSTRAINT "chk_refresh_token_usage_count" CHECK ("usageCount" >= 0);
ALTER TABLE "RefreshToken" ADD CONSTRAINT "chk_refresh_token_expires_future" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "PublicProfile" ADD CONSTRAINT "chk_public_profile_view_count" CHECK ("viewCount" >= 0);

ALTER TABLE "PlatformConnection" ADD CONSTRAINT "chk_platform_connection_platform" CHECK ("platform" IN ('github', 'gitlab', 'bitbucket'));

ALTER TABLE "SyncHistory" ADD CONSTRAINT "chk_sync_history_operation" CHECK ("operation" IN ('sync', 'create', 'update', 'delete'));
ALTER TABLE "SyncHistory" ADD CONSTRAINT "chk_sync_history_status" CHECK ("status" IN ('started', 'completed', 'failed'));
ALTER TABLE "SyncHistory" ADD CONSTRAINT "chk_sync_history_duration" CHECK ("duration" IS NULL OR "duration" >= 0);

ALTER TABLE "AIAnalysis" ADD CONSTRAINT "chk_ai_analysis_confidence" CHECK ("confidence" IS NULL OR ("confidence" >= 0.0 AND "confidence" <= 1.0));
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "chk_ai_analysis_version" CHECK ("version" > 0);

ALTER TABLE "ApiUsage" ADD CONSTRAINT "chk_api_usage_status_code" CHECK ("statusCode" >= 100 AND "statusCode" < 600);
ALTER TABLE "ApiUsage" ADD CONSTRAINT "chk_api_usage_duration" CHECK ("duration" >= 0);

ALTER TABLE "TokenBlacklist" ADD CONSTRAINT "chk_token_blacklist_type" CHECK ("tokenType" IN ('access', 'refresh'));

ALTER TABLE "WebhookEvent" ADD CONSTRAINT "chk_webhook_event_retry_count" CHECK ("retryCount" >= 0);

ALTER TABLE "CustomMetadata" ADD CONSTRAINT "chk_custom_metadata_version" CHECK ("version" > 0);
ALTER TABLE "CustomMetadata" ADD CONSTRAINT "chk_custom_metadata_size" CHECK ("size" >= 0);
ALTER TABLE "CustomMetadata" ADD CONSTRAINT "chk_custom_metadata_field_count" CHECK ("fieldCount" >= 0);

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS (if missing)
-- ============================================================================

-- Ensure all foreign key constraints exist with proper cascade behavior
-- Note: Most are already defined in Prisma schema, but adding explicit names for better management

-- Add missing foreign key constraints with proper names
DO $$
BEGIN
    -- Check and add foreign key constraints that might be missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_project_owner_cascade' 
        AND table_name = 'Project'
    ) THEN
        ALTER TABLE "Project" ADD CONSTRAINT "fk_project_owner_cascade" 
        FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_refresh_token_user_cascade' 
        AND table_name = 'RefreshToken'
    ) THEN
        ALTER TABLE "RefreshToken" ADD CONSTRAINT "fk_refresh_token_user_cascade" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_public_profile_user_cascade' 
        AND table_name = 'PublicProfile'
    ) THEN
        ALTER TABLE "PublicProfile" ADD CONSTRAINT "fk_public_profile_user_cascade" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_platform_connection_user_cascade' 
        AND table_name = 'PlatformConnection'
    ) THEN
        ALTER TABLE "PlatformConnection" ADD CONSTRAINT "fk_platform_connection_user_cascade" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_sync_history_user_cascade' 
        AND table_name = 'SyncHistory'
    ) THEN
        ALTER TABLE "SyncHistory" ADD CONSTRAINT "fk_sync_history_user_cascade" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_sync_history_project_set_null' 
        AND table_name = 'SyncHistory'
    ) THEN
        ALTER TABLE "SyncHistory" ADD CONSTRAINT "fk_sync_history_project_set_null" 
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_ai_analysis_project_cascade' 
        AND table_name = 'AIAnalysis'
    ) THEN
        ALTER TABLE "AIAnalysis" ADD CONSTRAINT "fk_ai_analysis_project_cascade" 
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_audit_log_user_set_null' 
        AND table_name = 'AuditLog'
    ) THEN
        ALTER TABLE "AuditLog" ADD CONSTRAINT "fk_audit_log_user_set_null" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_custom_metadata_project_cascade' 
        AND table_name = 'CustomMetadata'
    ) THEN
        ALTER TABLE "CustomMetadata" ADD CONSTRAINT "fk_custom_metadata_project_cascade" 
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_custom_metadata_user_cascade' 
        AND table_name = 'CustomMetadata'
    ) THEN
        ALTER TABLE "CustomMetadata" ADD CONSTRAINT "fk_custom_metadata_user_cascade" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- PERFORMANCE OPTIMIZATIONS
-- ============================================================================

-- Update table statistics for better query planning
ANALYZE "User";
ANALYZE "Project";
ANALYZE "RefreshToken";
ANALYZE "MagicLinkToken";
ANALYZE "PublicProfile";
ANALYZE "PlatformConnection";
ANALYZE "SyncHistory";
ANALYZE "AIAnalysis";
ANALYZE "AuditLog";
ANALYZE "ApiUsage";
ANALYZE "SystemMetric";
ANALYZE "TokenBlacklist";
ANALYZE "WebhookEvent";
ANALYZE "CustomMetadata";

-- Set up automatic statistics collection
ALTER TABLE "User" SET (autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE "Project" SET (autovacuum_analyze_scale_factor = 0.05);
ALTER TABLE "SyncHistory" SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "ApiUsage" SET (autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE "AuditLog" SET (autovacuum_analyze_scale_factor = 0.02);

-- Optimize frequently updated tables
ALTER TABLE "PublicProfile" SET (fillfactor = 90);
ALTER TABLE "Project" SET (fillfactor = 90);
ALTER TABLE "User" SET (fillfactor = 90);

-- ============================================================================
-- CLEANUP FUNCTIONS FOR MAINTENANCE
-- ============================================================================

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Clean up expired refresh tokens
    DELETE FROM "RefreshToken" WHERE "expiresAt" < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up expired magic link tokens
    DELETE FROM "MagicLinkToken" WHERE "expiresAt" < NOW();
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    -- Clean up expired blacklisted tokens
    DELETE FROM "TokenBlacklist" WHERE "expiresAt" < NOW();
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old audit logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM "AuditLog" 
    WHERE "timestamp" < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old API usage logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_api_usage()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM "ApiUsage" 
    WHERE "timestamp" < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old system metrics (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_system_metrics()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM "SystemMetric" 
    WHERE "timestamp" < NOW() - INTERVAL '7 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PERFORMANCE MONITORING VIEWS
-- ============================================================================

-- View for monitoring slow queries
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation,
    most_common_vals,
    most_common_freqs
FROM pg_stats 
WHERE schemaname = 'public'
ORDER BY tablename, attname;

-- View for monitoring index usage
CREATE OR REPLACE VIEW index_usage AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    CASE 
        WHEN idx_scan = 0 THEN 'Unused'
        WHEN idx_scan < 10 THEN 'Low Usage'
        WHEN idx_scan < 100 THEN 'Medium Usage'
        ELSE 'High Usage'
    END as usage_level
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- View for monitoring table sizes
CREATE OR REPLACE VIEW table_sizes AS
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

COMMIT;