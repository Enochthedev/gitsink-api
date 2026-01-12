#!/bin/bash
# Railway + Phase Deployment Script
# Usage: ./scripts/deploy-railway.sh [environment]
# Environments: development, staging, production

set -e

ENVIRONMENT=${1:-production}
APP_NAME="gitsink-api"

echo "🚀 Deploying $APP_NAME to Railway ($ENVIRONMENT)..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found. Install with: npm install -g @railway/cli${NC}"
    exit 1
fi

# Check if Phase CLI is installed
if ! command -v phase &> /dev/null; then
    echo -e "${YELLOW}⚠️  Phase CLI not found. Proceeding without Phase integration.${NC}"
    PHASE_AVAILABLE=false
else
    PHASE_AVAILABLE=true
fi

# Check if logged into Railway
if ! railway whoami &> /dev/null; then
    echo -e "${RED}❌ Not logged into Railway. Run: railway login${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Railway CLI authenticated${NC}"

# Sync Phase secrets to Railway (if Phase is available)
if [ "$PHASE_AVAILABLE" = true ]; then
    echo "📦 Syncing secrets from Phase..."
    
    # Check if Phase service token is set
    if [ -z "$PHASE_SERVICE_TOKEN" ]; then
        echo -e "${YELLOW}⚠️  PHASE_SERVICE_TOKEN not set. Using interactive mode.${NC}"
    fi
    
    # Export Phase secrets and set in Railway
    echo "Exporting Phase secrets for environment: $ENVIRONMENT"
    
    # Get secrets from Phase and set them in Railway
    phase secrets export --env "$ENVIRONMENT" --format dotenv 2>/dev/null | while IFS='=' read -r key value; do
        if [ -n "$key" ] && [ -n "$value" ]; then
            # Remove quotes if present
            value=$(echo "$value" | sed 's/^"//;s/"$//')
            echo "  Setting $key..."
            railway variables set "$key=$value" --environment "$ENVIRONMENT" 2>/dev/null || true
        fi
    done
    
    echo -e "${GREEN}✓ Secrets synced from Phase${NC}"
fi

# Set non-secret environment variables
echo "📝 Setting environment variables..."
railway variables set NODE_ENV="$ENVIRONMENT" --environment "$ENVIRONMENT" 2>/dev/null || true
railway variables set PORT=3000 --environment "$ENVIRONMENT" 2>/dev/null || true
railway variables set APP_NAME="GitSink" --environment "$ENVIRONMENT" 2>/dev/null || true
railway variables set ENABLE_HELMET=true --environment "$ENVIRONMENT" 2>/dev/null || true
railway variables set ENABLE_RATE_LIMIT=true --environment "$ENVIRONMENT" 2>/dev/null || true
railway variables set PROMETHEUS_ENABLED=true --environment "$ENVIRONMENT" 2>/dev/null || true

echo -e "${GREEN}✓ Environment variables set${NC}"

# Build and deploy
echo "🏗️  Building and deploying..."
railway up --environment "$ENVIRONMENT"

# Wait for deployment
echo "⏳ Waiting for deployment to complete..."
sleep 10

# Get deployment URL
DEPLOY_URL=$(railway status --json 2>/dev/null | grep -o '"url":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

if [ -n "$DEPLOY_URL" ]; then
    echo -e "${GREEN}✓ Deployment complete!${NC}"
    echo ""
    echo "🌐 Application URL: $DEPLOY_URL"
    echo "📊 Health Check: $DEPLOY_URL/health"
    echo "📡 GraphQL: $DEPLOY_URL/graphql"
    echo ""
    
    # Health check
    echo "🔍 Running health check..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOY_URL/health" || echo "000")
    
    if [ "$HTTP_STATUS" = "200" ]; then
        echo -e "${GREEN}✓ Health check passed (HTTP $HTTP_STATUS)${NC}"
    else
        echo -e "${YELLOW}⚠️  Health check returned HTTP $HTTP_STATUS (might still be starting)${NC}"
    fi
else
    echo -e "${GREEN}✓ Deployment submitted. Check Railway dashboard for status.${NC}"
fi

echo ""
echo "📋 Useful commands:"
echo "  railway logs           - View logs"
echo "  railway status         - Check status"
echo "  railway open           - Open in browser"
echo "  railway variables      - View variables"
echo ""
echo "🎉 Done!"
