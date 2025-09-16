// Social link interface
export interface SocialLink {
  platform: string;
  url: string;
  username?: string;
}

// Technology stack interface
export interface TechnologyStack {
  languages?: string[];
  frameworks?: string[];
  databases?: string[];
  tools?: string[];
  platforms?: string[];
}

// Project metrics interface
export interface ProjectMetrics {
  complexity?: 'simple' | 'moderate' | 'complex' | 'enterprise';
  estimatedHours?: number;
  teamSize?: number;
  linesOfCode?: number;
}

// SEO metadata interface
export interface SEOMetadata {
  keywords?: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
}

// Enhanced Portfolio metadata interface
export interface PortfolioMetadata {
  // Core fields (required)
  title: string;
  description: string;

  // Basic metadata (optional)
  tags?: string[];
  featured?: boolean;
  published?: boolean;
  demoUrl?: string;
  repoUrl?: string;
  icon?: string;
  image?: string;
  category?: string;
  order?: number;
  githubSync?: boolean;

  // Enhanced metadata
  version?: string;
  license?: string;
  status?: 'active' | 'maintenance' | 'deprecated' | 'archived';
  visibility?: 'public' | 'private' | 'unlisted';
  priority?: 'low' | 'medium' | 'high' | 'critical';

  // Dates
  startDate?: string;
  endDate?: string;
  lastUpdated?: string;

  // URLs and links
  homepage?: string;
  documentation?: string;
  changelog?: string;
  issues?: string;
  wiki?: string;
  socialLinks?: SocialLink[];

  // Technology and development
  technologyStack?: TechnologyStack;
  requirements?: string[];
  installation?: string;
  usage?: string;

  // Project metadata
  metrics?: ProjectMetrics;
  contributors?: string[];
  sponsors?: string[];
  acknowledgments?: string[];

  // SEO and marketing
  seo?: SEOMetadata;

  // Custom metadata (flexible)
  custom?: Record<string, any>;

  // Content (populated during parsing)
  body?: string;

  // Validation metadata
  schemaVersion?: string;
  validatedAt?: string;
}

// Parse result interfaces
export interface ParseFailure {
  valid: false;
  errors: ParseError[];
  warnings?: ParseWarning[];
  recoveredData?: Partial<PortfolioMetadata>;
}

export interface ParseSuccess {
  valid: true;
  data: PortfolioMetadata;
  warnings?: ParseWarning[];
  metadata?: ParseMetadata;
}

export type ParseResult = ParseFailure | ParseSuccess;

// Error and warning interfaces
export interface ParseError {
  field?: string;
  message: string;
  code: string;
  severity: 'error' | 'critical';
  line?: number;
  column?: number;
}

export interface ParseWarning {
  field?: string;
  message: string;
  code: string;
  suggestion?: string;
  line?: number;
  column?: number;
}

// Parse metadata interface
export interface ParseMetadata {
  parseTime: number;
  schemaVersion: string;
  validationLevel: 'strict' | 'lenient';
  recoveryAttempts?: number;
  customFieldsFound?: string[];
}

// Parser options interface
export interface ParserOptions {
  validationLevel?: 'strict' | 'lenient';
  allowCustomFields?: boolean;
  enableRecovery?: boolean;
  maxRecoveryAttempts?: number;
  schemaVersion?: string;
  customValidators?: Record<string, (value: any) => boolean>;
}

// Validation context interface
export interface ValidationContext {
  field: string;
  value: any;
  parent?: any;
  root: any;
  options: ParserOptions;
}
