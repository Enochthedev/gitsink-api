# Gitsink API Reference

## Quick Reference

**Base URL**: `https://api.gitsink.com` | **Version**: v1.0

## 🔐 Authentication

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/auth/signup` | POST | Register new user | ✅ Active |
| `/auth/signin` | POST | Sign in with credentials | ✅ Active |
| `/auth/magic-link/send` | POST | Send passwordless login link | ✅ Active |
| `/auth/magic-link/validate` | POST | Validate magic link token | ✅ Active |
| `/auth/token/refresh` | POST | Refresh access token | ✅ Active |
| `/auth/api-key/regenerate` | POST | Generate new API key | ✅ Active |
| `/auth/github/connect` | POST | Connect GitHub account | ✅ Active |
| `/auth/profile` | GET | Get user profile | ✅ Active |

## 📁 Projects

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/projects` | GET | List all user projects | ✅ Active |
| `/projects/:repoUrl` | GET | Get specific project | ✅ Active |
| `/projects/sync` | POST | Sync single repository | ✅ Active |
| `/projects/sync-all` | POST | Sync all repositories | ✅ Active |

## 🤖 AI Enrichment

| Service | Description | Status | API Access |
|---------|-------------|--------|------------|
| **Technology Detection** | Detect languages, frameworks, tools | ✅ Active | 🔒 Internal |
| **Description Generation** | AI-powered project descriptions | ✅ Active | 🔒 Internal |
| **Project Categorization** | Categorize projects automatically | ✅ Active | 🔒 Internal |
| **Comprehensive Analysis** | Full repository analysis | ✅ Active | 🔒 Internal |

### AI Analysis Capabilities
- **50+ Programming Languages** with usage percentages
- **Framework Detection** across web, mobile, backend, ML, game
- **15+ Project Categories** with confidence scoring
- **Quality Validation** for AI-generated content
- **Fallback Mechanisms** for reliable results

## 🔗 Webhooks

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/webhook/github` | POST | GitHub repository events | ✅ Active |
| `/webhook/bitbucket` | POST | Bitbucket repository events | ✅ Active |
| `/webhook/gitlab` | POST | GitLab repository events | ✅ Active |

## 🏥 System

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/health` | GET | System health check | ✅ Active |
| `/metrics` | GET | Prometheus metrics | ✅ Active |
| `/waitlist` | POST | Join product waitlist | ✅ Active |

## 📊 GraphQL

| Type | Description | Status |
|------|-------------|--------|
| **Queries** | projects, filteredProjects, project | ✅ Active |
| **Mutations** | syncProject, syncAllProjects, signup | ✅ Active |
| **Playground** | Available at `/graphql` | ✅ Active |

## 🔑 Authentication Methods

| Method | Header | Usage | Status |
|--------|--------|-------|--------|
| **JWT Token** | `Authorization: Bearer <token>` | User sessions | ✅ Active |
| **API Key** | `x-api-key: <key>` | Programmatic access | ✅ Active |
| **Magic Link** | Email-based | Passwordless login | ✅ Active |

## 📈 Rate Limits

| Tier | Limit | Window | Applied To |
|------|-------|--------|------------|
| **Short** | 3 requests | 1 second | All endpoints |
| **Medium** | 20 requests | 10 seconds | All endpoints |
| **Long** | 100 requests | 1 minute | All endpoints |
| **Custom** | Varies | Varies | Auth endpoints |

## 🗄️ Data Models

### Project
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "repoUrl": "string",
  "category": "string",
  "tags": ["string"],
  "languages": {"JavaScript": 1024},
  "featured": boolean,
  "published": boolean,
  "aiAnalysis": "AIAnalysisResult"
}
```

### AI Analysis Result
```json
{
  "description": "string",
  "technologies": {
    "languages": [{"name": "JavaScript", "percentage": 75.5}],
    "frameworks": [{"name": "react", "confidence": 0.9}],
    "databases": ["postgresql"],
    "tools": ["docker", "jest"]
  },
  "category": {
    "primary": "web-application",
    "secondary": ["frontend"],
    "confidence": 0.85,
    "tags": ["react", "javascript"]
  },
  "complexity": "moderate",
  "confidence": 0.82
}
```

## 🚀 Quick Start

### 1. Register & Get API Key
```bash
# Register
curl -X POST https://api.gitsink.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "pass", "username": "user"}'

# Response includes apiKey
```

### 2. Sync Repository
```bash
curl -X POST https://api.gitsink.com/projects/sync \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/user/repo"}'
```

### 3. Get Projects with AI Analysis
```bash
curl -X GET https://api.gitsink.com/projects \
  -H "x-api-key: YOUR_API_KEY"
```

## 🔄 Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| `200` | OK | Request successful |
| `201` | Created | Resource created |
| `400` | Bad Request | Invalid request data |
| `401` | Unauthorized | Authentication required |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource not found |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server error |

## 📝 Recent Updates

### ✅ Completed (Latest)
- **AI-Powered Project Enrichment System** - Full implementation
  - Technology detection with 50+ languages
  - AI-powered description generation
  - Project categorization with 15+ categories
  - Comprehensive analysis pipeline
- **Enhanced Authentication** - JWT, API keys, magic links
- **Project Management** - Sync, filtering, metadata
- **Multi-platform Support** - GitHub, GitLab, Bitbucket webhooks

### 🚧 In Development
- Direct AI enrichment API endpoints
- Public developer profiles
- Advanced project analytics
- Team collaboration features

### 📋 Planned
- Real-time notifications
- Plugin system
- Advanced search and filtering
- Performance analytics dashboard

---

**Last Updated**: 2024-01-15  
**Next Update**: After each major task completion

*This document is automatically updated after each development task to reflect the current API capabilities and status.*