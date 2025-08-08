import { Injectable, Logger } from '@nestjs/common';
import {
  RepositoryContent,
  TechnologyStack,
  LanguageInfo,
  FrameworkInfo,
} from './interfaces/ai-enrichment.interface';

@Injectable()
export class TechnologyDetectionService {
  private readonly logger = new Logger(TechnologyDetectionService.name);

  // Framework detection patterns
  private readonly frameworkPatterns = {
    // Web Frameworks
    react: {
      patterns: ['react', '@types/react', 'jsx'],
      category: 'web' as const,
    },
    vue: { patterns: ['vue', '@vue/', 'vue-'], category: 'web' as const },
    angular: {
      patterns: ['@angular/', 'angular', 'ng-'],
      category: 'web' as const,
    },
    svelte: { patterns: ['svelte'], category: 'web' as const },
    nextjs: { patterns: ['next', 'next.config'], category: 'web' as const },
    nuxt: { patterns: ['nuxt', 'nuxt.config'], category: 'web' as const },
    express: { patterns: ['express'], category: 'backend' as const },
    fastify: { patterns: ['fastify'], category: 'backend' as const },
    nestjs: {
      patterns: ['@nestjs/', 'nest-cli'],
      category: 'backend' as const,
    },
    koa: { patterns: ['koa'], category: 'backend' as const },

    // Mobile Frameworks
    'react-native': {
      patterns: ['react-native', '@react-native'],
      category: 'mobile' as const,
    },
    flutter: {
      patterns: ['flutter', 'pubspec.yaml'],
      category: 'mobile' as const,
    },
    ionic: { patterns: ['@ionic/', 'ionic'], category: 'mobile' as const },
    xamarin: { patterns: ['xamarin'], category: 'mobile' as const },

    // Desktop Frameworks
    electron: { patterns: ['electron'], category: 'desktop' as const },
    tauri: { patterns: ['tauri'], category: 'desktop' as const },

    // Backend Frameworks
    django: {
      patterns: ['django', 'requirements.txt'],
      category: 'backend' as const,
    },
    flask: { patterns: ['flask'], category: 'backend' as const },
    fastapi: { patterns: ['fastapi'], category: 'backend' as const },
    spring: {
      patterns: ['spring', 'springframework'],
      category: 'backend' as const,
    },
    laravel: {
      patterns: ['laravel', 'composer.json'],
      category: 'backend' as const,
    },
    rails: { patterns: ['rails', 'gemfile'], category: 'backend' as const },
    gin: { patterns: ['gin-gonic', 'go.mod'], category: 'backend' as const },
    fiber: { patterns: ['gofiber'], category: 'backend' as const },

    // ML/AI Frameworks
    tensorflow: { patterns: ['tensorflow', 'tf.'], category: 'ml' as const },
    pytorch: { patterns: ['torch', 'pytorch'], category: 'ml' as const },
    scikit: { patterns: ['sklearn', 'scikit-learn'], category: 'ml' as const },
    pandas: { patterns: ['pandas'], category: 'ml' as const },
    numpy: { patterns: ['numpy'], category: 'ml' as const },

    // Game Frameworks
    unity: { patterns: ['unity', '.unity'], category: 'game' as const },
    unreal: { patterns: ['unreal'], category: 'game' as const },
    godot: { patterns: ['godot'], category: 'game' as const },
  };

  // Database detection patterns
  private readonly databasePatterns = {
    postgresql: ['postgres', 'pg', 'postgresql'],
    mysql: ['mysql', 'mysql2'],
    mongodb: ['mongodb', 'mongoose'],
    redis: ['redis', 'ioredis'],
    sqlite: ['sqlite', 'sqlite3'],
    elasticsearch: ['elasticsearch', '@elastic'],
    firebase: ['firebase'],
    supabase: ['supabase'],
    prisma: ['prisma', '@prisma'],
    typeorm: ['typeorm'],
    sequelize: ['sequelize'],
  };

  // Build tools detection patterns
  private readonly buildToolPatterns = {
    webpack: ['webpack'],
    vite: ['vite'],
    rollup: ['rollup'],
    parcel: ['parcel'],
    esbuild: ['esbuild'],
    turbo: ['turbo'],
    gradle: ['gradle', 'build.gradle'],
    maven: ['maven', 'pom.xml'],
    make: ['makefile', 'make'],
    cmake: ['cmake', 'cmakelists.txt'],
    docker: ['dockerfile', 'docker-compose'],
    kubernetes: ['kubernetes', 'k8s'],
  };

  // Testing framework patterns
  private readonly testingPatterns = {
    jest: ['jest'],
    vitest: ['vitest'],
    mocha: ['mocha'],
    chai: ['chai'],
    jasmine: ['jasmine'],
    cypress: ['cypress'],
    playwright: ['playwright'],
    selenium: ['selenium'],
    pytest: ['pytest'],
    unittest: ['unittest'],
    rspec: ['rspec'],
    minitest: ['minitest'],
  };

  // Platform patterns
  private readonly platformPatterns = {
    aws: ['aws-sdk', '@aws-sdk', 'aws-cdk'],
    gcp: ['@google-cloud', 'gcp'],
    azure: ['@azure', 'azure'],
    vercel: ['vercel'],
    netlify: ['netlify'],
    heroku: ['heroku'],
    digitalocean: ['digitalocean'],
  };

  /**
   * Detect technologies used in the repository
   */
  async detectTechnologies(
    content: RepositoryContent,
  ): Promise<TechnologyStack> {
    this.logger.log('Starting technology detection');

    try {
      const [
        languages,
        frameworks,
        databases,
        buildTools,
        testingFrameworks,
        platforms,
        tools,
      ] = await Promise.all([
        this.detectLanguages(content),
        this.detectFrameworks(content),
        this.detectDatabases(content),
        this.detectBuildTools(content),
        this.detectTestingFrameworks(content),
        this.detectPlatforms(content),
        this.detectTools(content),
      ]);

      const technologyStack: TechnologyStack = {
        languages,
        frameworks,
        databases,
        buildTools,
        testingFrameworks,
        platforms,
        tools,
      };

      this.logger.log(
        `Technology detection completed. Found ${languages.length} languages, ${frameworks.length} frameworks`,
      );
      return technologyStack;
    } catch (error) {
      this.logger.error('Technology detection failed:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Technology detection failed: ${errorMessage}`);
    }
  }

  /**
   * Detect programming languages and their usage percentages
   */
  private async detectLanguages(
    content: RepositoryContent,
  ): Promise<LanguageInfo[]> {
    const languages: LanguageInfo[] = [];
    const totalBytes = Object.values(content.languages || {}).reduce(
      (sum, bytes) => sum + bytes,
      0,
    );

    if (totalBytes === 0) {
      // Fallback: detect languages from file extensions
      return this.detectLanguagesFromFiles(content.files);
    }

    for (const [language, bytes] of Object.entries(content.languages || {})) {
      const percentage = (bytes / totalBytes) * 100;
      const confidence = this.calculateLanguageConfidence(
        language,
        percentage,
        content,
      );

      languages.push({
        name: language,
        percentage: Math.round(percentage * 100) / 100,
        bytes,
        confidence,
      });
    }

    return languages.sort((a, b) => b.percentage - a.percentage);
  }

  /**
   * Detect languages from file extensions when GitHub language data is not available
   */
  private detectLanguagesFromFiles(files: any[]): LanguageInfo[] {
    const extensionMap: Record<string, string> = {
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.jsx': 'JavaScript',
      '.tsx': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.go': 'Go',
      '.rs': 'Rust',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.cs': 'C#',
      '.cpp': 'C++',
      '.c': 'C',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.dart': 'Dart',
      '.scala': 'Scala',
      '.clj': 'Clojure',
      '.hs': 'Haskell',
      '.elm': 'Elm',
      '.vue': 'Vue',
      '.svelte': 'Svelte',
    };

    const languageCounts: Record<string, number> = {};
    let totalFiles = 0;

    files.forEach((file) => {
      const language = extensionMap[file.extension];
      if (language) {
        languageCounts[language] =
          (languageCounts[language] || 0) + (file.size || 1);
        totalFiles += file.size || 1;
      }
    });

    const languages: LanguageInfo[] = [];
    for (const [language, bytes] of Object.entries(languageCounts)) {
      const percentage = (bytes / totalFiles) * 100;
      languages.push({
        name: language,
        percentage: Math.round(percentage * 100) / 100,
        bytes,
        confidence: 0.8, // Lower confidence for file-based detection
      });
    }

    return languages.sort((a, b) => b.percentage - a.percentage);
  }

  /**
   * Calculate confidence score for language detection
   */
  private calculateLanguageConfidence(
    language: string,
    percentage: number,
    content: RepositoryContent,
  ): number {
    let confidence = 0.9; // Base confidence for GitHub language data

    // Reduce confidence for very small percentages
    if (percentage < 1) confidence *= 0.7;
    else if (percentage < 5) confidence *= 0.8;

    // Increase confidence if we find related configuration files
    const hasRelatedConfig = this.hasRelatedConfigFiles(
      language,
      content.files,
    );
    if (hasRelatedConfig) confidence = Math.min(1.0, confidence * 1.1);

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Check if repository has configuration files related to a language
   */
  private hasRelatedConfigFiles(language: string, files: any[]): boolean {
    const configPatterns: Record<string, string[]> = {
      JavaScript: [
        'package.json',
        '.eslintrc',
        '.babelrc',
        'webpack.config.js',
      ],
      TypeScript: ['tsconfig.json', 'package.json'],
      Python: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
      Java: ['pom.xml', 'build.gradle', 'gradle.properties'],
      Go: ['go.mod', 'go.sum'],
      Rust: ['Cargo.toml', 'Cargo.lock'],
      PHP: ['composer.json', 'composer.lock'],
      Ruby: ['Gemfile', 'Gemfile.lock'],
      'C#': ['*.csproj', '*.sln'],
    };

    const patterns = configPatterns[language] || [];
    return files.some((file) =>
      patterns.some(
        (pattern) =>
          file.name.toLowerCase().includes(pattern.toLowerCase()) ||
          file.path.toLowerCase().includes(pattern.toLowerCase()),
      ),
    );
  }

  /**
   * Detect frameworks used in the repository
   */
  private async detectFrameworks(
    content: RepositoryContent,
  ): Promise<FrameworkInfo[]> {
    const frameworks: FrameworkInfo[] = [];
    const packageJsonContent = this.extractPackageJsonContent(content);
    const allFileContent = this.getAllFileContent(content);

    for (const [frameworkName, config] of Object.entries(
      this.frameworkPatterns,
    )) {
      const confidence = this.calculateFrameworkConfidence(
        config.patterns,
        packageJsonContent,
        allFileContent,
        content.files,
      );

      if (confidence > 0.3) {
        const version = this.extractFrameworkVersion(
          frameworkName,
          packageJsonContent,
        );
        frameworks.push({
          name: frameworkName,
          version,
          confidence: Math.round(confidence * 100) / 100,
          category: config.category,
        });
      }
    }

    return frameworks.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Detect databases used in the repository
   */
  private async detectDatabases(content: RepositoryContent): Promise<string[]> {
    const databases = new Set<string>();
    const packageJsonContent = this.extractPackageJsonContent(content);
    const allFileContent = this.getAllFileContent(content);

    for (const [dbName, patterns] of Object.entries(this.databasePatterns)) {
      const confidence = this.calculatePatternConfidence(
        patterns,
        packageJsonContent,
        allFileContent,
      );
      if (confidence > 0.3) {
        databases.add(dbName);
      }
    }

    return Array.from(databases);
  }

  /**
   * Detect build tools used in the repository
   */
  private async detectBuildTools(
    content: RepositoryContent,
  ): Promise<string[]> {
    const buildTools = new Set<string>();
    const packageJsonContent = this.extractPackageJsonContent(content);
    const allFileContent = this.getAllFileContent(content);

    for (const [toolName, patterns] of Object.entries(this.buildToolPatterns)) {
      const confidence = this.calculatePatternConfidence(
        patterns,
        packageJsonContent,
        allFileContent,
      );
      if (confidence > 0.3) {
        buildTools.add(toolName);
      }
    }

    return Array.from(buildTools);
  }

  /**
   * Detect testing frameworks used in the repository
   */
  private async detectTestingFrameworks(
    content: RepositoryContent,
  ): Promise<string[]> {
    const testingFrameworks = new Set<string>();
    const packageJsonContent = this.extractPackageJsonContent(content);
    const allFileContent = this.getAllFileContent(content);

    for (const [frameworkName, patterns] of Object.entries(
      this.testingPatterns,
    )) {
      const confidence = this.calculatePatternConfidence(
        patterns,
        packageJsonContent,
        allFileContent,
      );
      if (confidence > 0.3) {
        testingFrameworks.add(frameworkName);
      }
    }

    return Array.from(testingFrameworks);
  }

  /**
   * Detect platforms used in the repository
   */
  private async detectPlatforms(content: RepositoryContent): Promise<string[]> {
    const platforms = new Set<string>();
    const packageJsonContent = this.extractPackageJsonContent(content);
    const allFileContent = this.getAllFileContent(content);

    for (const [platformName, patterns] of Object.entries(
      this.platformPatterns,
    )) {
      const confidence = this.calculatePatternConfidence(
        patterns,
        packageJsonContent,
        allFileContent,
      );
      if (confidence > 0.3) {
        platforms.add(platformName);
      }
    }

    return Array.from(platforms);
  }

  /**
   * Detect general tools used in the repository
   */
  private async detectTools(content: RepositoryContent): Promise<string[]> {
    const tools = new Set<string>();

    // Check for common tools based on file patterns
    const toolPatterns = {
      git: ['.gitignore', '.gitattributes'],
      eslint: ['.eslintrc', 'eslint.config'],
      prettier: ['.prettierrc', 'prettier.config'],
      husky: ['.husky/', 'husky'],
      'lint-staged': ['lint-staged'],
      commitizen: ['.czrc', 'commitizen'],
      renovate: ['renovate.json', '.renovaterc'],
      dependabot: ['.github/dependabot.yml'],
      'github-actions': ['.github/workflows/'],
      'gitlab-ci': ['.gitlab-ci.yml'],
      jenkins: ['Jenkinsfile'],
      terraform: ['*.tf', 'terraform'],
      ansible: ['*.yml', 'ansible'],
    };

    for (const [toolName, patterns] of Object.entries(toolPatterns)) {
      const hasPattern = patterns.some((pattern) =>
        content.files.some(
          (file) =>
            file.path.toLowerCase().includes(pattern.toLowerCase()) ||
            file.name.toLowerCase().includes(pattern.toLowerCase()),
        ),
      );

      if (hasPattern) {
        tools.add(toolName);
      }
    }

    return Array.from(tools);
  }

  /**
   * Extract package.json content for analysis
   */
  private extractPackageJsonContent(content: RepositoryContent): string {
    if (content.packageJson) {
      return JSON.stringify(content.packageJson).toLowerCase();
    }

    const packageJsonFile = content.files.find(
      (f) => f.name === 'package.json',
    );
    return packageJsonFile?.content?.toLowerCase() || '';
  }

  /**
   * Get all file content concatenated for pattern matching
   */
  private getAllFileContent(content: RepositoryContent): string {
    return content.files
      .filter((f) => f.content && f.size < 10000) // Only small files to avoid performance issues
      .map((f) => f.content)
      .join(' ')
      .toLowerCase();
  }

  /**
   * Calculate confidence score for framework detection
   */
  private calculateFrameworkConfidence(
    patterns: string[],
    packageJsonContent: string,
    allFileContent: string,
    files: any[],
  ): number {
    let confidence = 0;
    let matches = 0;

    for (const pattern of patterns) {
      const patternLower = pattern.toLowerCase();

      // Check in package.json (highest weight)
      if (packageJsonContent.includes(patternLower)) {
        confidence += 0.8;
        matches++;
      }

      // Check in file names (medium weight)
      const hasFileMatch = files.some(
        (f) =>
          f.name.toLowerCase().includes(patternLower) ||
          f.path.toLowerCase().includes(patternLower),
      );
      if (hasFileMatch) {
        confidence += 0.6;
        matches++;
      }

      // Check in file content (lower weight)
      if (allFileContent.includes(patternLower)) {
        confidence += 0.3;
        matches++;
      }
    }

    // Normalize confidence based on pattern matches
    return matches > 0 ? Math.min(1.0, confidence / patterns.length) : 0;
  }

  /**
   * Calculate confidence score for general pattern matching
   */
  private calculatePatternConfidence(
    patterns: string[],
    packageJsonContent: string,
    allFileContent: string,
  ): number {
    let confidence = 0;

    for (const pattern of patterns) {
      const patternLower = pattern.toLowerCase();

      if (packageJsonContent.includes(patternLower)) {
        confidence += 0.7;
      }

      if (allFileContent.includes(patternLower)) {
        confidence += 0.3;
      }
    }

    return Math.min(1.0, confidence / patterns.length);
  }

  /**
   * Extract framework version from package.json
   */
  private extractFrameworkVersion(
    frameworkName: string,
    packageJsonContent: string,
  ): string | undefined {
    try {
      const packageJson = JSON.parse(packageJsonContent);
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Try exact match first
      if (dependencies[frameworkName]) {
        return dependencies[frameworkName].replace(/[\^~]/, '');
      }

      // Try pattern matching
      for (const [depName, version] of Object.entries(dependencies)) {
        if (
          depName.includes(frameworkName) ||
          frameworkName.includes(depName)
        ) {
          return (version as string).replace(/[\^~]/, '');
        }
      }
    } catch (error) {
      // Ignore JSON parsing errors
    }

    return undefined;
  }
}
