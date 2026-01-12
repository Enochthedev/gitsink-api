# GitSink Frontend Integration Specification

> **Version:** 1.0.0  
> **Last Updated:** 2026-01-12  
> **API Base URL:** `http://localhost:3000` (dev) / `https://api.gitsink.io` (prod)

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [User Flows](#user-flows)
4. [API Endpoints Reference](#api-endpoints-reference)
5. [GraphQL Operations](#graphql-operations)
6. [Real-time Subscriptions](#real-time-subscriptions)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)

---

## Overview

GitSink is a developer portfolio platform that syncs GitHub/GitLab/Bitbucket repositories and creates beautiful public profiles. The API supports both **REST** and **GraphQL** endpoints.

### Technology Stack
- **API:** NestJS with GraphQL (Apollo)
- **Database:** PostgreSQL with Prisma ORM
- **Auth:** API Key-based authentication
- **Real-time:** GraphQL Subscriptions (WebSocket)

---

## Authentication

### API Key Authentication

All authenticated requests require the `X-API-Key` header:

```http
X-API-Key: gs_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

### Getting an API Key

**1. New User Signup:**
```graphql
mutation Signup($email: String!) {
  signup(email: $email) {
    apiKey
    user {
      id
      email
      createdAt
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "signup": {
      "apiKey": "gs_live_a1b2c3d4e5f6g7h8i9j0",
      "user": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "user@example.com",
        "createdAt": "2024-03-20T15:45:00.000Z"
      }
    }
  }
}
```

**2. Regenerate API Key:**
```graphql
mutation RegenerateApiKey($userId: String!) {
  regenerateApiKey(userId: $userId) {
    apiKey
    user { id email }
  }
}
```

---

## User Flows

### Flow 1: New User Onboarding

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│  1. Signup  │────▶│ 2. Connect   │────▶│ 3. Sync All    │────▶│ 4. Create    │
│   (email)   │     │   GitHub     │     │   Projects     │     │   Profile    │
└─────────────┘     └──────────────┘     └────────────────┘     └──────────────┘
```

#### Step 1: Signup
```graphql
mutation { signup(email: "user@example.com") { apiKey user { id } } }
```

#### Step 2: Connect GitHub (OAuth)
```http
GET /auth/github/authorize?userId={userId}
# Redirects to GitHub OAuth, then back to callback URL
```

**Or via GraphQL after OAuth:**
```graphql
mutation {
  connectGitHub(userId: "...", githubId: "...", githubToken: "...")
}
```

#### Step 3: Sync All Projects
```graphql
mutation { syncAllProjects }
```
**Response:** `"Sync initiated for 25 repositories"`

#### Step 4: Create Profile
```graphql
mutation CreateProfile($input: CreateProfileInput!) {
  createProfile(input: $input) {
    id
    username
    displayName
    isPublic
  }
}
```

**Variables:**
```json
{
  "input": {
    "username": "johndoe",
    "displayName": "John Doe",
    "bio": "Full-stack developer",
    "isPublic": true
  }
}
```

---

### Flow 2: Sandbox Mode (Trial Experience)

Perfect for letting users try the platform without connecting real accounts.

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│ 1. Start Sandbox│────▶│ 2. Explore with  │────▶│ 3. Migrate to  │
│    Session      │     │   Sample Data    │     │   Production   │
└─────────────────┘     └──────────────────┘     └────────────────┘
```

#### Start Sandbox Session
```graphql
mutation {
  startSandboxSession(input: { sessionName: "Trial", maxProjects: 10 }) {
    id
    expiresAt
    isActive
  }
}
```

#### Check Sandbox Usage
```graphql
query {
  sandboxUsage {
    projectsUsed
    maxProjects
    apiCallsUsed
    maxApiCalls
    syncOperationsUsed
    maxSyncOperations
    sessionTimeRemaining
  }
}
```

#### Migrate to Production
```graphql
mutation {
  migrateSandboxToProduction(input: {
    includeProjects: true
    includeProfile: true
    includeSettings: true
    overwriteExisting: false
  })
}
```

---

### Flow 3: Dashboard (Main App Experience)

```
┌────────────────┐
│   Dashboard    │
├────────────────┤
│ - My Profile   │  ← query { myProfile { ... } }
│ - My Projects  │  ← query { projects { ... } }
│ - Statistics   │  ← query { projectStatistics { ... } }
│ - Sync Status   │  ← query { syncHistory { ... } }
│ - Settings     │  ← mutation { updateProfileSettings(...) }
└────────────────┘
```

---

### Flow 4: Public Profile View

```graphql
query PublicProfile($username: String!) {
  publicProfile(username: $username) {
    id
    username
    displayName
    bio
    avatar
    location
    website
    isPublic
    viewCount
    socialLinks { platform url label }
    theme { primaryColor secondaryColor fontFamily backgroundStyle }
    stats {
      totalProjects
      publicProjects
      totalStars
      totalForks
      joinedAt
      lastActivityAt
      languages
    }
  }
}
```

---

## API Endpoints Reference

### REST Endpoints

| Category | Method | Endpoint | Description |
|----------|------------------|-------------|
| **Health** | GET | `/health` | System health check |
| **Auth** | POST | `/auth/signup` | User signup |
| **Auth** | POST | `/auth/signin` | User signin |
| **Auth** | GET | `/auth/profile` | Get current user profile |
| **Auth** | POST | `/auth/regenerate-api-key` | Regenerate API key |
| **Auth** | POST | `/auth/revoke-api-key` | Revoke API key |
| **Auth** | POST | `/auth/magic-link/send` | Send magic link email |
| **Auth** | POST | `/auth/magic-link/validate` | Validate magic link token |
| **Auth** | POST | `/auth/forgot-password` | Request password reset |
| **Auth** | POST | `/auth/reset-password` | Reset password |
| **Auth** | POST | `/auth/refresh-token` | Refresh JWT token |
| **Auth** | GET | `/auth/github/authorize` | Start GitHub OAuth |
| **Auth** | GET | `/auth/github/callback` | GitHub OAuth callback |
| **Projects** | GET | `/projects` | List all projects (paginated) |
| **Projects** | GET | `/projects/:repoUrl` | Get single project |
| **Projects** | POST | `/projects/sync` | Sync single project |
| **Projects** | POST | `/projects/sync-all` | Sync all repositories |
| **Profiles** | POST | `/profiles` | Create profile |
| **Profiles** | GET | `/profiles/me` | Get my profile |
| **Profiles** | PUT | `/profiles/me` | Update my profile |
| **Profiles** | DELETE | `/profiles/me` | Delete my profile |
| **Profiles** | PUT | `/profiles/me/settings` | Update profile settings |
| **Profiles** | GET | `/profiles/public/:username` | Get public profile |
| **Profiles** | GET | `/profiles/domain/:domain` | Get profile by domain |
| **Profiles** | GET | `/profiles/check-username/:username` | Check username available |
| **Profiles** | GET | `/profiles/check-domain/:domain` | Check domain available |
| **Profiles** | GET | `/profiles/search` | Search profiles |
| **Profiles** | GET | `/profiles/featured` | Get featured profiles |
| **Profiles** | PUT | `/profiles/me/theme` | Update theme |
| **Profiles** | POST | `/profiles/me/theme/preset` | Apply theme preset |
| **Profiles** | PUT | `/profiles/me/social-links` | Update social links |
| **Profiles** | POST | `/profiles/me/social-links` | Add social link |
| **Profiles** | DELETE | `/profiles/me/social-links/:platform` | Remove social link |
| **Profiles** | PUT | `/profiles/me/custom-sections` | Update custom sections |
| **Profiles** | GET | `/profiles/me/statistics` | Get profile statistics |
| **Sandbox** | POST | `/sandbox/start` | Start sandbox session |
| **Sandbox** | POST | `/sandbox/end` | End sandbox session |
| **Sandbox** | GET | `/sandbox/status` | Get sandbox status |
| **Sandbox** | POST | `/sandbox/reset` | Reset sandbox data |
| **Sandbox** | POST | `/sandbox/migrate` | Migrate to production |

### GraphQL Endpoint

```
POST /graphql
```

---

## REST API Details

### Authentication Endpoints

#### POST `/auth/signup`
Create a new user account and receive an API key.

**Request:**
```json
{ "email": "user@example.com" }
```

**Response:**
```json
{
  "apiKey": "gs_live_a1b2c3d4e5f6g7h8i9j0",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "createdAt": "2024-03-20T15:45:00.000Z"
  }
}
```

#### POST `/auth/signin`
Sign in with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1...",
  "refreshToken": "eyJhbGciOiJIUzI1...",
  "expiresIn": 3600,
  "user": { "id": "...", "email": "..." }
}
```

#### POST `/auth/magic-link/send`
Send a passwordless login link to email.

**Request:**
```json
{ "email": "user@example.com" }
```

#### POST `/auth/magic-link/validate`
Validate a magic link token.

**Request:**
```json
{ "token": "abc123..." }
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1...",
  "user": { "id": "...", "email": "..." }
}
```

#### POST `/auth/regenerate-api-key`
Generate a new API key (invalidates old one).

**Headers:** `X-API-Key: current_api_key`

**Response:**
```json
{
  "apiKey": "gs_live_new_key_here",
  "user": { "id": "...", "email": "..." }
}
```

---

### Projects Endpoints

#### GET `/projects`
Get paginated list of user's projects.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20, max: 100)

**Headers:** `X-API-Key: your_api_key`

**Response:**
```json
{
  "data": [
    {
      "id": "project-uuid",
      "title": "My Project",
      "description": "A cool project",
      "repoUrl": "https://github.com/user/repo",
      "platform": "github",
      "language": "TypeScript",
      "starCount": 125,
      "forkCount": 23,
      "tags": ["react", "nodejs"],
      "category": "Web Application",
      "featured": true,
      "published": true,
      "isPrivate": false,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-03-20T15:45:00.000Z"
    }
  ],
  "meta": {
    "total": 25,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

#### POST `/projects/sync`
Sync a single repository.

**Headers:** `X-API-Key: your_api_key`

**Request:**
```json
{
  "repoUrl": "https://github.com/user/repo",
  "branch": "main"
}
```

**Response:**
```json
{ "enqueued": true }
```

#### POST `/projects/sync-all`
Sync all user's repositories.

**Headers:** `X-API-Key: your_api_key`

**Request:** Empty body or `{}`

**Response:**
```json
{ "queued": true }
```

---

### Profiles Endpoints

#### POST `/profiles`
Create a new public profile.

**Headers:** `X-API-Key: your_api_key`

**Request:**
```json
{
  "username": "johndoe",
  "displayName": "John Doe",
  "bio": "Full-stack developer",
  "location": "San Francisco, CA",
  "website": "https://johndoe.dev",
  "isPublic": true
}
```

#### GET `/profiles/me`
Get authenticated user's profile.

**Headers:** `X-API-Key: your_api_key`

#### PUT `/profiles/me`
Update profile information.

**Headers:** `X-API-Key: your_api_key`

**Request:**
```json
{
  "displayName": "John Doe Updated",
  "bio": "Senior full-stack developer",
  "location": "New York, NY"
}
```

#### PUT `/profiles/me/settings`
Update profile settings.

**Request:**
```json
{
  "isPublic": true,
  "showEmail": false,
  "showStats": true,
  "showActivity": true,
  "showContributions": true,
  "showPrivateRepos": false,
  "layout": "grid",
  "featuredProjects": ["project-id-1", "project-id-2"]
}
```

#### PUT `/profiles/me/theme`
Update profile theme.

**Request:**
```json
{
  "primaryColor": "#6366f1",
  "secondaryColor": "#8b5cf6",
  "fontFamily": "Inter",
  "backgroundStyle": "gradient"
}
```

#### PUT `/profiles/me/social-links`
Update all social links.

**Request:**
```json
{
  "socialLinks": [
    { "platform": "github", "url": "https://github.com/johndoe" },
    { "platform": "twitter", "url": "https://twitter.com/johndoe" },
    { "platform": "linkedin", "url": "https://linkedin.com/in/johndoe" }
  ]
}
```

#### GET `/profiles/public/:username`
Get a public profile by username (no auth required for public profiles).

**Response:**
```json
{
  "id": "profile-uuid",
  "username": "johndoe",
  "displayName": "John Doe",
  "bio": "Full-stack developer",
  "avatar": "https://avatars.githubusercontent.com/u/12345",
  "location": "San Francisco, CA",
  "website": "https://johndoe.dev",
  "isPublic": true,
  "viewCount": 1234,
  "socialLinks": [...],
  "theme": { "primaryColor": "#6366f1", ... },
  "stats": {
    "totalProjects": 25,
    "publicProjects": 18,
    "totalStars": 1250,
    "totalForks": 320
  }
}
```

#### GET `/profiles/search?q=query&limit=10&offset=0`
Search for profiles.

#### GET `/profiles/featured?limit=10`
Get featured profiles.

---

### Sandbox Endpoints

#### POST `/sandbox/start`
Start a sandbox session.

**Request:**
```json
{
  "sessionName": "Trial Session",
  "maxProjects": 10,
  "maxApiCalls": 100
}
```

**Response:**
```json
{
  "id": "session-uuid",
  "userId": "user-uuid",
  "startedAt": "2024-03-20T15:45:00.000Z",
  "expiresAt": "2024-03-21T15:45:00.000Z",
  "isActive": true
}
```

#### GET `/sandbox/status`
Get current sandbox status and usage.

**Response:**
```json
{
  "sandboxEnabled": true,
  "userInSandbox": true,
  "session": {
    "id": "session-uuid",
    "startedAt": "2024-03-20T15:45:00.000Z",
    "expiresAt": "2024-03-21T15:45:00.000Z",
    "isActive": true
  },
  "usage": {
    "projectsUsed": 5,
    "maxProjects": 10,
    "apiCallsUsed": 45,
    "maxApiCalls": 100,
    "syncOperationsUsed": 3,
    "maxSyncOperations": 50,
    "sessionTimeRemaining": 43200000
  }
}
```

#### POST `/sandbox/migrate`
Migrate sandbox data to production.

**Request:**
```json
{
  "includeProjects": true,
  "includeProfile": true,
  "includeSettings": true,
  "overwriteExisting": false
}
```

---

## GraphQL Operations

### Queries

#### Projects

```graphql
# Get all projects (simple)
query { projects { id title repoUrl starCount language } }

# Get paginated projects with filters
query EnhancedProjects(
  $filter: EnhancedProjectFilterInput
  $sort: ProjectSortInput
  $pagination: PaginationInput
) {
  enhancedProjects(filter: $filter, sort: $sort, pagination: $pagination) {
    totalCount
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    edges {
      cursor
      node {
        id title description repoUrl platform language
        starCount forkCount tags category featured published
        isPrivate popularityScore activityLevel createdAt updatedAt
      }
    }
  }
}

# Search projects
query SearchProjects($query: String!, $pagination: PaginationInput) {
  searchProjects(query: $query, pagination: $pagination) {
    id title description repoUrl language starCount tags
  }
}

# Get single project
query GetProject($repoUrl: String!) {
  project(repoUrl: $repoUrl) {
    id title description repoUrl platform language languages
    starCount forkCount tags category featured published isPrivate
    markdown
    aiAnalysis {
      description complexity confidence suggestedTags
      category { primary secondary confidence tags }
      technologies {
        languages { name percentage bytes }
        frameworks { name category version }
        databases platforms buildTools testingFrameworks
      }
      keyFeatures
    }
  }
}

# Project statistics
query ProjectStatistics {
  projectStatistics {
    totalProjects publicProjects privateProjects featuredProjects
    totalStars totalForks
    categoryStats { category count percentage }
    languageStats { language count percentage totalBytes }
    platformStats { platform count percentage }
  }
}

# Trending & Featured
query { trendingProjects(timeframe: "7d", limit: 10) { id title starCount } }
query { featuredProjects(limit: 10) { id title category } }
```

#### Profiles

```graphql
# My profile (authenticated)
query { myProfile { id username displayName bio avatar isPublic ... } }

# Public profile
query PublicProfile($username: String!) {
  publicProfile(username: $username) {
    id username displayName bio avatar location website
    isPublic viewCount
    socialLinks { platform url label }
    theme { primaryColor secondaryColor fontFamily backgroundStyle }
    settings { isPublic showEmail showStats showActivity layout featuredProjects }
    stats { totalProjects publicProjects totalStars totalForks ... }
  }
}

# Check username availability
query { isUsernameAvailable(username: "newusername") }

# Check domain availability
query { isDomainAvailable(domain: "myportfolio.dev") }

# Search profiles
query { searchProfiles(query: "developer", limit: 10, offset: 0) { id username displayName } }

# Featured profiles
query { featuredProfiles(limit: 10) { id username displayName avatar stats { totalStars } } }
```

#### AI Analysis

```graphql
# Get project analysis
query ProjectAnalysis($projectId: String!) {
  projectAnalysis(projectId: $projectId) {
    id description complexity confidence suggestedTags
    category { primary secondary confidence tags }
    technologies { languages { name percentage } frameworks { name category } }
    keyFeatures model version analysisDate
  }
}

# Recent analyses
query { recentAnalyses(limit: 10) { id projectId description complexity createdAt } }

# User's analyses
query { userProjectAnalyses(limit: 20, offset: 0) { id projectId description } }

# Enrichment job status
query { enrichmentJobs(status: "pending", limit: 20) { id projectId status progress } }
```

#### Audit & History

```graphql
# Audit logs
query AuditLogs($limit: Float!, $offset: Float!) {
  auditLogs(limit: $limit, offset: $offset) {
    totalCount hasNextPage
    nodes {
      id action actionDescription resource resourceId resourceName
      userId userName success error timestamp
    }
  }
}

# Sync history
query SyncHistory($limit: Float, $projectId: String) {
  syncHistory(limit: $limit, projectId: $projectId) {
    totalCount
    nodes {
      id projectTitle platform operation status
      startedAt completedAt duration durationFormatted error
    }
  }
}
```

#### System

```graphql
# Health check
query { ping }  # Returns "pong"

# System health
query SystemHealth {
  systemHealth {
    status uptime version timestamp
    metrics { cpuUsage memoryUsage activeConnections queueSize errorRate }
    services { name status responseTime lastCheck error }
  }
}
```

---

### Mutations

#### Profile Management

```graphql
# Create profile
mutation CreateProfile($input: CreateProfileInput!) {
  createProfile(input: $input) {
    id username displayName bio isPublic
  }
}

# Update profile
mutation UpdateProfile($input: UpdateProfileInput!) {
  updateProfile(input: $input) {
    id displayName bio location website
  }
}

# Update profile settings
mutation UpdateProfileSettings($input: ProfileSettingsInput!) {
  updateProfileSettings(input: $input)  # Returns Boolean
}

# Variables for settings:
{
  "input": {
    "isPublic": true,
    "showEmail": false,
    "showStats": true,
    "showActivity": true,
    "showContributions": true,
    "showPrivateRepos": false,
    "layout": "grid",          # "grid" | "list" | "masonry"
    "featuredProjects": ["project-id-1", "project-id-2"]
  }
}

# Update social links
mutation UpdateSocialLinks($socialLinks: [SocialLinkInput!]!) {
  updateSocialLinksGraphQL(socialLinks: $socialLinks) {
    id
    socialLinks { platform url label }
  }
}

# Variables:
{
  "socialLinks": [
    { "platform": "github", "url": "https://github.com/johndoe" },
    { "platform": "twitter", "url": "https://twitter.com/johndoe" },
    { "platform": "linkedin", "url": "https://linkedin.com/in/johndoe" },
    { "platform": "website", "url": "https://johndoe.dev", "label": "My Blog" }
  ]
}

# Update theme
mutation UpdateTheme($input: ProfileThemeInput!) {
  updateProfileThemeGraphQL(input: $input) {
    id
    theme { primaryColor secondaryColor fontFamily backgroundStyle }
  }
}

# Variables:
{
  "input": {
    "primaryColor": "#6366f1",
    "secondaryColor": "#8b5cf6",
    "fontFamily": "Inter",
    "backgroundStyle": "gradient"  # "solid" | "gradient" | "pattern"
  }
}

# Update custom sections
mutation UpdateCustomSections($customSections: [CustomSectionInput!]!) {
  updateCustomSectionsGraphQL(customSections: $customSections) {
    id
    settings { customSections { title content order visible } }
  }
}

# Delete profile
mutation { deleteProfile }  # Returns Boolean
```

#### Project Syncing

```graphql
# Sync single project
mutation SyncProject($input: SyncProjectInput!) {
  syncProject(input: $input) {
    id title repoUrl syncedAt
  }
}

# Variables:
{ "input": { "repoUrl": "https://github.com/user/repo", "branch": "main" } }

# Sync all projects
mutation { syncAllProjects }  # Returns "Sync initiated for X repositories"
```

#### AI Enrichment

```graphql
# Trigger analysis for a project
mutation TriggerEnrichment($input: TriggerEnrichmentInput!) {
  triggerEnrichment(input: $input) {
    id projectId status createdAt
  }
}

# Variables:
{
  "input": {
    "projectId": "project-uuid",
    "forceReanalysis": false,
    "analysisTypes": ["description", "technology", "category"]
  }
}

# Bulk enrich multiple projects
mutation BulkEnrich($input: BulkEnrichmentInput!) {
  bulkTriggerEnrichment(input: $input) {
    totalJobs successfulJobs failedJobs
    jobs { id projectId status }
  }
}
```

#### Sandbox

```graphql
# Start sandbox session
mutation StartSandbox($input: StartSandboxSessionInput!) {
  startSandboxSession(input: $input) {
    id userId startedAt expiresAt isActive
  }
}

# End sandbox session
mutation { endSandboxSession }

# Reset sandbox data
mutation ResetSandbox($input: ResetSandboxInput!) {
  resetSandboxData(input: $input)
}

# Migrate to production
mutation Migrate($input: MigrateSandboxDataInput!) {
  migrateSandboxToProduction(input: $input)
}
```

---

## Real-time Subscriptions

Connect via WebSocket to `/graphql` for real-time updates.

### Available Subscriptions

```graphql
# Enrichment progress
subscription EnrichmentStatus($projectId: String!) {
  enrichmentStatus(projectId: $projectId) {
    jobId projectId status progress currentStep error timestamp
  }
}

# Profile views (analytics)
subscription ProfileViews($profileId: String!) {
  profileViews(profileId: $profileId) {
    profileId viewerId timestamp referrer viewerLocation
  }
}

# Sync events
subscription SyncEvents($userId: ID!) {
  syncEvents(userId: $userId) {
    id type userId timestamp message
    progress { current total percentage }
    projects { id title repoUrl language starCount }
    error duration
  }
}

# System health updates
subscription { systemHealthUpdates { status uptime services { name status } } }

# Sandbox events
subscription { sandboxSessionStarted { id userId startedAt expiresAt isActive } }
subscription { sandboxSessionEnded }
subscription { sandboxUsageUpdated { projectsUsed apiCallsUsed ... } }
```

---

## Error Handling

### GraphQL Error Format

```json
{
  "errors": [
    {
      "message": "Unauthorized",
      "extensions": {
        "code": "UNAUTHORIZED",
        "category": "auth_error"
      }
    }
  ],
  "data": null
}
```

### Common Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `UNAUTHORIZED` | Missing or invalid API key | Redirect to login |
| `FORBIDDEN` | Insufficient permissions | Show error message |
| `NOT_FOUND` | Resource doesn't exist | Show 404 page |
| `VALIDATION_ERROR` | Invalid input data | Show field errors |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Show retry message |
| `SANDBOX_LIMIT_EXCEEDED` | Sandbox quota exceeded | Prompt upgrade |
| `CONFLICT` | Resource already exists | Show conflict message |

---

## Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| GraphQL Queries | 100 req/min | Per API key |
| GraphQL Mutations | 30 req/min | Per API key |
| Sync Operations | 10 req/min | Per API key |
| AI Enrichment | 5 req/min | Per API key |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1647532800
```

---

## Appendix: Input Types Quick Reference

### CreateProfileInput
```typescript
{
  username: string;       // Required, unique
  displayName?: string;
  bio?: string;
  avatar?: string;
  location?: string;
  website?: string;
  isPublic?: boolean;     // Default: false
}
```

### UpdateProfileInput
```typescript
{
  displayName?: string;
  bio?: string;
  avatar?: string;
  location?: string;
  website?: string;
}
```

### ProfileSettingsInput
```typescript
{
  isPublic?: boolean;
  showEmail?: boolean;
  showStats?: boolean;
  showActivity?: boolean;
  showContributions?: boolean;
  showPrivateRepos?: boolean;
  layout?: "grid" | "list" | "masonry";
  featuredProjects?: string[];
}
```

### ProfileThemeInput
```typescript
{
  primaryColor?: string;      // Hex color, e.g., "#6366f1"
  secondaryColor?: string;
  fontFamily?: string;        // e.g., "Inter", "Roboto"
  backgroundStyle?: "solid" | "gradient" | "pattern";
}
```

### SocialLinkInput
```typescript
{
  platform: string;   // "github" | "twitter" | "linkedin" | "website" | etc.
  url: string;
  label?: string;
}
```

### EnhancedProjectFilterInput
```typescript
{
  search?: string;
  languages?: string[];
  platforms?: string[];       // "github" | "gitlab" | "bitbucket"
  categories?: string[];
  tags?: string[];
  featured?: boolean;
  published?: boolean;
  isPrivate?: boolean;
  starCount?: { min?: number; max?: number };
  forkCount?: { min?: number; max?: number };
  createdAt?: { from?: Date; to?: Date };
  updatedAt?: { from?: Date; to?: Date };
  activityLevels?: string[]; // "high" | "medium" | "low" | "inactive"
  complexityLevels?: string[];
  minPopularityScore?: number;
  minConfidence?: number;
}
```

### PaginationInput
```typescript
{
  limit?: number;   // Default: 20, Max: 100
  offset?: number;  // Default: 0
}
```

### ProjectSortInput
```typescript
{
  field: "STARS" | "FORKS" | "CREATED_AT" | "UPDATED_AT" | "LAST_COMMIT" | "POPULARITY" | "TITLE";
  order: "ASC" | "DESC";
}
```

---

## Postman Collection

Import the GraphQL Postman collection from:
```
/gitsink-graphql.postman_collection.json
```

This includes all endpoints with example requests and responses.
