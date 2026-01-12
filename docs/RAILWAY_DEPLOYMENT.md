# Railway Deployment with Phase Secrets Management

This guide covers deploying GitSink API to Railway with Phase for secrets management.

## Prerequisites

1. [Railway CLI](https://docs.railway.app/develop/cli) installed
2. [Phase CLI](https://phase.dev/docs/cli/overview) installed
3. Railway account and project created
4. Phase account and app created

## Setup

### 1. Install CLIs

```bash
# Railway CLI
npm install -g @railway/cli

# Phase CLI (macOS)
brew install phasehq/cli/phase

# Phase CLI (Linux/Other)
curl -fsSL https://get.phase.dev | bash
```

### 2. Authenticate

```bash
# Login to Railway
railway login

# Login to Phase
phase auth
```

### 3. Link Project

```bash
# Link to Railway project
railway link

# Initialize Phase (if not already done)
phase init
```

## Environment Configuration

### Phase Secrets Setup

1. **Create environments in Phase:**
   - `development`
   - `staging`
   - `production`

2. **Add secrets in Phase Console or CLI:**

```bash
# Set secrets for production environment
phase secrets set DATABASE_URL "postgresql://user:pass@host:5432/db" --env production
phase secrets set REDIS_URL "redis://host:6379" --env production
phase secrets set JWT_SECRET "your-32-char-secret-key-here-abc123" --env production
phase secrets set TOKEN_ENCRYPTION_KEY "another-32-char-key-here-xyz789" --env production
phase secrets set LOCAL_API_KEY "prod-api-key-generated-uuid" --env production
phase secrets set GITHUB_CLIENT_ID "your-github-oauth-client-id" --env production
phase secrets set GITHUB_CLIENT_SECRET "your-github-oauth-client-secret" --env production
phase secrets set OPENAI_API_KEY "sk-..." --env production
phase secrets set SENTRY_DSN "https://xxx@sentry.io/xxx" --env production
```

3. **List secrets to verify:**
```bash
phase secrets list --env production
```

### Railway Variables Setup

Railway needs these non-secret environment variables:

```bash
# Set via Railway CLI or dashboard
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set APP_NAME=GitSink
railway variables set APP_VERSION=1.0.0
railway variables set CORS_ORIGIN=https://gitsink.io,https://app.gitsink.io
railway variables set ENABLE_HELMET=true
railway variables set ENABLE_RATE_LIMIT=true
railway variables set PROMETHEUS_ENABLED=true
```

## Deployment Methods

### Method 1: Railway + Phase Integration (Recommended)

Railway supports Phase integration natively. Connect Phase to Railway:

1. Go to Railway Dashboard → Your Project → Settings → Integrations
2. Add Phase integration
3. Select your Phase app and environment
4. Secrets will be automatically synced

### Method 2: Manual Secret Injection

If you prefer manual management:

```bash
# Export Phase secrets to Railway
phase secrets export --env production --format dotenv | railway variables set

# Or set individually
railway variables set DATABASE_URL=$(phase secrets get DATABASE_URL --env production)
```

### Method 3: CI/CD with Phase Run

Use Phase to inject secrets during deployment:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Phase CLI
        run: curl -fsSL https://get.phase.dev | bash
      
      - name: Install Railway CLI
        run: npm install -g @railway/cli
      
      - name: Deploy with secrets
        env:
          PHASE_SERVICE_TOKEN: ${{ secrets.PHASE_SERVICE_TOKEN }}
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: |
          # Export Phase secrets to Railway
          phase secrets export --env production --format dotenv > .env.production
          railway up --environment production
```

## Deploy

### Deploy to Railway

```bash
# Deploy current branch
railway up

# Deploy specific environment
railway up --environment production

# View logs
railway logs

# Open deployed URL
railway open
```

### Verify Deployment

```bash
# Check health endpoint
curl https://your-app.railway.app/health

# Check GraphQL endpoint
curl -X POST https://your-app.railway.app/graphql \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"query": "{ ping }"}'
```

## Railway Services

The application requires these Railway services:

### 1. PostgreSQL Database
```bash
railway add postgresql
```

### 2. Redis
```bash
railway add redis
```

### 3. Application (gitsink-api)
Automatically deployed from your repository.

## Database Migrations

Run Prisma migrations on Railway:

```bash
# Run migrations
railway run npx prisma migrate deploy

# Generate Prisma client
railway run npx prisma generate
```

## Monitoring

### View Logs
```bash
railway logs --follow
```

### Metrics
- Prometheus metrics available at `/metrics`
- Connect to Grafana for dashboards

### Health Checks
- Health endpoint: `/health`
- GraphQL ping: `query { ping }`

## Troubleshooting

### Common Issues

1. **Database connection failed**
   - Verify `DATABASE_URL` is correctly set
   - Check Railway PostgreSQL service is running

2. **Redis connection failed**
   - Verify `REDIS_URL` is correctly set
   - Check Railway Redis service is running

3. **Build failed**
   - Check Dockerfile syntax
   - Verify all dependencies are in package.json

4. **Phase secrets not loading**
   - Verify Phase service token has correct permissions
   - Check environment name matches

### Debug Commands

```bash
# Check environment variables
railway variables

# Check service status
railway status

# SSH into container (if enabled)
railway shell
```

## Rollback

```bash
# List deployments
railway deployments

# Rollback to previous deployment
railway rollback
```

## Cost Optimization

- Use Railway's sleep mode for development environments
- Scale down replicas during low traffic
- Use Redis caching to reduce database load
