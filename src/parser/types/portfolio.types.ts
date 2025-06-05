export interface PortfolioMetadata {
  title: string;
  description: string;
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
  custom?: Record<string, unknown>;
  body?: string;
}

export interface ParseFailure {
  valid: false;
  errors: string[];
}

export interface ParseSuccess {
  valid: true;
  data: PortfolioMetadata;
}

export type ParseResult = ParseFailure | ParseSuccess;
