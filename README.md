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
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Caddy (auto TLS support)
- **Monitoring**: Prometheus + Grafana
- **Testing**: Artillery, K9

---

## ⚙️ Getting Started

### 1. Clone & Setup

```bash
git clone https://github.com/enochthedev/gitsink-api.git
cd gitsink-api
cp .env.example .env
```

### 2. .env Config

``` dotenv
PORT=3000
DOMAIN=gitsink.localhost
NODE_ENV=development

DATABASE_URL=postgresql://user:pass@postgres:5432/gitsink
REDIS_URL=redis://redis:6379

GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

### 🐳 Run with Docker

```bash
docker-compose up --build
```

Available services:

| Service | URL |
| ------- | --- |
| API | {$DOMAIN} |
| Swagger UI | {$DOMAIN}/api-docs |
| Grafana | {$DOMAIN}:3001 |
| Redis | {$DOMAIN}:6379 |
| Prometheus | {$DOMAIN}:9090 |

### 🌐 Access Swagger UI

Visit [{$DOMAIN}/api-docs]({$DOMAIN}/api-docs) to explore the API documentation.

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

- **Unit Tests**: Run with `npm run test`
- **E2E Tests**: Run with `npm run test:e2e`
- **CI/CD**: Integrate with GitHub Actions or Railway for automated testing and deployment
- **Scripts**: Add custom scripts in `/scripts` for seeding, smoke tests, etc.
- **Test Coverage**: Use `npm run test:cov` to generate coverage reports
- **Linting**: Ensure code quality with `npm run lint` and `npm run lint:fix`
- **Prettier**: Format code with `npm run format` and `npm run format:check`
- **Commit Hooks**: Use Husky for pre-commit checks to ensure code quality
- **ESLint**: Enforce coding standards with ESLint rules
- **Commitlint**: Enforce conventional commit messages
- **Husky**: Set up Git hooks for linting and formatting checks
- **Commitizen**: Use Commitizen for standardized commit messages
- **Changelog**: Maintain a changelog with `standard-version` for versioning
- **GitHub Actions**: Set up workflows for CI/CD, including linting, testing, and deployment

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
