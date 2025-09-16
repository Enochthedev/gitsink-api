# Sandbox Environment Implementation

This module provides a comprehensive sandbox environment for the Gitsink API, allowing users to test and experiment with the platform using realistic test data without affecting their production projects.

## Features

### Core Functionality
- **Sandbox Sessions**: Time-limited sessions with configurable usage limits
- **Test Data Generation**: Realistic repository and user data for testing
- **Data Isolation**: Complete separation between sandbox and production data
- **Migration Tools**: Safe migration of sandbox data to production
- **Usage Monitoring**: Real-time tracking of sandbox resource usage

### Key Components

#### SandboxService
Main service for managing sandbox sessions and usage limits.

```typescript
// Start a sandbox session
const session = await sandboxService.startSandboxSession(userId, {
  maxProjects: 10,
  maxApiCalls: 1000,
});

// Check if user is in sandbox mode
const isInSandbox = await sandboxService.isUserInSandboxMode(userId);

// Get usage statistics
const usage = await sandboxService.getSandboxUsage(userId);
```

#### SandboxDataService
Handles generation and management of realistic test data.

```typescript
// Generate test repositories
const repositories = sandboxDataService.generateTestRepositories(10);

// Create sandbox projects
await sandboxDataService.createSandboxProjects(userId, repositories);

// Generate test user profile
const testUser = sandboxDataService.generateTestUser();
```

#### SandboxMigrationService
Provides tools for migrating sandbox data to production.

```typescript
// Validate data before migration
const validation = await migrationService.validateSandboxData(userId);

// Perform migration
const result = await migrationService.migrateToProduction(userId, {
  includeProjects: true,
  includeProfile: true,
  includeSettings: true,
  overwriteExisting: false,
  dryRun: false,
  validateData: true,
});
```

#### SandboxIsolationService
Ensures complete data isolation between sandbox and production environments.

```typescript
// Apply sandbox filters to queries
const filters = isolationService.applySandboxFilters(userId, isInSandbox);

// Mark data as sandbox data
const markedData = isolationService.applySandboxMarkers(data, isInSandbox);

// Validate data integrity
const integrity = await isolationService.validateDataIntegrity(userId);
```

## API Endpoints

### REST API

#### Start Sandbox Session
```http
POST /sandbox/session/start
Content-Type: application/json
Authorization: Bearer <api-key>

{
  "sessionName": "My Test Session",
  "maxProjects": 10,
  "maxApiCalls": 1000
}
```

#### Get Current Session
```http
GET /sandbox/session
Authorization: Bearer <api-key>
```

#### Get Usage Statistics
```http
GET /sandbox/usage
Authorization: Bearer <api-key>
```

#### Reset Sandbox Data
```http
POST /sandbox/reset
Authorization: Bearer <api-key>

{
  "keepSession": true
}
```

#### Migrate to Production
```http
POST /sandbox/migrate
Authorization: Bearer <api-key>

{
  "includeProjects": true,
  "includeProfile": true,
  "includeSettings": true,
  "overwriteExisting": false
}
```

### GraphQL API

#### Queries
```graphql
query GetSandboxStatus {
  currentSandboxSession {
    id
    startedAt
    expiresAt
    projectCount
    apiCallCount
    isActive
  }
  
  sandboxUsage {
    projectsUsed
    maxProjects
    apiCallsUsed
    maxApiCalls
    sessionTimeRemaining
  }
}

query GetSandboxRepositories {
  sandboxRepositories {
    id
    name
    description
    language
    topics
    starCount
    forkCount
  }
}
```

#### Mutations
```graphql
mutation StartSandboxSession($input: StartSandboxSessionInput!) {
  startSandboxSession(input: $input) {
    id
    userId
    expiresAt
    isActive
  }
}

mutation MigrateToProduction($input: MigrateSandboxDataInput!) {
  migrateSandboxToProduction(input: $input)
}

mutation ResetSandboxData($input: ResetSandboxInput!) {
  resetSandboxData(input: $input)
}
```

#### Subscriptions
```graphql
subscription SandboxUpdates {
  sandboxSessionStarted {
    id
    startedAt
    expiresAt
  }
  
  sandboxUsageUpdated {
    projectsUsed
    apiCallsUsed
    sessionTimeRemaining
  }
}
```

## Configuration

### Environment Variables

```bash
# Enable/disable sandbox mode
SANDBOX_ENABLED=true

# Default limits
SANDBOX_MAX_PROJECTS=10
SANDBOX_MAX_API_CALLS=1000
SANDBOX_MAX_SYNC_OPS=50

# Session duration (24 hours)
SANDBOX_SESSION_DURATION=86400000

# Data retention (7 days)
SANDBOX_DATA_RETENTION=604800000
```

### Usage Limits

| Tier | Max Projects | Max API Calls | Max Sync Ops | Session Duration |
|------|-------------|---------------|--------------|------------------|
| Free | 10 | 1,000 | 50 | 24 hours |
| Pro | 25 | 5,000 | 100 | 48 hours |
| Enterprise | 50 | 10,000 | 200 | 72 hours |

## Data Isolation

### Sandbox Data Markers
All sandbox data is marked with metadata flags:

```json
{
  "customMetadata": {
    "sandbox": true,
    "sandboxCreatedAt": "2024-01-01T00:00:00Z"
  }
}
```

### Query Filters
Automatic filters ensure data isolation:

```typescript
// Sandbox mode - only sandbox data
{
  ownerId: userId,
  customMetadata: {
    path: ['sandbox'],
    equals: true
  }
}

// Production mode - exclude sandbox data
{
  ownerId: userId,
  customMetadata: {
    path: ['sandbox'],
    not: true
  }
}
```

## Test Data Generation

### Repository Types
The system generates realistic repositories across various categories:

- **Frontend**: React, Vue, Angular applications
- **Backend**: Node.js, Python, Go services
- **Mobile**: Flutter, React Native apps
- **Data Science**: Python ML/AI projects
- **DevOps**: Docker, Kubernetes configurations
- **Blockchain**: Smart contracts and DApps

### Realistic Metadata
Generated repositories include:
- Authentic-looking names and descriptions
- Appropriate technology stacks
- Realistic star/fork counts
- Valid Portfolio.md and README content
- Proper categorization and tagging

## Migration Process

### Pre-Migration Validation
1. **Data Integrity**: Check for corrupt or invalid data
2. **Conflict Detection**: Identify potential conflicts with existing production data
3. **Schema Validation**: Ensure data meets production requirements

### Migration Steps
1. **Backup Creation**: Create backup of existing production data
2. **Data Transformation**: Remove sandbox markers and apply production settings
3. **Conflict Resolution**: Handle conflicts based on user preferences
4. **Validation**: Verify migrated data integrity
5. **Cleanup**: Remove sandbox data after successful migration

### Rollback Support
- Automatic backup creation before migration
- One-click rollback to previous state
- Detailed migration logs for troubleshooting

## Monitoring and Metrics

### Key Metrics
- Active sandbox sessions
- Resource usage per user
- Migration success rates
- Data integrity violations
- Performance metrics

### Alerts
- Session expiration warnings
- Usage limit approaching
- Data integrity issues
- Migration failures

## CLI Tools

The sandbox system includes CLI tools for administration:

```bash
# Start a sandbox session
npm run sandbox:start-session <userId> [maxProjects] [maxApiCalls]

# Get user status
npm run sandbox:status <userId>

# Clean up expired sessions
npm run sandbox:cleanup-expired

# Validate data integrity
npm run sandbox:validate <userId>

# Migrate to production
npm run sandbox:migrate <userId> [includeProjects] [includeProfile] [includeSettings]
```

## Security Considerations

### Data Isolation
- Complete separation between sandbox and production data
- Automatic query filtering based on user mode
- Validation of all data access operations

### Resource Limits
- Configurable usage limits per user tier
- Automatic session expiration
- Rate limiting for API calls

### Data Privacy
- Sandbox data is clearly marked and isolated
- Automatic cleanup of expired sessions
- No cross-contamination between environments

## Testing

### Unit Tests
- Service method coverage
- Data generation validation
- Migration logic testing

### Integration Tests
- Complete workflow testing
- Data isolation verification
- API endpoint testing

### Performance Tests
- Large dataset handling
- Concurrent user scenarios
- Resource usage optimization

## Troubleshooting

### Common Issues

#### Session Not Starting
- Check if sandbox mode is enabled
- Verify user authentication
- Check for existing active sessions

#### Data Not Isolated
- Verify sandbox markers are applied
- Check query filters
- Validate isolation service configuration

#### Migration Failures
- Review validation errors
- Check for data conflicts
- Verify backup creation

### Debug Commands
```bash
# Check sandbox configuration
npm run sandbox:config

# Validate user data
npm run sandbox:validate <userId>

# Get detailed stats
npm run sandbox:stats <userId>
```

## Future Enhancements

### Planned Features
- Multi-tenant sandbox environments
- Custom data templates
- Advanced migration options
- Integration with CI/CD pipelines
- Sandbox sharing and collaboration

### Performance Optimizations
- Lazy loading of test data
- Improved caching strategies
- Batch operations for large datasets
- Background cleanup processes

## Contributing

When contributing to the sandbox module:

1. Ensure all new features maintain data isolation
2. Add comprehensive tests for new functionality
3. Update documentation for API changes
4. Follow the established patterns for service organization
5. Consider performance implications of new features

## License

This sandbox implementation is part of the Gitsink project and follows the same licensing terms.