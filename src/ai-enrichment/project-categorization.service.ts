import { Injectable, Logger } from '@nestjs/common';
import {
    RepositoryContent,
    ProjectCategory,
} from './interfaces/ai-enrichment.interface';

@Injectable()
export class ProjectCategorizationService {
    private readonly logger = new Logger(ProjectCategorizationService.name);

    // Category detection patterns
    private readonly categoryPatterns = {
        'web-application': {
            patterns: ['react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'express', 'fastify', 'koa'],
            filePatterns: ['index.html', 'app.js', 'main.js', 'server.js'],
            directoryPatterns: ['public', 'static', 'assets', 'components'],
            weight: 1.0,
        },
        'mobile-application': {
            patterns: ['react-native', 'flutter', 'ionic', 'xamarin', 'cordova'],
            filePatterns: ['pubspec.yaml', 'android/', 'ios/', 'App.js'],
            directoryPatterns: ['android', 'ios', 'mobile'],
            weight: 1.0,
        },
        'desktop-application': {
            patterns: ['electron', 'tauri', 'qt', 'gtk', 'wpf', 'winforms'],
            filePatterns: ['main.cpp', 'main.cs', 'main.py'],
            directoryPatterns: ['desktop', 'gui'],
            weight: 1.0,
        },
        'api-service': {
            patterns: ['express', 'fastify', 'koa', 'django', 'flask', 'fastapi', 'spring', 'gin', 'fiber'],
            filePatterns: ['api.js', 'server.js', 'app.py', 'main.go'],
            directoryPatterns: ['api', 'routes', 'controllers', 'endpoints'],
            weight: 1.0,
        },
        'library': {
            patterns: ['npm', 'pypi', 'crates.io', 'maven', 'nuget'],
            filePatterns: ['package.json', 'setup.py', 'Cargo.toml', 'pom.xml', '*.csproj'],
            directoryPatterns: ['lib', 'src', 'dist'],
            weight: 0.8,
        },
        'cli-tool': {
            patterns: ['commander', 'click', 'cobra', 'clap', 'argparse'],
            filePatterns: ['cli.js', 'main.py', 'main.go', 'main.rs'],
            directoryPatterns: ['bin', 'cmd', 'cli'],
            weight: 0.9,
        },
        'data-science': {
            patterns: ['pandas', 'numpy', 'scikit-learn', 'tensorflow', 'pytorch', 'jupyter'],
            filePatterns: ['*.ipynb', 'requirements.txt', 'environment.yml'],
            directoryPatterns: ['notebooks', 'data', 'models', 'analysis'],
            weight: 1.0,
        },
        'machine-learning': {
            patterns: ['tensorflow', 'pytorch', 'keras', 'scikit-learn', 'xgboost', 'lightgbm'],
            filePatterns: ['model.py', 'train.py', '*.ipynb'],
            directoryPatterns: ['models', 'training', 'ml', 'ai'],
            weight: 1.0,
        },
        'game': {
            patterns: ['unity', 'unreal', 'godot', 'pygame', 'phaser', 'three.js'],
            filePatterns: ['*.unity', '*.cs', 'game.js'],
            directoryPatterns: ['assets', 'scenes', 'scripts', 'game'],
            weight: 1.0,
        },
        'devops': {
            patterns: ['docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'github-actions'],
            filePatterns: ['Dockerfile', 'docker-compose.yml', '*.tf', 'Jenkinsfile'],
            directoryPatterns: ['.github', '.gitlab-ci', 'terraform', 'k8s', 'kubernetes'],
            weight: 0.9,
        },
        'documentation': {
            patterns: ['gitbook', 'docusaurus', 'vuepress', 'mkdocs', 'sphinx'],
            filePatterns: ['README.md', 'docs/', '*.md'],
            directoryPatterns: ['docs', 'documentation', 'wiki'],
            weight: 0.7,
        },
        'testing': {
            patterns: ['jest', 'mocha', 'pytest', 'junit', 'cypress', 'selenium'],
            filePatterns: ['*.test.js', '*.spec.js', 'test_*.py'],
            directoryPatterns: ['test', 'tests', '__tests__', 'spec'],
            weight: 0.6,
        },
        'blockchain': {
            patterns: ['web3', 'ethereum', 'solidity', 'truffle', 'hardhat', 'bitcoin'],
            filePatterns: ['*.sol', 'truffle-config.js', 'hardhat.config.js'],
            directoryPatterns: ['contracts', 'blockchain', 'crypto'],
            weight: 1.0,
        },
        'iot': {
            patterns: ['arduino', 'raspberry-pi', 'mqtt', 'iot', 'embedded'],
            filePatterns: ['*.ino', 'platformio.ini'],
            directoryPatterns: ['firmware', 'hardware', 'embedded'],
            weight: 1.0,
        },
        'security': {
            patterns: ['security', 'cryptography', 'authentication', 'authorization', 'penetration'],
            filePatterns: ['security.js', 'auth.py', 'crypto.go'],
            directoryPatterns: ['security', 'auth', 'crypto'],
            weight: 0.8,
        },
        'education': {
            patterns: ['tutorial', 'course', 'learning', 'education', 'example'],
            filePatterns: ['tutorial.md', 'lesson.py', 'example.js'],
            directoryPatterns: ['tutorials', 'examples', 'lessons', 'course'],
            weight: 0.7,
        },
        'e-commerce': {
            patterns: ['shop', 'store', 'cart', 'payment', 'checkout', 'product'],
            filePatterns: ['cart.js', 'payment.py', 'product.model.js'],
            directoryPatterns: ['shop', 'store', 'products', 'cart'],
            weight: 0.9,
        },
        'social-media': {
            patterns: ['social', 'chat', 'message', 'post', 'feed', 'follow'],
            filePatterns: ['chat.js', 'message.py', 'post.model.js'],
            directoryPatterns: ['chat', 'messages', 'posts', 'social'],
            weight: 0.9,
        },
        'finance': {
            patterns: ['finance', 'banking', 'payment', 'transaction', 'wallet', 'crypto'],
            filePatterns: ['transaction.js', 'wallet.py', 'payment.model.js'],
            directoryPatterns: ['finance', 'banking', 'payments', 'transactions'],
            weight: 0.9,
        },
        'healthcare': {
            patterns: ['health', 'medical', 'patient', 'doctor', 'hospital', 'clinic'],
            filePatterns: ['patient.js', 'medical.py', 'health.model.js'],
            directoryPatterns: ['health', 'medical', 'patients', 'doctors'],
            weight: 0.9,
        },
    };

    // Secondary category mappings
    private readonly secondaryCategories = {
        'web-application': ['frontend', 'backend', 'fullstack'],
        'mobile-application': ['ios', 'android', 'cross-platform'],
        'api-service': ['rest', 'graphql', 'microservice'],
        'data-science': ['analytics', 'visualization', 'research'],
        'machine-learning': ['deep-learning', 'nlp', 'computer-vision'],
        'game': ['2d', '3d', 'indie', 'mobile-game'],
        'devops': ['ci-cd', 'infrastructure', 'monitoring'],
        'library': ['utility', 'framework', 'sdk'],
        'cli-tool': ['automation', 'productivity', 'system'],
    };

    /**
     * Categorize a project based on its content
     */
    async categorizeProject(
        content: RepositoryContent,
        manualOverride?: { category?: string; tags?: string[] }
    ): Promise<ProjectCategory> {
        this.logger.log('Starting project categorization');

        if (!content) {
            this.logger.warn('No content provided for categorization');
            return this.getDefaultCategory();
        }

        try {
            // If manual override is provided, use it as primary category
            if (manualOverride?.category && this.isValidCategory(manualOverride.category)) {
                return this.createManualOverrideResult(manualOverride, content);
            }

            const categoryScores = await this.calculateCategoryScores(content);
            const primaryCategory = this.selectPrimaryCategory(categoryScores);
            const secondaryCategories = this.selectSecondaryCategories(categoryScores, primaryCategory);
            const tags = this.generateCategoryTags(primaryCategory, secondaryCategories, content);
            const confidence = this.calculateConfidence(categoryScores, primaryCategory);

            const result: ProjectCategory = {
                primary: primaryCategory,
                secondary: secondaryCategories,
                confidence,
                tags: manualOverride?.tags ? [...new Set([...tags, ...manualOverride.tags])] : tags,
            };

            this.logger.log(`Project categorized as: ${primaryCategory} (confidence: ${confidence})`);
            return result;
        } catch (error) {
            this.logger.error('Project categorization failed:', error);
            return this.getDefaultCategory();
        }
    }

    /**
     * Validate if a category is supported
     */
    private isValidCategory(category: string): boolean {
        const validCategories = Object.keys(this.categoryPatterns);
        return validCategories.includes(category) || category === 'other';
    }

    /**
     * Create result with manual override
     */
    private createManualOverrideResult(
        override: { category?: string; tags?: string[] },
        content: RepositoryContent
    ): ProjectCategory {
        const primaryCategory = override.category!;
        const categoryScores = { [primaryCategory]: 1.0 };
        const secondaryCategories = this.selectSecondaryCategories(categoryScores, primaryCategory);
        const autoTags = this.generateCategoryTags(primaryCategory, secondaryCategories, content);
        const tags = override.tags ? [...new Set([...autoTags, ...override.tags])] : autoTags;

        return {
            primary: primaryCategory,
            secondary: secondaryCategories,
            confidence: 1.0, // High confidence for manual override
            tags,
        };
    }

    /**
     * Calculate scores for each category
     */
    private async calculateCategoryScores(content: RepositoryContent): Promise<Record<string, number>> {
        const scores: Record<string, number> = {};

        for (const [category, config] of Object.entries(this.categoryPatterns)) {
            let score = 0;

            // Check package.json dependencies
            score += this.checkPackageJsonPatterns(content, config.patterns) * config.weight;

            // Check file patterns
            score += this.checkFilePatterns(content, config.filePatterns) * config.weight * 0.8;

            // Check directory patterns
            score += this.checkDirectoryPatterns(content, config.directoryPatterns) * config.weight * 0.6;

            // Check file content patterns
            score += this.checkContentPatterns(content, config.patterns) * config.weight * 0.4;

            // Apply language-specific bonuses
            score += this.applyLanguageBonus(content, category) * config.weight * 0.3;

            scores[category] = Math.round(score * 100) / 100;
        }

        return scores;
    }

    /**
     * Check patterns in package.json dependencies
     */
    private checkPackageJsonPatterns(content: RepositoryContent, patterns: string[]): number {
        if (!content || !content.packageJson) return 0;

        const packageJsonStr = JSON.stringify(content.packageJson).toLowerCase();
        let matches = 0;

        for (const pattern of patterns) {
            if (packageJsonStr.includes(pattern.toLowerCase())) {
                matches++;
            }
        }

        return matches / patterns.length;
    }

    /**
     * Check file name patterns
     */
    private checkFilePatterns(content: RepositoryContent, patterns: string[]): number {
        if (!content || !content.files || !Array.isArray(content.files)) {
            return 0;
        }

        let matches = 0;
        const totalPatterns = patterns.length;

        for (const pattern of patterns) {
            const hasMatch = content.files.some(file =>
                file && file.name && file.path &&
                (file.name.toLowerCase().includes(pattern.toLowerCase()) ||
                    file.path.toLowerCase().includes(pattern.toLowerCase()))
            );
            if (hasMatch) matches++;
        }

        return totalPatterns > 0 ? matches / totalPatterns : 0;
    }

    /**
     * Check directory patterns
     */
    private checkDirectoryPatterns(content: RepositoryContent, patterns: string[]): number {
        if (!content || !content.files || !Array.isArray(content.files)) {
            return 0;
        }

        const directories = new Set(
            content.files
                .filter(f => f && f.path)
                .map(f => f.path.split('/')[0])
                .filter(dir => dir && !dir.startsWith('.'))
                .map(dir => dir.toLowerCase())
        );

        let matches = 0;
        for (const pattern of patterns) {
            if (directories.has(pattern.toLowerCase()) ||
                Array.from(directories).some(dir => dir.includes(pattern.toLowerCase()))) {
                matches++;
            }
        }

        return patterns.length > 0 ? matches / patterns.length : 0;
    }

    /**
     * Check patterns in file content
     */
    private checkContentPatterns(content: RepositoryContent, patterns: string[]): number {
        if (!content || !content.files || !Array.isArray(content.files)) {
            return 0;
        }

        const allContent = content.files
            .filter(f => f && f.content && f.size && f.size < 50000) // Only check smaller files
            .map(f => f.content)
            .join(' ')
            .toLowerCase();

        if (!allContent) return 0;

        let matches = 0;
        for (const pattern of patterns) {
            if (allContent.includes(pattern.toLowerCase())) {
                matches++;
            }
        }

        return patterns.length > 0 ? matches / patterns.length : 0;
    }

    /**
     * Apply language-specific bonuses
     */
    private applyLanguageBonus(content: RepositoryContent, category: string): number {
        const languages = Object.keys(content.languages || {}).map(l => l.toLowerCase());

        const languageBonuses: Record<string, Record<string, number>> = {
            'web-application': { javascript: 0.8, typescript: 0.8, html: 0.6, css: 0.4 },
            'mobile-application': { dart: 0.9, swift: 0.8, kotlin: 0.8, java: 0.6 },
            'data-science': { python: 0.9, r: 0.8, julia: 0.7 },
            'machine-learning': { python: 0.9, r: 0.7, julia: 0.6 },
            'game': { 'c#': 0.8, 'c++': 0.7, javascript: 0.6 },
            'api-service': { javascript: 0.7, typescript: 0.7, python: 0.8, go: 0.8, java: 0.7 },
            'cli-tool': { go: 0.8, rust: 0.8, python: 0.7, javascript: 0.6 },
            'devops': { yaml: 0.6, shell: 0.7, python: 0.6 },
        };

        const bonuses = languageBonuses[category] || {};
        let totalBonus = 0;

        for (const language of languages) {
            if (bonuses[language]) {
                totalBonus += bonuses[language];
            }
        }

        return Math.min(1.0, totalBonus);
    }

    /**
     * Select primary category with highest score
     */
    private selectPrimaryCategory(scores: Record<string, number>): string {
        let maxScore = 0;
        let primaryCategory = 'other';

        for (const [category, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                primaryCategory = category;
            }
        }

        // If no category has a significant score, return 'other'
        return maxScore > 0.3 ? primaryCategory : 'other';
    }

    /**
     * Select secondary categories
     */
    private selectSecondaryCategories(scores: Record<string, number>, primaryCategory: string): string[] {
        const secondaryCategories: string[] = [];
        const threshold = 0.4;

        // Add categories with scores above threshold (excluding primary)
        for (const [category, score] of Object.entries(scores)) {
            if (category !== primaryCategory && score > threshold) {
                secondaryCategories.push(category);
            }
        }

        // Add predefined secondary categories for the primary category
        const predefinedSecondary = this.secondaryCategories[primaryCategory] || [];
        for (const secondary of predefinedSecondary) {
            if (!secondaryCategories.includes(secondary)) {
                secondaryCategories.push(secondary);
            }
        }

        return secondaryCategories.slice(0, 3); // Limit to 3 secondary categories
    }

    /**
     * Generate category-specific tags
     */
    private generateCategoryTags(
        primaryCategory: string,
        secondaryCategories: string[],
        content: RepositoryContent,
    ): string[] {
        const tags = new Set<string>();

        // Add primary category as tag
        tags.add(primaryCategory.replace('-', ' '));

        // Add secondary categories as tags
        secondaryCategories.forEach(category => {
            tags.add(category.replace('-', ' '));
        });

        // Add technology-specific tags
        const techTags = this.generateTechnologyTags(primaryCategory, content);
        techTags.forEach(tag => tags.add(tag));

        // Add complexity tags
        const complexityTag = this.determineComplexityTag(content);
        if (complexityTag) tags.add(complexityTag);

        // Add special feature tags
        const featureTags = this.generateFeatureTags(content);
        featureTags.forEach(tag => tags.add(tag));

        return Array.from(tags).slice(0, 10); // Limit to 10 tags
    }

    /**
     * Generate technology-specific tags
     */
    private generateTechnologyTags(category: string, content: RepositoryContent): string[] {
        const tags: string[] = [];

        // Add language tags
        const primaryLanguages = Object.keys(content.languages || {}).slice(0, 3);
        primaryLanguages.forEach(lang => tags.push(lang.toLowerCase()));

        // Add category-specific technology tags
        const categoryTechTags: Record<string, string[]> = {
            'web-application': ['responsive', 'spa', 'pwa'],
            'mobile-application': ['native', 'hybrid', 'cross-platform'],
            'api-service': ['rest', 'microservice', 'scalable'],
            'data-science': ['analytics', 'visualization', 'research'],
            'machine-learning': ['ai', 'neural-network', 'deep-learning'],
            'game': ['interactive', 'graphics', 'entertainment'],
            'devops': ['automation', 'infrastructure', 'deployment'],
            'library': ['reusable', 'modular', 'utility'],
            'cli-tool': ['command-line', 'automation', 'productivity'],
        };

        const techTags = categoryTechTags[category] || [];
        tags.push(...techTags);

        return tags;
    }

    /**
     * Determine complexity tag based on project size and structure
     */
    private determineComplexityTag(content: RepositoryContent): string | null {
        const fileCount = content.files.length;
        const hasTests = content.files.some(f => f.path.includes('test') || f.path.includes('spec'));
        const hasDocker = content.files.some(f => f.name.toLowerCase().includes('dockerfile'));
        const hasCI = content.files.some(f => f.path.includes('.github') || f.path.includes('.gitlab-ci'));

        let complexityScore = 0;
        if (fileCount > 100) complexityScore += 2;
        else if (fileCount > 50) complexityScore += 1;

        if (hasTests) complexityScore += 1;
        if (hasDocker) complexityScore += 1;
        if (hasCI) complexityScore += 1;

        if (complexityScore >= 4) return 'enterprise';
        if (complexityScore >= 2) return 'professional';
        if (complexityScore >= 1) return 'intermediate';
        return 'beginner';
    }

    /**
     * Generate feature-based tags
     */
    private generateFeatureTags(content: RepositoryContent): string[] {
        const tags: string[] = [];

        // Check for common features
        const hasTests = content.files.some(f => f.path.includes('test') || f.path.includes('spec'));
        if (hasTests) tags.push('tested');

        const hasDocker = content.files.some(f => f.name.toLowerCase().includes('dockerfile'));
        if (hasDocker) tags.push('containerized');

        const hasCI = content.files.some(f => f.path.includes('.github') || f.path.includes('.gitlab-ci'));
        if (hasCI) tags.push('ci-cd');

        const hasDocumentation = content.files.some(f => f.path.includes('docs') || f.name.includes('README'));
        if (hasDocumentation) tags.push('documented');

        const hasLicense = content.files.some(f => f.name.toLowerCase().includes('license'));
        if (hasLicense) tags.push('open-source');

        return tags;
    }

    /**
     * Calculate confidence score for categorization
     */
    private calculateConfidence(scores: Record<string, number>, primaryCategory: string): number {
        const primaryScore = scores[primaryCategory] || 0;
        const allScores = Object.values(scores);
        const maxScore = Math.max(...allScores);
        const avgScore = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;

        // Base confidence on how much the primary category stands out
        let confidence = primaryScore / Math.max(maxScore, 1);

        // Boost confidence if primary score is significantly higher than average
        if (primaryScore > avgScore * 2) {
            confidence = Math.min(1.0, confidence * 1.2);
        }

        // Reduce confidence if scores are very close
        const sortedScores = allScores.sort((a, b) => b - a);
        if (sortedScores.length > 1 && sortedScores[0] - sortedScores[1] < 0.2) {
            confidence *= 0.8;
        }

        return Math.round(confidence * 100) / 100;
    }

    /**
     * Get default category when categorization fails
     */
    private getDefaultCategory(): ProjectCategory {
        return {
            primary: 'other',
            secondary: [],
            confidence: 0.1,
            tags: ['uncategorized'],
        };
    }

    /**
     * Get all available categories
     */
    getAvailableCategories(): string[] {
        return Object.keys(this.categoryPatterns);
    }

    /**
     * Get category hierarchy for filtering
     */
    getCategoryHierarchy(): Record<string, string[]> {
        return this.secondaryCategories;
    }

    /**
     * Filter projects by category
     */
    filterProjectsByCategory(
        projects: any[],
        primaryCategory?: string,
        secondaryCategories?: string[],
        tags?: string[]
    ): any[] {
        return projects.filter(project => {
            if (!project.category) return false;

            // Filter by primary category
            if (primaryCategory && project.category.primary !== primaryCategory) {
                return false;
            }

            // Filter by secondary categories
            if (secondaryCategories && secondaryCategories.length > 0) {
                const hasMatchingSecondary = secondaryCategories.some(sec =>
                    project.category.secondary?.includes(sec)
                );
                if (!hasMatchingSecondary) return false;
            }

            // Filter by tags
            if (tags && tags.length > 0) {
                const hasMatchingTag = tags.some(tag =>
                    project.category.tags?.includes(tag)
                );
                if (!hasMatchingTag) return false;
            }

            return true;
        });
    }

    /**
     * Search projects by category-related terms
     */
    searchProjectsByCategory(projects: any[], searchTerm: string): any[] {
        const lowerSearchTerm = searchTerm.toLowerCase();

        return projects.filter(project => {
            if (!project.category) return false;

            // Search in primary category
            if (project.category.primary.toLowerCase().includes(lowerSearchTerm)) {
                return true;
            }

            // Search in secondary categories
            if (project.category.secondary?.some((sec: string) =>
                sec.toLowerCase().includes(lowerSearchTerm)
            )) {
                return true;
            }

            // Search in tags
            if (project.category.tags?.some((tag: string) =>
                tag.toLowerCase().includes(lowerSearchTerm)
            )) {
                return true;
            }

            return false;
        });
    }

    /**
     * Get category statistics from a list of projects
     */
    getCategoryStatistics(projects: any[]): Record<string, number> {
        const stats: Record<string, number> = {};

        projects.forEach(project => {
            if (project.category?.primary) {
                stats[project.category.primary] = (stats[project.category.primary] || 0) + 1;
            }
        });

        return stats;
    }

    /**
     * Suggest similar categories based on content
     */
    async suggestSimilarCategories(
        content: RepositoryContent,
        currentCategory: string,
        limit: number = 3
    ): Promise<string[]> {
        const categoryScores = await this.calculateCategoryScores(content);

        // Remove current category and sort by score
        delete categoryScores[currentCategory];

        const sortedCategories = Object.entries(categoryScores)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([category]) => category);

        return sortedCategories;
    }
}