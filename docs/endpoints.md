# API Endpoints

This project exposes both REST and GraphQL APIs. All REST endpoints require an API key provided via the `x-api-key` HTTP header.

## REST Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | Returns a parsed sample `Portfolio.md` document. |
| GET | `/projects` | List projects for the authenticated user. |
| GET | `/projects/:repoUrl` | Fetch a single project by repository URL. |
| POST | `/projects/sync` | Sync a single GitHub repository. |
| POST | `/projects/sync-all` | Sync all GitHub repositories linked to the user. |
| POST | `/webhook/github` | GitHub webhook endpoint used to trigger project syncs. |
| POST | `/auth/signup` | Create a user and API key. |
| POST | `/auth/login` | Exchange an email and password for a JWT. |
| POST | `/auth/forgot-password` | Request a password reset email. |
| POST | `/auth/reset-password` | Complete the password reset process. |
| GET | `/auth/github` | Initiate GitHub OAuth login. |
| GET | `/auth/github/callback` | OAuth callback that returns a JWT. |

### Request Bodies

#### `POST /projects/sync`

```
{
  "repoUrl": "https://github.com/user/repo",
  "branch": "main"
}
```

#### `POST /projects/sync-all`

No body required.

#### `POST /webhook/github`

```
{
  "repository": { "html_url": "https://github.com/user/repo" },
  "ref": "refs/heads/main"
}
```

#### `POST /auth/signup`

```
{
  "email": "user@example.com",
  "username": "user123",
  "password": "secret"
}
```

#### `POST /auth/login`

```
{
  "email": "user@example.com",
  "password": "secret"
}
```

#### `POST /auth/forgot-password`

```
{
  "email": "user@example.com"
}
```

#### `POST /auth/reset-password`

```
{
  "token": "<resetToken>",
  "password": "newPass"
}
```

### Example Responses

#### `GET /projects`

```json
[
  {
    "id": "1",
    "title": "Test Project",
    "repoUrl": "https://github.com/user/repo",
    "tags": ["demo"]
  }
]
```

#### `POST /projects/sync`

```json
{
  "enqueued": true
}
```

#### `POST /auth/signup`

```json
{
  "apiKey": "<newKey>"
}
```

#### `POST /auth/login`

```json
{
  "token": "<jwt>"
}
```

## GraphQL Operations

GraphQL is served at `/graphql`. The following queries and mutations are available.

### Queries
- `ping`: returns `"pong"` for health checks.
- `projects`: list projects for the authenticated user.
- `filteredProjects(filter)`: filter projects by tag, category or featured flag.
- `project(repoUrl)`: fetch a project by repository URL.

### Mutations
- `syncProject(input)`: enqueue a sync job for a repository.
- `syncAllProjects`: enqueue sync jobs for all repositories.
- `signup(email)`: create a new user and API key.
- `connectGitHub(userId, githubId, githubToken)`: link a GitHub account.
- `regenerateApiKey(userId)`: create a new API key.
- `githubOAuth(userId, code)`: exchange an OAuth code for a GitHub account link.
- `revokeApiKey(userId)`: remove the user's API key.

