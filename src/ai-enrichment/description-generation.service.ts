// import { Injectable, Logger } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { HttpService } from '@nestjs/axios';
// import { firstValueFrom } from 'rxjs';
// import {
//   RepositoryContent,
//   AIServiceResponse,
// } from './interfaces/ai-enrichment.interface';

// @Injectable()
// export class DescriptionGenerationService {
//   private readonly logger = new Logger(DescriptionGenerationService.name);
//   private readonly aiServiceUrl: string;
//   private readonly aiServiceApiKey: string;

//   constructor(
//     private readonly configService: ConfigService,
//     private readonly httpService: HttpService,
//   ) {
//     this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', '');
//     this.aiServiceApiKey = this.configService.get<string>(
//       'AI_SERVICE_API_KEY',
//       '',
//     );
//   }

//   /**
//    * Generate AI-powered description for a repository
//    */
//   async generateDescription(
//     content: RepositoryContent,
//   ): Promise<{ description: string; confidence: number }> {
//     this.logger.log('Starting AI description generation');

//     try {
//       // Try AI service first if configured
//       if (this.aiServiceUrl && this.aiServiceApiKey) {
//         const aiResult = await this.generateWithAIService(content);
//         if (aiResult.description) {
//           return {
//             description: aiResult.description,
//             confidence: aiResult.confidence,
//           };
//         }
//       }

//       // Fallback to rule-based description generation
//       return this.generateFallbackDescription(content);
//     } catch (error) {
//       this.logger.error('AI description generation failed:', error);
//       return this.generateFallbackDescription(content);
//     }
//   }

//   /**
//    * Generate description using external AI service
//    */
//   private async generateWithAIService(
//     content: RepositoryContent,
//   ): Promise<AIServiceResponse> {
//     try {
//       const prompt = this.buildPrompt(content);

//       const response = await firstValueFrom(
//         this.httpService.post<{
//           description?: string;
//           text?: string;
//           confidence?: number;
//         }>(
//           `${this.aiServiceUrl}/generate-description`,
//           {
//             prompt,
//             max_tokens: 200,
//             temperature: 0.7,
//             model: 'gpt-3.5-turbo',
//           },
//           {
//             headers: {
//               Authorization: `Bearer ${this.aiServiceApiKey}`,
//               'Content-Type': 'application/json',
//             },
//             timeout: 30000, // 30 second timeout
//           },
//         ),
//       );

//       return {
//         description: response.data.description || response.data.text,
//         confidence: response.data.confidence || 0.8,
//       };
//     } catch (error) {
//       if (error instanceof Error) {
//         this.logger.warn('AI service request failed:', error.message);
//       } else {
//         this.logger.warn('AI service request failed:', error);
//       }
//       return { confidence: 0 };
//     }
//   }

//   /**
//    * Build prompt for AI service
//    */
//   private buildPrompt(content: RepositoryContent): string {
//     const projectInfo = this.extractProjectInfo(content);

//     return `
// Analyze this software repository and generate a concise, professional description (2-3 sentences):

// Repository Information:
// - Primary languages: ${projectInfo.languages.join(', ')}
// - File count: ${content.files.length}
// - Has README: ${!!content.readme}
// - Key files: ${projectInfo.keyFiles.join(', ')}

// ${content.readme ? `README excerpt:\n${content.readme.substring(0, 500)}...` : ''}

// Key directories: ${projectInfo.directories.join(', ')}

// Generate a description that:
// 1. Explains what the project does
// 2. Mentions key technologies used
// 3. Highlights the main purpose or functionality
// 4. Is professional and concise (50-150 words)

// Description:`;
//   }

//   /**
//    * Generate fallback description using rule-based approach
//    */
//   private generateFallbackDescription(content: RepositoryContent): {
//     description: string;
//     confidence: number;
//   } {
//     this.logger.log('Using fallback description generation');

//     const projectInfo = this.extractProjectInfo(content);
//     const templates = this.getDescriptionTemplates();

//     // Determine project type
//     const projectType = this.determineProjectType(projectInfo, content);
//     const template = templates[projectType] || templates.general;

//     // Generate description using template
//     const description = this.fillTemplate(template, projectInfo, content);

//     return {
//       description,
//       confidence: 0.6, // Lower confidence for rule-based generation
//     };
//   }

//   /**
//    * Extract key project information for description generation
//    */
//   private extractProjectInfo(content: RepositoryContent) {
//     const languages = Object.keys(content.languages || {}).slice(0, 3);
//     const keyFiles = content.files
//       .filter((f) => this.isKeyFile(f.name))
//       .map((f) => f.name)
//       .slice(0, 5);

//     const directories = [
//       ...new Set(
//         content.files
//           .map((f) => f.path.split('/')[0])
//           .filter((dir) => dir && !dir.startsWith('.')),
//       ),
//     ].slice(0, 5);

//     const hasTests = content.files.some(
//       (f) =>
//         f.path.includes('test') ||
//         f.path.includes('spec') ||
//         f.name.includes('test'),
//     );

//     const hasDocker = content.files.some((f) =>
//       f.name.toLowerCase().includes('dockerfile'),
//     );
//     const hasAPI = content.files.some(
//       (f) =>
//         f.path.includes('api') ||
//         f.path.includes('routes') ||
//         f.content?.includes('express'),
//     );

//     const hasDatabase = content.files.some(
//       (f) =>
//         f.content?.includes('database') ||
//         f.content?.includes('mongodb') ||
//         f.content?.includes('postgresql') ||
//         f.content?.includes('mysql'),
//     );

//     return {
//       languages,
//       keyFiles,
//       directories,
//       hasTests,
//       hasDocker,
//       hasAPI,
//       hasDatabase,
//       fileCount: content.files.length,
//       totalSize: content.totalSize,
//     };
//   }

//   /**
//    * Check if a file is considered a key configuration file
//    */
//   private isKeyFile(filename: string): boolean {
//     const keyFiles = [
//       'package.json',
//       'requirements.txt',
//       'pom.xml',
//       'build.gradle',
//       'Cargo.toml',
//       'go.mod',
//       'composer.json',
//       'Gemfile',
//       'dockerfile',
//       'docker-compose.yml',
//       'makefile',
//       'tsconfig.json',
//       '.eslintrc',
//       'webpack.config.js',
//     ];

//     return keyFiles.some((key) =>
//       filename.toLowerCase().includes(key.toLowerCase()),
//     );
//   }

//   /**
//    * Determine project type based on analysis
//    */
//   private determineProjectType(
//     projectInfo: any,
//     content: RepositoryContent,
//   ): string {
//     // Web application
//     if (
//       projectInfo.languages.includes('JavaScript') ||
//       projectInfo.languages.includes('TypeScript')
//     ) {
//       if (projectInfo.keyFiles.some((f) => f.includes('package.json'))) {
//         if (projectInfo.hasAPI) return 'web-api';
//         return 'web-app';
//       }
//     }

//     // Mobile app
//     if (
//       content.files.some(
//         (f) =>
//           f.path.includes('android') ||
//           f.path.includes('ios') ||
//           f.name.includes('pubspec.yaml') ||
//           f.content?.includes('react-native'),
//       )
//     ) {
//       return 'mobile-app';
//     }

//     // Data science/ML
//     if (
//       projectInfo.languages.includes('Python') &&
//       content.files.some(
//         (f) =>
//           f.content?.includes('pandas') ||
//           f.content?.includes('numpy') ||
//           f.content?.includes('tensorflow') ||
//           f.content?.includes('scikit-learn'),
//       )
//     ) {
//       return 'data-science';
//     }

//     // CLI tool
//     if (
//       content.files.some(
//         (f) => f.name.includes('cli') || f.path.includes('bin/'),
//       )
//     ) {
//       return 'cli-tool';
//     }

//     // Library
//     if (
//       projectInfo.keyFiles.some(
//         (f) =>
//           f.includes('setup.py') ||
//           f.includes('package.json') ||
//           f.includes('Cargo.toml'),
//       ) &&
//       !projectInfo.hasAPI
//     ) {
//       return 'library';
//     }

//     // Game
//     if (
//       content.files.some(
//         (f) =>
//           f.path.includes('game') ||
//           f.content?.includes('unity') ||
//           f.content?.includes('pygame'),
//       )
//     ) {
//       return 'game';
//     }

//     return 'general';
//   }

//   /**
//    * Get description templates for different project types
//    */
//   private getDescriptionTemplates(): Record<string, string> {
//     return {
//       'web-app':
//         'A {languages} web application that provides {functionality}. Built with modern web technologies, this project {features} and includes {additional_features}.',

//       'web-api':
//         'A {languages} REST API service that {functionality}. The application provides {api_features} and supports {additional_features}.',

//       'mobile-app':
//         'A mobile application developed in {languages} that {functionality}. The app features {mobile_features} and provides {user_experience}.',

//       'data-science':
//         'A {languages} data science project focused on {data_purpose}. This repository contains {analysis_components} and implements {ml_features}.',

//       'cli-tool':
//         'A command-line tool written in {languages} designed to {tool_purpose}. The utility provides {cli_features} and supports {usage_scenarios}.',

//       library:
//         'A {languages} library that provides {library_functionality}. This package offers {api_surface} and can be used for {use_cases}.',

//       game: 'A {languages} game project that {game_concept}. The game features {gameplay_elements} and includes {technical_features}.',

//       general:
//         'A {languages} project that {general_purpose}. This repository contains {components} and implements {key_functionality}.',
//     };
//   }

//   /**
//    * Fill template with project-specific information
//    */
//   private fillTemplate(
//     template: string,
//     projectInfo: any,
//     content: RepositoryContent,
//   ): string {
//     const replacements: Record<string, string> = {
//       '{languages}': this.formatLanguages(projectInfo.languages),
//       '{functionality}': this.generateFunctionality(projectInfo, content),
//       '{features}': this.generateFeatures(projectInfo),
//       '{additional_features}': this.generateAdditionalFeatures(projectInfo),
//       '{api_features}': this.generateAPIFeatures(projectInfo),
//       '{mobile_features}': this.generateMobileFeatures(projectInfo),
//       '{user_experience}': this.generateUserExperience(projectInfo),
//       '{data_purpose}': this.generateDataPurpose(content),
//       '{analysis_components}': this.generateAnalysisComponents(projectInfo),
//       '{ml_features}': this.generateMLFeatures(content),
//       '{tool_purpose}': this.generateToolPurpose(content),
//       '{cli_features}': this.generateCLIFeatures(projectInfo),
//       '{usage_scenarios}': this.generateUsageScenarios(projectInfo),
//       '{library_functionality}': this.generateLibraryFunctionality(content),
//       '{api_surface}': this.generateAPISurface(projectInfo),
//       '{use_cases}': this.generateUseCases(projectInfo),
//       '{game_concept}': this.generateGameConcept(content),
//       '{gameplay_elements}': this.generateGameplayElements(projectInfo),
//       '{technical_features}': this.generateTechnicalFeatures(projectInfo),
//       '{general_purpose}': this.generateGeneralPurpose(content),
//       '{components}': this.generateComponents(projectInfo),
//       '{key_functionality}': this.generateKeyFunctionality(projectInfo),
//     };

//     let description = template;
//     for (const [placeholder, replacement] of Object.entries(replacements)) {
//       description = description.replace(placeholder, replacement);
//     }

//     return description;
//   }

//   /**
//    * Format languages list for description
//    */
//   private formatLanguages(languages: string[]): string {
//     if (languages.length === 0) return 'multi-language';
//     if (languages.length === 1) return languages[0];
//     if (languages.length === 2) return `${languages[0]} and ${languages[1]}`;
//     return `${languages.slice(0, -1).join(', ')}, and ${languages[languages.length - 1]}`;
//   }

//   /**
//    * Generate functionality description
//    */
//   private generateFunctionality(
//     projectInfo: any,
//     content: RepositoryContent,
//   ): string {
//     if (projectInfo.hasAPI) return 'handles API requests and data processing';
//     if (projectInfo.hasDatabase) return 'manages data storage and retrieval';
//     if (content.readme) {
//       const readmeWords = content.readme.toLowerCase();
//       if (readmeWords.includes('dashboard'))
//         return 'provides a dashboard interface';
//       if (readmeWords.includes('automation')) return 'automates various tasks';
//       if (readmeWords.includes('analysis')) return 'performs data analysis';
//     }
//     return 'delivers core functionality';
//   }

//   /**
//    * Generate features description
//    */
//   private generateFeatures(projectInfo: any): string {
//     const features = [];
//     if (projectInfo.hasTests) features.push('comprehensive testing');
//     if (projectInfo.hasDocker) features.push('containerization support');
//     if (projectInfo.hasDatabase) features.push('database integration');

//     if (features.length === 0) return 'modern development practices';
//     return features.join(' and ');
//   }

//   /**
//    * Generate additional features description
//    */
//   private generateAdditionalFeatures(projectInfo: any): string {
//     const features = [];
//     if (projectInfo.fileCount > 50) features.push('modular architecture');
//     if (projectInfo.directories.includes('docs'))
//       features.push('comprehensive documentation');
//     if (projectInfo.keyFiles.some((f) => f.includes('eslint')))
//       features.push('code quality tools');

//     if (features.length === 0) return 'clean code structure';
//     return features.join(', ');
//   }

//   // Additional helper methods for template filling
//   private generateAPIFeatures(projectInfo: any): string {
//     return 'RESTful endpoints for data management';
//   }

//   private generateMobileFeatures(projectInfo: any): string {
//     return 'intuitive user interface and smooth navigation';
//   }

//   private generateUserExperience(projectInfo: any): string {
//     return 'an engaging and responsive user experience';
//   }

//   private generateDataPurpose(content: RepositoryContent): string {
//     if (content.readme?.toLowerCase().includes('machine learning'))
//       return 'machine learning and predictive analytics';
//     if (content.readme?.toLowerCase().includes('visualization'))
//       return 'data visualization and insights';
//     return 'data analysis and processing';
//   }

//   private generateAnalysisComponents(projectInfo: any): string {
//     return 'data processing scripts, analysis notebooks, and visualization tools';
//   }

//   private generateMLFeatures(content: RepositoryContent): string {
//     return 'machine learning algorithms and statistical analysis';
//   }

//   private generateToolPurpose(content: RepositoryContent): string {
//     if (content.readme?.toLowerCase().includes('build'))
//       return 'streamline build processes';
//     if (content.readme?.toLowerCase().includes('deploy'))
//       return 'simplify deployment workflows';
//     return 'enhance development productivity';
//   }

//   private generateCLIFeatures(projectInfo: any): string {
//     return 'command-line interface with various options and flags';
//   }

//   private generateUsageScenarios(projectInfo: any): string {
//     return 'development workflows and automation tasks';
//   }

//   private generateLibraryFunctionality(content: RepositoryContent): string {
//     return 'reusable components and utility functions';
//   }

//   private generateAPISurface(projectInfo: any): string {
//     return 'a clean and well-documented API';
//   }

//   private generateUseCases(projectInfo: any): string {
//     return 'various development scenarios and applications';
//   }

//   private generateGameConcept(content: RepositoryContent): string {
//     return 'implements engaging gameplay mechanics';
//   }

//   private generateGameplayElements(projectInfo: any): string {
//     return 'interactive gameplay and user controls';
//   }

//   private generateTechnicalFeatures(projectInfo: any): string {
//     const features = [];
//     if (projectInfo.hasTests) features.push('automated testing');
//     if (projectInfo.hasDocker) features.push('containerized deployment');
//     return features.length > 0
//       ? features.join(' and ')
//       : 'robust technical implementation';
//   }

//   private generateGeneralPurpose(content: RepositoryContent): string {
//     if (content.readme) {
//       const readme = content.readme.toLowerCase();
//       if (readme.includes('tool')) return 'serves as a development tool';
//       if (readme.includes('framework'))
//         return 'provides a framework for development';
//       if (readme.includes('utility')) return 'offers utility functions';
//     }
//     return 'addresses specific development needs';
//   }

//   private generateComponents(projectInfo: any): string {
//     const components = [];
//     if (projectInfo.directories.includes('src')) components.push('source code');
//     if (projectInfo.directories.includes('test'))
//       components.push('test suites');
//     if (projectInfo.directories.includes('docs'))
//       components.push('documentation');

//     return components.length > 0 ? components.join(', ') : 'various components';
//   }

//   private generateKeyFunctionality(projectInfo: any): string {
//     if (projectInfo.hasAPI) return 'API endpoints and data handling';
//     if (projectInfo.hasDatabase) return 'data management and persistence';
//     return 'core business logic and features';
//   }
// }
