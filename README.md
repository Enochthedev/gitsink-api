# GitSink API

GitSink API is a NestJS service for synchronising GitHub repositories and storing structured project data. It exposes both REST and GraphQL endpoints that allow developers to manage a portfolio of repositories.

## Features

- GitHub OAuth login and API key authentication
- Parses a `Portfolio.md` file from each repository using Zod schemas
- Daily background syncs and optional GitHub webhooks
- REST API documented with Swagger and a GraphQL schema served at `/graphql`
- PostgreSQL via Prisma and Redis caching

## Project setup

1. Copy `.env.example` to `.env` and fill in your database, GitHub and JWT details.
2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run start:dev
```

Swagger docs are available at `http://localhost:3000/docs` and GraphQL Playground at `http://localhost:3000/graphql` when `NODE_ENV=development`.

## Environment variables

Refer to `.env.example` for all options. Important variables include `DATABASE_URL`, `GITHUB_PERSONAL_TOKEN`, `REDIS_URL`, `JWT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY`. Additional values like `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` and `CORS_ORIGIN` configure the mailer and CORS support.

## Running tests

```bash
npm run test        # unit tests
npm run test:e2e    # e2e tests
npm run test:cov    # coverage report
```

## Prisma helpers

```bash
npm run prisma:generate  # generate Prisma client
npm run prisma:migrate   # run migrations
npm run prisma:seed      # seed the database
```

## Key API routes

- `GET /projects` – list projects for the authenticated user
- `GET /projects/:repoUrl` – fetch a project by repository URL
- `POST /projects/sync` – sync a single GitHub repository
- `POST /projects/sync-all` – sync all repositories for the user
- `POST /webhook/github` – webhook endpoint for GitHub events

See [docs/endpoints.md](docs/endpoints.md) and [docs/user-flow.md](docs/user-flow.md) for a full walkthrough.

## Markdown validation

Validate a `Portfolio.md` file using the provided script:

```bash
npm run validate-md docs/portfolio.md
```

## License

This project is provided without a license (UNLICENSED).
