# Test Automation and CI/CD Integration

This document describes the comprehensive test automation system implemented for the Gitsink API project.

## Overview

The test automation system provides:
- Automated test execution in CI/CD pipeline
- Multiple test environments (unit, integration, E2E, performance, security)
- Comprehensive test reporting and failure analysis
- Automated test data management
- Environment provisioning and teardown
- Coverage reporting and quality gates

## Test Types

### 1. Unit Tests
- **Purpose**: Test individual functions and methods in isolation
- **Location**: `src/**/*.spec.ts` (excluding integration/e2e/security)
- **Coverage Target**: 90% for critical modules, 80% for others
- **Timeout**: 10 seconds
- **Command**: `npm run test:unit`

### 2. Integration Tests
- **Purpose**: Test component interactions and external dependencies
- **Location**: `src/**/*.integration.spec.ts`
- **Coverage Target**: 80%
- **Timeout**: 30 seconds
- **Command**: `npm run test:integration`

### 3. End-to-End Tests
- **Purpose**: Test complete user workflows
- **Location**: `test/**/*.e2e-spec.ts`
- **Timeout**: 60 seconds
- **Command**: `npm run test:e2e`

### 4. Security Tests
- **Purpose**: Test for security vulnerabilities
- **Location**: `src/**/*.security.spec.ts`, `src/security/**/*.spec.ts`
- **Command**: `npm run test:security`

### 5. Performance Tests
- **Purpose**: Load testing and performance benchmarks
- **Location**: `performance/**/*.test.js`
- **Tool**: K6
- **Command**: `npm run test:perf:all`

## Test Environments

### Test Environment
- **Database**: PostgreSQL on port 5433
- **Redis**: Redis on port 6380
- **Purpose**: Unit and integration tests
- **Setup**: `npm run test:setup-env test`

### E2E Environment
- **Database**: PostgreSQL on port 5434
- **Redis**: Redis on port 6381
- **Purpose**: End-to-end tests
- **Setup**: `npm run test:setup-env e2e`

### Performance Environment
- **Database**: PostgreSQL on port 5435
- **Redis**: Redis on port 6382
- **Purpose**: Performance and load tests
- **Setup**: `npm run test:setup-env performance`

## CI/CD Pipeline

The CI/CD pipeline is defined in `.github/workflows/ci.yml` and includes:

### 1. Code Quality and Security Checks
- Format checking with Prettier
- Linting with ESLint
- Security audit with npm audit
- Build verification

### 2. Database and Migration Tests
- Database migration testing
- Test data seeding
- Migration rollback testing

### 3. Unit Tests
- Parallel execution
- Coverage reporting
- Coverage threshold enforcement

### 4. Integration Tests
- Database and Redis integration
- External service mocking
- API endpoint testing

### 5. End-to-End Tests
- Full application testing
- User workflow validation
- Browser automation (if applicable)

### 6. Security Tests
- Vulnerability scanning
- Penetration testing
- Authentication bypass testing

### 7. Performance Tests
- Load testing with K6
- Performance threshold validation
- Resource usage monitoring

### 8. Coverage Reporting
- Coverage report merging
- Threshold validation
- PR comments with coverage status

### 9. Deployment
- Staging deployment (main branch only)
- Smoke testing
- Deployment notifications

## Test Data Management

### Commands
```bash
# Seed test data
npm run db:seed:test
npm run db:seed:e2e
npm run db:seed:perf

# Clean up test data
npm run db:cleanup:test
npm run db:cleanup:e2e
npm run db:cleanup:perf

# Reset databases (cleanup + seed)
npm run db:reset:test
npm run db:reset:e2e
npm run db:reset:perf

# Create snapshots
npm run db:snapshot:test
npm run db:snapshot:e2e

# Restore from snapshots
npm run db:restore:test snapshot-name
npm run db:restore:e2e snapshot-name
```

### Test Data Volumes
- **Test Environment**: 10 users, 20 projects, 50 sync records
- **E2E Environment**: 50 users, 100 projects, 200 sync records
- **Performance Environment**: 1000 users, 5000 projects, 10000 sync records

## Environment Management

### Setup Commands
```bash
# Set up specific environment
./scripts/test-environment-setup.sh setup test
./scripts/test-environment-setup.sh setup e2e
./scripts/test-environment-setup.sh setup performance

# Set up all environments
./scripts/test-environment-setup.sh setup all

# Check environment status
./scripts/test-environment-setup.sh status

# View environment logs
./scripts/test-environment-setup.sh logs test

# Tear down environments
./scripts/test-environment-setup.sh teardown test
./scripts/test-environment-setup.sh teardown all

# Reset environments
./scripts/test-environment-setup.sh reset test
```

### Environment Files
- `.env.test` - Test environment configuration
- `.env.e2e` - E2E environment configuration
- `.env.performance` - Performance environment configuration

## Test Reporting

### Automated Reports
- **Coverage Reports**: HTML and LCOV formats
- **Test Results**: JSON and HTML formats
- **Failure Analysis**: Detailed failure breakdown
- **Performance Reports**: K6 results and metrics

### Report Generation
```bash
# Generate comprehensive test report
npm run test:report

# Merge coverage reports
npm run ci:merge-coverage

# Analyze test failures
npm run test:analyze-failures

# Clean up old reports
npm run ci:cleanup
```

### Report Locations
- `coverage/` - Coverage reports
- `test-reports/` - Test execution reports
- `test-results/` - Raw test results
- `performance/results/` - Performance test results

## Failure Analysis

### Automatic Analysis
The system automatically analyzes test failures and provides:
- Failure categorization by type and module
- Common error pattern identification
- Debugging recommendations
- System information collection

### Manual Analysis
```bash
# Analyze failures
node scripts/test-failure-analysis.js analyze

# View debugging commands
cat debug-info/debugging-commands.json
```

### Failure Categories
- **Timeout**: Test execution timeouts
- **Connection**: Database/Redis connection issues
- **Authentication**: Auth-related failures
- **Validation**: Input validation errors
- **Database**: Database operation failures
- **Performance**: Performance threshold violations

## Coverage Requirements

### Global Thresholds
- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 80%
- **Statements**: 80%

### Critical Module Thresholds
- **Auth Module**: 90%
- **Projects Module**: 90%
- **Utils Module**: 95%

### Coverage Enforcement
- CI pipeline fails if coverage thresholds are not met
- PR comments show coverage status
- Coverage reports are generated for all test types

## Performance Testing

### K6 Scenarios
- **Baseline**: 10 VUs for 30 seconds
- **Load**: Ramp up to 200 VUs over 16 minutes
- **Stress**: Ramp up to 400 VUs over 26 minutes
- **Spike**: Sudden spike to 1400 VUs

### Performance Thresholds
- **Response Time**: p95 < 200ms
- **Error Rate**: < 1%
- **Throughput**: > 100 requests/second

### Performance Commands
```bash
# Run all performance tests
npm run test:perf:all

# Run specific K6 tests
npm run test:perf:k6

# Run waitlist performance tests
npm run test:perf:k6:waitlist
```

## Security Testing

### Security Test Types
- **Authentication Bypass**: Test auth vulnerabilities
- **SQL Injection**: Database injection testing
- **XSS**: Cross-site scripting tests
- **Rate Limiting**: Rate limit bypass attempts
- **CSRF**: Cross-site request forgery tests
- **Access Control**: Permission and authorization tests

### Security Commands
```bash
# Run all security tests
npm run test:security

# Run security audit
npm run security:audit

# Run penetration tests
npm run security:penetration
```

## Debugging and Troubleshooting

### Common Issues

#### Database Connection Failures
```bash
# Check database status
docker-compose ps postgres-test

# View database logs
docker-compose logs postgres-test

# Test connection
npx prisma db pull
```

#### Redis Connection Failures
```bash
# Check Redis status
docker-compose ps redis-test

# Test Redis connection
redis-cli -p 6380 ping
```

#### Test Timeouts
- Increase timeout values in `test.config.js`
- Check for infinite loops or deadlocks
- Optimize database queries
- Use `test.concurrent` for parallel execution

#### Memory Issues
- Monitor memory usage during tests
- Check for memory leaks in application code
- Increase Node.js memory limit: `--max-old-space-size=4096`

### Debug Commands
```bash
# Run tests with debug output
npm run test:unit -- --verbose

# Detect open handles
npm run test:integration -- --detectOpenHandles

# Run with Node.js debugger
npm run test:debug

# Check system resources
docker stats
```

## Best Practices

### Test Writing
1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data
3. **Mocking**: Mock external dependencies
4. **Assertions**: Use descriptive assertion messages
5. **Setup**: Use proper test setup and teardown

### CI/CD
1. **Parallel Execution**: Run tests in parallel when possible
2. **Fast Feedback**: Fail fast on critical issues
3. **Artifact Management**: Store test artifacts with appropriate retention
4. **Notifications**: Send notifications for failures
5. **Rollback**: Implement automatic rollback on deployment failures

### Performance
1. **Baseline**: Establish performance baselines
2. **Monitoring**: Continuously monitor performance metrics
3. **Thresholds**: Set realistic performance thresholds
4. **Optimization**: Regularly optimize slow tests and queries

### Security
1. **Regular Scans**: Run security scans regularly
2. **Dependency Updates**: Keep dependencies updated
3. **Vulnerability Tracking**: Track and fix vulnerabilities promptly
4. **Access Control**: Test all access control mechanisms

## Configuration

### Jest Configuration
- `jest.config.js` - Base Jest configuration
- `test.config.js` - Comprehensive test configuration
- `test/jest-e2e.json` - E2E test configuration

### Environment Variables
```bash
# Database URLs
TEST_DATABASE_URL=postgresql://test_user:test_password@localhost:5433/gitsink_test
E2E_DATABASE_URL=postgresql://e2e_user:e2e_password@localhost:5434/gitsink_e2e
PERF_DATABASE_URL=postgresql://perf_user:perf_password@localhost:5435/gitsink_perf

# Redis URLs
REDIS_URL=redis://localhost:6380  # Test
REDIS_URL=redis://localhost:6381  # E2E
REDIS_URL=redis://localhost:6382  # Performance

# CI/CD
CI=true
GITHUB_TOKEN=<token>
SLACK_WEBHOOK_URL=<webhook>
CI_EMAIL_RECIPIENTS=<emails>
```

## Monitoring and Alerts

### CI/CD Monitoring
- Build status notifications
- Test failure alerts
- Performance degradation alerts
- Security vulnerability alerts

### Metrics Collection
- Test execution times
- Coverage percentages
- Failure rates
- Performance metrics

### Dashboards
- Test execution dashboard
- Coverage trends
- Performance trends
- Failure analysis dashboard

## Maintenance

### Regular Tasks
1. **Update Dependencies**: Keep test dependencies updated
2. **Review Thresholds**: Adjust coverage and performance thresholds
3. **Clean Artifacts**: Remove old test artifacts
4. **Update Documentation**: Keep test documentation current
5. **Performance Tuning**: Optimize slow tests

### Monthly Reviews
- Analyze test failure trends
- Review coverage reports
- Update performance baselines
- Security vulnerability assessment

This comprehensive test automation system ensures high code quality, reliable deployments, and early detection of issues across all aspects of the Gitsink API.