#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyMigrations() {
    console.log('🔍 Verifying database migrations...');

    try {
        // Check if database is accessible
        await prisma.$connect();
        console.log('✅ Database connection successful');

        // Check migration status
        console.log('📋 Checking migration status...');
        const migrationStatus = execSync('npx prisma migrate status', { encoding: 'utf8' });
        console.log(migrationStatus);

        // Verify all tables exist
        console.log('🔍 Verifying table existence...');
        const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

        const expectedTables = [
            'User',
            'Project',
            'WaitlistEntry',
            'RefreshToken',
            'MagicLinkToken',
            'PublicProfile',
            'PlatformConnection',
            'SyncHistory',
            'AIAnalysis',
            'AuditLog',
            'ApiUsage',
            'SystemMetric',
            '_prisma_migrations'
        ];

        const actualTables = (tables as any[]).map(t => t.table_name);

        for (const expectedTable of expectedTables) {
            if (actualTables.includes(expectedTable)) {
                console.log(`✅ Table ${expectedTable} exists`);
            } else {
                console.log(`❌ Table ${expectedTable} missing`);
                throw new Error(`Missing table: ${expectedTable}`);
            }
        }

        // Verify indexes exist
        console.log('🔍 Verifying performance indexes...');
        const indexes = await prisma.$queryRaw`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `;

        const expectedIndexes = [
            'idx_projects_user_published_featured',
            'idx_projects_tags_gin',
            'idx_projects_search_text',
            'idx_sync_history_user_date_desc',
            'idx_public_profiles_discovery',
            'idx_api_usage_analytics'
        ];

        const actualIndexes = (indexes as any[]).map(i => i.indexname);

        for (const expectedIndex of expectedIndexes) {
            if (actualIndexes.includes(expectedIndex)) {
                console.log(`✅ Index ${expectedIndex} exists`);
            } else {
                console.log(`❌ Index ${expectedIndex} missing`);
                throw new Error(`Missing index: ${expectedIndex}`);
            }
        }

        // Test basic CRUD operations on new tables
        console.log('🔍 Testing basic CRUD operations...');

        // Test User with enhanced fields
        const testUser = await prisma.user.create({
            data: {
                email: 'migration-test@example.com',
                tier: 'premium',
                settings: { theme: 'dark' },
                syncCount: 1,
            },
        });
        console.log('✅ User CRUD operations working');

        // Test PublicProfile
        const testProfile = await prisma.publicProfile.create({
            data: {
                userId: testUser.id,
                username: 'migrationtest',
                isPublic: true,
            },
        });
        console.log('✅ PublicProfile CRUD operations working');

        // Test PlatformConnection
        const testConnection = await prisma.platformConnection.create({
            data: {
                userId: testUser.id,
                platform: 'github',
                platformUserId: 'github123',
                isActive: true,
            },
        });
        console.log('✅ PlatformConnection CRUD operations working');

        // Test Project with enhanced fields
        const testProject = await prisma.project.create({
            data: {
                title: 'Migration Test Project',
                description: 'Test project for migration verification',
                tags: ['test'],
                ownerId: testUser.id,
                platform: 'github',
                starCount: 10,
                topics: ['testing'],
            },
        });
        console.log('✅ Enhanced Project CRUD operations working');

        // Test SyncHistory
        const testSync = await prisma.syncHistory.create({
            data: {
                userId: testUser.id,
                projectId: testProject.id,
                operation: 'sync',
                platform: 'github',
                repositoryUrl: 'https://github.com/test/repo',
                status: 'completed',
            },
        });
        console.log('✅ SyncHistory CRUD operations working');

        // Test AIAnalysis
        const testAnalysis = await prisma.aIAnalysis.create({
            data: {
                projectId: testProject.id,
                analysis: { description: 'Test analysis' },
                confidence: 0.9,
            },
        });
        console.log('✅ AIAnalysis CRUD operations working');

        // Test AuditLog
        const testAudit = await prisma.auditLog.create({
            data: {
                userId: testUser.id,
                action: 'test',
                success: true,
            },
        });
        console.log('✅ AuditLog CRUD operations working');

        // Test ApiUsage
        const testApiUsage = await prisma.apiUsage.create({
            data: {
                userId: testUser.id,
                endpoint: '/test',
                method: 'GET',
                statusCode: 200,
                duration: 100,
            },
        });
        console.log('✅ ApiUsage CRUD operations working');

        // Test SystemMetric
        const testMetric = await prisma.systemMetric.create({
            data: {
                metric: 'test_metric',
                value: 42.0,
            },
        });
        console.log('✅ SystemMetric CRUD operations working');

        // Cleanup test data
        console.log('🧹 Cleaning up test data...');
        await prisma.apiUsage.delete({ where: { id: testApiUsage.id } });
        await prisma.systemMetric.delete({ where: { id: testMetric.id } });
        await prisma.auditLog.delete({ where: { id: testAudit.id } });
        await prisma.aIAnalysis.delete({ where: { id: testAnalysis.id } });
        await prisma.syncHistory.delete({ where: { id: testSync.id } });
        await prisma.project.delete({ where: { id: testProject.id } });
        await prisma.platformConnection.delete({ where: { id: testConnection.id } });
        await prisma.publicProfile.delete({ where: { id: testProfile.id } });
        await prisma.user.delete({ where: { id: testUser.id } });
        console.log('✅ Test data cleaned up');

        console.log('\n🎉 All migration verifications passed!');
        console.log('✅ Database schema is properly enhanced');
        console.log('✅ All new tables are created');
        console.log('✅ Performance indexes are in place');
        console.log('✅ CRUD operations work correctly');

    } catch (error) {
        console.error('❌ Migration verification failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run verification if this script is executed directly
if (require.main === module) {
    verifyMigrations();
}

export { verifyMigrations };