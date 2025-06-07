# Using the GitSink API

This guide explains how a developer interacts with the GitSink API from sign up through daily usage. It also provides an overview of how the code base is organised.

## 1. Sign up and obtain an API key

User accounts are created via the `signup` GraphQL mutation. Provide an email and the API responds with a newly generated key:

```graphql
mutation {
  signup(email: "user@example.com") {
    user { id email }
    apiKey
  }
}
```

`AuthService.signup` generates a random 32 byte key, hashes it with bcrypt and stores it in the `User` table. The plain key is returned once so store it securely.

Additional mutations allow regenerating or revoking the key:

```graphql
mutation { regenerateApiKey(userId: "<id>") { apiKey } }
mutation { revokeApiKey(userId: "<id>") { id } }
```

## 2. Linking a GitHub account

Repositories are synchronised from GitHub. You can connect an account in two ways:

1. **OAuth redirect** – visit `/auth/github` which triggers Passport's GitHub strategy. After login GitHub redirects back to `/auth/github/callback`, `AuthService` stores the GitHub id and access token and finally redirects the user.
2. **GraphQL flow** – exchange a GitHub OAuth code using `githubOAuth(userId, code)` or manually supply credentials via `connectGitHub(userId, githubId, githubToken)`.

Tokens are optionally encrypted using `TOKEN_ENCRYPTION_KEY` before being persisted.

## 3. Authenticating API requests

All REST endpoints and GraphQL operations require the API key. Pass it using the `x-api-key` header or a `Bearer` token. `ApiKeyGuard` verifies the key and sets `req.user` for downstream handlers.

Example REST call:

```bash
curl -H "x-api-key: <api key>" http://localhost:3000/projects
```

## 4. Syncing repositories and fetching projects

`ProjectsService` communicates with GitHub to fetch repository data and parse any `Portfolio.md` file it finds. Useful endpoints/mutations include:

* `POST /projects/sync` / `syncProject` – sync a single repository.
* `POST /projects/sync-all` / `syncAllProjects` – sync every repo linked to the user.
* `GET /projects` / `projects` – list all stored projects.
* `GET /projects/:repoUrl` / `project(repoUrl)` – fetch details for one repo.

A GitHub webhook endpoint (`POST /webhook/github`) can trigger automatic syncs when repositories push.

## 5. Background syncs

`ProjectsScheduler` runs a daily cron job to synchronise all repositories for every user. It iterates over users in the database and calls `syncAllReposForUser`.

## 6. Code base architecture

The project is built with [NestJS](https://nestjs.com) and uses Prisma for PostgreSQL access. Key modules include:

### `AuthModule`
* Handles user creation, API key management and GitHub OAuth.
* `ApiKeyGuard` protects routes.
* `GithubStrategy` integrates with Passport for OAuth flows.

### `ProjectsModule`
* Exposes REST controllers and GraphQL resolvers for project operations.
* `ProjectsService` fetches repository data from GitHub and parses markdown using `ParserService`.
* `GitHubWebhookController` receives webhook events.
* Includes a daily `ProjectsScheduler` cron job.

### `ParserModule`
* Provides `ParserService` which validates `Portfolio.md` files using `zod` schemas (`PortfolioMetadataSchema`).

### `PrismaModule`
* Wraps Prisma client for database interactions (`PrismaService`).

`AppModule` wires everything together and configures GraphQL, caching (Redis), and global guards. The `main.ts` bootstrap file also sets up Swagger docs, Helmet security and rate limiting.

### Data model

The Prisma schema defines two models:

* `User` – stores email, optional GitHub details and the hashed API key.
* `Project` – contains parsed metadata, GitHub metadata and sync timestamps. Each project belongs to a user.

## 7. Running locally

1. Copy `.env.example` to `.env` and provide database, Redis and GitHub credentials.
2. Install dependencies and start the server:

```bash
npm install
npm run start:dev
```

GraphQL is served at `/graphql` and Swagger REST docs at `/docs`.

---

This document should give you an end‑to‑end picture of using the GitSink API and how the underlying modules fit together.
