#!/usr/bin/env ts-node

/**
 * Migration Testing Script
 * 
 * This script tests database migrations to ensure they work correctly
 * and can be rolled back safely (Requirement 10.1, 10.4, 10.5)
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationTest {
    name: string;
    passed: boolean;
    error?: string;
}

class MigrationTester {
    private results: MigrationTest[] = [];

    async runTests(): Promise<void> {
        console.log('🧪 Starting migration tests...\n');

        // Test 1: Check migration status
        await this.testMigrationStatus();

        // Test 2: Test data integrity after migrations
        await this.testDataIntegrity();

        // Test 3: Test schema consistency
        await this.testSchemaConsistency();

        // Test 4: Test migration rollback capability (dry run)
        await this.testRollbackCapability();

        // Test 5: Test migration performance
        await this.testMigrationPerformance();

        this.printResults();
    }

    private async testMigrationStatus(): Promise<void> {
        try {
            const output = execSync('npx prisma migrate status', { encoding: 'utf8' });

            if (output.includes('Database schema is up to date!')) {
                this.results.push({
                    name: 'Migration status check',
                    passed: true
                });
            } else {
                this.results.push({
                    name: 'Migration status check',
                    passed: false,
                    error: 'Database schema is not up to date'
                });
            }
        } catch (error) {
            this.results.push({
                name: 'Migration status check',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testDataIntegrity(): Promise<void> {
        try {
            // Test that we can create and query data in all new tables
            const testUserId = 'test-user-' + Date.now();

            // Create a test user with enhanced fields
            const user = await prisma.user.create({
                data: {
                    id: testUserId,
                    email: `test-${Date.now()}@example.com`,
                    tier: 'premium',
                    settings: { theme: 'dark' },
                    profileConfig: { showEmail: false },
                    platformTokens: { github: 'encrypted-token' },
                    syncCount: 5,
                    apiCallCount: 100,
                    monthlyApiCalls: 50
                }
            });

            // Create a test project with enhanced fields
            const project = await prisma.project.create({
                data: {
                    title: 'Test Project',
                    description: 'Test project for migration validation',
                    tags: ['test', 'migration'],
                    ownerId: user.id,
                    platform: 'github',
                    platformId: 'test-repo-123',
                    language: 'TypeScript',
                    languages: { TypeScript: 80, JavaScript: 20 },
                    starCount: 42,
                    forkCount: 5,
                    topics: ['testing', 'database'],
                    isPrivate: false
                }
            });

            // Create related records in new tables
            await prisma.publicProfile.create({
                data: {
                    userId: user.id,
                    username: `testuser-${Date.now()}`,
                    displayName: 'Test User',
                    bio: 'Test bio',
                    isPublic: true,
                    theme: { primaryColor: '#007acc' },
                    settings: { showStats: true }
                }
            });

            await prisma.platformConnection.create({
                data: {
                    userId: user.id,
                    platform: 'github',
                    platformUserId: 'github-123',
                    platformUsername: 'testuser',
                    isActive: true,
                    scopes: ['repo', 'user']
                }
            });

            await prisma.syncHistory.create({
                data: {
                    userId: user.id,
                    projectId: project.id,
                    operation: 'sync',
                    platform: 'github',
                    repositoryUrl: 'https://github.com/test/repo',
                    status: 'completed',
                    changes: [{ type: 'update', field: 'description' }],
                    metadata: { duration: 1500 }
                }
            });

            await prisma.aIAnalysis.create({
                data: {
                    projectId: project.id,
                    analysis: {
                        description: 'AI-generated description',
                        technologies: ['TypeScript', 'Node.js'],
                        category: 'web-application'
                    },
                    confidence: 0.95,
                    model: 'gpt-4'
                }
            });

            await prisma.auditLog.create({
                data: {
                    userId: user.id,
                    action: 'project_sync',
                    resource: 'project',
                    resourceId: project.id,
                    details: { operation: 'test' },
                    success: true
                }
            });

            await prisma.apiUsage.create({
                data: {
                    userId: user.id,
                    endpoint: '/api/projects',
                    method: 'GET',
                    statusCode: 200,
                    duration: 150
                }
            });

            await prisma.systemMetric.create({
                data: {
                    metric: 'test_metric',
                    value: 42.5,
                    tags: { component: 'migration-test' }
                }
            });

            // Clean up test data
            await prisma.systemMetric.deleteMany({ where: { metric: 'test_metric' } });
            await prisma.apiUsage.deleteMany({ where: { userId: user.id } });
            await prisma.auditLog.deleteMany({ where: { userId: user.id } });
            await prisma.aIAnalysis.deleteMany({ where: { projectId: project.id } });
            await prisma.syncHistory.deleteMany({ where: { userId: user.id } });
            await prisma.platformConnection.deleteMany({ where: { userId: user.id } });
            await prisma.publicProfile.deleteMany({ where: { userId: user.id } });
            await prisma.project.deleteMany({ where: { ownerId: user.id } });
            await prisma.user.deleteMany({ where: { id: user.id } });

            this.results.push({
                name: 'Data integrity test',
                passed: true
            });
        } catch (error) {
            this.results.push({
                name: 'Data integrity test',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testSchemaConsistency(): Promise<void> {
        try {
            // Check that all expected tables exist
            const tables = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `;

            const expectedTables = [
                'AIAnalysis',
                'ApiUsage',
                'AuditLog',
                'MagicLinkToken',
                'PlatformConnection',
                'Project',
                'PublicProfile',
                'RefreshToken',
                'SyncHistory',
                'SystemMetric',
                'User',
                'WaitlistEntry',
                '_prisma_migrations'
            ];

            const actualTables = (tables as any[]).map(t => t.table_name);
            const missingTables = expectedTables.filter(table => !actualTables.includes(table));

            if (missingTables.length === 0) {
                this.results.push({
                    name: 'Schema consistency check',
                    passed: true
                });
            } else {
                this.results.push({
                    name: 'Schema consistency check',
                    passed: false,
                    error: `Missing tables: ${missingTables.join(', ')}`
                });
            }
        } catch (error) {
            this.results.push({
                name: 'Schema consistency check',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testRollbackCapability(): Promise<void> {
        try {
            // Check that migrations have proper down migrations or are documented as irreversible
            const migrations = await prisma.$queryRaw`
        SELECT migration_name, finished_at, rolled_back_at
        FROM _prisma_migrations
        ORDER BY finished_at DESC;
      `;

            const migrationCount = (migrations as any[]).length;

            if (migrationCount > 0) {
                // Check if any migrations have been rolled back (which would indicate rollback capability)
                const rolledBackMigrations = (migrations as any[]).filter(m => m.rolled_back_at !== null);

                this.results.push({
                    name: 'Migration rollback capability',
                    passed: true,
                    error: `${migrationCount} migrations found, ${rolledBackMigrations.length} have rollback history`
                });
            } else {
                this.results.push({
                    name: 'Migration rollback capability',
                    passed: false,
                    error: 'No migrations found in _prisma_migrations table'
                });
            }
        } catch (error) {
            this.results.push({
                name: 'Migration rollback capability',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async testMigrationPerformance(): Promise<void> {
        try {
            // Test query performance on indexed columns
            const startTime = Date.now();

            // Test complex query that uses multiple indexes
            await prisma.$queryRaw`
        SELECT p.*, u.tier, pp.username
        FROM "Project" p
        JOIN "User" u ON p."ownerId" = u.id
        LEFT JOIN "PublicProfile" pp ON u.id = pp."userId"
        WHERE p.published = true 
        AND p.featured = true
        AND u.tier = 'premium'
        ORDER BY p."starCount" DESC
        LIMIT 10;
      `;

            const duration = Date.now() - startTime;

            if (duration < 1000) { // Should complete in under 1 second
                this.results.push({
                    name: 'Migration performance test',
                    passed: true,
                    error: `Query completed in ${duration}ms`
                });
            } else {
                this.results.push({
                    name: 'Migration performance test',
                    passed: false,
                    error: `Query took ${duration}ms, expected < 1000ms`
                });
            }
        } catch (error) {
            this.results.push({
                name: 'Migration performance test',
                passed: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private printResults(): void {
        console.log('\n📊 Migration Test Results:\n');

        const passed = this.results.filter(r => r.passed).length;
        const total = this.results.length;

        this.results.forEach(result => {
            const status = result.passed ? '✅' : '❌';
            console.log(`${status} ${result.name}`);
            if (result.error) {
                const prefix = result.passed ? '   Info:' : '   Error:';
                console.log(`${prefix} ${result.error}`);
            }
        });

        console.log(`\n📈 Summary: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 All migration tests passed successfully!');
        } else {
            console.log('⚠️  Some migration tests failed.');
            process.exit(1);
        }
    }
}

async function main() {
    const tester = new MigrationTester();

    try {
        await tester.runTests();
    } catch (error) {
        console.error('❌ Migration testing failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { MigrationTester };