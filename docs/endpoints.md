# API Endpoints

This project exposes both REST and GraphQL APIs. All REST endpoints require an API key provided via the `x-api-key` HTTP header.

## REST Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | Returns a parsed sample `Portfolio.md` document. |
| GET | `/projects` | List projects for the authenticated user. |
| GET | `/projects/:repoUrl` | Fetch a single project by repository URL. |
| POST | `/projects/sync` | Sync a single GitHub repository. Body parameters: `repoUrl` and optional `branch`. |
| POST | `/projects/sync-all` | Sync all GitHub repositories linked to the user. |
| POST | `/webhook/github` | GitHub webhook endpoint used to trigger project syncs. |
| GET | `/auth/github` | Initiate GitHub OAuth login. |
| GET | `/auth/github/callback` | OAuth callback that links the GitHub account. |

## GraphQL Operations

GraphQL is served at `/graphql`. The following queries and mutations are available.

### Queries
- `ping`: returns `"pong"` for health checks.
- `projects`: list projects for the authenticated user.
- `filteredProjects(filter)`: filter projects by tag, category or featured flag.
- `project(repoUrl)`: fetch a project by repository URL.

### Mutations
- `syncProject(input)`: sync a single repository.
- `syncAllProjects`: sync all repositories for the user.
- `signup(email)`: create a new user and API key.
- `connectGitHub(userId, githubId, githubToken)`: link a GitHub account.
- `regenerateApiKey(userId)`: create a new API key.
- `githubOAuth(userId, code)`: exchange an OAuth code for a GitHub account link.
- `revokeApiKey(userId)`: remove the user's API key.

