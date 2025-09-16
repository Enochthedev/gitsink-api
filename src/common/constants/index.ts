/**
 * Common constants used throughout the application
 */

// Authentication constants
export const AUTH_CONSTANTS = {
  API_KEY_LENGTH: 32,
  BCRYPT_ROUNDS: 12,
  JWT_ACCESS_TOKEN_EXPIRY: 900, // 15 minutes
  JWT_REFRESH_TOKEN_EXPIRY: 7 * 24 * 60 * 60, // 7 days
  MAGIC_LINK_EXPIRY: 15 * 60 * 1000, // 15 minutes
  PASSWORD_RESET_EXPIRY: 60 * 60 * 1000, // 1 hour
  MAX_REFRESH_TOKEN_USAGE: 1000,
  MIN_PASSWORD_LENGTH: 8,
  MAX_EMAIL_LENGTH: 254,
} as const;

// Cache constants
export const CACHE_CONSTANTS = {
  DEFAULT_TTL: 300000, // 5 minutes
  USER_PROJECTS_TTL: 300000, // 5 minutes
  USER_PROJECTS_DELETED_TTL: 60000, // 1 minute
  PROJECT_TTL: 600000, // 10 minutes
  API_RESPONSE_TTL: 180000, // 3 minutes
} as const;

// Database constants
export const DB_CONSTANTS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  QUERY_TIMEOUT: 30000, // 30 seconds
  CONNECTION_TIMEOUT: 10000, // 10 seconds
} as const;

// GitHub API constants
export const GITHUB_CONSTANTS = {
  API_BASE: 'https://api.github.com',
  RAW_BASE: 'https://raw.githubusercontent.com',
  REQUEST_TIMEOUT: 30000, // 30 seconds
  MD_REQUEST_TIMEOUT: 15000, // 15 seconds
  USER_AGENT: 'GitSink-API/1.0',
  ACCEPT_HEADER: 'application/vnd.github.v3+json',
  RAW_ACCEPT_HEADER: 'text/plain, application/vnd.github.v3.raw',
  CONCURRENT_SYNC_THRESHOLD: 30000, // 30 seconds
  MAX_REPOS_PER_PAGE: 100,
} as const;

// Sync operation constants
export const SYNC_CONSTANTS = {
  MAX_RETRIES: 3,
  RETRY_DELAY_BASE: 2000, // 2 seconds
  MAX_RETRY_DELAY: 30000, // 30 seconds
  BATCH_SIZE: 10,
  CONCURRENT_LIMIT: 5,
} as const;

// Validation constants
export const VALIDATION_CONSTANTS = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 50,
  TITLE_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 2000,
  TAG_MAX_LENGTH: 50,
  MAX_TAGS_PER_PROJECT: 20,
  URL_MAX_LENGTH: 2048,
} as const;

// Security constants
export const SECURITY_CONSTANTS = {
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  TIMING_ATTACK_DELAY_MIN: 100, // milliseconds
  TIMING_ATTACK_DELAY_MAX: 300, // milliseconds
  SUSPICIOUS_ACTIVITY_THRESHOLD: 10,
  IP_BLOCK_DURATION: 60 * 60 * 1000, // 1 hour
} as const;

// Error codes
export const ERROR_CODES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'AUTH_001',
  EXPIRED_TOKEN: 'AUTH_002',
  INVALID_TOKEN: 'AUTH_003',
  ACCOUNT_LOCKED: 'AUTH_004',
  WEAK_PASSWORD: 'AUTH_005',

  // Validation errors
  INVALID_INPUT: 'VAL_001',
  MISSING_REQUIRED_FIELD: 'VAL_002',
  INVALID_FORMAT: 'VAL_003',

  // Resource errors
  RESOURCE_NOT_FOUND: 'RES_001',
  RESOURCE_CONFLICT: 'RES_002',
  RESOURCE_FORBIDDEN: 'RES_003',

  // External service errors
  GITHUB_API_ERROR: 'EXT_001',
  GITLAB_API_ERROR: 'EXT_002',
  BITBUCKET_API_ERROR: 'EXT_003',

  // System errors
  DATABASE_ERROR: 'SYS_001',
  CACHE_ERROR: 'SYS_002',
  QUEUE_ERROR: 'SYS_003',
  INTERNAL_ERROR: 'SYS_004',
} as const;

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// Logging levels
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace',
} as const;

// Platform types
export const PLATFORMS = {
  GITHUB: 'github',
  GITLAB: 'gitlab',
  BITBUCKET: 'bitbucket',
} as const;

// User tiers
export const USER_TIERS = {
  FREE: 'free',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise',
} as const;

// Project categories
export const PROJECT_CATEGORIES = {
  WEB_APP: 'web-app',
  MOBILE_APP: 'mobile-app',
  DESKTOP_APP: 'desktop-app',
  LIBRARY: 'library',
  FRAMEWORK: 'framework',
  TOOL: 'tool',
  GAME: 'game',
  API: 'api',
  DOCUMENTATION: 'documentation',
  OTHER: 'other',
} as const;

// Queue job types
export const QUEUE_JOB_TYPES = {
  SYNC_PROJECT: 'sync-project',
  SYNC_ALL_PROJECTS: 'sync-all-projects',
  SEND_EMAIL: 'send-email',
  AI_ENRICHMENT: 'ai-enrichment',
  WEBHOOK_PROCESSING: 'webhook-processing',
  CLEANUP_EXPIRED_TOKENS: 'cleanup-expired-tokens',
} as const;

// Metrics names
export const METRICS_NAMES = {
  AUTH_OPERATIONS: 'auth_operations_total',
  AUTH_DURATION: 'auth_operation_duration_seconds',
  AUTH_FAILURES: 'auth_failures_total',
  API_REQUESTS: 'api_requests_total',
  API_DURATION: 'api_request_duration_seconds',
  DB_QUERIES: 'database_queries_total',
  DB_DURATION: 'database_query_duration_seconds',
  CACHE_OPERATIONS: 'cache_operations_total',
  QUEUE_JOBS: 'queue_jobs_total',
  SYNC_OPERATIONS: 'sync_operations_total',
} as const;
