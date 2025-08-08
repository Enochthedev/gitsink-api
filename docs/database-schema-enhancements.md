# Database Schema Enhancements

This document describes the comprehensive database schema enhancements implemented for the Gitsink codebase improvement project.

## Overview

The database schema has been significantly enhanced to support new features including:
- Multi-platform repository support (GitHub, GitLab, Bitbucket)
- Public developer profiles
- AI-powered project enrichment
- Comprehensive audit logging
- Advanced monitoring and analytics
- Enhanced user management with tiers and settings

## Schema Changes

### Enhanced User Table

The `User` table has been extended with the following new fields:

```sql
-- User tier management
tier              String   @default("free") // free, premium, enterprise

-- User settings and configuration
settings          Json     @default("{}")
profileConfig     Json     @default("{}")
platformTokens    Json     @default("{}")

-- Sync and API usage tracking
lastSyncAt        DateTime?
syncCount         Int      @default(0)
apiCallCount      Int      @default(0)
monthlyApiCalls   Int      @default(0)
lastApiCallReset  DateTime @default(now())
```

**New Indexes:**
- `User_tier_idx` - For tier-based queries
- `User_lastSyncAt_idx` - For sync activity tracking
- `User_monthlyApiCalls_idx` - For API usage monitoring

### Enhanced Project Table

The `Project` table has been extended to support multi-platform repositories:

```sql
-- Platform support
platform         String    @default("github") // github, gitlab, bitbucket
platformId       String?   // platform-specific repository ID
defaultBranch    String?   @default("main")

-- Repository metadata
language         String?   // primary programming language
languages        Json      @default("{}")  // language breakdown
starCount        Int       @default(0)
forkCount        Int       @default(0)
isPrivate        Boolean   @default(false)
license          String?
topics           String[]  @default([])
size             Int?      // repository size in KB
openIssues       Int       @default(0)
hasWiki          Boolean   @default(false)
hasPages         Boolean   @default(false)
archived         Boolean   @default(false)
disabled         Boolean   @default(false)
pushedAt         DateTime?
```

**New Indexes:**
- `Project_platform_idx` - For platform-specific queries
- `Project_language_idx` - For language filtering
- `Project_starCount_idx` - For popularity sorting
- `Project_topics_idx` - For topic-based search
- `Project_isPrivate_idx` - For privacy filtering
- `Project_archived_idx` - For active project filtering

## New Tables

### PublicProfile

Stores public developer profile information for showcasing projects.

```sql
model PublicProfile {
  id           String   @id @default(uuid())
  userId       String   @unique
  username     String   @unique
  displayName  String?
  bio          String?
  avatar       String?
  location     String?
  website      String?
  socialLinks  Json     @default("[]")
  theme        Json     @default("{}")
  settings     Json     @default("{}")
  isPublic     Boolean  @default(false)
  customDomain String?  @unique
  viewCount    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

**Key Features:**
- Unique usernames for public URLs
- Customizable themes and settings
- Social media links integration
- View count tracking
- Custom domain support

### PlatformConnection

Manages connections to multiple repository platforms.

```sql
model PlatformConnection {
  id               String    @id @default(uuid())
  userId           String
  platform         String    // github, gitlab, bitbucket
  platformUserId   String
  platformUsername String?
  accessToken      String?
  refreshToken     String?
  tokenExpiresAt   DateTime?
  scopes           String[]
  isActive         Boolean   @default(true)
  lastSyncAt       DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```

**Key Features:**
- Multi-platform OAuth token management
- Token expiration tracking
- Scope management
- Connection status tracking

### SyncHistory

Comprehensive audit trail for all repository synchronization operations.

```sql
model SyncHistory {
  id            String    @id @default(uuid())
  userId        String
  projectId     String?
  operation     String    // sync, create, update, delete
  platform      String
  repositoryUrl String
  status        String    // started, completed, failed
  changes       Json      @default("[]")
  metadata      Json      @default("{}")
  error         String?
  startedAt     DateTime  @default(now())
  completedAt   DateTime?
  duration      Int?      // duration in milliseconds
}
```

**Key Features:**
- Detailed change tracking
- Performance monitoring (duration)
- Error logging and debugging
- Platform-specific metadata storage

### AIAnalysis

Stores AI-powered project analysis results.

```sql
model AIAnalysis {
  id         String   @id @default(uuid())
  projectId  String
  version    Int      @default(1)
  analysis   Json     // stores the complete AI analysis result
  confidence Float?   // confidence score 0.0-1.0
  model      String?  // AI model used for analysis
  createdAt  DateTime @default(now())
}
```

**Key Features:**
- Versioned analysis results
- Confidence scoring
- Model tracking for analysis provenance
- Flexible JSON storage for analysis data

### AuditLog

Comprehensive security and compliance audit logging.

```sql
model AuditLog {
  id          String   @id @default(uuid())
  userId      String?
  action      String   // login, logout, api_call, sync, etc.
  resource    String?  // resource being acted upon
  resourceId  String?  // ID of the resource
  details     Json     @default("{}")
  ipAddress   String?
  userAgent   String?
  success     Boolean  @default(true)
  error       String?
  timestamp   DateTime @default(now())
}
```

**Key Features:**
- User action tracking
- Resource-level auditing
- IP and user agent logging
- Success/failure tracking
- Flexible details storage

### ApiUsage

API usage tracking for rate limiting and analytics.

```sql
model ApiUsage {
  id         String   @id @default(uuid())
  userId     String?
  apiKey     String?
  endpoint   String
  method     String
  statusCode Int
  duration   Int      // response time in milliseconds
  ipAddress  String?
  userAgent  String?
  timestamp  DateTime @default(now())
}
```

**Key Features:**
- Per-endpoint usage tracking
- Performance monitoring
- Rate limiting support
- User and API key association

### SystemMetric

System health and performance metrics storage.

```sql
model SystemMetric {
  id        String   @id @default(uuid())
  metric    String   // metric name
  value     Float    // metric value
  tags      Json     @default("{}")  // additional tags/dimensions
  timestamp DateTime @default(now())
}
```

**Key Features:**
- Time-series metric storage
- Flexible tagging system
- Performance monitoring
- System health tracking

## Performance Optimizations

### Composite Indexes

Several composite indexes have been created for common query patterns:

```sql
-- Complex project queries
CREATE INDEX "idx_projects_user_published_featured" ON "Project" ("ownerId", "published", "featured");

-- Full-text search
CREATE INDEX "idx_projects_search_text" ON "Project" USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Tag-based search
CREATE INDEX "idx_projects_tags_gin" ON "Project" USING GIN ("tags");
```

### Time-Based Indexes

Optimized indexes for time-series data:

```sql
-- Audit trail queries
CREATE INDEX "idx_sync_history_user_date_desc" ON "SyncHistory" ("userId", "startedAt" DESC);
CREATE INDEX "idx_audit_log_timestamp_desc" ON "AuditLog" ("timestamp" DESC);
CREATE INDEX "idx_api_usage_timestamp_desc" ON "ApiUsage" ("timestamp" DESC);
```

### Conditional Indexes

Indexes with WHERE clauses for specific use cases:

```sql
-- Active projects only
CREATE INDEX "idx_projects_stars_desc" ON "Project" ("starCount" DESC) WHERE "published" = true;
CREATE INDEX "idx_projects_recent_activity" ON "Project" ("pushedAt" DESC) WHERE "archived" = false;

-- Active users only
CREATE INDEX "idx_users_active_tier" ON "User" ("lastLoginAt" DESC, "tier") WHERE "deletedAt" IS NULL;
```

## Migration Strategy

### Applied Migrations

1. **20250807230531_add_enhanced_schema_and_new_tables** - Main schema enhancement
2. **20250807231000_add_performance_indexes** - Performance optimization indexes

### Migration Verification

A comprehensive verification script (`scripts/verify-migrations.ts`) has been created to:
- Verify all tables exist
- Check index creation
- Test CRUD operations on all new tables
- Validate data integrity

### Rollback Strategy

All migrations are designed to be reversible:
- New columns have default values
- New tables have proper foreign key constraints
- Indexes can be dropped without data loss

## Usage Examples

### User Tier Management

```typescript
// Upgrade user to premium tier
await prisma.user.update({
  where: { id: userId },
  data: { 
    tier: 'premium',
    settings: { 
      ...existingSettings,
      premiumFeatures: true 
    }
  }
});
```

### Multi-Platform Project Sync

```typescript
// Create project from GitLab
await prisma.project.create({
  data: {
    title: 'My GitLab Project',
    description: 'Project from GitLab',
    platform: 'gitlab',
    platformId: 'gitlab-project-123',
    ownerId: userId,
    // ... other fields
  }
});
```

### Audit Trail Querying

```typescript
// Get user's recent sync history
const syncHistory = await prisma.syncHistory.findMany({
  where: { userId },
  orderBy: { startedAt: 'desc' },
  take: 10,
  include: { project: true }
});
```

### Public Profile Management

```typescript
// Create public profile
await prisma.publicProfile.create({
  data: {
    userId,
    username: 'developer123',
    displayName: 'John Developer',
    bio: 'Full-stack developer',
    isPublic: true,
    theme: { primaryColor: '#007acc' }
  }
});
```

## Performance Considerations

### Query Optimization

- Use composite indexes for multi-column WHERE clauses
- Leverage GIN indexes for array and full-text search
- Use conditional indexes to reduce index size

### Data Retention

- Consider partitioning large tables (SyncHistory, AuditLog, ApiUsage) by date
- Implement data archival for old audit logs
- Use appropriate data types to minimize storage

### Monitoring

- Monitor index usage with `pg_stat_user_indexes`
- Track query performance with `pg_stat_statements`
- Set up alerts for slow queries

## Security Considerations

### Data Protection

- Sensitive tokens are stored encrypted
- Audit logs capture security events
- User data includes soft delete support

### Access Control

- Foreign key constraints ensure data integrity
- Proper indexing prevents unauthorized data access
- API usage tracking enables rate limiting

## Future Enhancements

### Planned Improvements

1. **Table Partitioning** - For large audit tables
2. **Read Replicas** - For analytics queries
3. **Data Archival** - Automated old data cleanup
4. **Advanced Indexing** - Partial and expression indexes

### Scalability Considerations

- Connection pooling optimization
- Query result caching
- Database sharding for multi-tenant support

## Conclusion

The database schema enhancements provide a solid foundation for the Gitsink platform's growth, supporting multi-platform integration, comprehensive auditing, and advanced analytics while maintaining performance and data integrity.