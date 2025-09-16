/**
 * Parses a GitHub repository URL to extract owner and repository name
 * @param url - The GitHub repository URL (HTTPS or SSH)
 * @returns Object containing owner and repo name
 * @throws Error if URL format is invalid
 */
export function parseGitHubRepoUrl(url: string): {
  owner: string;
  repo: string;
} {
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  // Handle different GitHub URL formats
  const patterns = [
    // HTTPS URLs
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
    // SSH URLs
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
    // GitHub CLI format
    /^([^/]+)\/([^/]+)$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const owner = match[1];
      const repo = match[2];

      // Validate owner and repo names
      if (!owner || !repo) {
        throw new Error('Invalid GitHub repo URL: missing owner or repository name');
      }

      // GitHub username/org name validation (basic)
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(owner)) {
        throw new Error('Invalid GitHub owner name');
      }

      // GitHub repository name validation (basic)
      if (!/^[a-zA-Z0-9._-]+$/.test(repo)) {
        throw new Error('Invalid GitHub repository name');
      }

      return { owner, repo };
    }
  }

  throw new Error('Invalid GitHub repo URL format');
}

/**
 * Constructs a GitHub repository URL from owner and repo name
 * @param owner - Repository owner (username or organization)
 * @param repo - Repository name
 * @param format - URL format ('https' or 'ssh')
 * @returns Formatted GitHub URL
 */
export function buildGitHubRepoUrl(
  owner: string,
  repo: string,
  format: 'https' | 'ssh' = 'https',
): string {
  if (!owner || !repo) {
    throw new Error('Owner and repo name are required');
  }

  if (format === 'ssh') {
    return `git@github.com:${owner}/${repo}.git`;
  }

  return `https://github.com/${owner}/${repo}`;
}

/**
 * Validates if a string is a valid GitHub repository URL
 * @param url - URL to validate
 * @returns True if valid GitHub repo URL
 */
export function isValidGitHubRepoUrl(url: string): boolean {
  try {
    parseGitHubRepoUrl(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts repository information from GitHub API URL
 * @param apiUrl - GitHub API URL (e.g., https://api.github.com/repos/owner/repo)
 * @returns Object containing owner and repo name
 */
export function parseGitHubApiUrl(apiUrl: string): {
  owner: string;
  repo: string;
} {
  const match = apiUrl.match(/api\.github\.com\/repos\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error('Invalid GitHub API URL');
  }

  return { owner: match[1], repo: match[2] };
}

/**
 * Constructs GitHub raw content URL for a file
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param branch - Branch name (default: 'main')
 * @param filePath - Path to the file
 * @returns Raw content URL
 */
export function buildGitHubRawUrl(
  owner: string,
  repo: string,
  branch: string = 'main',
  filePath: string,
): string {
  if (!owner || !repo || !filePath) {
    throw new Error('Owner, repo, and filePath are required');
  }

  // Remove leading slash from filePath if present
  const cleanFilePath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleanFilePath}`;
}

/**
 * Constructs GitHub API URL for repository
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns GitHub API URL
 */
export function buildGitHubApiUrl(owner: string, repo: string): string {
  if (!owner || !repo) {
    throw new Error('Owner and repo name are required');
  }

  return `https://api.github.com/repos/${owner}/${repo}`;
}
