export interface PortfolioMetadata {
  title: string;
  description: string;
  tags?: string[];
  featured?: boolean;
  published?: boolean;
  demoUrl?: string;
  repoUrl?: string;
  icon?: string;
  category?: string;
  order?: number;
  githubSync?: boolean;
  body?: string;
}
