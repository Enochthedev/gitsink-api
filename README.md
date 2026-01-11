# 🧠 Gitsink API

**Gitsink** is a modular, performance-optimized GitHub sync API developed by [Wave](https://github.com/enochthedev). It powers project enrichment, metadata extraction, and real-time syncing for dev dashboards, bots, and automation workflows.

---

## 🚀 Features

- 🔁 GitHub repo syncing via OAuth
- 🗂️ Enrichment using `Portfolio.md` and GitHub metadata
- 🔐 REST & GraphQL APIs with API key support
- 🩺 Healthcheck endpoints for container orchestration
- 📊 Monitoring with Prometheus & Grafana
- ⚙️ Docker-based deployment with Caddy proxy
- 📈 Artillery + K9 performance testing suite

---

## 🛠️ Stack

- **Backend**: NestJS + Prisma + TypeScript
- **Database**: PostgreSQL
- **Cache/Queue**: Redis
- **Secrets Management**: [Phase](https://phase.dev)
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Caddy (auto TLS support)
- **Monitoring**: Prometheus + Grafana + Sentry
- **Testing**: Jest, Artillery, K6

---

## ⚙️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker](https://www.docker.com/) & Docker Compose
- [Phase CLI](https://phase.dev) for secrets management

### 1. Clone & Install

```bash
git clone https://github.com/enochthedev/gitsink-api.git
cd gitsink-api
npm install
```

### 2. Install Phase CLI

```bash
# macOS
brew install phasehq/cli/phase

# Or via npm
npm install -g @phasehq/cli

# Login to Phase
phase auth
```

### 3. Configure Secrets in Phase

You'll need to set up the following secrets in Phase under your `Gitsink_API` app:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `DATABASE_URL` | PostgreSQL connection string | Docker provides: `postgresql://gitsink:password@postgres:5432/gitsink_dev` |
| `JWT_SECRET` | JWT signing key (32+ chars) | Generate: `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | Token encryption key (32+ chars) | Generate: `openssl rand -base64 32` |
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID | [GitHub Developer Settings](https://github.com/settings/developers) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret | Same as above |
| `GITHUB_CALLBACK_URL` | OAuth callback URL | `http://localhost:3000/auth/github/callback` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `PORT` | API port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `SENTRY_DSN` | Sentry error tracking (optional) | [Sentry.io](https://sentry.io) - Create Node.js project |

**Quick setup with Phase CLI:**

```bash
# List current secrets
phase secrets list --app Gitsink_API --env development

# Create a secret
printf "your_value" | phase secrets create SECRET_NAME --app Gitsink_API --env development

# Update a secret
printf "new_value" | phase secrets update SECRET_NAME --app Gitsink_API --env development
```

### 4. Start Infrastructure with Docker

```bash
# Start PostgreSQL and Redis
docker-compose -f docker-compose.dev.yml up -d postgres redis
```

### 5. Run Database Migrations

```bash
npm run phase:prisma:generate
npm run phase:prisma:migrate
```

### 6. Start the API

```bash
# Development with hot reload (recommended)
npm run phase:dev

# Or with debug mode
npm run phase:debug

# For production
npm run phase:prod
```

### 🐳 Run Everything with Docker

```bash
docker-compose -f docker-compose.dev.yml up --build
```

Available services:

| Service | URL |
| ------- | --- |
| API | http://localhost:3000 |
| Swagger UI | http://localhost:3000/api-docs |
| GraphQL Playground | http://localhost:3000/graphql |
| Redis Commander | http://localhost:8081 (with `--profile tools`) |
| pgAdmin | http://localhost:8080 (with `--profile tools`) |

### 🌐 Access Swagger UI

Visit [http://localhost:3000/api-docs](http://localhost:3000/api-docs) to explore the API documentation.

### 📈 Performance Testing

Artillery

```bash
npm run test:perf:artillery:{ModuleName}
```

### K9 (k6-compatible)

```bash
npm run test:perf:k6:{ModuleName}
```

Use results to analyze latency, throughput, and request bottlenecks.

### 🔍 Monitoring

- **Prometheus**: Scrapes metrics from the API and Redis
- **Grafana**: Pre-configured dashboards for API performance, Redis health, and more
- Useful dashboards: API Latency, Request Rate, DB/Redis health
- **Caddy**: Reverse proxy with automatic TLS for secure access

### 🧪 Testing & CI

**With Phase CLI (recommended):**

```bash
# Run unit tests
npm run phase:test

# Run E2E tests
npm run phase:test:e2e
```

**Without Phase (requires .env file):**

- **Unit Tests**: Run with `npm run test`
- **E2E Tests**: Run with `npm run test:e2e`
- **Test Coverage**: Use `npm run test:cov` to generate coverage reports

**Code Quality:**

- **Linting**: `npm run lint` and `npm run lint:fix`
- **Formatting**: `npm run format` and `npm run format:check`

**CI/CD**: Integrate with GitHub Actions for automated testing and deployment

### 👤 Author

Developed by Wave.
Built to help devs expose, sync, and enrich their GitHub project data with speed and clarity.

### 📜 License

This project is licensed under the **Business Source License 1.1 (BSL-1.1)**.

- ✅ You may **view the source code**.
- ❌ You **may not** use it for commercial purposes **until** the Change Date.
- 🔓 On the Change Date, this project will be automatically released under the **Apache 2.0** license.

**Change Date**: August 2, 2028  
**Licensor**: Enoch Omosebi (Wave)

For commercial licensing, contact: [wavedidwhat@gmail.com](mailto:wavedidwhat@gmail.com)

---
