#!/usr/bin/env ts-node

/**
 * Database Schema Validation Script
 * 
 * This script validates that all required database enhancements are properly implemented
 * according to the requirements in the gitsink-codebase-improvement spec.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ValidationResult {
    test: string;
    passed: boolean;
    error?: string;
}

class DatabaseSchemaValidator {
    private results: ValidationResult[] = [];

    async validateSchema(): Promise<void> {
        console.log('🔍 Starting database schema validation...\n');

        // Test 1: Validate User table enhancements (Requirement 10.1, 11.1, 12.1)
        await this.validateUserEnhancements();

        // Test 2: Validate Project table enhancements (Requirement 14.1, 17.1, 18.1)
        await this.validateProjectEnhancements();

        // Test 3: Validate new tables for sync history and audit trail (Requirement 11.1, 11.2)
        await this.validateSyncHistoryTable();
        await this.validateAuditLogTable();

        // Test 4: Validate public profiles table (Requirement 12.1)
        await this.validatePublicProfileTable();

        // Test 5: Validate platform connections table (Requirement 14.1)
        await this.validatePlatformConnectionTable();

        // Test 6: Validate AI analysis table (Requirement 16.1)
        await this.validateAIAnalysisTable();

        // Test 7: Validate API usage tracking table (Requirement 15.1)
        await this.validateApiUsageTable();

        // Test 8: Validate system metrics table (Requirement 6.1)
        await this.validateSystemMetricTable();

        // Test 9: Validate indexes for performance (Requirement 8.1, 8.2)
        await this.validatePerformanceIndexes();

        // Test 10: Validate foreign key constraints and relationships
        await this.validateRelationships();

        this.printResults();
    }

    private async validateUserEnhancements(): Promise<void> {
        try {
            // Check if enhanced user fields exist
            const userFields = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'User' 
        AND column_name IN ('tier', 'settings', 'profileConfig', 'platformTokens', 'lastSyncAt', 'syncCount', 'apiCallCount', 'monthlyApiCalls', 'lastApiCallReset')
        ORDER BY column_name;
      `;

            const expectedFields = [
                'tier', 'settings', 'profileConfig', 'platformTokens',
                'lastSyncAt', 'syncCount', 'apiCallCount', 'monthlyApiCalls', 'lastApiCallReset'
            ];

            const actualFields = (userFields as any[]).map(field => field.column_name);
            const missingFields = expectedFields.filter(field => !actualFields.includes(field));

            if (missingFields.length === 0) {
                this.results.push({
                    test: 'User table enhancements',
                    passed: true
                });
            } else {
                this.results.push({
                    test: 'User table enhancements',
                    passed: false,
                    error: `Missing fields: ${missingFields.join(', ')}`
                });
            }
        } catch (error) {
            this.results.push({
                test: 'User table enhancements',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async validateProjectEnhancements(): Promise<void> {
        try {
            const projectFields = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'Project' 
        AND column_name IN ('platform', 'platformId', 'defaultBranch', 'language', 'languages', 'starCount', 'forkCount', 'isPrivate', 'license', 'topics', 'size', 'openIssues', 'hasWiki', 'hasPages', 'archived', 'disabled', 'pushedAt')
        ORDER BY column_name;
      `;

            const expectedFields = [
                'platform', 'platformId', 'defaultBranch', 'language', 'languages',
                'starCount', 'forkCount', 'isPrivate', 'license', 'topics', 'size',
                'openIssues', 'hasWiki', 'hasPages', 'archived', 'disabled', 'pushedAt'
            ];

            const actualFields = (projectFields as any[]).map(field => field.column_name);
            const missingFields = expectedFields.filter(field => !actualFields.includes(field));

            if (missingFields.length === 0) {
                this.results.push({
                    test: 'Project table enhancements',
                    passed: true
                });
            } else {
                this.results.push({
                    test: 'Project table enhancements',
                    passed: false,
                    error: `Missing fields: ${missingFields.join(', ')}`
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Project table enhancements',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async validateSyncHistoryTable(): Promise<void> {
        try {
            const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'SyncHistory'
        );
      `;

            if ((tableExists as any[])[0].exists) {
                // Check required columns
                const columns = await prisma.$queryRaw`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'SyncHistory'
          ORDER BY column_name;
        `;

                const requiredColumns = [
                    'id', 'userId', 'projectId', 'operation', 'platform', 'repositoryUrl',
                    'status', 'changes', 'metadata', 'error', 'startedAt', 'completedAt', 'duration'
                ];

                const actualColumns = (columns as any[]).map(col => col.column_name);
                const missingColumns = requiredColumns.filter(col => !actualColumns.includes(col));

                if (missingColumns.length === 0) {
                    this.results.push({
                        test: 'SyncHistory table structure',
                        passed: true
                    });
                } else {
                    this.results.push({
                        test: 'SyncHistory table structure',
                        passed: false,
                        error: `Missing columns: ${missingColumns.join(', ')}`
                    });
                }
            } else {
                this.results.push({
                    test: 'SyncHistory table structure',
                    passed: false,
                    error: 'SyncHistory table does not exist'
                });
            }
        } catch (error) {
            this.results.push({
                test: 'SyncHistory table structure',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async validateAuditLogTable(): Promise<void> {
        try {
            const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'AuditLog'
        );
      `;

            if ((tableExists as any[])[0].exists) {
                this.results.push({
                    test: 'AuditLog table exists',
                    passed: true
                });
            } else {
                this.results.push({
                    test: 'AuditLog table exists',
                    passed: false,
                    error: 'AuditLog table does not exist'
                });
            }
        } catch (error) {
            this.results.push({
                test: 'AuditLog table exists',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async validatePublicProfileTable(): Promise<void> {
        try {
            const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'PublicProfile'
        );
      `;

            if ((tableExists as any[])[0].exists) {
                this.results.push({
                    test: 'PublicProfile table exists',
                    passed: true
                });
            } else {
                this.results.push({
                    test: 'PublicProfile table exists',
                    passed: false,
                    error: 'PublicProfile table does not exist'
                });
            }
        } catch (error) {
            this.results.push({
                test: 'PublicProfile table exists',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async validatePlatformConnectionTable(): Promise<void> {
        try {
            const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'PlatformConnection'
        );
      `;

            if ((tableExists as any[])[0].exists) {
                this.results.push({
                    test: 'PlatformConnection table exists',
                    passed: true
                });
            } else {
                this.results.push({
                    test: 'PlatformConnection table exists',
                    passed: false,
                    error: 'PlatformConnection table does not exist'
                });
            }
        } catch (error) {
            this.results.push({
                test: 'PlatformConnection table exists',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async validateAIAnalysisTable(): Promise<void> {
        try {
            const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'AIAnalysis'
        );
      `;

            if ((tableExists as any[])[0].exists) {
                this.results.push({
                    test: 'AIAnalysis table exists',
                    passed: true
                });
            } else {
                this.results.push({
                    test: 'AIAnalysis table exists',
                    passed: false,
                    error: 'AIAnalysis table does not exist'
                });
            }
        } catch (error) {
            this.results.push({
                test: 'AIAnalysis table exists',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async validateApiUsageTable(): Promise<void> {
        try {
            const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'ApiUsage'
        );
      `;

            if ((tableExists as any[])[0].exists) {
                this.results.push({
                    test: 'ApiUsage table exists',
                    passed: true
                });
            } else {
                this.results.push({
                    test: 'ApiUsage table exists',
                    passed: false,
                    error: 'ApiUsage table does not exist'
                });
            }
        } catch (error) {
            this.results.push({
                test: 'ApiUsage table exists',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async validateSystemMetricTable(): Promise<void> {
        try {
            const tableExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'SystemMetric'
        );
      `;

            if ((tableExists as any[])[0].exists) {
                this.results.push({
                    test: 'SystemMetric table exists',
                    passed: true
                });
            } else {
                this.results.push({
                    test: 'SystemMetric table exists',
                    passed: false,
                    error: 'SystemMetric table does not exist'
                });
            }
        } catch (error) {
            this.results.push({
                test: 'SystemMetric table exists',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async validatePerformanceIndexes(): Promise<void> {
        try {
            // Check for key performance indexes
            const indexes = await prisma.$queryRaw`
        SELECT indexname, tablename 
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND (
          indexname LIKE '%_user_published_featured%' OR
          indexname LIKE '%_tags_gin%' OR
          indexname LIKE '%_search_text%' OR
          indexname LIKE '%_user_date_desc%' OR
          indexname LIKE '%_timestamp_desc%'
        );
      `;

            if ((indexes as any[]).length >= 3) {
                this.results.push({
                    test: 'Performance indexes exist',
                    passed: true
                });
            } else {
                this.results.push({
                    test: 'Performance indexes exist',
                    passed: false,
                    error: `Only ${(indexes as any[]).length} performance indexes found, expected at least 3`
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Performance indexes exist',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async validateRelationships(): Promise<void> {
        try {
            // Check foreign key constraints
            const foreignKeys = await prisma.$queryRaw`
        SELECT 
          tc.table_name, 
          kcu.column_name, 
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
        FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        ORDER BY tc.table_name;
      `;

            const expectedRelationships = [
                'PublicProfile -> User',
                'PlatformConnection -> User',
                'SyncHistory -> User',
                'SyncHistory -> Project',
                'AIAnalysis -> Project',
                'AuditLog -> User'
            ];

            const actualRelationships = (foreignKeys as any[]).map(fk =>
                `${fk.table_name} -> ${fk.foreign_table_name}`
            );

            const missingRelationships = expectedRelationships.filter(rel =>
                !actualRelationships.some(actual => actual.includes(rel.split(' -> ')[0]) && actual.includes(rel.split(' -> ')[1]))
            );

            if (missingRelationships.length === 0) {
                this.results.push({
                    test: 'Foreign key relationships',
                    passed: true
                });
            } else {
                this.results.push({
                    test: 'Foreign key relationships',
                    passed: false,
                    error: `Missing relationships: ${missingRelationships.join(', ')}`
                });
            }
        } catch (error) {
            this.results.push({
                test: 'Foreign key relationships',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private printResults(): void {
        console.log('\n📊 Database Schema Validation Results:\n');

        const passed = this.results.filter(r => r.passed).length;
        const total = this.results.length;

        this.results.forEach(result => {
            const status = result.passed ? '✅' : '❌';
            console.log(`${status} ${result.test}`);
            if (!result.passed && result.error) {
                console.log(`   Error: ${result.error}`);
            }
        });

        console.log(`\n📈 Summary: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 All database schema enhancements are properly implemented!');
        } else {
            console.log('⚠️  Some database schema enhancements need attention.');
            process.exit(1);
        }
    }
}

async function main() {
    const validator = new DatabaseSchemaValidator();

    try {
        await validator.validateSchema();
    } catch (error) {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { DatabaseSchemaValidator };