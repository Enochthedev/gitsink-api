# Projects API Guide

The Projects API allows you to sync, manage, and enrich your repositories from GitHub, GitLab, and Bitbucket. This guide covers all project-related operations with detailed examples.

## Overview

GitSink automatically enriches your repositories with:
- **AI-powered descriptions** based on code analysis
- **Technology stack detection** for 50+ languages and frameworks
- **Project categorization** across 15+ categories
- **Custom metadata** via Portfolio.md files
- **Real-time synchronization** via webhooks

## Authentication

All project endpoints require authentication. Use either:
- **API Key**: `x-api-key: gsk_your_key_here`
- **JWT Token**: `Authorization: Bearer your_jwt_token`

## Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/projects` | GET | List all projects |
| `/projects/:id` | GET | Get specific project |
| `/projects/sync` | POST | Sync single repository |
| `/projects/sync-all` | POST | Sync all repositories |
| `/projects/search` | GET | Search projects |
| `/projects/:id/enrich` | POST | Trigger AI enrichment |

## 1. Listing Projects

### Basic Project List

```bash
curl -X GET https://api.gitsink.com/projects \
  -H "x-api-key: gsk_your_key_here"
```

**Response:**
```json
{
  "success": true,
  "message": "Projects retrieved successfully",
  "data": [
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
      "aiAnalysis": {
        "confidence": 0.92,
        "complexity": "moderate",
        "technologies": {
          "frameworks": ["react", "express"],
          "databases": ["postgresql"],
          "tools": ["docker", "jest"]
        }
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  },
  "timestamp": "2024-01-15T13:00:00Z"
}
```

### Filtered Project List

```bash
# Filter by category and tags
curl -X GET "https://api.gitsink.com/projects?category=web-application&tags=react,typescript&featured=true" \
  -H "x-api-key: gsk_your_key_here"

# Search projects
curl -X GET "https://api.gitsink.com/projects?q=react%20typescript&limit=10" \
  -H "x-api-key: gsk_your_key_here"

# Sort and paginate
curl -X GET "https://api.gitsink.com/projects?sortBy=updatedAt&sortOrder=desc&page=2&limit=5" \
  -H "x-api-key: gsk_your_key_here"
```

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `q` | string | Search query | `react typescript` |
| `category` | string | Filter by category | `web-application` |
| `tags` | string | Comma-separated tags | `react,nodejs` |
| `language` | string | Programming language | `TypeScript` |
| `featured` | boolean | Show only featured | `true` |
| `published` | boolean | Show only published | `true` |
| `page` | number | Page number (1-based) | `2` |
| `limit` | number | Items per page (1-100) | `20` |
| `sortBy` | string | Sort field | `updatedAt` |
| `sortOrder` | string | Sort direction | `desc` |

## 2. Getting a Specific Project

```bash
curl -X GET https://api.gitsink.com/projects/proj_abc123 \
  -H "x-api-key: gsk_your_key_here"
```

**Response:**
```json
{
  "success": true,
  "message": "Project retrieved successfully",
  "data": {
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
    "syncStatus": "completed",
    "aiAnalysis": {
      "description": "A modern web application built with React and Node.js",
      "technologies": {
        "languages": [
          {"name": "TypeScript", "percentage": 65.2},
          {"name": "JavaScript", "percentage": 25.8}
        ],
        "frameworks": ["react", "express"],
        "databases": ["postgresql"],
        "tools": ["docker", "jest", "webpack"]
      },
      "category": {
        "primary": "web-application",
        "secondary": ["frontend", "fullstack"],
        "confidence": 0.92
      },
      "complexity": "moderate",
      "confidence": 0.92,
      "keyFeatures": [
        "User authentication system",
        "Real-time data updates",
        "Responsive design"
      ]
    },
    "customMetadata": {
      "demo": "https://awesome-app.demo.com",
      "documentation": "https://docs.awesome-app.com",
      "highlights": ["Performance optimized", "Mobile-first design"]
    }
  },
  "timestamp": "2024-01-15T13:00:00Z"
}
```

## 3. Syncing Repositories

### Sync Single Repository

```bash
curl -X POST https://api.gitsink.com/projects/sync \
  -H "x-api-key: gsk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/user/new-project",
    "branch": "main"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Repository sync queued successfully",
  "data": {
    "jobId": "job_xyz789",
    "repoUrl": "https://github.com/user/new-project",
    "branch": "main",
    "estimatedTime": "2-5 minutes",
    "status": "queued"
  },
  "timestamp": "2024-01-15T13:00:00Z"
}
```

### Sync All Repositories

```bash
curl -X POST https://api.gitsink.com/projects/sync-all \
  -H "x-api-key: gsk_your_key_here" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "All repositories sync queued successfully",
  "data": {
    "jobId": "job_batch_456",
    "repositoryCount": 12,
    "estimatedTime": "10-20 minutes",
    "status": "queued"
  },
  "timestamp": "2024-01-15T13:00:00Z"
}
```

### Sync Status

Check the status of a sync operation:

```bash
curl -X GET https://api.gitsink.com/projects/sync/job_xyz789/status \
  -H "x-api-key: gsk_your_key_here"
```

**Response:**
```json
{
  "success": true,
  "message": "Sync status retrieved",
  "data": {
    "jobId": "job_xyz789",
    "status": "processing",
    "progress": 75,
    "currentStep": "AI analysis",
    "startedAt": "2024-01-15T13:00:00Z",
    "estimatedCompletion": "2024-01-15T13:03:00Z",
    "steps": [
      {"name": "Repository fetch", "status": "completed", "duration": 1200},
      {"name": "Metadata parsing", "status": "completed", "duration": 800},
      {"name": "AI analysis", "status": "processing", "progress": 75},
      {"name": "Database update", "status": "pending"}
    ]
  },
  "timestamp": "2024-01-15T13:02:30Z"
}
```

## 4. AI Enrichment

### Trigger Manual Enrichment

```bash
curl -X POST https://api.gitsink.com/projects/proj_abc123/enrich \
  -H "x-api-key: gsk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "force": true,
    "includeDescription": true,
    "includeTechnologies": true,
    "includeCategories": true
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "AI enrichment queued successfully",
  "data": {
    "jobId": "enrich_abc123",
    "projectId": "proj_abc123",
    "estimatedTime": "1-3 minutes",
    "status": "queued"
  },
  "timestamp": "2024-01-15T13:00:00Z"
}
```

### Get Enrichment Results

```bash
curl -X GET https://api.gitsink.com/projects/proj_abc123/enrichment \
  -H "x-api-key: gsk_your_key_here"
```

**Response:**
```json
{
  "success": true,
  "message": "Enrichment data retrieved",
  "data": {
    "projectId": "proj_abc123",
    "version": 2,
    "analysis": {
      "description": "A modern web application built with React and Node.js, featuring user authentication, real-time updates, and responsive design.",
      "technologies": {
        "languages": [
          {"name": "TypeScript", "percentage": 65.2, "confidence": 0.95},
          {"name": "JavaScript", "percentage": 25.8, "confidence": 0.98},
          {"name": "CSS", "percentage": 9.0, "confidence": 0.92}
        ],
        "frameworks": [
          {"name": "react", "confidence": 0.98, "version": "18.x"},
          {"name": "express", "confidence": 0.95, "version": "4.x"}
        ],
        "databases": [
          {"name": "postgresql", "confidence": 0.88}
        ],
        "tools": [
          {"name": "docker", "confidence": 0.92},
          {"name": "jest", "confidence": 0.89},
          {"name": "webpack", "confidence": 0.85}
        ]
      },
      "category": {
        "primary": "web-application",
        "secondary": ["frontend", "fullstack"],
        "confidence": 0.92,
        "tags": ["react", "nodejs", "typescript", "fullstack"]
      },
      "complexity": "moderate",
      "keyFeatures": [
        "User authentication system",
        "Real-time data updates",
        "Responsive design",
        "API integration"
      ],
      "suggestedTags": ["react", "typescript", "nodejs", "web-app", "fullstack"],
      "confidence": 0.92
    },
    "model": "gpt-4",
    "createdAt": "2024-01-15T12:45:00Z"
  },
  "timestamp": "2024-01-15T13:00:00Z"
}
```

## 5. Custom Metadata with Portfolio.md

GitSink supports custom project metadata via `Portfolio.md` files in your repositories.

### Portfolio.md Format

Create a `Portfolio.md` file in your repository root:

```markdown
---
title: "My Awesome Web App"
description: "A comprehensive web application showcasing modern development practices"
category: "web-application"
tags: ["react", "typescript", "nodejs", "postgresql"]
featured: true
published: true
demo: "https://my-app.demo.com"
documentation: "https://docs.my-app.com"
highlights:
  - "Real-time collaboration features"
  - "Advanced security implementation"
  - "Scalable microservices architecture"
technologies:
  primary: ["React", "Node.js", "TypeScript"]
  databases: ["PostgreSQL", "Redis"]
  deployment: ["Docker", "Kubernetes", "AWS"]
metrics:
  performance_score: 95
  accessibility_score: 98
  seo_score: 92
---

# My Awesome Web App

This project demonstrates modern web development practices...
```

### Supported Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Project title (overrides repo name) |
| `description` | string | Project description |
| `category` | string | Project category |
| `tags` | array | Project tags |
| `featured` | boolean | Mark as featured project |
| `published` | boolean | Make publicly visible |
| `demo` | string | Demo URL |
| `documentation` | string | Documentation URL |
| `highlights` | array | Key project highlights |
| `technologies` | object | Technology stack details |
| `metrics` | object | Custom metrics |

## 6. Project Categories

GitSink automatically categorizes projects into these categories:

| Category | Description | Examples |
|----------|-------------|----------|
| `web-application` | Full web applications | React apps, Vue.js sites |
| `mobile-application` | Mobile apps | React Native, Flutter |
| `api-service` | Backend APIs | REST APIs, GraphQL |
| `library-framework` | Reusable libraries | npm packages, gems |
| `cli-tool` | Command-line tools | CLI utilities, scripts |
| `desktop-application` | Desktop software | Electron apps |
| `game` | Games and simulations | Unity games, web games |
| `machine-learning` | ML/AI projects | Models, datasets |
| `data-analysis` | Data science | Jupyter notebooks |
| `devops-infrastructure` | DevOps tools | Docker configs, CI/CD |
| `documentation` | Documentation sites | GitBook, Docusaurus |
| `educational` | Learning projects | Tutorials, examples |
| `prototype-experiment` | Experimental code | POCs, experiments |
| `configuration` | Config files | Dotfiles, settings |
| `other` | Uncategorized projects | Miscellaneous |

## 7. Error Handling

### Common Error Responses

#### Repository Not Found
```json
{
  "success": false,
  "message": "Repository not found or not accessible",
  "statusCode": 404,
  "error": "REPOSITORY_NOT_FOUND",
  "details": {
    "repoUrl": "https://github.com/user/nonexistent",
    "suggestion": "Verify the repository URL and ensure it's public or you have access"
  },
  "timestamp": "2024-01-15T13:00:00Z",
  "path": "/projects/sync"
}
```

#### Sync Already in Progress
```json
{
  "success": false,
  "message": "Sync already in progress for this repository",
  "statusCode": 409,
  "error": "SYNC_IN_PROGRESS",
  "details": {
    "jobId": "job_existing_123",
    "estimatedCompletion": "2024-01-15T13:05:00Z"
  },
  "timestamp": "2024-01-15T13:00:00Z",
  "path": "/projects/sync"
}
```

#### Rate Limit Exceeded
```json
{
  "success": false,
  "message": "Rate limit exceeded",
  "statusCode": 429,
  "error": "RATE_LIMIT_EXCEEDED",
  "details": {
    "limit": 100,
    "window": "1 minute",
    "resetTime": "2024-01-15T13:01:00Z"
  },
  "timestamp": "2024-01-15T13:00:00Z",
  "path": "/projects/sync"
}
```

## 8. Webhooks Integration

GitSink supports real-time synchronization via webhooks from GitHub, GitLab, and Bitbucket.

### Setting Up Webhooks

#### GitHub Webhook
1. Go to your repository settings
2. Click "Webhooks" → "Add webhook"
3. Set payload URL: `https://api.gitsink.com/webhooks/github`
4. Select "application/json" content type
5. Choose events: `push`, `repository`, `release`

#### GitLab Webhook
1. Go to project settings → "Webhooks"
2. Set URL: `https://api.gitsink.com/webhooks/gitlab`
3. Select events: `Push events`, `Tag push events`, `Repository update events`

#### Bitbucket Webhook
1. Go to repository settings → "Webhooks"
2. Add webhook: `https://api.gitsink.com/webhooks/bitbucket`
3. Select events: `Repository push`, `Repository updated`

### Webhook Events

When webhooks are triggered, GitSink automatically:
- Syncs repository changes
- Updates project metadata
- Triggers AI re-analysis if needed
- Updates last sync timestamp

## 9. Best Practices

### Performance Optimization
- Use pagination for large project lists
- Implement caching for frequently accessed data
- Use webhooks instead of polling for updates
- Filter results to reduce payload size

### Data Management
- Keep Portfolio.md files up to date
- Use meaningful project titles and descriptions
- Tag projects consistently
- Mark important projects as featured

### API Usage
- Implement proper error handling
- Use appropriate authentication method
- Respect rate limits
- Monitor API usage

### Example Implementation

```javascript
class GitSinkProjectManager {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.gitsink.com';
  }

  async syncRepository(repoUrl, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}/projects/sync`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          repoUrl,
          branch: options.branch || 'main'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Sync failed: ${error.message}`);
      }

      const result = await response.json();
      
      // Poll for completion
      return this.waitForSync(result.data.jobId);
    } catch (error) {
      console.error('Sync error:', error);
      throw error;
    }
  }

  async waitForSync(jobId, maxWait = 300000) { // 5 minutes max
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      const status = await this.getSyncStatus(jobId);
      
      if (status.status === 'completed') {
        return status;
      } else if (status.status === 'failed') {
        throw new Error(`Sync failed: ${status.error}`);
      }
      
      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error('Sync timeout');
  }

  async getSyncStatus(jobId) {
    const response = await fetch(`${this.baseURL}/projects/sync/${jobId}/status`, {
      headers: { 'x-api-key': this.apiKey }
    });
    
    const result = await response.json();
    return result.data;
  }

  async getProjects(filters = {}) {
    const params = new URLSearchParams(filters);
    const response = await fetch(`${this.baseURL}/projects?${params}`, {
      headers: { 'x-api-key': this.apiKey }
    });
    
    const result = await response.json();
    return result.data;
  }
}

// Usage
const manager = new GitSinkProjectManager(process.env.GITSINK_API_KEY);

// Sync a repository
await manager.syncRepository('https://github.com/user/repo');

// Get featured projects
const featured = await manager.getProjects({ featured: true });
```

## 10. Troubleshooting

### Common Issues

1. **Repository Access Denied**
   - Ensure repository is public or you have access
   - Check GitHub token permissions
   - Verify repository URL format

2. **Sync Taking Too Long**
   - Large repositories take longer to process
   - AI analysis adds processing time
   - Check sync status for progress

3. **Missing AI Analysis**
   - Trigger manual enrichment
   - Check if repository has sufficient code
   - Verify AI service availability

4. **Portfolio.md Not Parsed**
   - Ensure file is in repository root
   - Check YAML frontmatter syntax
   - Verify file encoding (UTF-8)

### Getting Help

- **API Status**: https://status.gitsink.com
- **Documentation**: https://docs.gitsink.com
- **Support**: support@gitsink.com
- **Community**: https://github.com/gitsink/community