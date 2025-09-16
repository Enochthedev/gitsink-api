#!/bin/bash

# Docker Health Check Script for Gitsink API
# This script performs comprehensive health checks for the containerized application

set -e

# Configuration
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-http://localhost:3000/health}"
TIMEOUT="${TIMEOUT:-10}"
VERBOSE="${VERBOSE:-false}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    if [ "$VERBOSE" = "true" ]; then
        echo -e "${2:-$NC}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
    fi
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check HTTP endpoint
check_http_endpoint() {
    local url="$1"
    local expected_status="${2:-200}"
    
    log "Checking HTTP endpoint: $url" "$YELLOW"
    
    if command_exists curl; then
        response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
    elif command_exists wget; then
        response=$(wget --spider --timeout="$TIMEOUT" --tries=1 -q "$url" 2>&1 && echo "200" || echo "000")
    else
        error "Neither curl nor wget is available for health check"
        return 1
    fi
    
    if [ "$response" = "$expected_status" ]; then
        log "HTTP endpoint check passed (status: $response)" "$GREEN"
        return 0
    else
        error "HTTP endpoint check failed (status: $response, expected: $expected_status)"
        return 1
    fi
}

# Function to check application health endpoint
check_app_health() {
    log "Checking application health endpoint..." "$YELLOW"
    
    if command_exists curl; then
        health_response=$(curl -s --max-time "$TIMEOUT" "$HEALTH_ENDPOINT" 2>/dev/null || echo '{"status":"error"}')
    elif command_exists wget; then
        health_response=$(wget -qO- --timeout="$TIMEOUT" "$HEALTH_ENDPOINT" 2>/dev/null || echo '{"status":"error"}')
    else
        error "Cannot check health endpoint - no HTTP client available"
        return 1
    fi
    
    # Check if response contains "healthy" status
    if echo "$health_response" | grep -q '"status".*"healthy"'; then
        log "Application health check passed" "$GREEN"
        return 0
    else
        error "Application health check failed. Response: $health_response"
        return 1
    fi
}

# Function to check database connectivity (if applicable)
check_database() {
    log "Checking database connectivity..." "$YELLOW"
    
    # Try to check if the application can connect to database via health endpoint
    if command_exists curl; then
        db_response=$(curl -s --max-time "$TIMEOUT" "$HEALTH_ENDPOINT/database" 2>/dev/null || echo '{"status":"error"}')
    elif command_exists wget; then
        db_response=$(wget -qO- --timeout="$TIMEOUT" "$HEALTH_ENDPOINT/database" 2>/dev/null || echo '{"status":"error"}')
    else
        warning "Cannot check database connectivity - no HTTP client available"
        return 0  # Don't fail the health check for this
    fi
    
    if echo "$db_response" | grep -q '"status".*"healthy"'; then
        log "Database connectivity check passed" "$GREEN"
        return 0
    else
        warning "Database connectivity check failed or not available"
        return 0  # Don't fail the health check for this
    fi
}

# Function to check memory usage
check_memory() {
    log "Checking memory usage..." "$YELLOW"
    
    if [ -f /proc/meminfo ]; then
        mem_total=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        mem_available=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
        
        if [ "$mem_total" -gt 0 ] && [ "$mem_available" -gt 0 ]; then
            mem_usage_percent=$(( (mem_total - mem_available) * 100 / mem_total ))
            
            if [ "$mem_usage_percent" -lt 90 ]; then
                log "Memory usage check passed ($mem_usage_percent% used)" "$GREEN"
                return 0
            else
                warning "High memory usage detected ($mem_usage_percent% used)"
                return 0  # Don't fail for high memory usage
            fi
        fi
    fi
    
    log "Memory usage check skipped (no /proc/meminfo)" "$YELLOW"
    return 0
}

# Function to check disk space
check_disk_space() {
    log "Checking disk space..." "$YELLOW"
    
    if command_exists df; then
        disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
        
        if [ "$disk_usage" -lt 90 ]; then
            log "Disk space check passed ($disk_usage% used)" "$GREEN"
            return 0
        else
            warning "High disk usage detected ($disk_usage% used)"
            return 0  # Don't fail for high disk usage
        fi
    fi
    
    log "Disk space check skipped (df not available)" "$YELLOW"
    return 0
}

# Function to check if Node.js process is running
check_node_process() {
    log "Checking Node.js process..." "$YELLOW"
    
    if pgrep -f "node" > /dev/null; then
        log "Node.js process check passed" "$GREEN"
        return 0
    else
        error "Node.js process not found"
        return 1
    fi
}

# Main health check function
main() {
    local exit_code=0
    
    log "Starting health check for environment: $ENVIRONMENT" "$YELLOW"
    log "Health endpoint: $HEALTH_ENDPOINT" "$YELLOW"
    log "Timeout: ${TIMEOUT}s" "$YELLOW"
    
    # Core health checks (these must pass)
    if ! check_node_process; then
        exit_code=1
    fi
    
    if ! check_http_endpoint "$HEALTH_ENDPOINT"; then
        exit_code=1
    fi
    
    if ! check_app_health; then
        exit_code=1
    fi
    
    # Optional health checks (warnings only)
    check_database
    check_memory
    check_disk_space
    
    if [ $exit_code -eq 0 ]; then
        success "All health checks passed"
    else
        error "One or more critical health checks failed"
    fi
    
    return $exit_code
}

# Handle command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE="true"
            shift
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -e, --environment ENV    Set environment (default: production)"
            echo "  -v, --verbose           Enable verbose output"
            echo "  -t, --timeout SECONDS   Set timeout for checks (default: 10)"
            echo "  -h, --help              Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  HEALTH_ENDPOINT         Health check endpoint URL"
            echo "  TIMEOUT                 Timeout in seconds"
            echo "  VERBOSE                 Enable verbose output (true/false)"
            echo "  ENVIRONMENT             Environment name"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run the main function
main
exit $?