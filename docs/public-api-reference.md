# GitSink Public API Reference

Complete reference for all public-facing REST and GraphQL endpoints.

**Base URL:** `https://api.gitsink.com`  
**API Version:** 1.0.0  
**Last Updated:** October 4, 2025

---

## Authentication

All API requests require an API key in the header:

```
x-api-key: YOUR_API_KEY
```

Get your API key by signing up at [gitsink.com](https://gitsink.com)

---

## REST API

### Projects

#### Get All Projects
```http
GET /projects
```
Retrieve all projects for your account.

**Response:**
```json
[
  {
    "id": "string",
    "title": "string",
    "description": "string",
    "repoUrl": "string",
    "language": "string",
    "starCount": 0,
    "forkCount": 0,
    "published": true
  }
]
```

#### Get Single Project
```http
GET /projects/:repoUrl
```
Get a specific project by repository URL.

#### Sync Project
```http
POST /projects/sync
```
Synchronize a single repository.

**Request Body:**
```json
{
  "repoUrl": "https://github.com/username/repo",
  "branch": "main"
}
```

**Response:**
```json
{
  "enqueued": true
}
```

#### Sync All Projects
```http
POST /projects/sync-all
```
Synchronize all GitHub repositories.

**Response:**
```json
{
  "queued": true
}
```

---

### Profiles

#### Create Profile
```http
POST /profiles
```
Create a public developer profile.

**Request Body:**
```json
{
  "username": "string",
  "displayName": "string",
  "bio": "string",
  "avatar": "string",
  "website": "string",
  "location": "string",
  "isPublic": true
}
```

#### Get My Profile
```http
GET /profiles/me
```
Get your own profile.

#### Update My Profile
```http
PUT /profiles/me
```
Update your profile information.

**Request Body:**
```json
{
  "displayName": "string",
  "bio": "string",
  "avatar": "string",
  "website": "string",
  "location": "string"
}
```

#### Update Profile Settings
```http
PUT /profiles/me/settings
```
Update profile visibility and display settings.

**Request Body:**
```json
{
  "isPublic": true,
  "showEmail": false,
  "showPrivateRepos": false,
  "showStats": true,
  "showActivity": true,
  "showContributions": true,
  "layout": "grid",
  "featuredProjects": ["project-id-1", "project-id-2"]
}
```

#### Delete Profile
```http
DELETE /profiles/me
```
Delete your profile.

#### Get Public Profile
```http
GET /profiles/:username
```
Get any public profile by username (no auth required).

#### Get Profile by Domain
```http
GET /profiles/domain/:domain
```
Get profile by custom domain (no auth required).

#### Check Username Availability
```http
GET /profiles/check-username/:username
```
Check if a username is available (no auth required).

#### Check Domain Availability
```http
GET /profiles/check-domain/:domain
```
Check if a custom domain is available (no auth required).

#### Search Profiles
```http
GET /profiles/search?q=searchterm&limit=20&offset=0
```
Search public profiles (no auth required).

#### Get Featured Profiles
```http
GET /profiles/featured?limit=10
```
Get featured public profiles (no auth required).

#### Get Profile Statistics
```http
GET /profiles/me/statistics
```
Get your profile statistics.

---

### Profile Themes

#### Get Theme Presets
```http
GET /profiles/themes/presets
```
Get available theme presets (no auth required).

#### Update Theme
```http
PUT /profiles/me/theme
```
Update your profile theme.

**Request Body:**
```json
{
  "primaryColor": "#3b82f6",
  "secondaryColor": "#8b5cf6",
  "fontFamily": "Inter",
  "backgroundStyle": "gradient"
}
```

#### Apply Theme Preset
```http
POST /profiles/me/theme/preset
```
Apply a theme preset.

**Request Body:**
```json
{
  "presetName": "ocean"
}
```

---

### Social Links

#### Get Supported Platforms
```http
GET /profiles/platforms
```
Get list of supported social media platforms (no auth required).

#### Update Social Links
```http
PUT /profiles/me/social-links
```
Update all social links.

**Request Body:**
```json
{
  "socialLinks": [
    {
      "platform": "twitter",
      "url": "https://twitter.com/username",
      "label": "Follow me"
    }
  ]
}
```

#### Add Social Link
```http
POST /profiles/me/social-links
```
Add a new social link.

#### Delete Social Link
```http
DELETE /profiles/me/social-links/:platform
```
Remove a social link.

---

### Custom Sections

#### Update Custom Sections
```http
PUT /profiles/me/custom-sections
```
Update custom profile sections.

**Request Body:**
```json
{
  "customSections": [
    {
      "title": "About Me",
      "content": "I'm a developer...",
      "order": 1,
      "visible": true
    }
  ]
}
```

---

### Webhooks

#### Handle Platform Webhook
```http
POST /webhooks/:platform
```
Receive webhooks from GitHub, GitLab, or Bitbucket.

**Platforms:** `github`, `gitlab`, `bitbucket`

#### Get Webhook Events
```http
GET /webhooks/events?platform=github&status=success&limit=50&offset=0
```
Get webhook event history.

#### Get Specific Event
```http
GET /webhooks/events/:eventId
```
Get details of a specific webhook event.

#### Retry Failed Event
```http
POST /webhooks/events/:eventId/retry
```
Retry a failed webhook event.

#### Get Webhook Metrics
```http
GET /webhooks/metrics?platform=github&timeRange=7d
```
Get webhook processing metrics.

---

### Health & Status

#### Basic Health Check
```http
GET /health
```
Check if the API is running (no auth required).

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-04T12:00:00Z",
  "uptime": 123456
}
```

#### Detailed Health Check
```http
GET /health/detailed
```
Get detailed health information (no auth required).

#### Service-Specific Health
```http
GET /health/database
GET /health/redis
GET /health/queues
```
Check specific service health (no auth required).

---

### Waitlist

#### Join Waitlist
```http
POST /waitlist
```
Join the waitlist (no auth required).

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

---

## GraphQL API

**Endpoint:** `POST /graphql`

### Authentication

Include your API key in the header:
```
x-api-key: YOUR_API_KEY
```

### Schema Overview

The complete GraphQL schema is available at `/graphql` (GraphQL Playground).

---

### Queries

#### Projects

```graphql
# Get all projects
query {
  projects {
    id
    title
    description
    repoUrl
    language
    starCount
    forkCount
    published
  }
}

# Get single project
query {
  project(repoUrl: "https://github.com/user/repo") {
    id
    title
    description
  }
}

# Get filtered projects
query {
  filteredProjects(filter: { category: "web", featured: true }) {
    id
    title
  }
}

# Enhanced projects with pagination
query {
  enhancedProjects(
    filter: {
      languages: ["TypeScript", "JavaScript"]
      categories: ["web"]
      published: true
    }
    sort: { field: STARS, order: DESC }
    pagination: { limit: 20, offset: 0 }
  ) {
    edges {
      node {
        id
        title
        description
      }
      cursor
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    totalCount
  }
}

# Search projects
query {
  searchProjects(
    query: "react"
    filter: { languages: ["JavaScript"] }
    pagination: { limit: 10, offset: 0 }
  ) {
    id
    title
  }
}

# Get project statistics
query {
  projectStatistics(filter: { published: true }) {
    totalProjects
    publicProjects
    privateProjects
    totalStars
    totalForks
    languageStats {
      language
      count
      percentage
    }
    categoryStats {
      category
      count
      percentage
    }
  }
}

# Get trending projects
query {
  trendingProjects(timeframe: "7d", limit: 10) {
    id
    title
    starCount
  }
}

# Get featured projects
query {
  featuredProjects(limit: 10) {
    id
    title
    featured
  }
}
```

#### Profiles

```graphql
# Get my profile
query {
  myProfile {
    id
    username
    displayName
    bio
    avatar
    isPublic
    stats {
      totalProjects
      totalStars
      totalForks
    }
  }
}

# Get public profile
query {
  publicProfile(username: "johndoe") {
    id
    username
    displayName
    bio
    avatar
    socialLinks {
      platform
      url
      label
    }
    theme {
      primaryColor
      secondaryColor
    }
  }
}

# Get profile by domain
query {
  profileByDomain(domain: "johndoe.dev") {
    id
    username
    customDomain
  }
}

# Search profiles
query {
  searchProfiles(query: "developer", limit: 20, offset: 0) {
    id
    username
    displayName
    bio
  }
}

# Search profiles (enhanced)
query {
  searchProfilesGraphQL(
    input: {
      query: "developer"
      location: "San Francisco"
      isPublic: true
      limit: 20
      offset: 0
    }
  ) {
    edges {
      node {
        id
        username
      }
      cursor
    }
    pageInfo {
      hasNextPage
    }
    totalCount
  }
}

# Get featured profiles
query {
  featuredProfiles(limit: 10) {
    id
    username
    displayName
  }
}

# Check username availability
query {
  isUsernameAvailable(username: "johndoe")
}

# Check domain availability
query {
  isDomainAvailable(domain: "johndoe.dev")
}

# Generate profile URL
query {
  generateProfileUrl(username: "johndoe", customDomain: "johndoe.dev")
}

# Get supported platforms
query {
  getSupportedPlatforms
}
```

#### AI Enrichment

```graphql
# Get project analysis
query {
  projectAnalysis(projectId: "project-id") {
    id
    description
    category {
      primary
      secondary
      confidence
    }
    technologies {
      languages {
        name
        confidence
      }
      frameworks {
        name
        category
      }
    }
    complexity
    suggestedTags
  }
}

# Get user project analyses
query {
  userProjectAnalyses(limit: 20, offset: 0) {
    id
    projectId
    description
    confidence
  }
}

# Get recent analyses
query {
  recentAnalyses(limit: 10) {
    id
    projectId
    analysisDate
  }
}

# Get enrichment jobs
query {
  enrichmentJobs(status: "completed", limit: 20, offset: 0) {
    id
    projectId
    status
    progress
    createdAt
    completedAt
  }
}
```

#### Health

```graphql
# System health
query {
  systemHealth {
    status
    services {
      name
      status
      responseTime
    }
    metrics {
      cpuUsage
      memoryUsage
      activeConnections
    }
    uptime
  }
}

# Service health
query {
  serviceHealth {
    name
    status
    responseTime
    lastCheck
  }
}

# Ping
query {
  ping
}
```

---

### Mutations

#### Projects

```graphql
# Sync project
mutation {
  syncProject(input: {
    repoUrl: "https://github.com/user/repo"
    branch: "main"
  }) {
    id
    title
    syncedAt
  }
}

# Sync all projects
mutation {
  syncAllProjects
}
```

#### Profiles

```graphql
# Create profile
mutation {
  createProfile(input: {
    username: "johndoe"
    displayName: "John Doe"
    bio: "Full-stack developer"
    isPublic: true
  }) {
    id
    username
    displayName
  }
}

# Update profile
mutation {
  updateProfile(input: {
    displayName: "John Doe"
    bio: "Senior developer"
    avatar: "https://..."
  }) {
    id
    displayName
  }
}

# Update profile settings
mutation {
  updateProfileSettings(input: {
    isPublic: true
    showEmail: false
    showStats: true
    featuredProjects: ["project-1", "project-2"]
  })
}

# Delete profile
mutation {
  deleteProfile
}

# Update theme
mutation {
  updateProfileThemeGraphQL(input: {
    primaryColor: "#3b82f6"
    secondaryColor: "#8b5cf6"
    fontFamily: "Inter"
  }) {
    id
    theme {
      primaryColor
      secondaryColor
    }
  }
}

# Update social links
mutation {
  updateSocialLinksGraphQL(socialLinks: [
    {
      platform: "twitter"
      url: "https://twitter.com/johndoe"
      label: "Follow me"
    }
  ]) {
    id
    socialLinks {
      platform
      url
    }
  }
}

# Update custom sections
mutation {
  updateCustomSectionsGraphQL(customSections: [
    {
      title: "About"
      content: "I'm a developer..."
      order: 1
      visible: true
    }
  ]) {
    id
    settings {
      customSections {
        title
        content
      }
    }
  }
}
```

#### AI Enrichment

```graphql
# Trigger enrichment
mutation {
  triggerEnrichment(input: {
    projectId: "project-id"
    analysisTypes: ["description", "categorization", "technology"]
    forceReanalysis: false
  }) {
    id
    projectId
    status
    progress
  }
}

# Bulk trigger enrichment
mutation {
  bulkTriggerEnrichment(input: {
    projectIds: ["project-1", "project-2"]
    analysisTypes: ["description"]
    forceReanalysis: false
  }) {
    totalJobs
    successfulJobs
    failedJobs
    jobs {
      id
      projectId
      status
    }
  }
}
```

---

### Subscriptions

GraphQL subscriptions provide real-time updates via WebSocket.

**WebSocket Endpoint:** `ws://api.gitsink.com/graphql` or `wss://api.gitsink.com/graphql`

#### Project Sync Updates

```graphql
subscription {
  syncStatusUpdates {
    status
    projectId
    userId
    progress
    message
    timestamp
  }
}
```

#### Profile Views

```graphql
subscription {
  profileViews(profileId: "profile-id") {
    profileId
    viewerId
    timestamp
    referrer
  }
}
```

#### AI Enrichment Updates

```graphql
subscription {
  enrichmentStatus(projectId: "project-id") {
    jobId
    projectId
    status
    progress
    currentStep
    error
    timestamp
  }
}

subscription {
  userEnrichmentUpdates {
    jobId
    projectId
    status
    progress
  }
}
```

#### Health Updates

```graphql
subscription {
  systemHealthUpdates {
    status
    services {
      name
      status
    }
    timestamp
  }
}

subscription {
  serviceHealthUpdates {
    name
    status
    responseTime
    lastCheck
  }
}
```

---

## Rate Limits

| Tier | Requests/Hour | Requests/Day |
|------|---------------|--------------|
| Free | 1,000 | 10,000 |
| Premium | 10,000 | 100,000 |
| Enterprise | Unlimited | Unlimited |

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1633024800
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized (invalid or missing API key) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (duplicate resource) |
| 429 | Too Many Requests (rate limit exceeded) |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

**Error Response Format:**
```json
{
  "statusCode": 400,
  "message": "Invalid request parameters",
  "error": "Bad Request"
}
```

---

## Examples

### cURL Examples

```bash
# Get all projects
curl -H "x-api-key: YOUR_API_KEY" \
  https://api.gitsink.com/projects

# Sync a project
curl -X POST \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/user/repo","branch":"main"}' \
  https://api.gitsink.com/projects/sync

# Get public profile
curl https://api.gitsink.com/profiles/johndoe

# GraphQL query
curl -X POST \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ projects { id title } }"}' \
  https://api.gitsink.com/graphql
```

### JavaScript/TypeScript Examples

```typescript
// Using fetch
const response = await fetch('https://api.gitsink.com/projects', {
  headers: {
    'x-api-key': 'YOUR_API_KEY'
  }
});
const projects = await response.json();

// GraphQL query
const response = await fetch('https://api.gitsink.com/graphql', {
  method: 'POST',
  headers: {
    'x-api-key': 'YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: `
      query {
        projects {
          id
          title
          description
        }
      }
    `
  })
});
const data = await response.json();
```

### Python Examples

```python
import requests

# REST API
headers = {'x-api-key': 'YOUR_API_KEY'}
response = requests.get('https://api.gitsink.com/projects', headers=headers)
projects = response.json()

# GraphQL
query = """
  query {
    projects {
      id
      title
    }
  }
"""
response = requests.post(
  'https://api.gitsink.com/graphql',
  headers=headers,
  json={'query': query}
)
data = response.json()
```

---

## Support

- **Documentation:** https://docs.gitsink.com
- **API Status:** https://status.gitsink.com
- **Support Email:** support@gitsink.com
- **GitHub:** https://github.com/gitsink

---

**Note:** This API is under active development. Breaking changes will be communicated via email and documented in the changelog.
