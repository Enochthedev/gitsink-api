#!/bin/bash

# Test Environment Setup Script
# Provisions and configures test environments for different test types

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yaml"
TEST_ENV_FILE="$PROJECT_ROOT/.env.test"
E2E_ENV_FILE="$PROJECT_ROOT/.env.e2e"
PERF_ENV_FILE="$PROJECT_ROOT/.env.performance"

# Default values
ENVIRONMENT="test"
ACTION="setup"
PARALLEL_JOBS=4
TIMEOUT=300

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
Test Environment Setup Script

Usage: $0 [OPTIONS] <action> [environment]

Actions:
    setup       Set up test environment
    teardown    Tear down test environment
    reset       Reset test environment (teardown + setup)
    status      Check environment status
    logs        Show environment logs

Environments:
    test        Unit and integration tests (default)
    e2e         End-to-end tests
    performance Performance and load tests
    all         All environments

Options:
    -h, --help          Show this help message
    -j, --jobs NUM      Number of parallel jobs (default: 4)
    -t, --timeout SEC   Timeout in seconds (default: 300)
    -v, --verbose       Verbose output
    --no-cache          Don't use Docker cache
    --force             Force operation without confirmation

Examples:
    $0 setup test
    $0 reset e2e
    $0 teardown all
    $0 status
EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -j|--jobs)
                PARALLEL_JOBS="$2"
                shift 2
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -v|--verbose)
                set -x
                shift
                ;;
            --no-cache)
                NO_CACHE="--no-cache"
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            setup|teardown|reset|status|logs)
                ACTION="$1"
                shift
                ;;
            test|e2e|performance|all)
                ENVIRONMENT="$1"
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 1
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Create environment files
create_env_files() {
    local env=$1
    log_info "Creating environment files for $env..."
    
    case $env in
        test)
            create_test_env_file
            ;;
        e2e)
            create_e2e_env_file
            ;;
        performance)
            create_performance_env_file
            ;;
    esac
}

create_test_env_file() {
    cat > "$TEST_ENV_FILE" << EOF
# Test Environment Configuration
NODE_ENV=test
PORT=3001

# Database
DATABASE_URL=postgresql://test_user:test_password@localhost:5433/gitsink_test
TEST_DATABASE_URL=postgresql://test_user:test_password@localhost:5433/gitsink_test

# Redis
REDIS_URL=redis://localhost:6380

# JWT
JWT_SECRET=test-jwt-secret-key-for-testing-only
JWT_EXPIRES_IN=1h

# GitHub (Test tokens)
GITHUB_CLIENT_ID=test-github-client-id
GITHUB_CLIENT_SECRET=test-github-client-secret

# Email (Test configuration)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=test
SMTP_PASS=test
FROM_EMAIL=test@gitsink.dev

# Rate limiting (Relaxed for testing)
RATE_LIMIT_TTL=60
RATE_LIMIT_LIMIT=1000

# Logging
LOG_LEVEL=error

# Test-specific
TEST_TIMEOUT=30000
JEST_TIMEOUT=10000
EOF
    log_success "Test environment file created: $TEST_ENV_FILE"
}

create_e2e_env_file() {
    cat > "$E2E_ENV_FILE" << EOF
# E2E Test Environment Configuration
NODE_ENV=test
PORT=3002

# Database
DATABASE_URL=postgresql://e2e_user:e2e_password@localhost:5434/gitsink_e2e
E2E_DATABASE_URL=postgresql://e2e_user:e2e_password@localhost:5434/gitsink_e2e

# Redis
REDIS_URL=redis://localhost:6381

# JWT
JWT_SECRET=e2e-jwt-secret-key-for-testing-only
JWT_EXPIRES_IN=1h

# GitHub (Test tokens)
GITHUB_CLIENT_ID=e2e-github-client-id
GITHUB_CLIENT_SECRET=e2e-github-client-secret

# Email (Test configuration)
SMTP_HOST=localhost
SMTP_PORT=1026
SMTP_USER=e2e
SMTP_PASS=e2e
FROM_EMAIL=e2e@gitsink.dev

# Rate limiting (Relaxed for E2E)
RATE_LIMIT_TTL=60
RATE_LIMIT_LIMIT=2000

# Logging
LOG_LEVEL=warn

# E2E-specific
E2E_TIMEOUT=60000
HEADLESS=true
BROWSER=chromium
EOF
    log_success "E2E environment file created: $E2E_ENV_FILE"
}

create_performance_env_file() {
    cat > "$PERF_ENV_FILE" << EOF
# Performance Test Environment Configuration
NODE_ENV=production
PORT=3003

# Database
DATABASE_URL=postgresql://perf_user:perf_password@localhost:5435/gitsink_perf
PERF_DATABASE_URL=postgresql://perf_user:perf_password@localhost:5435/gitsink_perf

# Redis
REDIS_URL=redis://localhost:6382

# JWT
JWT_SECRET=perf-jwt-secret-key-for-testing-only
JWT_EXPIRES_IN=1h

# GitHub (Test tokens)
GITHUB_CLIENT_ID=perf-github-client-id
GITHUB_CLIENT_SECRET=perf-github-client-secret

# Email (Disabled for performance)
SMTP_HOST=localhost
SMTP_PORT=1027
SMTP_USER=perf
SMTP_PASS=perf
FROM_EMAIL=perf@gitsink.dev

# Rate limiting (Production-like)
RATE_LIMIT_TTL=60
RATE_LIMIT_LIMIT=100

# Logging (Minimal for performance)
LOG_LEVEL=error

# Performance-specific
PERF_TIMEOUT=120000
LOAD_TEST_DURATION=300
CONCURRENT_USERS=100
EOF
    log_success "Performance environment file created: $PERF_ENV_FILE"
}

# Setup Docker services
setup_docker_services() {
    local env=$1
    log_info "Setting up Docker services for $env environment..."
    
    case $env in
        test)
            setup_test_services
            ;;
        e2e)
            setup_e2e_services
            ;;
        performance)
            setup_performance_services
            ;;
        all)
            setup_test_services
            setup_e2e_services
            setup_performance_services
            ;;
    esac
}

setup_test_services() {
    log_info "Starting test services..."
    
    # Create test-specific docker-compose override
    cat > docker-compose.test.yml << EOF
version: '3.8'
services:
  postgres-test:
    image: postgres:15
    environment:
      POSTGRES_DB: gitsink_test
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_password
    ports:
      - "5433:5432"
    volumes:
      - postgres_test_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test_user -d gitsink_test"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    volumes:
      - redis_test_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  mailhog-test:
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  postgres_test_data:
  redis_test_data:
EOF

    docker-compose -f docker-compose.test.yml up -d
    wait_for_services "test"
}

setup_e2e_services() {
    log_info "Starting E2E services..."
    
    cat > docker-compose.e2e.yml << EOF
version: '3.8'
services:
  postgres-e2e:
    image: postgres:15
    environment:
      POSTGRES_DB: gitsink_e2e
      POSTGRES_USER: e2e_user
      POSTGRES_PASSWORD: e2e_password
    ports:
      - "5434:5432"
    volumes:
      - postgres_e2e_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U e2e_user -d gitsink_e2e"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis-e2e:
    image: redis:7-alpine
    ports:
      - "6381:6379"
    volumes:
      - redis_e2e_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  mailhog-e2e:
    image: mailhog/mailhog:latest
    ports:
      - "1026:1025"
      - "8026:8025"

volumes:
  postgres_e2e_data:
  redis_e2e_data:
EOF

    docker-compose -f docker-compose.e2e.yml up -d
    wait_for_services "e2e"
}

setup_performance_services() {
    log_info "Starting performance services..."
    
    cat > docker-compose.performance.yml << EOF
version: '3.8'
services:
  postgres-perf:
    image: postgres:15
    environment:
      POSTGRES_DB: gitsink_perf
      POSTGRES_USER: perf_user
      POSTGRES_PASSWORD: perf_password
      POSTGRES_SHARED_PRELOAD_LIBRARIES: pg_stat_statements
    ports:
      - "5435:5432"
    volumes:
      - postgres_perf_data:/var/lib/postgresql/data
    command: postgres -c shared_preload_libraries=pg_stat_statements -c pg_stat_statements.track=all
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U perf_user -d gitsink_perf"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis-perf:
    image: redis:7-alpine
    ports:
      - "6382:6379"
    volumes:
      - redis_perf_data:/data
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  mailhog-perf:
    image: mailhog/mailhog:latest
    ports:
      - "1027:1025"
      - "8027:8025"

volumes:
  postgres_perf_data:
  redis_perf_data:
EOF

    docker-compose -f docker-compose.performance.yml up -d
    wait_for_services "performance"
}

# Wait for services to be ready
wait_for_services() {
    local env=$1
    log_info "Waiting for $env services to be ready..."
    
    local timeout=$TIMEOUT
    local elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        if check_services_health "$env"; then
            log_success "$env services are ready"
            return 0
        fi
        
        sleep 5
        elapsed=$((elapsed + 5))
        log_info "Waiting... ($elapsed/${timeout}s)"
    done
    
    log_error "$env services failed to start within ${timeout}s"
    return 1
}

check_services_health() {
    local env=$1
    
    case $env in
        test)
            docker-compose -f docker-compose.test.yml ps | grep -q "Up (healthy)" || return 1
            ;;
        e2e)
            docker-compose -f docker-compose.e2e.yml ps | grep -q "Up (healthy)" || return 1
            ;;
        performance)
            docker-compose -f docker-compose.performance.yml ps | grep -q "Up (healthy)" || return 1
            ;;
    esac
    
    return 0
}

# Setup application dependencies
setup_app_dependencies() {
    local env=$1
    log_info "Setting up application dependencies for $env..."
    
    # Install npm dependencies if needed
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        log_info "Installing npm dependencies..."
        npm ci
    fi
    
    # Generate Prisma client
    log_info "Generating Prisma client..."
    npx prisma generate
    
    # Run database migrations
    log_info "Running database migrations..."
    case $env in
        test)
            export DATABASE_URL="postgresql://test_user:test_password@localhost:5433/gitsink_test"
            ;;
        e2e)
            export DATABASE_URL="postgresql://e2e_user:e2e_password@localhost:5434/gitsink_e2e"
            ;;
        performance)
            export DATABASE_URL="postgresql://perf_user:perf_password@localhost:5435/gitsink_perf"
            ;;
    esac
    
    npx prisma migrate deploy
    
    # Seed test data
    log_info "Seeding test data..."
    node scripts/test-data-management.js provision "$env"
    
    log_success "Application dependencies setup complete for $env"
}

# Teardown environment
teardown_environment() {
    local env=$1
    log_info "Tearing down $env environment..."
    
    case $env in
        test)
            docker-compose -f docker-compose.test.yml down -v
            rm -f docker-compose.test.yml
            ;;
        e2e)
            docker-compose -f docker-compose.e2e.yml down -v
            rm -f docker-compose.e2e.yml
            ;;
        performance)
            docker-compose -f docker-compose.performance.yml down -v
            rm -f docker-compose.performance.yml
            ;;
        all)
            teardown_environment test
            teardown_environment e2e
            teardown_environment performance
            ;;
    esac
    
    log_success "$env environment torn down"
}

# Check environment status
check_status() {
    local env=$1
    log_info "Checking $env environment status..."
    
    case $env in
        test)
            echo "=== Test Environment ==="
            docker-compose -f docker-compose.test.yml ps 2>/dev/null || echo "Test services not running"
            ;;
        e2e)
            echo "=== E2E Environment ==="
            docker-compose -f docker-compose.e2e.yml ps 2>/dev/null || echo "E2E services not running"
            ;;
        performance)
            echo "=== Performance Environment ==="
            docker-compose -f docker-compose.performance.yml ps 2>/dev/null || echo "Performance services not running"
            ;;
        all)
            check_status test
            check_status e2e
            check_status performance
            ;;
    esac
}

# Show logs
show_logs() {
    local env=$1
    log_info "Showing $env environment logs..."
    
    case $env in
        test)
            docker-compose -f docker-compose.test.yml logs -f
            ;;
        e2e)
            docker-compose -f docker-compose.e2e.yml logs -f
            ;;
        performance)
            docker-compose -f docker-compose.performance.yml logs -f
            ;;
        all)
            log_warning "Cannot show logs for all environments simultaneously"
            log_info "Use specific environment: test, e2e, or performance"
            ;;
    esac
}

# Main execution
main() {
    parse_args "$@"
    
    log_info "Test Environment Setup - Action: $ACTION, Environment: $ENVIRONMENT"
    
    case $ACTION in
        setup)
            check_prerequisites
            if [ "$ENVIRONMENT" = "all" ]; then
                for env in test e2e performance; do
                    create_env_files "$env"
                    setup_docker_services "$env"
                    setup_app_dependencies "$env"
                done
            else
                create_env_files "$ENVIRONMENT"
                setup_docker_services "$ENVIRONMENT"
                setup_app_dependencies "$ENVIRONMENT"
            fi
            log_success "Environment setup complete!"
            ;;
        teardown)
            teardown_environment "$ENVIRONMENT"
            ;;
        reset)
            teardown_environment "$ENVIRONMENT"
            sleep 2
            main setup "$ENVIRONMENT"
            ;;
        status)
            check_status "$ENVIRONMENT"
            ;;
        logs)
            show_logs "$ENVIRONMENT"
            ;;
        *)
            log_error "Unknown action: $ACTION"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"