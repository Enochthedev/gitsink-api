# Authentication Guide

GitSink provides multiple authentication methods to suit different use cases. This guide covers all available authentication options with detailed examples.

## Authentication Methods Overview

| Method | Use Case | Security Level | Expiration |
|--------|----------|----------------|------------|
| **API Keys** | Programmatic access, integrations | High | Never (unless revoked) |
| **JWT Tokens** | Web applications, mobile apps | High | 15 minutes (access), 7 days (refresh) |
| **Magic Links** | Passwordless authentication | High | 15 minutes |
| **OAuth** | Third-party integrations | High | Platform-dependent |

## 1. API Key Authentication

API keys are ideal for server-to-server communication and long-running integrations.

### Getting an API Key

#### Option 1: During Signup
```bash
curl -X POST https://api.gitsink.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "developer@example.com",
    "username": "developer123",
    "password": "SecurePassword123!"
  }'
```

**Response:**
```json
{
  "message": "User created successfully",
  "user": {
    "id": "user_abc123",
    "email": "developer@example.com",
    "username": "developer123",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "apiKey": "gsk_1234567890abcdef..."
}
```

#### Option 2: Regenerate Existing Key
```bash
curl -X POST https://api.gitsink.com/auth/api-key/regenerate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Security rotation"
  }'
```

### Using API Keys

Include the API key in the `x-api-key` header:

```bash
curl -X GET https://api.gitsink.com/projects \
  -H "x-api-key: gsk_1234567890abcdef..."
```

### API Key Best Practices

- **Store Securely**: Never commit API keys to version control
- **Rotate Regularly**: Regenerate keys periodically for security
- **Use Environment Variables**: Store keys in environment variables
- **Monitor Usage**: Track API key usage through the dashboard
- **Revoke When Needed**: Immediately revoke compromised keys

```bash
# Revoke an API key
curl -X POST https://api.gitsink.com/auth/api-key/revoke \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Security breach"
  }'
```

## 2. JWT Token Authentication

JWT tokens are perfect for web applications and mobile apps with user sessions.

### Obtaining JWT Tokens

#### Password-based Login
```bash
curl -X POST https://api.gitsink.com/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "user": {
    "id": "user_abc123",
    "email": "user@example.com",
    "username": "user123",
    "hasApiKey": true
  }
}
```

### Using JWT Tokens

Include the access token in the `Authorization` header:

```bash
curl -X GET https://api.gitsink.com/auth/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Token Refresh

When the access token expires, use the refresh token to get a new one:

```bash
curl -X POST https://api.gitsink.com/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

### Token Management

#### Logout (Revoke Single Token)
```bash
curl -X POST https://api.gitsink.com/auth/token/revoke \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "reason": "User logout"
  }'
```

#### Logout from All Devices
```bash
curl -X POST https://api.gitsink.com/auth/token/revoke-all \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Security precaution"
  }'
```

## 3. Magic Link Authentication

Magic links provide passwordless authentication via email.

### Sending a Magic Link

```bash
curl -X POST https://api.gitsink.com/auth/magic-link/send \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

**Response:**
```json
{
  "message": "If an account with this email exists, a magic link has been sent"
}
```

### Validating a Magic Link

When the user clicks the magic link, extract the token and validate it:

```bash
curl -X POST https://api.gitsink.com/auth/magic-link/validate \
  -H "Content-Type: application/json" \
  -d '{
    "token": "ml_1234567890abcdef..."
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "user": {
    "id": "user_abc123",
    "email": "user@example.com",
    "username": "user123"
  }
}
```

## 4. OAuth Integration

### GitHub OAuth

#### Step 1: Redirect to GitHub
```
https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&scope=repo,user:email&redirect_uri=YOUR_CALLBACK_URL
```

#### Step 2: Handle Callback
After user authorization, GitHub redirects with a code:
```
https://your-app.com/callback?code=AUTHORIZATION_CODE
```

#### Step 3: Connect GitHub Account
```bash
curl -X POST https://api.gitsink.com/auth/github/connect \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "AUTHORIZATION_CODE"
  }'
```

## Error Handling

All authentication endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Invalid credentials",
  "statusCode": 401,
  "error": "UNAUTHORIZED",
  "timestamp": "2024-01-15T10:30:00Z",
  "path": "/auth/signin"
}
```

### Common Error Codes

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request data |
| 401 | `UNAUTHORIZED` | Invalid credentials |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

## Rate Limiting

Authentication endpoints have specific rate limits:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/signup` | 5 requests | 1 minute |
| `/auth/signin` | 10 requests | 1 minute |
| `/auth/magic-link/send` | 3 requests | 5 minutes |
| `/auth/token/refresh` | 10 requests | 5 minutes |
| `/auth/api-key/regenerate` | 3 requests | 5 minutes |

## Security Best Practices

### For API Keys
- Use HTTPS only
- Store in environment variables
- Rotate regularly
- Monitor usage
- Revoke immediately if compromised

### For JWT Tokens
- Store securely (httpOnly cookies for web)
- Implement proper refresh logic
- Handle expiration gracefully
- Logout on security events

### For Magic Links
- Use HTTPS only
- Implement proper email validation
- Handle expired tokens gracefully
- Rate limit requests

## Integration Examples

### JavaScript/Node.js
```javascript
class GitSinkClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.gitsink.com';
  }

  async makeRequest(endpoint, options = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  }

  async getProjects() {
    return this.makeRequest('/projects');
  }
}

// Usage
const client = new GitSinkClient(process.env.GITSINK_API_KEY);
const projects = await client.getProjects();
```

### Python
```python
import requests
import os

class GitSinkClient:
    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv('GITSINK_API_KEY')
        self.base_url = 'https://api.gitsink.com'
        self.session = requests.Session()
        self.session.headers.update({
            'x-api-key': self.api_key,
            'Content-Type': 'application/json'
        })

    def get_projects(self):
        response = self.session.get(f'{self.base_url}/projects')
        response.raise_for_status()
        return response.json()

# Usage
client = GitSinkClient()
projects = client.get_projects()
```

### cURL Scripts
```bash
#!/bin/bash

# Set your API key
API_KEY="gsk_your_api_key_here"
BASE_URL="https://api.gitsink.com"

# Function to make authenticated requests
gitsink_api() {
    curl -H "x-api-key: $API_KEY" \
         -H "Content-Type: application/json" \
         "$BASE_URL$1" \
         "${@:2}"
}

# Get all projects
gitsink_api "/projects"

# Sync a repository
gitsink_api "/projects/sync" \
    -X POST \
    -d '{"repoUrl": "https://github.com/user/repo"}'
```

## Troubleshooting

### Common Issues

1. **Invalid API Key**
   - Verify the key is correct
   - Check if the key has been revoked
   - Ensure proper header format

2. **Token Expired**
   - Use refresh token to get new access token
   - Implement automatic token refresh

3. **Rate Limit Exceeded**
   - Implement exponential backoff
   - Reduce request frequency
   - Use caching where appropriate

4. **Magic Link Not Working**
   - Check email spam folder
   - Verify token hasn't expired
   - Ensure proper URL encoding

### Getting Help

- **Documentation**: https://docs.gitsink.com
- **Support**: support@gitsink.com
- **Status Page**: https://status.gitsink.com
- **GitHub Issues**: https://github.com/gitsink/api/issues