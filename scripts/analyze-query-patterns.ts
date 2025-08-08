#!/usr/bin/env ts-node

/**
 * Query Pattern Analysis Script
 * 
 * This script analyzes common query patterns to identify potential
 * database optimizations and missing indexes.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface QueryAnalysis {
    pattern: string;
    description: string;
    currentIndexes: string[];
    suggestedOptimizations: string[];
}

class QueryPatternAnalyzer {
    private analyses: QueryAnalysis[] = [];

    async analyzePatterns(): Promise<void> {
        console.log('🔍 Analyzing query patterns for optimization opportunities...\n');

        // Analyze common query patterns based on requirements
        await this.analyzeUserQueries();
        await this.analyzeProjectQueries();
        await this.analyzeSyncHistoryQueries();
        await this.analyzeAuditQueries();
        await this.analyzeApiUsageQueries();

        this.printAnalysis();
    }

    private async analyzeUserQueries(): Promise<void> {
        // Common user queries based on authentication and profile requirements
        const userIndexes = await this.getIndexesForTable('User');

        this.analyses.push({
            pattern: 'User authentication and profile queries',
            description: 'Queries for login, API key validation, and profile access',
            currentIndexes: userIndexes,
            suggestedOptimizations: [
                'Composite index on (email, deletedAt) for soft-deleted user lookups',
                'Partial index on apiKey WHERE apiKey IS NOT NULL',
                'Index on (tier, monthlyApiCalls) for rate limiting queries'
            ]
        });
    }

    private async analyzeProjectQueries(): Promise<void> {
        const projectIndexes = await this.getIndexesForTable('Project');

        this.analyses.push({
            pattern: 'Project discovery and filtering queries',
            description: 'Queries for public project browsing, search, and filtering',
            currentIndexes: projectIndexes,
            suggestedOptimizations: [
                'Composite index on (published, featured, starCount DESC) for featured projects',
                'Composite index on (platform, archived, pushedAt DESC) for active projects',
                'GIN index on (tags || topics) for combined tag/topic search',
                'Partial index on (ownerId, published) WHERE deletedAt IS NULL'
            ]
        });
    }

    private async analyzeSyncHistoryQueries(): Promise<void> {
        const syncIndexes = await this.getIndexesForTable('SyncHistory');

        this.analyses.push({
            pattern: 'Sync history and audit trail queries',
            description: 'Queries for sync status, history, and troubleshooting',
            currentIndexes: syncIndexes,
            suggestedOptimizations: [
                'Composite index on (status, platform, startedAt DESC) for monitoring',
                'Composite index on (userId, operation, startedAt DESC) for user history',
                'Index on (repositoryUrl, startedAt DESC) for repository-specific history'
            ]
        });
    }

    private async analyzeAuditQueries(): Promise<void> {
        const auditIndexes = await this.getIndexesForTable('AuditLog');

        this.analyses.push({
            pattern: 'Security and compliance audit queries',
            description: 'Queries for security monitoring and compliance reporting',
            currentIndexes: auditIndexes,
            suggestedOptimizations: [
                'Composite index on (action, success, timestamp DESC) for security monitoring',
                'Index on (ipAddress, timestamp DESC) for IP-based analysis',
                'Partial index on (userId, action) WHERE success = false for failed actions'
            ]
        });
    }

    private async analyzeApiUsageQueries(): Promise<void> {
        const apiIndexes = await this.getIndexesForTable('ApiUsage');

        this.analyses.push({
            pattern: 'API usage analytics and rate limiting queries',
            description: 'Queries for usage analytics, rate limiting, and performance monitoring',
            currentIndexes: apiIndexes,
            suggestedOptimizations: [
                'Composite index on (endpoint, statusCode, timestamp DESC) for endpoint analytics',
                'Index on (duration DESC, timestamp DESC) for performance analysis',
                'Composite index on (userId, endpoint, timestamp DESC) for user-specific rate limiting'
            ]
        });
    }

    private async getIndexesForTable(tableName: string): Promise<string[]> {
        try {
            const indexes = await prisma.$queryRaw`
        SELECT indexname, indexdef
        FROM pg_indexes 
        WHERE tablename = ${tableName}
        AND schemaname = 'public'
        ORDER BY indexname;
      `;

            return (indexes as any[]).map(idx => idx.indexname);
        } catch (error) {
            console.warn(`Could not fetch indexes for table ${tableName}:`, error);
            return [];
        }
    }

    private printAnalysis(): void {
        console.log('📊 Query Pattern Analysis Results:\n');

        this.analyses.forEach((analysis, index) => {
            console.log(`${index + 1}. ${analysis.pattern}`);
            console.log(`   Description: ${analysis.description}`);
            console.log(`   Current indexes: ${analysis.currentIndexes.length} found`);
            console.log(`   Suggested optimizations:`);
            analysis.suggestedOptimizations.forEach(opt => {
                console.log(`   • ${opt}`);
            });
            console.log('');
        });

        console.log('💡 Consider implementing these optimizations based on actual query patterns in production.');
    }
}

async function main() {
    const analyzer = new QueryPatternAnalyzer();

    try {
        await analyzer.analyzePatterns();
    } catch (error) {
        console.error('❌ Query pattern analysis failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { QueryPatternAnalyzer };