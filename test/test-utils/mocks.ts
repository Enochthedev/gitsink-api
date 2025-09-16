/**
 * Comprehensive mock implementations for testing
 */

// Mock Prisma Service
export const createMockPrismaService = () => ({
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
  },
  project: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
    groupBy: jest.fn(),
  },
  publicProfile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  magicLinkToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  aiAnalysis: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  syncHistory: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
  $transaction: jest.fn(),
});

// Mock Config Service
export const createMockConfigService = () => ({
  get: jest.fn((key: string) => {
    const config = {
      GITHUB_API_BASE: 'https://api.github.com/repos',
      GITHUB_MD_URL: 'https://raw.githubusercontent.com',
      TOKEN_ENCRYPTION_KEY: 'test-encryption-key',
      JWT_SECRET: 'test-jwt-secret',
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-client-secret',
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    };
    return config[key];
  }),
});

// Mock JWT Service
export const createMockJwtService = () => ({
  sign: jest.fn((payload: any, options?: any) => 'mock-jwt-token'),
  verify: jest.fn((token: string) => ({
    sub: 'user-id',
    email: 'test@example.com',
  })),
  verifyAsync: jest.fn((token: string) =>
    Promise.resolve({ sub: 'user-id', email: 'test@example.com' }),
  ),
  decode: jest.fn((token: string) => ({
    sub: 'user-id',
    jti: 'token-id',
    exp: Date.now() / 1000 + 3600,
  })),
});

// Mock JWT Token Service
export const createMockJwtTokenService = () => ({
  generateTokenPair: jest.fn((user: any, deviceInfo?: any) => ({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresIn: 900,
    refreshExpiresIn: 604800,
  })),
  refreshAccessToken: jest.fn((refreshToken: string) => ({
    accessToken: 'new-access-token',
    expiresIn: 900,
  })),
  revokeRefreshToken: jest.fn(),
  validateToken: jest.fn(),
});

// Mock Cache Manager
export const createMockCacheManager = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  reset: jest.fn(),
  wrap: jest.fn(),
});

// Mock Logger
export const createMockLogger = () => ({
  setContext: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
});

// Mock Enqueue Service
export const createMockEnqueueService = () => ({
  enqueueSignupEmail: jest.fn(),
  enqueueSigninEmail: jest.fn(),
  enqueueForgotPassword: jest.fn(),
  enqueuePasswordResetConfirmation: jest.fn(),
  enqueueMagicLinkSignInEmail: jest.fn(),
});

// Mock Metrics Service
export const createMockMetricsService = () => ({
  createCustomCounter: jest.fn(() => ({
    inc: jest.fn(),
  })),
  createCustomHistogram: jest.fn(() => ({
    observe: jest.fn(),
  })),
  createCustomGauge: jest.fn(() => ({
    set: jest.fn(),
    inc: jest.fn(),
    dec: jest.fn(),
  })),
  recordDatabaseQueryDuration: jest.fn(),
  incrementDatabaseQueries: jest.fn(),
  recordAPICall: jest.fn(),
  recordCacheHit: jest.fn(),
});

// Mock Parser Service
export const createMockParserService = () => ({
  parseMarkdown: jest.fn((markdown: string) => ({
    valid: true,
    data: {
      title: 'Test Project',
      description: 'Test description',
      tags: ['test'],
      featured: false,
      published: true,
      body: 'Test content',
      validatedAt: new Date(),
      schemaVersion: '1.0.0',
    },
    metadata: {
      parseTime: 10,
    },
  })),
  validateSchemaVersion: jest.fn(() => true),
  getPerformanceMetrics: jest.fn(() => ({
    averageParseTime: 10,
    totalParses: 100,
  })),
});

// Mock Sync Queue Service
export const createMockSyncQueueService = () => ({
  addJob: jest.fn(),
  getJobStatus: jest.fn(),
  removeJob: jest.fn(),
  getQueueHealth: jest.fn(() => ({
    waiting: 0,
    active: 0,
    completed: 10,
    failed: 0,
  })),
});

// Mock AI Enrichment Service
export const createMockAIEnrichmentService = () => ({
  analyzeRepository: jest.fn(),
  generateDescription: jest.fn(() => 'AI generated description'),
  detectTechnologies: jest.fn(() => ({
    languages: [{ name: 'TypeScript', percentage: 80 }],
    frameworks: ['NestJS'],
    databases: ['PostgreSQL'],
    tools: ['Jest'],
    platforms: ['Node.js'],
  })),
  categorizeProject: jest.fn(() => 'web'),
  generateTags: jest.fn(() => ['api', 'backend']),
});

// Mock Platform Provider
export const createMockPlatformProvider = () => ({
  name: 'github',
  authenticate: jest.fn(),
  fetchRepositories: jest.fn(() => []),
  fetchRepository: jest.fn(),
  fetchPortfolioFile: jest.fn(),
  setupWebhook: jest.fn(),
});

// Mock Webhook Service
export const createMockWebhookService = () => ({
  processWebhook: jest.fn(),
  validateSignature: jest.fn(() => true),
  handleGitHubWebhook: jest.fn(),
  handleGitLabWebhook: jest.fn(),
  handleBitbucketWebhook: jest.fn(),
});

// Mock Audit Service
export const createMockAuditService = () => ({
  logSyncOperation: jest.fn(),
  logUserAction: jest.fn(),
  logSystemEvent: jest.fn(),
  getAuditTrail: jest.fn(() => []),
  generateComplianceReport: jest.fn(),
});

// Mock Profile Service
export const createMockProfileService = () => ({
  createPublicProfile: jest.fn(),
  updateProfileSettings: jest.fn(),
  getPublicProfile: jest.fn(),
  generateProfileUrl: jest.fn(() => 'https://example.com/profile/username'),
  customizeProfileTheme: jest.fn(),
});

// Mock Health Service
export const createMockHealthService = () => ({
  checkDatabase: jest.fn(() => ({ status: 'healthy', responseTime: 10 })),
  checkRedis: jest.fn(() => ({ status: 'healthy', responseTime: 5 })),
  checkQueues: jest.fn(() => ({ status: 'healthy', responseTime: 15 })),
  checkExternalServices: jest.fn(() => ({
    github: { status: 'healthy', responseTime: 100 },
  })),
  getOverallHealth: jest.fn(() => ({ status: 'healthy', uptime: 3600 })),
});

// Mock Rate Limiting Service
export const createMockRateLimitingService = () => ({
  checkRateLimit: jest.fn(() => ({
    allowed: true,
    remaining: 100,
    resetTime: Date.now() + 3600000,
  })),
  incrementCounter: jest.fn(),
  getRateLimitInfo: jest.fn(),
  resetRateLimit: jest.fn(),
});

// Mock Security Monitoring Service
export const createMockSecurityMonitoringService = () => ({
  logSecurityEvent: jest.fn(),
  detectSuspiciousActivity: jest.fn(() => false),
  blockIP: jest.fn(),
  unblockIP: jest.fn(),
  getSecurityMetrics: jest.fn(),
});

// Mock Mail Service
export const createMockMailService = () => ({
  sendSignupEmail: jest.fn(),
  sendSigninEmail: jest.fn(),
  sendForgotPasswordEmail: jest.fn(),
  sendPasswordResetConfirmation: jest.fn(),
  sendMagicLinkEmail: jest.fn(),
});

// Test Data Factories
export const createMockUser = (overrides: Partial<any> = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
  password: '$2b$12$hashedpassword',
  apiKey: '$2b$12$hashedapikey',
  githubId: '12345',
  githubToken: 'encrypted-token',
  tier: 'free',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: new Date(),
  apiKeyUpdatedAt: new Date(),
  resetToken: null,
  resetTokenExpires: null,
  ...overrides,
});

export const createMockProject = (overrides: Partial<any> = {}) => ({
  id: 'project-123',
  ownerId: 'user-123',
  title: 'Test Project',
  description: 'A test project',
  tags: ['test', 'demo'],
  icon: null,
  image: null,
  demoUrl: null,
  repoUrl: 'https://github.com/user/repo',
  valid: true,
  validationErrors: [],
  featured: false,
  published: true,
  category: 'web',
  order: null,
  blacklisted: false,
  markdown: '# Test Project\n\nThis is a test.',
  collaborators: [],
  firstCommitAt: null,
  lastCommitAt: new Date(),
  githubMetadata: {},
  customMetadata: {},
  syncedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  starCount: 10,
  forkCount: 2,
  language: 'TypeScript',
  platform: 'github',
  isPrivate: false,
  archived: false,
  hasWiki: false,
  hasPages: false,
  openIssues: 0,
  size: 1024,
  ...overrides,
});

export const createMockAuditLog = (overrides: Partial<any> = {}) => ({
  id: 'audit-123',
  userId: 'user-123',
  action: 'project_sync',
  resource: 'project',
  resourceId: 'project-123',
  details: { repoUrl: 'https://github.com/user/repo' },
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0',
  timestamp: new Date(),
  ...overrides,
});

export const createMockPublicProfile = (overrides: Partial<any> = {}) => ({
  id: 'profile-123',
  userId: 'user-123',
  username: 'testuser',
  displayName: 'Test User',
  bio: 'A test user profile',
  avatar: null,
  location: 'Test City',
  website: 'https://example.com',
  socialLinks: [],
  theme: {},
  settings: {},
  isPublic: true,
  customDomain: null,
  viewCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Axios Mock Helper
export const createMockAxiosResponse = <T>(data: T, status = 200) => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config: {} as any,
});

// GitHub API Mock Data
export const createMockGitHubRepo = (overrides: Partial<any> = {}) => ({
  id: 123456,
  name: 'test-repo',
  full_name: 'user/test-repo',
  description: 'A test repository',
  html_url: 'https://github.com/user/test-repo',
  clone_url: 'https://github.com/user/test-repo.git',
  default_branch: 'main',
  language: 'TypeScript',
  topics: ['test', 'demo'],
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-12-01T00:00:00Z',
  pushed_at: '2023-12-01T00:00:00Z',
  stargazers_count: 10,
  forks_count: 2,
  private: false,
  archived: false,
  disabled: false,
  has_wiki: false,
  has_pages: false,
  open_issues_count: 0,
  size: 1024,
  contributors_url: 'https://api.github.com/repos/user/test-repo/contributors',
  ...overrides,
});

// Error Mock Helpers
export const createMockError = (message: string, code?: string) => {
  const error = new Error(message);
  if (code) {
    (error as any).code = code;
  }
  return error;
};

export const createMockAxiosError = (status: number, message: string) => {
  const error = new Error(message);
  (error as any).isAxiosError = true;
  (error as any).response = {
    status,
    statusText: message,
    data: { message },
  };
  return error;
};
