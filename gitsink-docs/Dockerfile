# ============================================
# Build stage for Docusaurus
# ============================================
FROM node:20.18.1-alpine3.20 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the documentation site
RUN npm run build

# ============================================
# Production stage
# ============================================
FROM nginx:alpine AS production

# Copy built site to nginx
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration if needed
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]