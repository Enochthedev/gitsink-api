#!/bin/bash

# ============================================
# Docker Deployment Script
# ============================================

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_COMPOSE_DIR="$PROJECT_ROOT"

# Default values
ENVIRONMENT="development"
ACTION="deploy"
FORCE=false
VERBOSE=false
TIMEOUT=300
BACKUP=true
ROLLBACK=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
Docker Deployment Script for GitSink

Usage: $0 [OPTIONS] [ACTION]

Actions:
    deploy      Deploy the application (default)
    start       Start existing containers
    stop        Stop running containers
    restart     Restart containers
    status      Show container status
    logs        Show container logs
    cleanup     Clean up unused resources
    backup      Backup data volumes
    restore     Restore from backup

Options:
    -e, --env ENV       Environment (development|staging|production) [default: development]
    -f, --force         Force operation without confirmation
    -v, --verbose       Verbose output
    -t, --timeout SEC   Timeout in seconds [default: 300]
    --no-backup         Skip backup before deployment
    --rollback          Rollback to previous version
    -h, --help          Show this help message

Examples:
    $0 deploy -e production
    $0 start -e staging
    $0 logs -e development -v
    $0 cleanup -f

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -f|--force)
                FORCE=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --no-backup)
                BACKUP=false
                shift
                ;;
            --rollback)
                ROLLBACK=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            deploy|start|stop|restart|status|logs|cleanup|backup|restore)
                ACTION="$1"
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

# Validate environment
validate_environment() {
    case $ENVIRONMENT in
        development|staging|production)
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT"
            log_error "Valid environments: development, staging, production"
            exit 1
            ;;
    esac
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
    
    # Check if environment file exists
    local env_file="$PROJECT_ROOT/.env.$ENVIRONMENT"
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Get Docker Compose command
get_docker_compose_cmd() {
    if command -v docker-compose &> /dev/null; then
        echo "docker-compose"
    else
        echo "docker compose"
    fi
}

# Get compose file for environment
get_compose_file() {
    case $ENVIRONMENT in
        development)
            echo "$DOCKER_COMPOSE_DIR/docker-compose.dev.yml"
            ;;
        staging)
            echo "$DOCKER_COMPOSE_DIR/docker-compose.staging.yml"
            ;;
        production)
            echo "$DOCKER_COMPOSE_DIR/docker-compose.prod.yml"
            ;;
    esac
}

# Backup data volumes
backup_volumes() {
    if [[ "$BACKUP" == "false" ]]; then
        log_info "Skipping backup (--no-backup specified)"
        return 0
    fi
    
    log_info "Creating backup of data volumes..."
    
    local backup_dir="$PROJECT_ROOT/backups/$(date +%Y%m%d_%H%M%S)_$ENVIRONMENT"
    mkdir -p "$backup_dir"
    
    local compose_cmd=$(get_docker_compose_cmd)
    local compose_file=$(get_compose_file)
    
    # Backup PostgreSQL data
    if docker volume ls | grep -q "gitsink-postgres-data-$ENVIRONMENT"; then
        log_info "Backing up PostgreSQL data..."
        docker run --rm \
            -v "gitsink-postgres-data-$ENVIRONMENT:/data:ro" \
            -v "$backup_dir:/backup" \
            alpine:latest \
            tar czf "/backup/postgres-data.tar.gz" -C /data .
    fi
    
    # Backup Redis data
    if docker volume ls | grep -q "gitsink-redis-data-$ENVIRONMENT"; then
        log_info "Backing up Redis data..."
        docker run --rm \
            -v "gitsink-redis-data-$ENVIRONMENT:/data:ro" \
            -v "$backup_dir:/backup" \
            alpine:latest \
            tar czf "/backup/redis-data.tar.gz" -C /data .
    fi
    
    log_success "Backup created at: $backup_dir"
}

# Deploy application
deploy_app() {
    log_info "Deploying GitSink to $ENVIRONMENT environment..."
    
    local compose_cmd=$(get_docker_compose_cmd)
    local compose_file=$(get_compose_file)
    
    # Confirmation for production
    if [[ "$ENVIRONMENT" == "production" && "$FORCE" == "false" ]]; then
        echo -n "Are you sure you want to deploy to PRODUCTION? (yes/no): "
        read -r confirmation
        if [[ "$confirmation" != "yes" ]]; then
            log_info "Deployment cancelled"
            exit 0
        fi
    fi
    
    # Create backup before deployment
    backup_volumes
    
    # Pull latest images
    log_info "Pulling latest images..."
    $compose_cmd -f "$compose_file" pull
    
    # Build images
    log_info "Building images..."
    $compose_cmd -f "$compose_file" build --no-cache
    
    # Stop existing containers
    log_info "Stopping existing containers..."
    $compose_cmd -f "$compose_file" down
    
    # Start new containers
    log_info "Starting new containers..."
    $compose_cmd -f "$compose_file" up -d
    
    # Wait for services to be healthy
    wait_for_health
    
    log_success "Deployment completed successfully!"
}

# Start containers
start_containers() {
    log_info "Starting containers for $ENVIRONMENT environment..."
    
    local compose_cmd=$(get_docker_compose_cmd)
    local compose_file=$(get_compose_file)
    
    $compose_cmd -f "$compose_file" up -d
    
    wait_for_health
    
    log_success "Containers started successfully!"
}

# Stop containers
stop_containers() {
    log_info "Stopping containers for $ENVIRONMENT environment..."
    
    local compose_cmd=$(get_docker_compose_cmd)
    local compose_file=$(get_compose_file)
    
    $compose_cmd -f "$compose_file" down
    
    log_success "Containers stopped successfully!"
}

# Restart containers
restart_containers() {
    log_info "Restarting containers for $ENVIRONMENT environment..."
    
    stop_containers
    start_containers
}

# Show container status
show_status() {
    log_info "Container status for $ENVIRONMENT environment:"
    
    local compose_cmd=$(get_docker_compose_cmd)
    local compose_file=$(get_compose_file)
    
    $compose_cmd -f "$compose_file" ps
}

# Show container logs
show_logs() {
    log_info "Container logs for $ENVIRONMENT environment:"
    
    local compose_cmd=$(get_docker_compose_cmd)
    local compose_file=$(get_compose_file)
    
    if [[ "$VERBOSE" == "true" ]]; then
        $compose_cmd -f "$compose_file" logs -f --tail=100
    else
        $compose_cmd -f "$compose_file" logs --tail=50
    fi
}

# Clean up unused resources
cleanup_resources() {
    log_info "Cleaning up unused Docker resources..."
    
    if [[ "$FORCE" == "false" ]]; then
        echo -n "This will remove unused containers, networks, and images. Continue? (yes/no): "
        read -r confirmation
        if [[ "$confirmation" != "yes" ]]; then
            log_info "Cleanup cancelled"
            exit 0
        fi
    fi
    
    # Remove stopped containers
    docker container prune -f
    
    # Remove unused networks
    docker network prune -f
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes (be careful with this)
    if [[ "$FORCE" == "true" ]]; then
        docker volume prune -f
    fi
    
    log_success "Cleanup completed!"
}

# Wait for services to be healthy
wait_for_health() {
    log_info "Waiting for services to be healthy..."
    
    local compose_cmd=$(get_docker_compose_cmd)
    local compose_file=$(get_compose_file)
    local timeout=$TIMEOUT
    local elapsed=0
    
    while [[ $elapsed -lt $timeout ]]; do
        if $compose_cmd -f "$compose_file" ps | grep -q "Up (healthy)"; then
            log_success "Services are healthy!"
            return 0
        fi
        
        sleep 5
        elapsed=$((elapsed + 5))
        
        if [[ $((elapsed % 30)) -eq 0 ]]; then
            log_info "Still waiting for services... (${elapsed}s elapsed)"
        fi
    done
    
    log_error "Timeout waiting for services to be healthy"
    log_info "Current status:"
    $compose_cmd -f "$compose_file" ps
    exit 1
}

# Restore from backup
restore_backup() {
    log_info "Restoring from backup..."
    
    # List available backups
    local backup_base_dir="$PROJECT_ROOT/backups"
    if [[ ! -d "$backup_base_dir" ]]; then
        log_error "No backups directory found"
        exit 1
    fi
    
    local backups=($(ls -1 "$backup_base_dir" | grep "_$ENVIRONMENT" | sort -r))
    
    if [[ ${#backups[@]} -eq 0 ]]; then
        log_error "No backups found for environment: $ENVIRONMENT"
        exit 1
    fi
    
    log_info "Available backups:"
    for i in "${!backups[@]}"; do
        echo "$((i+1)). ${backups[$i]}"
    done
    
    echo -n "Select backup to restore (1-${#backups[@]}): "
    read -r selection
    
    if [[ ! "$selection" =~ ^[0-9]+$ ]] || [[ "$selection" -lt 1 ]] || [[ "$selection" -gt ${#backups[@]} ]]; then
        log_error "Invalid selection"
        exit 1
    fi
    
    local selected_backup="${backups[$((selection-1))]}"
    local backup_dir="$backup_base_dir/$selected_backup"
    
    log_info "Restoring from: $selected_backup"
    
    # Stop containers before restore
    stop_containers
    
    # Restore PostgreSQL data
    if [[ -f "$backup_dir/postgres-data.tar.gz" ]]; then
        log_info "Restoring PostgreSQL data..."
        docker run --rm \
            -v "gitsink-postgres-data-$ENVIRONMENT:/data" \
            -v "$backup_dir:/backup:ro" \
            alpine:latest \
            sh -c "rm -rf /data/* && tar xzf /backup/postgres-data.tar.gz -C /data"
    fi
    
    # Restore Redis data
    if [[ -f "$backup_dir/redis-data.tar.gz" ]]; then
        log_info "Restoring Redis data..."
        docker run --rm \
            -v "gitsink-redis-data-$ENVIRONMENT:/data" \
            -v "$backup_dir:/backup:ro" \
            alpine:latest \
            sh -c "rm -rf /data/* && tar xzf /backup/redis-data.tar.gz -C /data"
    fi
    
    # Start containers
    start_containers
    
    log_success "Restore completed successfully!"
}

# Main function
main() {
    parse_args "$@"
    validate_environment
    check_prerequisites
    
    cd "$PROJECT_ROOT"
    
    case $ACTION in
        deploy)
            deploy_app
            ;;
        start)
            start_containers
            ;;
        stop)
            stop_containers
            ;;
        restart)
            restart_containers
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        cleanup)
            cleanup_resources
            ;;
        backup)
            backup_volumes
            ;;
        restore)
            restore_backup
            ;;
        *)
            log_error "Unknown action: $ACTION"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"