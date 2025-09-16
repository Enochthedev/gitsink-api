import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AUTH_CONSTANTS, SECURITY_CONSTANTS } from '../constants';

/**
 * Security utility functions
 */

/**
 * Generates a secure random API key
 */
export function generateSecureApiKey(): string {
  return randomBytes(AUTH_CONSTANTS.API_KEY_LENGTH).toString('hex');
}

/**
 * Generates a secure random token
 */
export function generateSecureToken(length: number = AUTH_CONSTANTS.API_KEY_LENGTH): string {
  return randomBytes(length).toString('hex');
}

/**
 * Hashes a password or token with bcrypt
 */
export async function hashSecret(
  secret: string,
  rounds: number = AUTH_CONSTANTS.BCRYPT_ROUNDS,
): Promise<string> {
  return bcrypt.hash(secret, rounds);
}

/**
 * Compares a plain text secret with a hash
 */
export async function compareSecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

/**
 * Simulates a hash operation to prevent timing attacks
 */
export async function simulateHashOperation(): Promise<void> {
  // Perform a dummy bcrypt operation to maintain consistent timing
  await bcrypt.compare('dummy', '$2b$12$dummy.hash.to.prevent.timing.attacks');
}

/**
 * Adds a random delay to prevent timing attacks
 */
export async function addTimingAttackDelay(operationStartTime: number): Promise<void> {
  const operationDuration = Date.now() - operationStartTime;
  const minDelay = SECURITY_CONSTANTS.TIMING_ATTACK_DELAY_MIN;
  const maxDelay = SECURITY_CONSTANTS.TIMING_ATTACK_DELAY_MAX;

  // Calculate random delay within range
  const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

  // Only delay if operation was faster than minimum delay
  if (operationDuration < randomDelay) {
    const delayTime = randomDelay - operationDuration;
    await new Promise(resolve => setTimeout(resolve, delayTime));
  }
}

/**
 * Sanitizes input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .slice(0, 10000); // Limit length to prevent DoS
}

/**
 * Validates and sanitizes email input
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  return email.trim().toLowerCase().slice(0, AUTH_CONSTANTS.MAX_EMAIL_LENGTH);
}

/**
 * Checks if an IP address is in a private range
 */
export function isPrivateIP(ip: string): boolean {
  if (!ip) return false;

  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/,
  ];

  return privateRanges.some(range => range.test(ip));
}

/**
 * Extracts client IP from request headers
 */
export function extractClientIP(headers: Record<string, string | string[]>): string {
  // Check various headers in order of preference
  const ipHeaders = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'cf-connecting-ip', // Cloudflare
    'x-cluster-client-ip',
  ];

  for (const header of ipHeaders) {
    const value = headers[header];
    if (value) {
      const ip = Array.isArray(value) ? value[0] : value;
      // Take the first IP if comma-separated
      const firstIP = ip.split(',')[0].trim();
      if (firstIP && !isPrivateIP(firstIP)) {
        return firstIP;
      }
    }
  }

  return 'unknown';
}

/**
 * Generates a secure session ID
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Creates a secure random string for CSRF tokens
 */
export function generateCSRFToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Validates that a string contains only safe characters
 */
export function containsOnlySafeCharacters(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }

  // Allow alphanumeric, spaces, and common punctuation
  const safePattern = /^[a-zA-Z0-9\s\-_.,!?@#$%^&*()+=\[\]{}|\\:";'<>\/~`]*$/;
  return safePattern.test(input);
}

/**
 * Masks sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (!data || typeof data !== 'string') {
    return '';
  }

  if (data.length <= visibleChars) {
    return '*'.repeat(data.length);
  }

  const visible = data.substring(0, visibleChars);
  const masked = '*'.repeat(data.length - visibleChars);
  return visible + masked;
}

/**
 * Validates that a URL is safe (not pointing to internal resources)
 */
export function isSafeURL(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsedURL = new URL(url);

    // Only allow HTTP and HTTPS
    if (!['http:', 'https:'].includes(parsedURL.protocol)) {
      return false;
    }

    // Block localhost and private IPs
    const hostname = parsedURL.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      isPrivateIP(hostname)
    ) {
      return false;
    }

    // Block common internal domains
    const blockedDomains = ['internal', 'local', 'intranet', 'corp', 'admin'];

    if (blockedDomains.some(domain => hostname.includes(domain))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Rate limiting key generator
 */
export function generateRateLimitKey(identifier: string, endpoint?: string): string {
  const sanitizedIdentifier = sanitizeInput(identifier);
  const sanitizedEndpoint = endpoint ? sanitizeInput(endpoint) : 'global';
  return `rate_limit:${sanitizedIdentifier}:${sanitizedEndpoint}`;
}

/**
 * Checks if a user agent string looks suspicious
 */
export function isSuspiciousUserAgent(userAgent: string): boolean {
  if (!userAgent || typeof userAgent !== 'string') {
    return true; // No user agent is suspicious
  }

  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /go-http-client/i,
  ];

  return suspiciousPatterns.some(pattern => pattern.test(userAgent));
}
