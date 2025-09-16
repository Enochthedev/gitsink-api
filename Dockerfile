# ============================================
# Build stage
# ============================================
FROM node:20.18.1-alpine3.20 AS builder

# Set working directory
WORKDIR /app

# Install build dependencies and security updates
RUN apk add --no-cache python3 make g++ && \
    apk upgrade --no-cache

# Copy package files first for better layer caching
COPY package*.json ./
COPY pnpm-lock.yaml* ./

# Copy Prisma schema for generation
COPY prisma ./prisma

# Install dependencies with npm ci for faster, reliable builds
RUN npm ci --include=dev --frozen-lockfile && \
    npm cache clean --force

# Copy source code (only what's needed for build)
COPY src ./src
COPY scripts ./scripts
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY eslint.config.mjs ./

# Generate Prisma client
RUN npx prisma generate

# Build the application with optimizations
RUN npm run build && \
    # Remove source maps in production
    find dist -name "*.map" -delete

# ============================================
# Production dependencies stage
# ============================================
FROM node:20.18.1-alpine3.20 AS deps

WORKDIR /app

# Install security updates
RUN apk upgrade --no-cache

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml* ./
COPY prisma ./prisma

# Install only production dependencies with optimizations
RUN npm ci --only=production --ignore-scripts --frozen-lockfile && \
    npm cache clean --force && \
    # Remove unnecessary files
    rm -rf /root/.npm /tmp/*

# Generate Prisma client for production
RUN npx prisma generate

# ============================================
# Production stage
# ============================================
FROM node:20.18.1-alpine3.20 AS production

# Install runtime dependencies and security updates
RUN apk add --no-cache dumb-init wget curl tini && \
    apk upgrade --no-cache && \
    # Remove package cache
    rm -rf /var/cache/apk/*

# Create non-root user with specific UID/GID for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Set working directory and ensure proper ownership
WORKDIR /app
RUN chown nodejs:nodejs /app

# Copy production dependencies with proper ownership
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/package*.json ./

# Copy built application with proper ownership
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy Prisma files (schema and generated client) with proper ownership
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Copy health check script with proper ownership
COPY --chown=nodejs:nodejs scripts/docker-health-check.sh ./scripts/docker-health-check.sh
RUN chmod +x ./scripts/docker-health-check.sh

# Create logs directory for application
RUN mkdir -p /app/logs && chown nodejs:nodejs /app/logs

# Switch to non-root user early for security
USER nodejs

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=1024" \
    NPM_CONFIG_CACHE=/tmp/.npm

# Enhanced health check with comprehensive validation
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
    CMD ./scripts/docker-health-check.sh --quick || exit 1

# Expose port
EXPOSE 3000

# Use tini as PID 1 for better signal handling
ENTRYPOINT ["tini", "--"]

# Start the application with proper signal handling
CMD ["node", "dist/main"]