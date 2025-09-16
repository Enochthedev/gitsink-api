import { User } from '@prisma/client';
import {
  generateSecureApiKey,
  generateSecureToken,
  hashSecret,
  compareSecret,
  simulateHashOperation,
  addTimingAttackDelay,
} from '../../common/utils/security.utils';
import {
  isValidEmail,
  isPasswordStrong,
  calculatePasswordStrength,
  isValidUsername,
} from '../../common/utils/validation.utils';
import {
  AuthenticationError,
  ValidationError,
  ConflictError,
} from '../../common/utils/error.utils';
import { AUTH_CONSTANTS } from '../../common/constants';

/**
 * Authentication operation utilities
 */

export interface SignupData {
  email: string;
  password?: string;
  username?: string;
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
}

export interface SignupResult {
  user: User;
  apiKey: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

/**
 * Validates signup input data
 */
export function validateSignupData(data: SignupData): void {
  if (!isValidEmail(data.email)) {
    throw new ValidationError('Invalid email format', 'INVALID_EMAIL');
  }

  if (data.password && !isPasswordStrong(data.password)) {
    throw new ValidationError('Password does not meet security requirements', 'WEAK_PASSWORD', {
      requirements: [
        'At least 8 characters',
        'At least 1 uppercase letter',
        'At least 1 lowercase letter',
        'At least 1 number',
        'At least 1 special character (@$!%*?&)',
      ],
    });
  }

  if (data.username && !isValidUsername(data.username)) {
    throw new ValidationError('Invalid username format', 'INVALID_USERNAME', {
      requirements: [
        'Between 3 and 50 characters',
        'Alphanumeric characters, hyphens, and underscores only',
        'Cannot start or end with special characters',
      ],
    });
  }
}

/**
 * Validates signin input data
 */
export function validateSigninData(email: string, password: string): void {
  if (!isValidEmail(email)) {
    throw new ValidationError('Invalid email format', 'INVALID_EMAIL');
  }

  if (!password || typeof password !== 'string' || password.length === 0) {
    throw new ValidationError('Password is required', 'MISSING_PASSWORD');
  }
}

/**
 * Generates secure credentials for new user
 */
export async function generateUserCredentials(password?: string): Promise<{
  apiKey: string;
  hashedApiKey: string;
  hashedPassword: string | null;
}> {
  const apiKey = generateSecureApiKey();

  const [hashedApiKey, hashedPassword] = await Promise.all([
    hashSecret(apiKey, AUTH_CONSTANTS.BCRYPT_ROUNDS),
    password ? hashSecret(password, AUTH_CONSTANTS.BCRYPT_ROUNDS) : Promise.resolve(null),
  ]);

  return {
    apiKey,
    hashedApiKey,
    hashedPassword,
  };
}

/**
 * Validates user credentials for signin
 */
export async function validateUserCredentials(
  user: User | null,
  password: string,
  operationStartTime: number,
): Promise<User> {
  if (!user || !user.password) {
    // Simulate hash to prevent timing attacks
    await simulateHashOperation();
    await addTimingAttackDelay(operationStartTime);
    throw new AuthenticationError('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const isPasswordValid = await compareSecret(password, user.password);

  if (!isPasswordValid) {
    await addTimingAttackDelay(operationStartTime);
    throw new AuthenticationError('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  return user;
}

/**
 * Validates API key format and strength
 */
export function validateApiKeyFormat(apiKey: string): void {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new ValidationError('API key is required', 'MISSING_API_KEY');
  }

  if (apiKey.length < AUTH_CONSTANTS.API_KEY_LENGTH) {
    throw new ValidationError('Invalid API key format', 'INVALID_API_KEY_FORMAT');
  }
}

/**
 * Finds user by API key with timing-safe comparison
 */
export async function findUserByApiKey(users: User[], apiKey: string): Promise<User | null> {
  for (const user of users) {
    if (user.apiKey && (await compareSecret(apiKey, user.apiKey))) {
      return user;
    }
  }
  return null;
}

/**
 * Generates magic link token and hash
 */
export async function generateMagicLinkToken(): Promise<{
  token: string;
  hashedToken: string;
  expiresAt: Date;
}> {
  const token = generateSecureToken();
  const hashedToken = await hashSecret(token, AUTH_CONSTANTS.BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.MAGIC_LINK_EXPIRY);

  return { token, hashedToken, expiresAt };
}

/**
 * Generates password reset token and hash
 */
export async function generatePasswordResetToken(): Promise<{
  token: string;
  hashedToken: string;
  expiresAt: Date;
}> {
  const token = generateSecureToken();
  const hashedToken = await hashSecret(token, AUTH_CONSTANTS.BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.PASSWORD_RESET_EXPIRY);

  return { token, hashedToken, expiresAt };
}

/**
 * Validates password reset token
 */
export async function validatePasswordResetToken(
  users: User[],
  token: string,
): Promise<User | null> {
  for (const user of users) {
    if (
      user.resetToken &&
      user.resetTokenExpires &&
      user.resetTokenExpires > new Date() &&
      (await compareSecret(token, user.resetToken))
    ) {
      return user;
    }
  }
  return null;
}

/**
 * Validates magic link token
 */
export async function validateMagicLinkToken(
  storedTokens: Array<{ tokenHash: string; email: string; expiresAt: Date }>,
  token: string,
  email: string,
): Promise<boolean> {
  const now = new Date();

  for (const storedToken of storedTokens) {
    if (
      storedToken.email === email &&
      storedToken.expiresAt > now &&
      (await compareSecret(token, storedToken.tokenHash))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks for existing user conflicts
 */
export async function checkUserConflicts(
  email: string,
  checkEmailFn: (email: string) => Promise<User | null>,
  username?: string,
  checkUsernameFn?: (username: string) => Promise<User | null>,
): Promise<void> {
  const existingUser = await checkEmailFn(email);
  if (existingUser) {
    await simulateHashOperation(); // Prevent timing attacks
    throw new ConflictError('Email already in use', 'EMAIL_EXISTS');
  }

  if (username && checkUsernameFn) {
    const existingUsername = await checkUsernameFn(username);
    if (existingUsername) {
      await simulateHashOperation(); // Timing safe
      throw new ConflictError('Username already taken', 'USERNAME_EXISTS');
    }
  }
}

/**
 * Tracks password strength for metrics
 */
export function getPasswordStrengthMetric(password?: string): string {
  if (!password) return 'none';
  return calculatePasswordStrength(password);
}

/**
 * Creates user data for database insertion
 */
export function createUserData(
  signupData: SignupData,
  hashedApiKey: string,
  hashedPassword: string | null,
): any {
  return {
    email: signupData.email,
    username: signupData.username,
    apiKey: hashedApiKey,
    password: hashedPassword,
    lastLoginAt: new Date(),
    createdAt: new Date(),
  };
}

/**
 * Creates sanitized user response
 */
export function createUserResponse(user: User): {
  id: string;
  email: string;
  username: string | null;
  tier: string;
} {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    tier: user.tier,
  };
}

/**
 * Validates refresh token payload structure
 */
export function validateRefreshTokenPayload(payload: any): {
  sub: string;
  type: string;
  jti: string;
  exp: number;
  iat: number;
} {
  if (!payload.sub || !payload.jti || !payload.type || !payload.exp) {
    throw new AuthenticationError('Malformed token payload', 'MALFORMED_PAYLOAD');
  }

  if (payload.type !== 'refresh') {
    throw new AuthenticationError('Invalid token type', 'WRONG_TOKEN_TYPE');
  }

  // Check if token is expired
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new AuthenticationError('Refresh token expired', 'TOKEN_EXPIRED');
  }

  // Check if token is too old (issued more than 7 days ago)
  const maxAge = AUTH_CONSTANTS.JWT_REFRESH_TOKEN_EXPIRY;
  if (payload.iat && now - payload.iat > maxAge) {
    throw new AuthenticationError('Refresh token too old', 'TOKEN_TOO_OLD');
  }

  return payload;
}

/**
 * Validates refresh token usage patterns
 */
export function validateRefreshTokenUsage(storedToken: any, jti: string): void {
  if (!storedToken) {
    throw new AuthenticationError('Invalid refresh token', 'TOKEN_NOT_FOUND');
  }

  // Check if user account is still active
  if (storedToken.user?.deletedAt) {
    throw new AuthenticationError('User account no longer exists', 'USER_DELETED');
  }

  // Check for suspicious usage patterns
  const timeSinceLastUse = storedToken.lastUsedAt
    ? Date.now() - storedToken.lastUsedAt.getTime()
    : 0;

  // If token was used very recently (within 1 second), it might be a replay attack
  if (timeSinceLastUse < 1000 && storedToken.lastUsedAt) {
    // Log warning but don't fail - this could be legitimate rapid requests
  }

  // Check usage count for anomalies
  if (storedToken.usageCount > AUTH_CONSTANTS.MAX_REFRESH_TOKEN_USAGE) {
    throw new AuthenticationError('Refresh token usage limit exceeded', 'TOKEN_USAGE_EXCEEDED', {
      usageCount: storedToken.usageCount,
    });
  }
}
