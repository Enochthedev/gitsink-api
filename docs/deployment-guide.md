# GitSink Deployment Guide

This guide covers the deployment process for GitSink using the enhanced CI/CD pipeline and Docker configurations.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Deployment Process](#deployment-process)
5. [Monitoring and Alerting](#monitoring-and-alerting)
6. [Rollback Procedures](#rollback-procedures)
7. [Troubleshooting](#troubleshooting)

## Overview

GitSink uses a comprehensive CI/CD pipeline with the following features:

- **Multi-environment support**: Development, Staging, Production
- **Automated testing**: Unit, Integration, E2E, Security, Performance
- **Security scanning**: Code analysis, dependency scanning, container scanning
- **Automated deployment**: Zero-downtime deployments with health checks
- **Rollback capabilities**: Automated rollback on failure with manual triggers
- **Monitoring**: Real-time health monitoring and alerting

## Prerequisites

### Required Tools

- Docker and Docker Compose
- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Git

### Required Secrets

Configure the following secrets in your GitHub repository:

#### Production Secrets
```bash
POSTGRES_PASSWORD=<secure-production-password>
JWT_SECRET=<secure-jwt-secret>
TOKEN_ENCRYPTION_KEY=<secure-encryption-key>
GITHUB_PERSONAL_TOKEN=<github-token>
GITHUB_CLIENT_ID=<github-oauth-client-id>
GITHUB_CLIENT_SECRET=<github-oauth-client-secret>
SMTP_HOST=<email-smtp-host>
SMTP_USER=<email-smtp-user>
SMTP_PASS=<email-smtp-password>
GRAFANA_PASSWORD=<grafana-admin-password>
```

#### Monitoring and Alerting
```bash
SLACK_WEBHOOK_URL=<slack-webhook-for-alerts>
PAGERDUTY_INTEGRATION_KEY=<pagerduty-integration-key>
PRODUCTION_APPROVERS=<comma-separated-github-usernames>
```

## Environment Setup

### Development Environment

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd gitsink-api
   ```

2. **Setup environment**:
   ```bash
   cp .env.example .env.development
   # Edit .env.development with your local settings
   ```

3. **Start development environment**:
   ```bash
   npm run docker:deploy:dev
   ```

4. **Verify deployment**:
   ```bash
   npm run docker:health:dev
   ```

### Staging Environment

1. **Configure staging environment**:
   ```bash
   # Update .env.staging with staging-specific values
   ```

2. **Deploy to staging**:
   ```bash
   npm run docker:deploy:staging
   ```

3. **Monitor staging deployment**:
   ```bash
   npm run docker:health:staging
   ```

### Production Environment

Production deployments are handled automatically through the CI/CD pipeline when code is pushed to the `main` branch.

## Deployment Process

### Automatic Deployment (Recommended)

1. **Push to main branch**:
   ```bash
   git push origin main
   ```

2. **Monitor CI/CD pipeline**:
   - Check GitHub Actions for pipeline status
   - Review test results and security scans
   - Approve production deployment when prompted

3. **Verify deployment**:
   - Automatic health checks run post-deployment
   - Monitor alerts in Slack/PagerDuty
   - Check application metrics in Grafana

### Manual Deployment

For emergency deployments or specific version deployments:

1. **Trigger manual deployment**:
   - Go to GitHub Actions
   - Select "Enhanced CI/CD Pipeline"
   - Click "Run workflow"
   - Choose environment and options

2. **Monitor deployment progress**:
   - Watch workflow execution
   - Check deployment logs
   - Verify health checks

## Deployment Workflow

### CI/CD Pipeline Stages

1. **Code Quality & Security**
   - Format and lint checks
   - TypeScript compilation
   - Security vulnerability scanning
   - Dependency analysis

2. **Testing**
   - Unit tests (90% coverage target)
   - Integration tests (80% coverage target)
   - End-to-end tests
   - Security penetration tests
   - Performance tests (production only)

3. **Container Security**
   - Docker image vulnerability scanning
   - Container security analysis
   - SBOM generation

4. **Build & Push**
   - Multi-architecture Docker builds
   - Container registry push
   - Image tagging and versioning

5. **Deployment**
   - Environment-specific configuration
   - Zero-downtime deployment
   - Health check verification
   - Smoke tests

6. **Post-Deployment**
   - Extended monitoring
   - Performance verification
   - Alert configuration

### Deployment Environments

#### Staging Deployment
- **Trigger**: Push to `main` branch
- **Approval**: Automatic
- **URL**: https://staging-api.gitsink.com
- **Monitoring**: Basic health checks

#### Production Deployment
- **Trigger**: Successful staging deployment
- **Approval**: Manual (2 approvers required)
- **URL**: https://api.gitsink.com
- **Monitoring**: Full monitoring with PagerDuty alerts

## Monitoring and Alerting

### Health Monitoring

The system includes comprehensive health monitoring:

- **API Health**: Response time and availability
- **Database Health**: Connection and query performance
- **Redis Health**: Cache availability and performance
- **SSL Certificate**: Expiration monitoring
- **External Dependencies**: GitHub API, DNS resolution

### Monitoring Schedule

- **Production**: Every 5 minutes
- **Staging**: Every 15 minutes
- **Development**: On-demand

### Alert Levels

1. **Healthy**: All systems operational
2. **Warning**: Non-critical issues detected
3. **Critical**: Service degradation or failure

### Alert Channels

- **Slack**: `#alerts` (critical), `#dev-alerts` (warnings)
- **PagerDuty**: Critical production alerts only
- **GitHub Issues**: Automatic incident creation

### Monitoring Commands

```bash
# Check environment health
npm run docker:health:prod
npm run docker:health:staging
npm run docker:health:dev

# View container status
npm run docker:status:prod
npm run docker:status:staging
npm run docker:status:dev

# View logs
docker-compose -f docker-compose.prod.yml logs -f
docker-compose -f docker-compose.staging.yml logs -f
docker-compose -f docker-compose.dev.yml logs -f
```

## Rollback Procedures

### Automatic Rollback

The system automatically rolls back deployments if:
- Health checks fail after deployment
- Smoke tests fail
- Critical errors are detected

### Manual Rollback

#### Emergency Rollback (Production)

1. **Trigger rollback workflow**:
   - Go to GitHub Actions
   - Select "Automated Rollback"
   - Click "Run workflow"
   - Fill in rollback details:
     - Environment: `production`
     - Rollback type: `previous-version`
     - Reason: Brief description of issue

2. **Approval process**:
   - 2 approvers required for production
   - Automatic for staging

3. **Monitor rollback**:
   - Watch workflow progress
   - Verify health checks
   - Check application functionality

#### Rollback Types

1. **Previous Version**: Roll back to the last known good version
2. **Specific Version**: Roll back to a specific git tag/version
3. **Backup Restore**: Restore from data backup (includes database)

#### Rollback Commands

```bash
# Manual rollback using scripts
./scripts/docker-deploy.sh restore -e production -f
./scripts/docker-deploy.sh restore -e staging -f

# Create backup before changes
./scripts/docker-deploy.sh backup -e production
./scripts/docker-deploy.sh backup -e staging
```

### Post-Rollback Actions

1. **Verify system health**
2. **Check data integrity**
3. **Update incident documentation**
4. **Plan forward fix**
5. **Conduct post-mortem**

## Configuration Management

### Environment-Specific Configuration

Each environment has its own configuration files:

- `.env.development` - Development settings
- `.env.staging` - Staging settings  
- `.env.production` - Production settings

### Configuration Validation

The CI/CD pipeline automatically validates:
- Required environment variables
- URL formats and connectivity
- Security configurations
- Docker Compose syntax

### Configuration Deployment

Configuration changes are deployed automatically when:
- Configuration files are modified
- Changes are pushed to `main` branch
- Manual configuration deployment is triggered

## Security

### Security Scanning

The pipeline includes multiple security layers:

1. **Code Analysis**: CodeQL and Trivy scanning
2. **Dependency Scanning**: npm audit and dependency review
3. **Container Scanning**: Docker image vulnerability analysis
4. **Runtime Security**: OWASP ZAP baseline scanning
5. **Secret Scanning**: TruffleHog secret detection

### Security Best Practices

1. **Secrets Management**:
   - Use GitHub Secrets for sensitive data
   - Rotate secrets regularly
   - Never commit secrets to code

2. **Container Security**:
   - Use non-root users in containers
   - Minimal base images (Alpine Linux)
   - Regular security updates

3. **Network Security**:
   - HTTPS/TLS encryption
   - Security headers (HSTS, CSP, etc.)
   - Rate limiting and DDoS protection

4. **Access Control**:
   - Multi-factor authentication
   - Principle of least privilege
   - Regular access reviews

## Troubleshooting

### Common Issues

#### Deployment Failures

1. **Health Check Failures**:
   ```bash
   # Check container logs
   docker-compose -f docker-compose.prod.yml logs gitsink-api
   
   # Check health status
   ./scripts/docker-health-check.sh -e production -v
   ```

2. **Database Connection Issues**:
   ```bash
   # Check database status
   docker-compose -f docker-compose.prod.yml logs postgres
   
   # Test database connectivity
   docker exec gitsink-db-prod pg_isready -U gitsink_prod
   ```

3. **Redis Connection Issues**:
   ```bash
   # Check Redis status
   docker-compose -f docker-compose.prod.yml logs redis
   
   # Test Redis connectivity
   docker exec gitsink-redis-prod redis-cli ping
   ```

#### Performance Issues

1. **High Response Times**:
   - Check database query performance
   - Monitor Redis cache hit rates
   - Review application logs for bottlenecks

2. **Memory Issues**:
   - Monitor container resource usage
   - Check for memory leaks in application
   - Review Docker resource limits

3. **CPU Issues**:
   - Monitor CPU usage patterns
   - Check for infinite loops or heavy processing
   - Review queue processing efficiency

### Debugging Commands

```bash
# Container resource usage
docker stats

# Application logs
docker-compose -f docker-compose.prod.yml logs -f gitsink-api

# Database performance
docker exec gitsink-db-prod psql -U gitsink_prod -c "SELECT * FROM pg_stat_activity;"

# Redis performance
docker exec gitsink-redis-prod redis-cli info stats

# Network connectivity
docker exec gitsink-api-prod curl -f http://localhost:3000/health
```

### Emergency Contacts

- **On-Call Engineer**: Check PagerDuty rotation
- **DevOps Team**: Slack `#devops`
- **Security Team**: Slack `#security`
- **Management**: Escalation procedures in incident response plan

### Incident Response

1. **Immediate Response**:
   - Assess impact and severity
   - Implement immediate mitigation
   - Notify stakeholders

2. **Investigation**:
   - Gather logs and metrics
   - Identify root cause
   - Document findings

3. **Resolution**:
   - Implement permanent fix
   - Verify resolution
   - Update monitoring

4. **Post-Mortem**:
   - Conduct blameless post-mortem
   - Document lessons learned
   - Implement preventive measures

## Performance Optimization

### Database Optimization

1. **Query Performance**:
   - Use database indexes effectively
   - Optimize N+1 queries
   - Implement query caching

2. **Connection Management**:
   - Configure connection pooling
   - Monitor connection usage
   - Implement connection limits

### Caching Strategy

1. **Redis Caching**:
   - Cache frequently accessed data
   - Implement cache invalidation
   - Monitor cache hit rates

2. **Application Caching**:
   - Use in-memory caching for hot data
   - Implement cache warming strategies
   - Monitor memory usage

### Scaling Considerations

1. **Horizontal Scaling**:
   - Load balancer configuration
   - Session management
   - Database read replicas

2. **Vertical Scaling**:
   - Resource monitoring
   - Performance bottleneck identification
   - Capacity planning

## Maintenance

### Regular Maintenance Tasks

1. **Weekly**:
   - Review monitoring alerts
   - Check system performance metrics
   - Update security patches

2. **Monthly**:
   - Rotate secrets and certificates
   - Review and clean up logs
   - Update dependencies

3. **Quarterly**:
   - Conduct security audits
   - Review and update documentation
   - Capacity planning review

### Backup and Recovery

1. **Automated Backups**:
   - Daily database backups
   - Configuration backups before deployments
   - Retention policy: 30 days

2. **Recovery Testing**:
   - Monthly backup restoration tests
   - Disaster recovery drills
   - Documentation updates

## Support and Documentation

### Additional Resources

- [API Documentation](./api-reference.md)
- [System Architecture](./system-documentation.md)
- [Security Guidelines](./security-guidelines.md)
- [Performance Tuning](./performance-optimization.md)

### Getting Help

- **Documentation**: Check this guide and related docs
- **Slack**: `#gitsink-support` for general questions
- **GitHub Issues**: For bug reports and feature requests
- **Emergency**: Follow incident response procedures

---

*This deployment guide is maintained by the GitSink DevOps team. Last updated: $(date)*