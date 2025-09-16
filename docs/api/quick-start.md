# Quick Start Guide

Get up and running with GitSink API in under 5 minutes. This guide will walk you through the essential steps to start syncing and enriching your repositories.

## Prerequisites

- A GitHub, GitLab, or Bitbucket account with repositories
- Basic knowledge of REST APIs
- A tool for making HTTP requests (curl, Postman, or code)

## Step 1: Create Your Account

### Option A: Sign Up with Email

```bash
curl -X POST https://api.gitsink.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "username": "your-username",
    "password": "SecurePassword123!"
  }'
```

**Response:**
```json
{
  "message": "User created successfully",
  "user": {
    "id": "user_abc123",
    "email": "your-email@example.com",
    "username": "your-username",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "apiKey": "gsk_1234567890abcdef..."
}
```

**💡 Important**: Save your API key! You'll need it for all subsequent requests.

### Option B: Magic Link (Passwordless)

```bash
# Send magic link
curl -X POST https://api.gitsink.com/auth/magic-link/send \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email@example.com"}'

# Check your email and use the token from the link
curl -X POST https://api.gitsink.com/auth/magic-link/validate \
  -H "Content-Type: application/json" \
  -d '{"token": "ml_token_from_email"}'
```

## Step 2: Connect Your GitHub Account (Optional)

If you want to sync private repositories or use GitHub OAuth:

```bash
# First, get a GitHub OAuth code by visiting:
# https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&scope=repo,user:email

# Then connect your account
curl -X POST https://api.gitsink.com/auth/github/connect \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "GITHUB_OAUTH_CODE"}'
```

## Step 3: Sync Your First Repository

Now let's sync a repository and see GitSink's AI enrichment in action:

```bash
curl -X POST https://api.gitsink.com/projects/sync \
  -H "x-api-key: gsk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/facebook/react",
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
    "repoUrl": "https://github.com/facebook/react",
    "estimatedTime": "2-5 minutes",
    "status": "queued"
  }
}
```

## Step 4: Check Sync Progress

Monitor your sync progress:

```bash
curl -X GET https://api.gitsink.com/projects/sync/job_xyz789/status \
  -H "x-api-key: gsk_your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "job_xyz789",
    "status": "processing",
    "progress": 75,
    "currentStep": "AI analysis",
    "steps": [
      {"name": "Repository fetch", "status": "completed"},
      {"name": "Metadata parsing", "status": "completed"},
      {"name": "AI analysis", "status": "processing", "progress": 75},
      {"name": "Database update", "status": "pending"}
    ]
  }
}
```

## Step 5: View Your Enriched Project

Once sync is complete, view your enriched project:

```bash
curl -X GET https://api.gitsink.com/projects \
  -H "x-api-key: gsk_your_api_key_here"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "proj_react_123",
      "title": "React",
      "description": "A declarative, efficient, and flexible JavaScript library for building user interfaces",
      "repoUrl": "https://github.com/facebook/react",
      "category": "library-framework",
      "tags": ["javascript", "react", "ui", "frontend"],
      "languages": {
        "JavaScript": 95.2,
        "TypeScript": 3.1,
        "HTML": 1.7
      },
      "aiAnalysis": {
        "technologies": {
          "frameworks": ["react"],
          "tools": ["jest", "babel", "rollup"],
          "languages": [
            {"name": "JavaScript", "percentage": 95.2}
          ]
        },
        "category": {
          "primary": "library-framework",
          "confidence": 0.98
        },
        "complexity": "enterprise",
        "keyFeatures": [
          "Virtual DOM implementation",
          "Component-based architecture",
          "Hooks system",
          "Server-side rendering support"
        ]
      }
    }
  ]
}
```

## Step 6: Explore Advanced Features

### Search and Filter Projects

```bash
# Search for React projects
curl -X GET "https://api.gitsink.com/projects?q=react&category=library-framework" \
  -H "x-api-key: gsk_your_api_key_here"

# Get only featured projects
curl -X GET "https://api.gitsink.com/projects?featured=true" \
  -H "x-api-key: gsk_your_api_key_here"
```

### Sync All Your Repositories

```bash
curl -X POST https://api.gitsink.com/projects/sync-all \
  -H "x-api-key: gsk_your_api_key_here"
```

### Trigger AI Re-analysis

```bash
curl -X POST https://api.gitsink.com/projects/proj_react_123/enrich \
  -H "x-api-key: gsk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

## Common Use Cases

### 1. Portfolio Website Integration

```javascript
// Fetch your featured projects for a portfolio site
async function getFeaturedProjects() {
  const response = await fetch('https://api.gitsink.com/projects?featured=true&published=true', {
    headers: {
      'x-api-key': process.env.GITSINK_API_KEY
    }
  });
  
  const result = await response.json();
  return result.data;
}

// Use in your React component
function Portfolio() {
  const [projects, setProjects] = useState([]);
  
  useEffect(() => {
    getFeaturedProjects().then(setProjects);
  }, []);
  
  return (
    <div className="portfolio">
      {projects.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
```

### 2. Developer Dashboard

```python
import requests
import os

class GitSinkDashboard:
    def __init__(self):
        self.api_key = os.getenv('GITSINK_API_KEY')
        self.base_url = 'https://api.gitsink.com'
    
    def get_project_stats(self):
        response = requests.get(
            f'{self.base_url}/projects',
            headers={'x-api-key': self.api_key}
        )
        projects = response.json()['data']
        
        stats = {
            'total_projects': len(projects),
            'languages': {},
            'categories': {}
        }
        
        for project in projects:
            # Count languages
            for lang, percentage in project.get('languages', {}).items():
                stats['languages'][lang] = stats['languages'].get(lang, 0) + 1
            
            # Count categories
            category = project.get('category', 'other')
            stats['categories'][category] = stats['categories'].get(category, 0) + 1
        
        return stats

# Usage
dashboard = GitSinkDashboard()
stats = dashboard.get_project_stats()
print(f"Total projects: {stats['total_projects']}")
print(f"Top languages: {sorted(stats['languages'].items(), key=lambda x: x[1], reverse=True)[:5]}")
```

### 3. Automated Repository Monitoring

```bash
#!/bin/bash

# Script to sync all repositories daily
API_KEY="gsk_your_api_key_here"
BASE_URL="https://api.gitsink.com"

echo "Starting daily repository sync..."

# Sync all repositories
RESPONSE=$(curl -s -X POST "$BASE_URL/projects/sync-all" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json")

JOB_ID=$(echo $RESPONSE | jq -r '.data.jobId')
echo "Sync job started: $JOB_ID"

# Monitor progress
while true; do
  STATUS=$(curl -s -X GET "$BASE_URL/projects/sync/$JOB_ID/status" \
    -H "x-api-key: $API_KEY" | jq -r '.data.status')
  
  if [ "$STATUS" = "completed" ]; then
    echo "Sync completed successfully!"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Sync failed!"
    exit 1
  else
    echo "Sync in progress... ($STATUS)"
    sleep 30
  fi
done

echo "Daily sync completed at $(date)"
```

## Next Steps

### 1. Set Up Webhooks
Configure webhooks in your repositories for real-time synchronization:
- [GitHub Webhooks Guide](./webhooks-guide.md#github)
- [GitLab Webhooks Guide](./webhooks-guide.md#gitlab)
- [Bitbucket Webhooks Guide](./webhooks-guide.md#bitbucket)

### 2. Customize with Portfolio.md
Add custom metadata to your repositories:
```markdown
---
title: "My Amazing Project"
description: "A detailed description of what this project does"
category: "web-application"
tags: ["react", "typescript", "nodejs"]
featured: true
demo: "https://my-project.demo.com"
---

# My Amazing Project
...
```

### 3. Explore GraphQL API
For more flexible data queries:
```graphql
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
            frameworks
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
```

### 4. Build Integrations
- Create a portfolio website
- Build a developer dashboard
- Integrate with your CI/CD pipeline
- Create automated reports

## Troubleshooting

### Common Issues

**API Key Not Working**
```bash
# Verify your API key
curl -X GET https://api.gitsink.com/auth/profile \
  -H "x-api-key: gsk_your_api_key_here"
```

**Repository Not Syncing**
- Check if repository is public or you have access
- Verify the repository URL format
- Ensure you're not hitting rate limits

**Missing AI Analysis**
- Large repositories take longer to process
- Try triggering manual enrichment
- Check if the repository has sufficient code content

### Getting Help

- **Documentation**: https://docs.gitsink.com
- **API Reference**: https://api.gitsink.com/api-docs
- **Support**: support@gitsink.com
- **Status Page**: https://status.gitsink.com

## What's Next?

You're now ready to start building with GitSink! Here are some ideas:

1. **Portfolio Website**: Showcase your projects automatically
2. **Developer Dashboard**: Track your coding activity and growth
3. **Team Analytics**: Monitor team repository health and activity
4. **CI/CD Integration**: Automate project documentation updates
5. **Content Generation**: Use AI insights for blog posts and documentation

Happy coding! 🚀