#!/usr/bin/env node

/**
 * Test Data Management Script
 * Handles test data seeding, cleanup, and environment provisioning
 */

const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestDataManager {
    constructor() {
        this.prisma = new PrismaClient();
        this.environments = {
            test: 'TEST_DATABASE_URL',
            e2e: 'E2E_DATABASE_URL',
            performance: 'PERF_DATABASE_URL'
        };
    }

    /**
     * Seed database with test data
     */
    async seedDatabase(environment = 'test') {
        console.log(`🌱 Seeding ${environment} database...`);

        try {
            await this.prisma.$connect();

            switch (environment) {
                case 'test':
                    await this.seedTestData();
                    break;
                case 'e2e':
                    await this.seedE2EData();
                    break;
                case 'performance':
                    await this.seedPerformanceData();
                    break;
                default:
                    throw new Error(`Unknown environment: ${environment}`);
            }

            console.log(`✅ ${environment} database seeded successfully`);
        } catch (error) {
            console.error(`❌ Error seeding ${environment} database:`, error.message);
            throw error;
        } finally {
            await this.prisma.$disconnect();
        }
    }

    /**
     * Seed minimal test data for unit/integration tests
     */
    async seedTestData() {
        // Create test users
        const testUsers = await Promise.all([
            this.prisma.user.upsert({
                where: { email: 'test@example.com' },
                update: {},
                create: {
                    email: 'test@example.com',
                    username: 'testuser',
                    githubId: 'test-github-id',
                    githubToken: 'test-token',
                    apiKey: 'test-api-key',
                    tier: 'free',
                    settings: {},
                    profileConfig: {}
                }
            }),
            this.prisma.user.upsert({
                where: { email: 'premium@example.com' },
                update: {},
                create: {
                    email: 'premium@example.com',
                    username: 'premiumuser',
                    githubId: 'premium-github-id',
                    githubToken: 'premium-token',
                    apiKey: 'premium-api-key',
                    tier: 'premium',
                    settings: {},
                    profileConfig: {}
                }
            })
        ]);

        // Create test projects
        const testProjects = await Promise.all([
            this.prisma.project.create({
                data: {
                    title: 'Test Project 1',
                    description: 'A test project for unit testing',
                    repoUrl: 'https://github.com/testuser/test-project-1',
                    platformId: 'test-repo-1',
                    language: 'TypeScript',
                    topics: ['testing', 'nodejs'],
                    published: true,
                    featured: false,
                    ownerId: testUsers[0].id,
                    starCount: 10,
                    forkCount: 2,
                    openIssues: 1
                }
            }),
            this.prisma.project.create({
                data: {
                    title: 'Test Project 2',
                    description: 'Another test project',
                    repoUrl: 'https://github.com/testuser/test-project-2',
                    platformId: 'test-repo-2',
                    language: 'JavaScript',
                    topics: ['web', 'frontend'],
                    published: false,
                    featured: true,
                    ownerId: testUsers[0].id,
                    starCount: 25,
                    forkCount: 5,
                    openIssues: 3
                }
            })
        ]);

        // Create platform connections
        await this.prisma.platformConnection.createMany({
            data: [
                {
                    userId: testUsers[0].id,
                    platform: 'github',
                    platformUserId: 'test-github-id',
                    platformUsername: 'testuser',
                    accessToken: 'test-access-token',
                    isActive: true
                },
                {
                    userId: testUsers[1].id,
                    platform: 'github',
                    platformUserId: 'premium-github-id',
                    platformUsername: 'premiumuser',
                    accessToken: 'premium-access-token',
                    isActive: true
                }
            ]
        });

        // Create sync history
        await this.prisma.syncHistory.createMany({
            data: [
                {
                    userId: testUsers[0].id,
                    projectId: testProjects[0].id,
                    operation: 'sync',
                    platform: 'github',
                    repositoryUrl: 'https://github.com/testuser/test-project-1',
                    status: 'completed',
                    changes: [{ type: 'update', field: 'description' }],
                    startedAt: new Date(Date.now() - 3600000), // 1 hour ago
                    completedAt: new Date(Date.now() - 3500000),
                    duration: 100000
                },
                {
                    userId: testUsers[0].id,
                    projectId: testProjects[1].id,
                    operation: 'create',
                    platform: 'github',
                    repositoryUrl: 'https://github.com/testuser/test-project-2',
                    status: 'failed',
                    error: 'API rate limit exceeded',
                    startedAt: new Date(Date.now() - 1800000), // 30 minutes ago
                    completedAt: new Date(Date.now() - 1700000),
                    duration: 100000
                }
            ]
        });

        console.log('📊 Test data seeded:', {
            users: testUsers.length,
            projects: testProjects.length,
            connections: 2,
            syncHistory: 2
        });
    }

    /**
     * Seed comprehensive data for E2E tests
     */
    async seedE2EData() {
        // Seed basic test data first
        await this.seedTestData();

        // Create additional users for E2E scenarios
        const e2eUsers = await Promise.all([
            this.prisma.user.create({
                data: {
                    email: 'e2e-user1@example.com',
                    username: 'e2euser1',
                    githubId: 'e2e-github-1',
                    githubToken: 'e2e-token-1',
                    apiKey: 'e2e-api-key-1',
                    tier: 'free'
                }
            }),
            this.prisma.user.create({
                data: {
                    email: 'e2e-user2@example.com',
                    username: 'e2euser2',
                    githubId: 'e2e-github-2',
                    githubToken: 'e2e-token-2',
                    apiKey: 'e2e-api-key-2',
                    tier: 'premium'
                }
            })
        ]);

        // Create public profiles
        await Promise.all(e2eUsers.map(user =>
            this.prisma.publicProfile.create({
                data: {
                    userId: user.id,
                    username: user.username,
                    displayName: `${user.username} Display Name`,
                    bio: `Bio for ${user.username}`,
                    isPublic: true,
                    theme: { primaryColor: '#007acc' },
                    settings: { showEmail: false, showStats: true }
                }
            })
        ));

        // Create projects with AI analysis
        const e2eProjects = await Promise.all([
            this.prisma.project.create({
                data: {
                    title: 'E2E React App',
                    description: 'A React application for E2E testing',
                    repoUrl: 'https://github.com/e2euser1/react-app',
                    platformId: 'e2e-react-repo',
                    language: 'JavaScript',
                    topics: ['react', 'frontend', 'e2e'],
                    published: true,
                    featured: true,
                    ownerId: e2eUsers[0].id,
                    starCount: 100,
                    forkCount: 20,
                    openIssues: 5,
                    githubMetadata: { framework: 'React', complexity: 'moderate' }
                }
            }),
            this.prisma.project.create({
                data: {
                    title: 'E2E API Service',
                    description: 'A Node.js API service for E2E testing',
                    repoUrl: 'https://github.com/e2euser2/api-service',
                    platformId: 'e2e-api-repo',
                    language: 'TypeScript',
                    topics: ['nodejs', 'api', 'backend'],
                    published: true,
                    featured: false,
                    ownerId: e2eUsers[1].id,
                    starCount: 50,
                    forkCount: 10,
                    openIssues: 2,
                    githubMetadata: { framework: 'NestJS', complexity: 'complex' }
                }
            })
        ]);

        // Create AI analysis results
        await Promise.all(e2eProjects.map((project, index) =>
            this.prisma.aIAnalysis.create({
                data: {
                    projectId: project.id,
                    version: 1,
                    analysis: {
                        description: `AI-generated description for ${project.title}`,
                        technologies: {
                            languages: [{ name: project.language, percentage: 85 }],
                            frameworks: [index === 0 ? 'React' : 'NestJS'],
                            tools: ['npm', 'webpack']
                        },
                        category: index === 0 ? 'frontend' : 'backend',
                        complexity: index === 0 ? 'moderate' : 'complex',
                        suggestedTags: project.topics,
                        keyFeatures: ['Feature 1', 'Feature 2']
                    },
                    confidence: 0.85,
                    model: 'gpt-4'
                }
            })
        ));

        console.log('🎭 E2E data seeded:', {
            additionalUsers: e2eUsers.length,
            publicProfiles: e2eUsers.length,
            additionalProjects: e2eProjects.length,
            aiAnalyses: e2eProjects.length
        });
    }

    /**
     * Seed large dataset for performance testing
     */
    async seedPerformanceData() {
        console.log('⚡ Seeding performance test data...');

        // Create many users
        const userCount = 100;
        const users = [];

        for (let i = 0; i < userCount; i++) {
            users.push({
                email: `perf-user-${i}@example.com`,
                username: `perfuser${i}`,
                githubId: `perf-github-${i}`,
                githubToken: `perf-token-${i}`,
                apiKey: `perf-api-key-${i}`,
                tier: i % 10 === 0 ? 'premium' : 'free'
            });
        }

        await this.prisma.user.createMany({ data: users });
        const createdUsers = await this.prisma.user.findMany({
            where: { email: { startsWith: 'perf-user-' } }
        });

        // Create many projects
        const projectCount = 500;
        const projects = [];
        const languages = ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust'];
        const topics = ['web', 'api', 'frontend', 'backend', 'mobile', 'desktop', 'cli', 'library'];

        for (let i = 0; i < projectCount; i++) {
            const userId = createdUsers[i % createdUsers.length].id;
            const language = languages[i % languages.length];
            const projectTopics = topics.slice(0, Math.floor(Math.random() * 3) + 1);

            projects.push({
                title: `Performance Project ${i}`,
                description: `A ${language} project for performance testing`,
                repositoryUrl: `https://github.com/perfuser${i % userCount}/perf-project-${i}`,
                githubId: `perf-repo-${i}`,
                language,
                topics: projectTopics,
                published: Math.random() > 0.3,
                featured: Math.random() > 0.8,
                ownerId: userId,
                metadata: {
                    stars: Math.floor(Math.random() * 1000),
                    forks: Math.floor(Math.random() * 100),
                    issues: Math.floor(Math.random() * 50)
                }
            });
        }

        await this.prisma.project.createMany({ data: projects });

        // Create sync history for performance testing
        const createdProjects = await this.prisma.project.findMany({
            where: { title: { startsWith: 'Performance Project' } }
        });

        const syncHistoryCount = 1000;
        const syncHistory = [];

        for (let i = 0; i < syncHistoryCount; i++) {
            const project = createdProjects[i % createdProjects.length];
            const startTime = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000); // Last 30 days
            const duration = Math.floor(Math.random() * 300000) + 10000; // 10s to 5min

            syncHistory.push({
                userId: project.ownerId,
                projectId: project.id,
                operation: ['sync', 'create', 'update'][Math.floor(Math.random() * 3)],
                platform: 'github',
                repositoryUrl: project.repositoryUrl,
                status: Math.random() > 0.1 ? 'completed' : 'failed',
                changes: [{ type: 'update', field: 'metadata' }],
                startedAt: startTime,
                completedAt: new Date(startTime.getTime() + duration),
                duration
            });
        }

        await this.prisma.syncHistory.createMany({ data: syncHistory });

        console.log('⚡ Performance data seeded:', {
            users: userCount,
            projects: projectCount,
            syncHistory: syncHistoryCount
        });
    }

    /**
     * Clean up test data
     */
    async cleanupDatabase(environment = 'test') {
        console.log(`🧹 Cleaning up ${environment} database...`);

        try {
            await this.prisma.$connect();

            // Delete in correct order to respect foreign key constraints
            await this.prisma.aIAnalysis.deleteMany();
            await this.prisma.syncHistory.deleteMany();
            await this.prisma.publicProfile.deleteMany();
            await this.prisma.platformConnection.deleteMany();
            await this.prisma.project.deleteMany();
            await this.prisma.user.deleteMany();

            console.log(`✅ ${environment} database cleaned up`);
        } catch (error) {
            console.error(`❌ Error cleaning up ${environment} database:`, error.message);
            throw error;
        } finally {
            await this.prisma.$disconnect();
        }
    }

    /**
     * Reset database (cleanup + seed)
     */
    async resetDatabase(environment = 'test') {
        console.log(`🔄 Resetting ${environment} database...`);

        await this.cleanupDatabase(environment);
        await this.seedDatabase(environment);

        console.log(`✅ ${environment} database reset complete`);
    }

    /**
     * Provision test environment
     */
    async provisionEnvironment(environment = 'test') {
        console.log(`🏗️ Provisioning ${environment} environment...`);

        try {
            // Set environment-specific database URL
            const dbUrlEnv = this.environments[environment];
            if (dbUrlEnv && process.env[dbUrlEnv]) {
                process.env.DATABASE_URL = process.env[dbUrlEnv];
            }

            // Run migrations
            console.log('📦 Running database migrations...');
            execSync(`npx prisma migrate deploy`, { stdio: 'inherit' });

            // Generate Prisma client
            console.log('🔧 Generating Prisma client...');
            execSync(`npx prisma generate`, { stdio: 'inherit' });

            // Seed database
            await this.seedDatabase(environment);

            console.log(`✅ ${environment} environment provisioned successfully`);
        } catch (error) {
            console.error(`❌ Error provisioning ${environment} environment:`, error.message);
            throw error;
        }
    }

    /**
     * Teardown test environment
     */
    async teardownEnvironment(environment = 'test') {
        console.log(`🏗️ Tearing down ${environment} environment...`);

        try {
            await this.cleanupDatabase(environment);

            // Additional cleanup for specific environments
            if (environment === 'performance') {
                // Clear Redis cache
                console.log('🗑️ Clearing Redis cache...');
                // Add Redis cleanup logic here
            }

            console.log(`✅ ${environment} environment torn down successfully`);
        } catch (error) {
            console.error(`❌ Error tearing down ${environment} environment:`, error.message);
            throw error;
        }
    }

    /**
     * Create test data snapshots
     */
    async createSnapshot(environment = 'test', name = null) {
        const snapshotName = name || `${environment}-${Date.now()}`;
        const snapshotDir = path.join(process.cwd(), 'test-snapshots');

        if (!fs.existsSync(snapshotDir)) {
            fs.mkdirSync(snapshotDir, { recursive: true });
        }

        console.log(`📸 Creating snapshot: ${snapshotName}`);

        try {
            // Export database to SQL file
            const snapshotFile = path.join(snapshotDir, `${snapshotName}.sql`);
            const dbUrl = process.env.DATABASE_URL || process.env[this.environments[environment]];

            if (!dbUrl) {
                throw new Error(`Database URL not found for environment: ${environment}`);
            }

            // Use pg_dump to create snapshot
            execSync(`pg_dump "${dbUrl}" > "${snapshotFile}"`, { stdio: 'inherit' });

            // Create metadata file
            const metadataFile = path.join(snapshotDir, `${snapshotName}.json`);
            const metadata = {
                name: snapshotName,
                environment,
                createdAt: new Date().toISOString(),
                databaseUrl: dbUrl.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
                size: fs.statSync(snapshotFile).size
            };

            fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));

            console.log(`✅ Snapshot created: ${snapshotFile}`);
            return snapshotFile;
        } catch (error) {
            console.error(`❌ Error creating snapshot:`, error.message);
            throw error;
        }
    }

    /**
     * Restore from snapshot
     */
    async restoreSnapshot(snapshotName, environment = 'test') {
        const snapshotDir = path.join(process.cwd(), 'test-snapshots');
        const snapshotFile = path.join(snapshotDir, `${snapshotName}.sql`);

        if (!fs.existsSync(snapshotFile)) {
            throw new Error(`Snapshot not found: ${snapshotFile}`);
        }

        console.log(`📥 Restoring snapshot: ${snapshotName}`);

        try {
            const dbUrl = process.env.DATABASE_URL || process.env[this.environments[environment]];

            if (!dbUrl) {
                throw new Error(`Database URL not found for environment: ${environment}`);
            }

            // Clean database first
            await this.cleanupDatabase(environment);

            // Restore from snapshot
            execSync(`psql "${dbUrl}" < "${snapshotFile}"`, { stdio: 'inherit' });

            console.log(`✅ Snapshot restored: ${snapshotName}`);
        } catch (error) {
            console.error(`❌ Error restoring snapshot:`, error.message);
            throw error;
        }
    }
}

// CLI interface
async function main() {
    const manager = new TestDataManager();
    const [command, environment, ...args] = process.argv.slice(2);

    try {
        switch (command) {
            case 'seed':
                await manager.seedDatabase(environment || 'test');
                break;
            case 'cleanup':
                await manager.cleanupDatabase(environment || 'test');
                break;
            case 'reset':
                await manager.resetDatabase(environment || 'test');
                break;
            case 'provision':
                await manager.provisionEnvironment(environment || 'test');
                break;
            case 'teardown':
                await manager.teardownEnvironment(environment || 'test');
                break;
            case 'snapshot':
                await manager.createSnapshot(environment || 'test', args[0]);
                break;
            case 'restore':
                await manager.restoreSnapshot(environment, args[0] || 'test');
                break;
            default:
                console.log(`
Usage: node test-data-management.js <command> [environment] [args]

Commands:
  seed <env>              Seed database with test data
  cleanup <env>           Clean up test data
  reset <env>             Reset database (cleanup + seed)
  provision <env>         Provision test environment
  teardown <env>          Teardown test environment
  snapshot <env> [name]   Create database snapshot
  restore <name> [env]    Restore from snapshot

Environments: test, e2e, performance
        `);
                break;
        }
    } catch (error) {
        console.error('❌ Test data management failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = TestDataManager;