# GraphQL API Guide

GitSink provides a powerful GraphQL API alongside the REST API, offering flexible data fetching with a single endpoint. This guide covers all GraphQL operations with detailed examples.

## GraphQL Endpoint

**URL**: `https://api.gitsink.com/graphql`  
**Playground**: `https://api.gitsink.com/graphql` (in development mode)

## Authentication

Include your authentication in the request headers:

```bash
# Using API Key
curl -X POST https://api.gitsink.com/graphql \
  -H "x-api-key: gsk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ projects { id title } }"}'

# Using JWT Token
curl -X POST https://api.gitsink.com/graphql \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ projects { id title } }"}'
```

## Schema Overview

### Core Types

```graphql
type User {
  id: ID!
  email: String!
  username: String
  githubId: String
  createdAt: DateTime!
  lastLoginAt: DateTime
  projects: [Project!]!
  profile: PublicProfile
}

type Project {
  id: ID!
  title: String!
  description: String
  repoUrl: String!
  category: String
  tags: [String!]!
  languages: JSON
  featured: Boolean!
  published: Boolean!
  createdAt: DateTime!
  updatedAt: DateTime!
  lastSyncAt: DateTime
  syncStatus: SyncStatus
  aiAnalysis: AIAnalysis
  customMetadata: JSON
  owner: User!
}

type AIAnalysis {
  id: ID!
  description: String
  technologies: TechnologyStack!
  category: ProjectCategory!
  complexity: ComplexityLevel!
  keyFeatures: [String!]!
  confidence: Float!
  model: String!
  createdAt: DateTime!
}

type TechnologyStack {
  languages: [LanguageUsage!]!
  frameworks: [Framework!]!
  databases: [String!]!
  tools: [String!]!
}

type LanguageUsage {
  name: String!
  percentage: Float!
  confidence: Float!
}

type Framework {
  name: String!
  confidence: Float!
  version: String
}

type ProjectCategory {
  primary: String!
  secondary: [String!]!
  confidence: Float!
  tags: [String!]!
}

enum ComplexityLevel {
  SIMPLE
  MODERATE
  COMPLEX
  ENTERPRISE
}

enum SyncStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

## Queries

### 1. Get All Projects

```graphql
query GetProjects {
  projects {
    id
    title
    description
    repoUrl
    category
    tags
    languages
    featured
    published
    createdAt
    updatedAt
    lastSyncAt
    syncStatus
    aiAnalysis {
      description
      technologies {
        languages {
          name
          percentage
          confidence
        }
        frameworks {
          name
          confidence
          version
        }
        databases
        tools
      }
      category {
        primary
        secondary
        confidence
        tags
      }
      complexity
      keyFeatures
      confidence
      model
      createdAt
    }
    customMetadata
  }
}
```

**Response:**
```json
{
  "data": {
    "projects": [
      {
        "id": "proj_abc123",
        "title": "My Awesome App",
        "description": "A modern web application built with React and Node.js",
        "repoUrl": "https://github.com/user/awesome-app",
        "category": "web-application",
        "tags": ["react", "nodejs", "typescript"],
        "languages": {
          "TypeScript": 65.2,
          "JavaScript": 25.8,
          "CSS": 9.0
        },
        "featured": true,
        "published": true,
        "createdAt": "2024-01-15T10:30:00Z",
        "updatedAt": "2024-01-15T12:45:00Z",
        "lastSyncAt": "2024-01-15T12:45:00Z",
        "syncStatus": "COMPLETED",
        "aiAnalysis": {
          "description": "A modern web application built with React and Node.js",
          "technologies": {
            "languages": [
              {
                "name": "TypeScript",
                "percentage": 65.2,
                "confidence": 0.95
              }
            ],
            "frameworks": [
              {
                "name": "react",
                "confidence": 0.98,
                "version": "18.x"
              }
            ],
            "databases": ["postgresql"],
            "tools": ["docker", "jest"]
          },
          "category": {
            "primary": "web-application",
            "secondary": ["frontend", "fullstack"],
            "confidence": 0.92,
            "tags": ["react", "nodejs", "typescript"]
          },
          "complexity": "MODERATE",
          "keyFeatures": [
            "User authentication system",
            "Real-time data updates"
          ],
          "confidence": 0.92,
          "model": "gpt-4",
          "createdAt": "2024-01-15T12:45:00Z"
        },
        "customMetadata": {
          "demo": "https://awesome-app.demo.com"
        }
      }
    ]
  }
}
```

### 2. Filtered Projects Query

```graphql
query GetFilteredProjects($filter: ProjectFilter, $pagination: PaginationInput) {
  projects(filter: $filter, pagination: $pagination) {
    edges {
      node {
        id
        title
        description
        category
        tags
        featured
        aiAnalysis {
          technologies {
            languages {
              name
              percentage
            }
          }
          category {
            primary
            confidence
          }
        }
      }
      cursor
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      startCursor
      endCursor
    }
    totalCount
  }
}
```

**Variables:**
```json
{
  "filter": {
    "category": "web-application",
    "tags": ["react", "typescript"],
    "featured": true,
    "published": true,
    "search": "modern web app"
  },
  "pagination": {
    "first": 10,
    "after": "cursor_abc123"
  }
}
```

### 3. Single Project Query

```graphql
query GetProject($id: ID!) {
  project(id: $id) {
    id
    title
    description
    repoUrl
    category
    tags
    languages
    featured
    published
    createdAt
    updatedAt
    lastSyncAt
    syncStatus
    aiAnalysis {
      description
      technologies {
        languages {
          name
          percentage
          confidence
        }
        frameworks {
          name
          confidence
          version
        }
        databases
        tools
      }
      category {
        primary
        secondary
        confidence
        tags
      }
      complexity
      keyFeatures
      confidence
      model
      createdAt
    }
    customMetadata
    owner {
      id
      username
      email
    }
  }
}
```

**Variables:**
```json
{
  "id": "proj_abc123"
}
```

### 4. Search Projects

```graphql
query SearchProjects($query: String!, $filters: SearchFilters) {
  searchProjects(query: $query, filters: $filters) {
    results {
      id
      title
      description
      category
      tags
      relevanceScore
      aiAnalysis {
        category {
          primary
          confidence
        }
        technologies {
          languages {
            name
            percentage
          }
        }
      }
    }
    totalCount
    searchTime
    suggestions
  }
}
```

**Variables:**
```json
{
  "query": "react typescript web application",
  "filters": {
    "category": ["web-application", "library-framework"],
    "languages": ["TypeScript", "JavaScript"],
    "minConfidence": 0.8,
    "featured": true
  }
}
```

### 5. User Profile Query

```graphql
query GetUserProfile {
  me {
    id
    email
    username
    githubId
    createdAt
    lastLoginAt
    projects {
      id
      title
      category
      featured
      published
    }
    profile {
      id
      username
      displayName
      bio
      avatar
      isPublic
      theme
      stats {
        totalProjects
        featuredProjects
        totalStars
        totalForks
        languageStats {
          language
          projectCount
          percentage
        }
      }
    }
  }
}
```

### 6. Project Analytics Query

```graphql
query GetProjectAnalytics($projectId: ID!, $timeRange: TimeRange) {
  projectAnalytics(projectId: $projectId, timeRange: $timeRange) {
    project {
      id
      title
    }
    metrics {
      syncCount
      viewCount
      lastSyncAt
      averageSyncTime
      errorRate
    }
    trends {
      date
      syncs
      views
      errors
    }
    aiAnalysisHistory {
      version
      confidence
      createdAt
      changes {
        field
        oldValue
        newValue
      }
    }
  }
}
```

## Mutations

### 1. Sync Project

```graphql
mutation SyncProject($input: SyncProjectInput!) {
  syncProject(input: $input) {
    success
    message
    job {
      id
      status
      estimatedTime
      progress
    }
    project {
      id
      title
      syncStatus
      lastSyncAt
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "repoUrl": "https://github.com/user/repo",
    "branch": "main",
    "force": false
  }
}
```

### 2. Bulk Sync Projects

```graphql
mutation SyncAllProjects($input: BulkSyncInput!) {
  syncAllProjects(input: $input) {
    success
    message
    job {
      id
      status
      estimatedTime
      repositoryCount
    }
    queuedProjects {
      id
      repoUrl
      status
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "force": false,
    "includePrivate": true,
    "platforms": ["github", "gitlab"]
  }
}
```

### 3. Update Project

```graphql
mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
  updateProject(id: $id, input: $input) {
    success
    message
    project {
      id
      title
      description
      category
      tags
      featured
      published
      updatedAt
    }
  }
}
```

**Variables:**
```json
{
  "id": "proj_abc123",
  "input": {
    "title": "Updated Project Title",
    "description": "Updated description",
    "category": "web-application",
    "tags": ["react", "typescript", "nodejs"],
    "featured": true,
    "published": true
  }
}
```

### 4. Trigger AI Enrichment

```graphql
mutation TriggerAIEnrichment($projectId: ID!, $options: EnrichmentOptions) {
  triggerAIEnrichment(projectId: $projectId, options: $options) {
    success
    message
    job {
      id
      status
      estimatedTime
    }
    project {
      id
      title
      aiAnalysis {
        confidence
        model
        createdAt
      }
    }
  }
}
```

**Variables:**
```json
{
  "projectId": "proj_abc123",
  "options": {
    "force": true,
    "includeDescription": true,
    "includeTechnologies": true,
    "includeCategories": true,
    "model": "gpt-4"
  }
}
```

### 5. Create Public Profile

```graphql
mutation CreatePublicProfile($input: CreateProfileInput!) {
  createPublicProfile(input: $input) {
    success
    message
    profile {
      id
      username
      displayName
      bio
      isPublic
      profileUrl
      theme
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "username": "developer123",
    "displayName": "John Developer",
    "bio": "Full-stack developer passionate about modern web technologies",
    "isPublic": true,
    "theme": {
      "primaryColor": "#3b82f6",
      "layout": "grid"
    },
    "socialLinks": [
      {
        "platform": "github",
        "url": "https://github.com/developer123"
      },
      {
        "platform": "linkedin",
        "url": "https://linkedin.com/in/developer123"
      }
    ]
  }
}
```

## Subscriptions

### 1. Project Sync Status Updates

```graphql
subscription ProjectSyncStatus($userId: ID!) {
  projectSyncStatus(userId: $userId) {
    jobId
    projectId
    status
    progress
    currentStep
    estimatedCompletion
    error
    result {
      id
      title
      syncStatus
      lastSyncAt
    }
  }
}
```

### 2. Real-time Profile Views

```graphql
subscription ProfileViews($profileId: ID!) {
  profileViews(profileId: $profileId) {
    profileId
    viewCount
    timestamp
    visitor {
      country
      referrer
      userAgent
    }
  }
}
```

### 3. System Health Updates

```graphql
subscription SystemHealth {
  systemHealth {
    status
    timestamp
    services {
      name
      status
      responseTime
      errorRate
    }
    metrics {
      activeUsers
      requestsPerSecond
      queueSize
    }
  }
}
```

## Input Types

### ProjectFilter
```graphql
input ProjectFilter {
  category: String
  tags: [String!]
  languages: [String!]
  featured: Boolean
  published: Boolean
  search: String
  owner: ID
  createdAfter: DateTime
  createdBefore: DateTime
  updatedAfter: DateTime
  updatedBefore: DateTime
  minConfidence: Float
  complexity: [ComplexityLevel!]
}
```

### PaginationInput
```graphql
input PaginationInput {
  first: Int
  after: String
  last: Int
  before: String
}
```

### SyncProjectInput
```graphql
input SyncProjectInput {
  repoUrl: String!
  branch: String
  force: Boolean
  includePrivate: Boolean
}
```

## Error Handling

GraphQL errors are returned in the standard format:

```json
{
  "data": null,
  "errors": [
    {
      "message": "Project not found",
      "locations": [
        {
          "line": 2,
          "column": 3
        }
      ],
      "path": ["project"],
      "extensions": {
        "code": "PROJECT_NOT_FOUND",
        "statusCode": 404,
        "details": {
          "projectId": "proj_nonexistent"
        }
      }
    }
  ]
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHENTICATED` | Authentication required |
| `FORBIDDEN` | Insufficient permissions |
| `PROJECT_NOT_FOUND` | Project doesn't exist |
| `SYNC_IN_PROGRESS` | Sync already running |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `VALIDATION_ERROR` | Invalid input data |

## Advanced Queries

### 1. Complex Project Analysis

```graphql
query ComplexProjectAnalysis {
  projects(filter: { featured: true, published: true }) {
    edges {
      node {
        id
        title
        category
        aiAnalysis {
          technologies {
            languages {
              name
              percentage
            }
            frameworks {
              name
              confidence
            }
          }
          category {
            primary
            confidence
          }
          complexity
        }
        stats: analytics(timeRange: { from: "2024-01-01", to: "2024-01-31" }) {
          viewCount
          syncCount
          errorRate
        }
      }
    }
  }
  
  languageStats: aggregateProjects {
    languageDistribution {
      language
      projectCount
      totalPercentage
    }
    categoryDistribution {
      category
      count
      percentage
    }
  }
}
```

### 2. User Dashboard Data

```graphql
query UserDashboard {
  me {
    id
    username
    projects(filter: { published: true }) {
      edges {
        node {
          id
          title
          category
          featured
          aiAnalysis {
            technologies {
              languages {
                name
                percentage
              }
            }
            complexity
          }
        }
      }
    }
    
    profile {
      stats {
        totalProjects
        featuredProjects
        languageStats {
          language
          projectCount
          percentage
        }
      }
    }
    
    recentActivity: syncHistory(first: 10) {
      edges {
        node {
          id
          operation
          status
          createdAt
          project {
            title
          }
        }
      }
    }
  }
}
```

## Client Examples

### JavaScript/Apollo Client

```javascript
import { ApolloClient, InMemoryCache, createHttpLink, gql } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

// Setup Apollo Client
const httpLink = createHttpLink({
  uri: 'https://api.gitsink.com/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('gitsink-api-key');
  return {
    headers: {
      ...headers,
      'x-api-key': token,
    }
  };
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});

// Query projects
const GET_PROJECTS = gql`
  query GetProjects($filter: ProjectFilter) {
    projects(filter: $filter) {
      edges {
        node {
          id
          title
          description
          category
          tags
          aiAnalysis {
            technologies {
              languages {
                name
                percentage
              }
            }
          }
        }
      }
    }
  }
`;

// Usage in React component
function ProjectList() {
  const { loading, error, data } = useQuery(GET_PROJECTS, {
    variables: {
      filter: { featured: true, published: true }
    }
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data.projects.edges.map(({ node: project }) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
```

### Python/GQL

```python
from gql import gql, Client
from gql.transport.requests import RequestsHTTPTransport

# Setup client
transport = RequestsHTTPTransport(
    url="https://api.gitsink.com/graphql",
    headers={"x-api-key": "gsk_your_key_here"}
)
client = Client(transport=transport, fetch_schema_from_transport=True)

# Query
query = gql("""
    query GetProjects($filter: ProjectFilter) {
        projects(filter: $filter) {
            edges {
                node {
                    id
                    title
                    category
                    aiAnalysis {
                        technologies {
                            languages {
                                name
                                percentage
                            }
                        }
                    }
                }
            }
        }
    }
""")

# Execute
result = client.execute(query, variable_values={
    "filter": {"featured": True, "published": True}
})

projects = [edge["node"] for edge in result["projects"]["edges"]]
for project in projects:
    print(f"{project['title']} - {project['category']}")
```

### cURL Examples

```bash
# Simple query
curl -X POST https://api.gitsink.com/graphql \
  -H "x-api-key: gsk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ projects { edges { node { id title category } } } }"
  }'

# Query with variables
curl -X POST https://api.gitsink.com/graphql \
  -H "x-api-key: gsk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query GetProjects($filter: ProjectFilter) { projects(filter: $filter) { edges { node { id title } } } }",
    "variables": {
      "filter": { "featured": true }
    }
  }'

# Mutation
curl -X POST https://api.gitsink.com/graphql \
  -H "x-api-key: gsk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation SyncProject($input: SyncProjectInput!) { syncProject(input: $input) { success message job { id status } } }",
    "variables": {
      "input": {
        "repoUrl": "https://github.com/user/repo"
      }
    }
  }'
```

## Best Practices

### 1. Query Optimization
- Request only the fields you need
- Use fragments for reusable field sets
- Implement proper pagination
- Use variables for dynamic queries

### 2. Error Handling
- Always check for errors in the response
- Implement retry logic for transient errors
- Handle network errors gracefully
- Log errors for debugging

### 3. Caching
- Use Apollo Client cache for better performance
- Implement cache invalidation strategies
- Use cache-first policies where appropriate
- Consider cache persistence for offline support

### 4. Security
- Never expose API keys in client-side code
- Use environment variables for sensitive data
- Implement proper authentication flows
- Validate all user inputs

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify API key is correct and active
   - Check header format
   - Ensure proper permissions

2. **Query Errors**
   - Validate GraphQL syntax
   - Check field availability in schema
   - Verify variable types match schema

3. **Performance Issues**
   - Reduce query complexity
   - Implement pagination
   - Use query optimization techniques
   - Consider caching strategies

### Getting Help

- **GraphQL Playground**: https://api.gitsink.com/graphql
- **Schema Documentation**: Available in playground
- **Support**: support@gitsink.com
- **Community**: https://github.com/gitsink/community