import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TechnologyDetectionService } from './technology-detection.service';
import { DescriptionGenerationService } from './description-generation.service';
import { ProjectCategorizationService } from './project-categorization.service';
import {
  AIAnalysisResult,
  EnrichmentConfig,
  ProjectCategory,
  RepositoryContent,
  TechnologyStack,
} from './interfaces/ai-enrichment.interface';

@Injectable()
export class AIEnrichmentService {
  private readonly logger = new Logger(AIEnrichmentService.name);
  private readonly config: EnrichmentConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly technologyDetection: TechnologyDetectionService,
    private readonly descriptionGeneration: DescriptionGenerationService,
    private readonly projectCategorization: ProjectCategorizationService,
  ) {
    this.config = this.loadConfiguration();
  }

  /**
   * Analyze a repository and generate comprehensive AI enrichment data
   */
  async analyzeRepository(
    projectId: string,
    repositoryContent: RepositoryContent,
    forceReanalysis = false,
  ): Promise<AIAnalysisResult> {
    this.logger.log(`Starting AI analysis for project ${projectId}`);

    try {
      // Check if we have recent analysis and don't need to reanalyze
      if (!forceReanalysis) {
        const existingAnalysis = await this.getLatestAnalysis(projectId);
        if (existingAnalysis && this.isAnalysisRecent(existingAnalysis.createdAt)) {
          this.logger.log(`Using existing analysis for project ${projectId}`);
          return this.parseAnalysisResult(existingAnalysis.analysis as any);
        }
      }

      // Perform comprehensive analysis
      const [technologies, description, category] = await Promise.allSettled([
        this.analyzeTechnologies(repositoryContent),
        this.generateDescription(repositoryContent),
        this.categorizeProject(repositoryContent),
      ]);

      // Extract results, handling any failures gracefully
      const technologyStack =
        this.extractResult(technologies, 'technology detection') || this.getEmptyTechnologyStack();
      const generatedDescription = this.extractResult(description, 'description generation');
      const projectCategory =
        this.extractResult(category, 'project categorization') || this.getDefaultCategory();

      // Calculate overall complexity
      const complexity = this.calculateComplexity(repositoryContent, technologyStack);

      // Generate suggested tags
      const suggestedTags = this.generateSuggestedTags(
        technologyStack,
        projectCategory,
        repositoryContent,
      );

      // Extract key features
      const keyFeatures = this.extractKeyFeatures(repositoryContent, technologyStack);

      // Calculate overall confidence
      const confidence = this.calculateOverallConfidence([
        technologyStack,
        generatedDescription,
        projectCategory,
      ]);

      const analysisResult: AIAnalysisResult = {
        description: generatedDescription?.description || 'No description available',
        technologies: technologyStack || this.getEmptyTechnologyStack(),
        category: projectCategory || this.getDefaultCategory(),
        complexity,
        suggestedTags,
        keyFeatures,
        confidence,
        model: 'gitsink-ai-v1',
        version: 1,
        analysisDate: new Date(),
      };

      // Store the analysis result
      await this.storeAnalysisResult(projectId, analysisResult);

      this.logger.log(
        `Completed AI analysis for project ${projectId} with confidence ${confidence}`,
      );
      return analysisResult;
    } catch (error) {
      this.logger.error(`Failed to analyze repository for project ${projectId}:`, error);
      const errorMessage =
        error instanceof Error
          ? error instanceof Error
            ? error.message
            : String(error)
          : 'Unknown error';
      throw new Error(`AI analysis failed: ${errorMessage}`);
    }
  }

  /**
   * Get the latest AI analysis for a project
   */
  async getLatestAnalysis(projectId: string) {
    return this.prisma.aIAnalysis.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Analyze repository technologies
   */
  private async analyzeTechnologies(content: RepositoryContent): Promise<TechnologyStack> {
    if (!this.config.enableTechnologyDetection) {
      return this.getEmptyTechnologyStack();
    }

    return this.technologyDetection.detectTechnologies(content);
  }

  /**
   * Generate AI-powered description
   */
  private async generateDescription(
    content: RepositoryContent,
  ): Promise<{ description: string; confidence: number }> {
    if (!this.config.enableAIDescription) {
      return {
        description: 'AI description generation disabled',
        confidence: 0,
      };
    }

    return this.descriptionGeneration.generateDescription(content);
  }

  /**
   * Categorize the project
   */
  private async categorizeProject(content: RepositoryContent): Promise<ProjectCategory> {
    if (!this.config.enableCategorization) {
      return this.getDefaultCategory();
    }

    return this.projectCategorization.categorizeProject(content);
  }

  /**
   * Calculate project complexity based on various factors
   */
  private calculateComplexity(
    content: RepositoryContent,
    technologies?: TechnologyStack,
  ): 'simple' | 'moderate' | 'complex' | 'enterprise' {
    let complexityScore = 0;

    // File count factor
    if (content.files.length > 100) complexityScore += 2;
    else if (content.files.length > 50) complexityScore += 1;

    // Size factor
    if (content.totalSize > 10000000)
      complexityScore += 2; // > 10MB
    else if (content.totalSize > 1000000) complexityScore += 1; // > 1MB

    // Technology diversity factor
    if (technologies) {
      if (technologies.languages.length > 5) complexityScore += 2;
      else if (technologies.languages.length > 3) complexityScore += 1;

      if (technologies.frameworks.length > 3) complexityScore += 1;
      if (technologies.databases.length > 1) complexityScore += 1;
    }

    // Configuration files factor
    const configFiles = content.files.filter(f =>
      ['dockerfile', 'docker-compose', 'kubernetes', 'terraform', '.github', '.gitlab-ci'].some(
        pattern => f.path.toLowerCase().includes(pattern),
      ),
    );
    if (configFiles.length > 5) complexityScore += 2;
    else if (configFiles.length > 2) complexityScore += 1;

    // Determine complexity level
    if (complexityScore >= 6) return 'enterprise';
    if (complexityScore >= 4) return 'complex';
    if (complexityScore >= 2) return 'moderate';
    return 'simple';
  }

  /**
   * Generate suggested tags based on analysis
   */
  private generateSuggestedTags(
    technologies: TechnologyStack,
    category: ProjectCategory,
    content: RepositoryContent,
  ): string[] {
    const tags = new Set<string>();

    // Add language tags
    technologies?.languages?.forEach(lang => {
      if (lang.percentage > 10) {
        tags.add(lang.name.toLowerCase());
      }
    });

    // Add framework tags
    technologies?.frameworks?.forEach(framework => {
      tags.add(framework.name.toLowerCase());
      tags.add(framework.category);
    });

    // Add category tags
    if (category?.primary) {
      tags.add(category.primary.toLowerCase());
    }
    category?.secondary?.forEach(sec => tags.add(sec.toLowerCase()));
    category?.tags?.forEach(tag => tags.add(tag.toLowerCase()));

    // Add platform tags
    technologies?.platforms?.forEach(platform => tags.add(platform.toLowerCase()));

    // Add special tags based on file patterns
    const hasTests = content.files.some(
      f => f.path.includes('test') || f.path.includes('spec') || f.name.includes('test'),
    );
    if (hasTests) tags.add('tested');

    const hasDocker = content.files.some(f => f.name.toLowerCase().includes('dockerfile'));
    if (hasDocker) tags.add('containerized');

    const hasCI = content.files.some(
      f =>
        f.path.includes('.github') || f.path.includes('.gitlab-ci') || f.name.includes('jenkins'),
    );
    if (hasCI) tags.add('ci-cd');

    return Array.from(tags).slice(0, 15); // Limit to 15 tags
  }

  /**
   * Extract key features from repository content
   */
  private extractKeyFeatures(content: RepositoryContent, technologies: TechnologyStack): string[] {
    const features = new Set<string>();

    // API-related features
    if (content.files.some(f => f.path.includes('api') || f.path.includes('routes'))) {
      features.add('REST API');
    }

    if (content.files.some(f => f.content?.includes('graphql') || f.name.includes('graphql'))) {
      features.add('GraphQL API');
    }

    // Database features
    if (technologies.databases.length > 0) {
      features.add('Database Integration');
    }

    // Authentication features
    if (
      content.files.some(
        f =>
          f.content?.toLowerCase().includes('auth') ||
          f.content?.toLowerCase().includes('jwt') ||
          f.content?.toLowerCase().includes('oauth'),
      )
    ) {
      features.add('Authentication');
    }

    // Testing features
    if (
      technologies.testingFrameworks.length > 0 ||
      content.files.some(
        f =>
          f.path.includes('test') ||
          f.path.includes('spec') ||
          f.name.includes('test') ||
          f.name.includes('spec'),
      )
    ) {
      features.add('Automated Testing');
    }

    // Deployment features
    if (content.files.some(f => f.name.toLowerCase().includes('dockerfile'))) {
      features.add('Docker Support');
    }

    // Documentation features
    if (content.readme && content.readme.length > 500) {
      features.add('Well Documented');
    }

    return Array.from(features).slice(0, 8); // Limit to 8 features
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(results: any[]): number {
    const confidenceScores = results
      .filter(result => result && typeof result.confidence === 'number')
      .map(result => result.confidence);

    if (confidenceScores.length === 0) return 0.5; // Default confidence

    return confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length;
  }

  /**
   * Store analysis result in database
   */
  private async storeAnalysisResult(projectId: string, result: AIAnalysisResult): Promise<void> {
    await this.prisma.aIAnalysis.create({
      data: {
        projectId,
        version: result.version,
        analysis: result as any,
        confidence: result.confidence,
        model: result.model,
      },
    });
  }

  /**
   * Check if analysis is recent (within 7 days)
   */
  private isAnalysisRecent(createdAt: Date): boolean {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return createdAt > sevenDaysAgo;
  }

  /**
   * Parse stored analysis result
   */
  private parseAnalysisResult(analysis: any): AIAnalysisResult {
    return {
      description: analysis.description || 'No description available',
      technologies: analysis.technologies || this.getEmptyTechnologyStack(),
      category: analysis.category || this.getDefaultCategory(),
      complexity: analysis.complexity || 'simple',
      suggestedTags: analysis.suggestedTags || [],
      keyFeatures: analysis.keyFeatures || [],
      confidence: analysis.confidence || 0.5,
      model: analysis.model || 'unknown',
      version: analysis.version || 1,
      analysisDate: analysis.analysisDate ? new Date(analysis.analysisDate) : new Date(),
    };
  }

  /**
   * Extract result from Promise.allSettled result
   */
  private extractResult<T>(result: PromiseSettledResult<T>, operation: string): T | null {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      this.logger.warn(`${operation} failed:`, result.reason);
      return null;
    }
  }

  /**
   * Get empty technology stack
   */
  private getEmptyTechnologyStack(): TechnologyStack {
    return {
      languages: [],
      frameworks: [],
      databases: [],
      tools: [],
      platforms: [],
      buildTools: [],
      testingFrameworks: [],
    };
  }

  /**
   * Get default project category
   */
  private getDefaultCategory(): ProjectCategory {
    return {
      primary: 'other',
      secondary: [],
      confidence: 0.1,
      tags: [],
    };
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfiguration(): EnrichmentConfig {
    return {
      aiServiceUrl: this.configService.get<string>('AI_SERVICE_URL'),
      aiServiceApiKey: this.configService.get<string>('AI_SERVICE_API_KEY'),
      enableAIDescription: this.configService.get<boolean>('ENABLE_AI_DESCRIPTION', true),
      enableTechnologyDetection: this.configService.get<boolean>(
        'ENABLE_TECHNOLOGY_DETECTION',
        true,
      ),
      enableCategorization: this.configService.get<boolean>('ENABLE_CATEGORIZATION', true),
      confidenceThreshold: this.configService.get<number>('AI_CONFIDENCE_THRESHOLD', 0.7),
      maxFileSize: this.configService.get<number>('MAX_FILE_SIZE', 1024 * 1024), // 1MB
      maxFilesToAnalyze: this.configService.get<number>('MAX_FILES_TO_ANALYZE', 100),
      supportedLanguages: this.configService
        .get<string>(
          'SUPPORTED_LANGUAGES',
          'javascript,typescript,python,java,go,rust,php,ruby,csharp,cpp',
        )
        .split(','),
    };
  }

  // GraphQL resolver methods (stubs for now)
  async getAnalysisForProject(projectId: string, userId: string): Promise<any | null> {
    // TODO: Implement getting AI analysis for a specific project
    return null;
  }

  async getUserAnalyses(userId: string, limit: number, offset: number): Promise<any[]> {
    // TODO: Implement getting user's AI analyses
    return [];
  }

  async getRecentAnalyses(limit: number): Promise<any[]> {
    // TODO: Implement getting recent analyses
    return [];
  }

  async triggerEnrichment(
    projectId: string,
    userId: string,
    forceReanalysis: boolean,
    analysisTypes?: string[],
  ): Promise<any> {
    // TODO: Implement triggering enrichment
    return {
      id: `job-${Date.now()}`,
      projectId,
      status: 'pending',
      createdAt: new Date(),
    };
  }

  async bulkTriggerEnrichment(
    projectIds: string[],
    userId: string,
    forceReanalysis: boolean,
    analysisTypes?: string[],
  ): Promise<any> {
    // TODO: Implement bulk enrichment
    return {
      jobs: [],
      totalJobs: projectIds.length,
      successfulJobs: 0,
      failedJobs: 0,
    };
  }

  async getEnrichmentJobs(
    userId: string,
    status?: string,
    limit?: number,
    offset?: number,
  ): Promise<any[]> {
    // TODO: Implement getting enrichment jobs
    return [];
  }
}
