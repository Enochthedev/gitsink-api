# ============================================
# Build stage
# ============================================
FROM node:20.18.1-alpine3.20 AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Copy Prisma schema for generation
COPY prisma ./prisma

# Install all dependencies (including dev dependencies)
RUN npm ci --include=dev

# Copy source code (only what's needed for build)
COPY src ./src
COPY scripts ./scripts
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY eslint.config.mjs ./

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# ============================================
# Production dependencies stage
# ============================================
FROM node:20.18.1-alpine3.20 AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma

# Install only production dependencies
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Generate Prisma client for production
RUN npx prisma generate

# ============================================
# Production stage
# ============================================
FROM node:20.18.1-alpine3.20 AS production

# Install dumb-init and wget for proper signal handling and health checks
RUN apk add --no-cache dumb-init wget

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/package*.json ./

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy Prisma files (schema and generated client)
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Switch to non-root user
USER nodejs

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check using wget (matching docker-compose health check)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main"]