export interface RepositoryContent {
  files: FileInfo[];
  readme?: string;
  packageJson?: any;
  languages: Record<string, number>;
  totalSize: number;
}

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  content?: string;
  language?: string;
}

export interface TechnologyStack {
  languages: LanguageInfo[];
  frameworks: FrameworkInfo[];
  databases: string[];
  tools: string[];
  platforms: string[];
  buildTools: string[];
  testingFrameworks: string[];
}

export interface LanguageInfo {
  name: string;
  percentage: number;
  bytes: number;
  confidence: number;
}

export interface FrameworkInfo {
  name: string;
  version?: string;
  confidence: number;
  category: 'web' | 'mobile' | 'desktop' | 'backend' | 'ml' | 'game' | 'other';
}

export interface ProjectCategory {
  primary: string;
  secondary?: string[];
  confidence: number;
  tags: string[];
}

export interface AIAnalysisResult {
  description: string;
  technologies: TechnologyStack;
  category: ProjectCategory;
  complexity: 'simple' | 'moderate' | 'complex' | 'enterprise';
  suggestedTags: string[];
  keyFeatures: string[];
  confidence: number;
  model: string;
  version: number;
  analysisDate: Date;
}

export interface EnrichmentConfig {
  aiServiceUrl?: string;
  aiServiceApiKey?: string;
  enableAIDescription: boolean;
  enableTechnologyDetection: boolean;
  enableCategorization: boolean;
  confidenceThreshold: number;
  maxFileSize: number;
  maxFilesToAnalyze: number;
  supportedLanguages: string[];
}

export interface AIServiceResponse {
  description?: string;
  summary?: string;
  keyFeatures?: string[];
  suggestedTags?: string[];
  category?: string;
  confidence: number;
  error?: string;
}
