/**
 * Code cleanup utilities for removing dead code and improving code quality
 */

/**
 * Standardized error messages for better user experience
 */
export const ERROR_MESSAGES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'The email or password you entered is incorrect. Please try again.',
  ACCOUNT_LOCKED:
    'Your account has been temporarily locked due to multiple failed login attempts. Please try again later or reset your password.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  INVALID_TOKEN: 'Invalid authentication token. Please sign in again.',
  WEAK_PASSWORD:
    'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.',

  // Validation errors
  INVALID_EMAIL: 'Please enter a valid email address.',
  INVALID_USERNAME:
    'Username must be 3-50 characters long and contain only letters, numbers, hyphens, and underscores.',
  MISSING_REQUIRED_FIELD: 'This field is required.',
  INVALID_URL: 'Please enter a valid URL.',

  // Resource errors
  RESOURCE_NOT_FOUND: 'The requested resource could not be found.',
  RESOURCE_CONFLICT: 'This resource already exists.',
  ACCESS_DENIED: 'You do not have permission to access this resource.',

  // GitHub/External service errors
  GITHUB_REPO_NOT_FOUND:
    'Repository not found. Please check the URL and ensure you have access to this repository.',
  GITHUB_ACCESS_DENIED: 'Access denied to repository. Please check your GitHub token permissions.',
  GITHUB_AUTH_FAILED: 'GitHub authentication failed. Please reconnect your GitHub account.',
  GITHUB_TIMEOUT: 'GitHub request timed out. Please try again later.',

  // System errors
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
  DATABASE_ERROR: 'Database operation failed. Please try again later.',
  CACHE_ERROR: 'Cache operation failed. The request will continue without caching.',
  QUEUE_ERROR: 'Background job failed. The operation may need to be retried.',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait a moment before trying again.',

  // Sync errors
  SYNC_IN_PROGRESS: 'A sync operation is already in progress for this repository.',
  SYNC_FAILED: 'Failed to sync repository. Please check the repository URL and try again.',
  PORTFOLIO_MD_INVALID: 'Portfolio.md file contains invalid format. Please check the syntax.',

  // Profile errors
  PROFILE_NOT_PUBLIC: 'This profile is not publicly accessible.',
  PROFILE_NOT_FOUND: 'Profile not found.',
  USERNAME_TAKEN: 'This username is already taken. Please choose a different one.',

  // API errors
  INVALID_API_KEY: 'Invalid API key. Please check your API key and try again.',
  API_KEY_EXPIRED: 'API key has expired. Please generate a new one.',
  MISSING_API_KEY: 'API key is required for this operation.',
} as const;

/**
 * Success messages for positive user feedback
 */
export const SUCCESS_MESSAGES = {
  // Authentication
  SIGNUP_SUCCESS: 'Account created successfully! Welcome to GitSink.',
  SIGNIN_SUCCESS: 'Signed in successfully.',
  SIGNOUT_SUCCESS: 'Signed out successfully.',
  PASSWORD_RESET_SENT: 'Password reset instructions have been sent to your email.',
  PASSWORD_RESET_SUCCESS: 'Password reset successfully.',

  // Projects
  PROJECT_SYNCED: 'Repository synced successfully.',
  PROJECT_UPDATED: 'Project updated successfully.',
  PROJECT_DELETED: 'Project deleted successfully.',

  // Profile
  PROFILE_CREATED: 'Public profile created successfully.',
  PROFILE_UPDATED: 'Profile updated successfully.',
  PROFILE_SETTINGS_UPDATED: 'Profile settings updated successfully.',

  // API
  API_KEY_GENERATED: 'New API key generated successfully.',
  API_KEY_REVOKED: 'API key revoked successfully.',
} as const;

/**
 * Common validation patterns
 */
export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  USERNAME: /^[a-zA-Z0-9]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/,
  GITHUB_REPO_URL: /^https?:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?(?:\/.*)?$/,
  URL: /^https?:\/\/.+/,
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
} as const;

/**
 * Common HTTP headers
 */
export const HTTP_HEADERS = {
  AUTHORIZATION: 'Authorization',
  CONTENT_TYPE: 'Content-Type',
  USER_AGENT: 'User-Agent',
  X_FORWARDED_FOR: 'X-Forwarded-For',
  X_REAL_IP: 'X-Real-IP',
  X_REQUEST_ID: 'X-Request-ID',
  X_GITHUB_EVENT: 'X-GitHub-Event',
  X_GITHUB_SIGNATURE: 'X-Hub-Signature-256',
  X_GITLAB_EVENT: 'X-Gitlab-Event',
  X_GITLAB_TOKEN: 'X-Gitlab-Token',
} as const;

/**
 * Environment variable names
 */
export const ENV_VARS = {
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  DATABASE_URL: 'DATABASE_URL',
  REDIS_URL: 'REDIS_URL',
  JWT_SECRET: 'JWT_SECRET',
  GITHUB_CLIENT_ID: 'GITHUB_CLIENT_ID',
  GITHUB_CLIENT_SECRET: 'GITHUB_CLIENT_SECRET',
  GITHUB_API_BASE: 'GITHUB_API_BASE',
  GITHUB_MD_URL: 'GITHUB_MD_URL',
  TOKEN_ENCRYPTION_KEY: 'TOKEN_ENCRYPTION_KEY',
  SENTRY_DSN: 'SENTRY_DSN',
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  PORT: 3000,
  NODE_ENV: 'development',
  GITHUB_API_BASE: 'https://api.github.com/repos',
  GITHUB_MD_URL: 'https://raw.githubusercontent.com',
  PAGINATION_LIMIT: 20,
  CACHE_TTL: 300000, // 5 minutes
  REQUEST_TIMEOUT: 30000, // 30 seconds
} as const;

/**
 * File extensions and MIME types
 */
export const FILE_TYPES = {
  MARKDOWN: {
    extensions: ['.md', '.markdown'],
    mimeType: 'text/markdown',
  },
  JSON: {
    extensions: ['.json'],
    mimeType: 'application/json',
  },
  YAML: {
    extensions: ['.yml', '.yaml'],
    mimeType: 'application/x-yaml',
  },
  TEXT: {
    extensions: ['.txt'],
    mimeType: 'text/plain',
  },
} as const;

/**
 * Common regex patterns for code cleanup
 */
export const CLEANUP_PATTERNS = {
  // Matches unused imports (basic pattern)
  UNUSED_IMPORT: /^import\s+.*\s+from\s+['"][^'"]+['"];?\s*$/gm,

  // Matches TODO/FIXME comments
  TODO_COMMENTS: /(\/\/\s*(TODO|FIXME|XXX|HACK):?.*)|(\/\*\s*(TODO|FIXME|XXX|HACK):?.*?\*\/)/gi,

  // Matches console.log statements
  CONSOLE_LOG: /console\.(log|debug|info|warn|error)\s*\([^)]*\);?/g,

  // Matches empty lines (more than 2 consecutive)
  EXCESSIVE_EMPTY_LINES: /\n\s*\n\s*\n/g,

  // Matches trailing whitespace
  TRAILING_WHITESPACE: /[ \t]+$/gm,
} as const;

/**
 * Utility function to clean up code
 */
export function cleanupCode(code: string): string {
  return (
    code
      // Remove excessive empty lines
      .replace(CLEANUP_PATTERNS.EXCESSIVE_EMPTY_LINES, '\n\n')
      // Remove trailing whitespace
      .replace(CLEANUP_PATTERNS.TRAILING_WHITESPACE, '')
      // Ensure file ends with single newline
      .replace(/\n*$/, '\n')
  );
}

/**
 * Extracts TODO comments from code
 */
export function extractTodoComments(code: string): string[] {
  const matches = code.match(CLEANUP_PATTERNS.TODO_COMMENTS);
  return matches ? matches.map(match => match.trim()) : [];
}

/**
 * Removes console.log statements from code
 */
export function removeConsoleStatements(code: string): string {
  return code.replace(CLEANUP_PATTERNS.CONSOLE_LOG, '');
}

/**
 * Standardizes import statements
 */
export function standardizeImports(code: string): string {
  // This is a basic implementation - in practice, you'd use a proper AST parser
  return code
    .replace(/import\s*\*\s*as\s+(\w+)\s+from\s+(['"][^'"]+['"])/g, 'import * as $1 from $2')
    .replace(/import\s*\{([^}]+)\}\s*from\s+(['"][^'"]+['"])/g, (match, imports, module) => {
      const cleanImports = imports
        .split(',')
        .map((imp: string) => imp.trim())
        .filter((imp: string) => imp.length > 0)
        .sort()
        .join(', ');
      return `import { ${cleanImports} } from ${module}`;
    });
}

/**
 * Common utility functions that should be extracted
 */
export const COMMON_UTILS = {
  /**
   * Delays execution for specified milliseconds
   */
  delay: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Retries a function with exponential backoff
   */
  retry: async <T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelay: number = 1000,
  ): Promise<T> => {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxAttempts) {
          throw lastError;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  },

  /**
   * Chunks an array into smaller arrays
   */
  chunk: <T>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  },

  /**
   * Removes duplicates from array
   */
  unique: <T>(array: T[]): T[] => [...new Set(array)],

  /**
   * Safely parses JSON
   */
  safeJsonParse: <T>(json: string, defaultValue: T): T => {
    try {
      return JSON.parse(json);
    } catch {
      return defaultValue;
    }
  },

  /**
   * Capitalizes first letter of string
   */
  capitalize: (str: string): string => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(),

  /**
   * Converts string to kebab-case
   */
  kebabCase: (str: string): string => str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),

  /**
   * Converts string to camelCase
   */
  camelCase: (str: string): string => str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
} as const;
