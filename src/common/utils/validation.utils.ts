import { AUTH_CONSTANTS, DB_CONSTANTS, VALIDATION_CONSTANTS } from '../constants';

/**
 * Validation utility functions
 */

/**
 * Validates email format and length
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  if (email.length > AUTH_CONSTANTS.MAX_EMAIL_LENGTH) {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates password strength
 */
export function isPasswordStrong(password: string): boolean {
  if (!password || typeof password !== 'string') {
    return false;
  }

  if (password.length < AUTH_CONSTANTS.MIN_PASSWORD_LENGTH) {
    return false;
  }

  // At least 1 uppercase, 1 lowercase, 1 number, 1 special char
  const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return strongRegex.test(password);
}

/**
 * Calculates password strength score
 */
export function calculatePasswordStrength(
  password: string,
): 'very_weak' | 'weak' | 'medium' | 'strong' {
  if (!password) return 'very_weak';

  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[@$!%*?&]/.test(password)) score++;
  if (password.length >= 16) score++;

  if (score >= 6) return 'strong';
  if (score >= 4) return 'medium';
  if (score >= 2) return 'weak';
  return 'very_weak';
}

/**
 * Validates username format and length
 */
export function isValidUsername(username: string): boolean {
  if (!username || typeof username !== 'string') {
    return false;
  }

  if (
    username.length < VALIDATION_CONSTANTS.USERNAME_MIN_LENGTH ||
    username.length > VALIDATION_CONSTANTS.USERNAME_MAX_LENGTH
  ) {
    return false;
  }

  // Allow alphanumeric, hyphens, underscores, but not starting/ending with special chars
  const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;
  return usernameRegex.test(username);
}

/**
 * Validates project title
 */
export function isValidProjectTitle(title: string): boolean {
  if (!title || typeof title !== 'string') {
    return false;
  }

  return title.trim().length > 0 && title.length <= VALIDATION_CONSTANTS.TITLE_MAX_LENGTH;
}

/**
 * Validates project description
 */
export function isValidProjectDescription(description: string): boolean {
  if (!description || typeof description !== 'string') {
    return true; // Description is optional
  }

  return description.length <= VALIDATION_CONSTANTS.DESCRIPTION_MAX_LENGTH;
}

/**
 * Validates project tags
 */
export function isValidProjectTags(tags: string[]): boolean {
  if (!Array.isArray(tags)) {
    return false;
  }

  if (tags.length > VALIDATION_CONSTANTS.MAX_TAGS_PER_PROJECT) {
    return false;
  }

  return tags.every(
    tag =>
      typeof tag === 'string' &&
      tag.trim().length > 0 &&
      tag.length <= VALIDATION_CONSTANTS.TAG_MAX_LENGTH,
  );
}

/**
 * Validates URL format
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  if (url.length > VALIDATION_CONSTANTS.URL_MAX_LENGTH) {
    return false;
  }

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates API key format
 */
export function isValidApiKey(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  return apiKey.length >= AUTH_CONSTANTS.API_KEY_LENGTH;
}

/**
 * Sanitizes string input by trimming and removing null bytes
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input.trim().replace(/\0/g, '');
}

/**
 * Validates pagination parameters
 */
export function validatePagination(
  offset?: number,
  limit?: number,
): { offset: number; limit: number } {
  const validOffset = Math.max(0, Math.floor(offset || 0));
  const validLimit = Math.min(
    DB_CONSTANTS.MAX_PAGE_SIZE,
    Math.max(1, Math.floor(limit || DB_CONSTANTS.DEFAULT_PAGE_SIZE)),
  );

  return { offset: validOffset, limit: validLimit };
}

/**
 * Validates GitHub repository owner name
 */
export function isValidGitHubOwner(owner: string): boolean {
  if (!owner || typeof owner !== 'string') {
    return false;
  }

  // GitHub username/org name validation
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(owner);
}

/**
 * Validates GitHub repository name
 */
export function isValidGitHubRepo(repo: string): boolean {
  if (!repo || typeof repo !== 'string') {
    return false;
  }

  // GitHub repository name validation
  return /^[a-zA-Z0-9._-]+$/.test(repo);
}
