# Gitsink API System Documentation

## Overview

Gitsink is a comprehensive API platform for managing and enriching GitHub repositories with AI-powered analysis. The system provides both REST API and GraphQL endpoints for authentication, project management, AI enrichment, and platform integrations.

## Architecture

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Queue System**: Bull Queue with Redis
- **Authentication**: JWT tokens with refresh tokens, API keys, Magic links
- **AI Integration**: External AI services for repository analysis
- **Monitoring**: Prometheus metrics, Health checks
- **Rate Limiting**: Throttling with configurable limits

## API Endpoints

### Base URL
- **Development**: `http://localhost:3000`
- **Production**: `https://api.gitsink.com`

---

## 🔐 Authentication Endpoints

### REST API (`/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/auth/signup` | Register a new user | ❌ |
| `POST` | `/auth/signin` | Sign in with email/password | ❌ |
| `POST` | `/auth/password-reset` | Request password reset | ❌ |
| `POST` | `/auth/password-reset/confirm` | Confirm password reset | ❌ |
| `GET` | `/auth/profile` | Get user profile | ✅ JWT |
| `POST` | `/auth/api-key/regenerate` | Regenerate API key | ✅ JWT |
| `POST` | `/auth/api-key/revoke` | Revoke API key | ✅ JWT |
| `POST` | `/auth/github/connect` | Connect GitHub account | ✅ JWT |
| `POST` | `/auth/magic-link/send` | Send magic link | ❌ |
| `POST` | `/auth/magic-link/validate` | Validate magic link | ❌ |
| `GET` | `/auth/magic-link/stats` | Magic link statistics | ✅ JWT |
| `POST` | `/auth/magic-link/cleanup` | Cleanup expired magic links | ✅ JWT |
| `GET` | `/auth/api-key/stats` | API key statistics | ✅ JWT |
| `POST` | `/auth/api-key/update-metrics` | Update API key metrics | ✅ JWT |
| `POST` | `/auth/token/refresh` | Refresh access token | ❌ |
| `POST` | `/auth/token/revoke` | Revoke token (logout) | ❌ |
| `POST` | `/auth/token/revoke-all` | Revoke all tokens | ✅ JWT |
| `GET` | `/auth/token/stats` | Token statistics | ✅ JWT |
| `POST` | `/auth/token/cleanup` | Cleanup expired tokens | ✅ JWT |
| `GET` | `/auth/health` | Auth service health check | ❌ |

### GitHub OAuth (`/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/auth/github` | Initiate GitHub OAuth | ❌ |
| `GET` | `/auth/github/callback` | GitHub OAuth callback | ❌ |

### GraphQL Mutations

```graphql
# User registration
mutation Signup($email: String!) {
  signup(email: $email) {
    user { id email username }
    apiKey
  }
}

# Connect GitHub account
mutation ConnectGitHub($userId: String!, $githubId: String!, $githubToken: String!) {
  connectGitHub(userId: $userId, githubId: $githubId, githubToken: $githubToken) {
    id email githubId
  }
}

# Regenerate API key
mutation RegenerateApiKey($userId: String!) {
  regenerateApiKey(userId: $userId) {
    user { id email }
    apiKey
  }
}

# GitHub OAuth
mutation GitHubOAuth($userId: String!, $code: String!) {
  githubOAuth(userId: $userId, code: $code) {
    id email githubId
  }
}

# Revoke API key
mutation RevokeApiKey($userId: String!) {
  revokeApiKey(userId: $userId) {
    id email
  }
}
```

---

## 📁 Project Management Endpoints

### REST API (`/projects`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/projects` | Get all user projects | ✅ API Key |
| `GET` | `/projects/:repoUrl` | Get specific project | ✅ API Key |
| `POST` | `/projects/sync` | Sync single repository | ✅ API Key |
| `POST` | `/projects/sync-all` | Sync all repositories | ✅ API Key |

### GraphQL Queries & Mutations

```graphql
# Get all projects
query Projects {
  projects {
    id title description repoUrl
    tags category featured published
    githubMetadata languages
    createdAt updatedAt
  }
}

# Get filtered projects
query FilteredProjects($filter: ProjectFilterInput) {
  filteredProjects(filter: $filter) {
    id title description
    category tags
  }
}

# Get single project
query Project($repoUrl: String!) {
  project(repoUrl: $repoUrl) {
    id title description
    repoUrl category tags
  }
}

# Sync single project
mutation SyncProject($input: SyncProjectInput!) {
  syncProject(input: $input) {
    enqueued
  }
}

# Sync all projects
mutation SyncAllProjects {
  syncAllProjects
}
```

---

## 🤖 AI Enrichment System

### Services Available (Internal)

The AI enrichment system provides comprehensive repository analysis through internal services:

#### 1. **AI Enrichment Service** (`AIEnrichmentService`)
- **Purpose**: Orchestrates comprehensive repository analysis
- **Methods**:
  - `analyzeRepository(projectId, content, forceReanalysis?)`: Complete AI analysis
  - `getLatestAnalysis(projectId)`: Retrieve cached analysis results

#### 2. **Technology Detection Service** (`TechnologyDetectionService`)
- **Purpose**: Detects programming languages, frameworks, and tools
- **Capabilities**:
  - 50+ programming languages with percentage calculation
  - Framework detection (web, mobile, backend, ML, game)
  - Build tools and platform detection
  - Confidence scoring system
- **Methods**:
  - `detectTechnologies(content)`: Comprehensive technology analysis

#### 3. **Description Generation Service** (`DescriptionGenerationService`)
- **Purpose**: Generates AI-powered project descriptions
- **Features**:
  - External AI service integration with retry logic
  - Project-type-specific prompt templates
  - Quality validation and formatting
  - Fallback rule-based generation
- **Methods**:
  - `generateDescription(content)`: Generate project description

#### 4. **Project Categorization Service** (`ProjectCategorizationService`)
- **Purpose**: Categorizes projects into predefined categories
- **Categories**: 15+ categories including web-app, mobile-app, data-science, e-commerce, etc.
- **Features**:
  - Manual category override support
  - Category-based filtering and search
  - Confidence scoring and validation
- **Methods**:
  - `categorizeProject(content, manualOverride?)`: Categorize project
  - `filterProjectsByCategory(projects, filters)`: Filter projects
  - `searchProjectsByCategory(projects, term)`: Search by category
  - `getCategoryStatistics(projects)`: Get category stats

### AI Analysis Results

The AI enrichment system produces comprehensive analysis results stored in the `AIAnalysis` table:

```typescript
interface AIAnalysisResult {
  description: string;           // AI-generated description
  technologies: TechnologyStack; // Detected technologies
  category: ProjectCategory;     // Project categorization
  complexity: 'simple' | 'moderate' | 'complex' | 'enterprise';
  suggestedTags: string[];      // Auto-generated tags
  keyFeatures: string[];        // Extracted key features
  confidence: number;           // Overall confidence score
  model: string;                // AI model used
  version: number;              // Analysis version
  analysisDate: Date;           // When analysis was performed
}
```

**Note**: AI enrichment services are currently internal and not exposed as direct API endpoints. They are integrated into the project sync process.

---

## 👤 Public Developer Profiles

### REST API (`/profiles`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/profiles` | Create a new public profile | ✅ JWT |
| `GET` | `/profiles/me` | Get current user profile | ✅ JWT |
| `PUT` | `/profiles/me` | Update current user profile | ✅ JWT |
| `PUT` | `/profiles/me/settings` | Update profile settings | ✅ JWT |
| `DELETE` | `/profiles/me` | Delete current user profile | ✅ JWT |
| `GET` | `/profiles/check-username/:username` | Check username availability | ❌ |
| `GET` | `/profiles/check-domain/:domain` | Check custom domain availability | ❌ |
| `GET` | `/profiles/search` | Search public profiles | ❌ |
| `GET` | `/profiles/featured` | Get featured public profiles | ❌ |
| `GET` | `/profiles/:username` | Get public profile by username | ❌ |
| `GET` | `/profiles/domain/:domain` | Get public profile by custom domain | ❌ |

#### Theme Customization

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/profiles/themes/presets` | Get available theme presets | ❌ |
| `PUT` | `/profiles/me/theme` | Update profile theme | ✅ JWT |
| `POST` | `/profiles/me/theme/preset` | Apply a theme preset | ✅ JWT |

#### Social Links Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/profiles/platforms` | Get supported social platforms | ❌ |
| `PUT` | `/profiles/me/social-links` | Update all social links | ✅ JWT |
| `POST` | `/profiles/me/social-links` | Add a social link | ✅ JWT |
| `DELETE` | `/profiles/me/social-links/:platform` | Remove a social link | ✅ JWT |

#### Custom Sections & Statistics

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `PUT` | `/profiles/me/custom-sections` | Update custom profile sections | ✅ JWT |
| `GET` | `/profiles/me/statistics` | Get comprehensive profile statistics | ✅ JWT |

### GraphQL Queries & Mutations

```graphql
# Profile Management
mutation CreateProfile($input: CreateProfileInput!) {
  createProfile(input: $input) {
    id username displayName bio
    avatar location website
    socialLinks theme settings
    isPublic customDomain
  }
}

query MyProfile {
  myProfile {
    id username displayName bio
    avatar location website
    socialLinks theme settings
    isPublic customDomain viewCount
    stats {
      totalProjects publicProjects
      totalStars totalForks
      languageBreakdown
      topRepositories {
        id name stars forks language
      }
      activityData {
        date commits repositories
      }
    }
  }
}

query PublicProfile($username: String!) {
  publicProfile(username: $username) {
    id username displayName bio
    avatar location website
    socialLinks theme
    stats {
      totalProjects publicProjects
      totalStars totalForks
      languageBreakdown
    }
  }
}

query SearchProfiles($query: String!, $limit: Int, $offset: Int) {
  searchProfiles(query: $query, limit: $limit, offset: $offset) {
    id username displayName bio
    avatar viewCount
  }
}

query FeaturedProfiles($limit: Int) {
  featuredProfiles(limit: $limit) {
    id username displayName bio
    avatar viewCount
  }
}

mutation UpdateProfile($input: UpdateProfileInput!) {
  updateProfile(input: $input) {
    id username displayName bio
    avatar location website
  }
}

mutation UpdateProfileSettings($input: ProfileSettingsInput!) {
  updateProfileSettings(input: $input)
}

mutation DeleteProfile {
  deleteProfile
}

# Theme Customization
query GetThemePresets {
  getThemePresets {
    name displayName
    primaryColor secondaryColor
    backgroundStyle fontFamily
  }
}

mutation UpdateProfileTheme($input: UpdateThemeInput!) {
  updateProfileTheme(input: $input) {
    theme
    success
  }
}

mutation ApplyThemePreset($presetName: String!) {
  applyThemePreset(presetName: $presetName) {
    theme
    success
  }
}

# Social Links Management
query GetSupportedPlatforms {
  getSupportedPlatforms
}

mutation UpdateSocialLinks($socialLinks: [SocialLinkInput!]!) {
  updateSocialLinks(socialLinks: $socialLinks) {
    socialLinks
    success
  }
}

mutation AddSocialLink($socialLink: SocialLinkInput!) {
  addSocialLink(socialLink: $socialLink) {
    socialLinks
    success
  }
}

mutation RemoveSocialLink($platform: String!) {
  removeSocialLink(platform: $platform) {
    socialLinks
    success
  }
}

# Custom Sections & Statistics
mutation UpdateCustomSections($customSections: [CustomSectionInput!]!) {
  updateCustomSections(customSections: $customSections)
}

query ProfileStatistics {
  profileStatistics {
    totalProjects publicProjects privateProjects
    totalStars totalForks
    languageBreakdown
    topRepositories {
      id name stars forks language
    }
    activityData {
      date commits repositories
    }
    joinedDate lastActiveDate
  }
}

# Utility Queries
query IsUsernameAvailable($username: String!) {
  isUsernameAvailable(username: $username)
}

query IsDomainAvailable($domain: String!) {
  isDomainAvailable(domain: $domain)
}

query GenerateProfileUrl($username: String!, $customDomain: String) {
  generateProfileUrl(username: $username, customDomain: $customDomain)
}
```

### Profile Data Structure

```typescript
interface PublicProfile {
  id: string;
  userId: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  location?: string;
  website?: string;
  socialLinks: SocialLink[];
  theme: ProfileTheme;
  settings: ProfileSettings;
  isPublic: boolean;
  customDomain?: string;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
  stats?: ProfileStats;
}

interface SocialLink {
  platform: string;
  url: string;
  label?: string;
}

interface ProfileTheme {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundStyle?: string;
  fontFamily?: string;
}

interface ProfileSettings {
  isPublic?: boolean;
  showEmail?: boolean;
  showStats?: boolean;
  showPrivateRepos?: boolean;
  featuredProjects?: string[];
  customSections?: CustomSection[];
  layout?: string;
  showActivity?: boolean;
  showContributions?: boolean;
}

interface CustomSection {
  title: string;
  content: string;
  order?: number;
  visible?: boolean;
}

interface ProfileStats {
  totalProjects: number;
  publicProjects: number;
  privateProjects: number;
  totalStars: number;
  totalForks: number;
  languageBreakdown: { [language: string]: number };
  topRepositories: Array<{
    id: string;
    name: string;
    stars: number;
    forks: number;
    language?: string;
  }>;
  activityData: Array<{
    date: string;
    commits: number;
    repositories: number;
  }>;
  joinedDate: Date;
  lastActiveDate?: Date;
}
```

### Supported Social Platforms

The profiles system supports 19+ social media platforms:

- **Code Platforms**: GitHub, GitLab, Bitbucket
- **Professional**: LinkedIn, Stack Overflow
- **Social Media**: Twitter, Instagram, Facebook
- **Content**: YouTube, Twitch, Medium, Dev.to, Hashnode
- **Communication**: Discord, Telegram, Reddit
- **Personal**: Personal Website, Blog, Portfolio

### Theme Presets

6 built-in theme presets are available:

1. **Default**: Clean blue theme with solid background
2. **Dark**: Dark mode with teal accents and gradient background
3. **Minimal**: Green theme with minimal styling
4. **Vibrant**: Pink and orange gradient theme
5. **Professional**: Dark gray professional theme
6. **Creative**: Purple and pink creative gradient theme

### Profile URL Generation

Profiles can be accessed via:
- **Standard URL**: `https://gitsink.dev/profile/{username}`
- **Custom Domain**: `https://{customDomain}` (if configured)

### Usage Examples

#### Create a Profile
```bash
curl -X POST https://api.gitsink.com/profiles \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "displayName": "John Doe",
    "bio": "Full-stack developer passionate about open source",
    "location": "San Francisco, CA",
    "website": "https://johndoe.dev",
    "socialLinks": [
      {
        "platform": "github",
        "url": "https://github.com/johndoe",
        "label": "My GitHub"
      }
    ],
    "isPublic": true
  }'
```

#### Search Profiles
```bash
curl -X GET "https://api.gitsink.com/profiles/search?q=developer&limit=10&offset=0"
```

#### Apply Theme Preset
```bash
curl -X POST https://api.gitsink.com/profiles/me/theme/preset \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"presetName": "dark"}'
```

#### Update Custom Sections
```bash
curl -X PUT https://api.gitsink.com/profiles/me/custom-sections \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "customSections": [
      {
        "title": "About Me",
        "content": "I am a passionate developer with 5+ years of experience...",
        "order": 1,
        "visible": true
      },
      {
        "title": "Skills",
        "content": "TypeScript, React, Node.js, Python, Docker, AWS",
        "order": 2,
        "visible": true
      }
    ]
  }'
```

---

## 🔗 Webhook Endpoints

### GitHub Webhooks (`/webhook/github`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/webhook/github` | Handle GitHub webhook events | ❌ |

### Platform Webhooks

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/webhook/bitbucket` | Handle Bitbucket webhook events | ❌ |
| `POST` | `/webhook/gitlab` | Handle GitLab webhook events | ❌ |

---

## 🏥 System Health & Monitoring

### Health Checks

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/health` | General health check | ❌ |
| `GET` | `/auth/health` | Auth service health | ❌ |
| `GET` | `/metrics/health` | Metrics service health | ❌ |

### Metrics

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/metrics` | Prometheus metrics | ❌ |

---

## 📧 Waitlist

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/waitlist` | Join waitlist | ❌ |

---

## 🔧 Platform Integrations

### OAuth Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/auth/bitbucket` | Bitbucket OAuth | ❌ |
| `GET` | `/auth/bitbucket/callback` | Bitbucket OAuth callback | ❌ |
| `GET` | `/auth/gitlab` | GitLab OAuth | ❌ |
| `GET` | `/auth/gitlab/callback` | GitLab OAuth callback | ❌ |

---

## 🔑 Authentication Methods

### 1. **JWT Tokens**
- **Access Token**: Short-lived (15 minutes)
- **Refresh Token**: Long-lived (7 days)
- **Header**: `Authorization: Bearer <token>`

### 2. **API Keys**
- **Header**: `x-api-key: <api-key>`
- **Usage**: Programmatic access to projects API
- **Management**: Can be regenerated/revoked via auth endpoints

### 3. **Magic Links**
- **Passwordless authentication**
- **Email-based login**
- **Temporary tokens with expiration**

---

## 📊 Rate Limiting

The API implements multiple throttling tiers:

- **Short**: 3 requests per second
- **Medium**: 20 requests per 10 seconds  
- **Long**: 100 requests per minute

Specific endpoints have custom limits:
- Signup: 5 requests per minute
- Signin: 10 requests per minute
- Password reset: 3 requests per 5 minutes
- Magic links: 3 requests per 5 minutes

---

## 🗄️ Database Schema

### Key Tables

- **User**: User accounts and authentication
- **Project**: Repository projects and metadata
- **RefreshToken**: JWT refresh token management
- **MagicLinkToken**: Magic link authentication
- **AIAnalysis**: AI enrichment analysis results
- **PublicProfile**: Public developer profiles with themes, social links, and custom sections
- **PlatformConnection**: Multi-platform integrations
- **SyncHistory**: Repository sync audit trail
- **AuditLog**: Comprehensive audit logging
- **ApiUsage**: API usage tracking
- **SystemMetric**: System performance metrics
- **TokenBlacklist**: JWT token revocation

---

## 🚀 Getting Started

### 1. **User Registration**
```bash
curl -X POST https://api.gitsink.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepassword", "username": "myusername"}'
```

### 2. **Get API Key**
The API key is returned in the signup response or can be regenerated:
```bash
curl -X POST https://api.gitsink.com/auth/api-key/regenerate \
  -H "Authorization: Bearer <jwt-token>"
```

### 3. **Sync Repository**
```bash
curl -X POST https://api.gitsink.com/projects/sync \
  -H "x-api-key: <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/user/repo", "branch": "main"}'
```

### 4. **Get Projects**
```bash
curl -X GET https://api.gitsink.com/projects \
  -H "x-api-key: <api-key>"
```

---

## 🔧 Configuration

### Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/gitsink"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-jwt-secret"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN="7d"

# AI Services
AI_SERVICE_URL="https://api.openai.com/v1"
AI_SERVICE_API_KEY="your-ai-api-key"

# GitHub OAuth
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# Email
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# Features
ENABLE_AI_DESCRIPTION=true
ENABLE_TECHNOLOGY_DETECTION=true
ENABLE_CATEGORIZATION=true
AI_CONFIDENCE_THRESHOLD=0.7
```

---

## 📈 Monitoring & Observability

### Metrics Available
- HTTP request metrics (duration, status codes)
- Authentication metrics (logins, API key usage)
- Database query performance
- Queue processing metrics
- AI service integration metrics

### Health Checks
- Database connectivity
- Redis connectivity
- External service availability
- Queue system status

### Logging
- Structured JSON logging with Pino
- Request/response logging
- Error tracking with context
- Audit trail for sensitive operations

---

## 🔄 Queue System

### Background Jobs
- **Project Sync**: Repository synchronization
- **AI Analysis**: Repository enrichment processing
- **Email Sending**: Transactional emails
- **Cleanup Tasks**: Token and cache cleanup

### Queue Management
- Redis-backed Bull queues
- Job retry mechanisms
- Dead letter queues
- Queue monitoring and metrics

---

## 🛡️ Security Features

### Authentication Security
- Password hashing with bcrypt
- JWT token blacklisting
- Refresh token rotation
- API key encryption
- Rate limiting and throttling

### Data Protection
- Input validation and sanitization
- SQL injection prevention (Prisma ORM)
- XSS protection
- CORS configuration
- Request size limits

### Audit & Compliance
- Comprehensive audit logging
- User action tracking
- API usage monitoring
- Data retention policies

---

## 📚 API Documentation

### Interactive Documentation
- **Swagger UI**: Available at `/api/docs` (when enabled)
- **GraphQL Playground**: Available at `/graphql`

### Response Formats

#### Success Response
```json
{
  "data": { ... },
  "message": "Success message",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Error Response
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": { ... }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 🚧 Roadmap & Future Enhancements

### Recently Implemented
1. **Public Profile API**: ✅ Complete developer portfolio management system with themes, social links, custom sections, and statistics

### Planned Features
1. **AI Enrichment API Endpoints**: Direct access to AI analysis services
2. **Team Collaboration**: Multi-user project management
3. **Advanced Analytics**: Repository insights and trends
4. **Webhook Management**: User-configurable webhooks
5. **Plugin System**: Extensible integrations
6. **Profile Analytics**: Detailed profile view analytics and insights

### Current Limitations
- AI enrichment services are internal-only (no direct API access)
- Limited to GitHub integration (GitLab/Bitbucket in development)
- No real-time notifications (webhook-based only)
- Basic user management (no teams/organizations)

---

## 📞 Support & Contact

For API support, documentation updates, or feature requests:
- **Documentation**: This file (updated with each release)
- **Issues**: GitHub repository issues
- **API Status**: Monitor health endpoints for system status

---

## 🆕 Recent Updates

### v1.1.0 - Public Developer Profiles (2025-08-15)
- **New Feature**: Complete Public Developer Profiles system
- **25 New Endpoints**: Profile management, themes, social links, custom sections
- **6 Theme Presets**: Built-in themes with custom theme support
- **19+ Social Platforms**: Comprehensive social media integration
- **Profile Statistics**: Rich analytics including language breakdown and activity data
- **Custom Sections**: User-defined content areas with markdown support
- **Search & Discovery**: Profile search with pagination and featured profiles
- **Custom Domains**: Support for custom domain mapping

---

*Last Updated: 2025-08-15*
*API Version: v1.1*
*Documentation Version: 1.1*