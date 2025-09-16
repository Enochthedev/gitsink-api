#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Script to apply database performance fixes and optimizations
 */
async function runDatabaseFixes() {
    const prisma = new PrismaClient({
        log: ['info', 'warn', 'error'],
    });

    try {
        console.log('🚀 Starting database performance optimization...');

        // Read the SQL script
        const sqlScript = readFileSync(
            join(__dirname, 'fix-database-performance.sql'),
            'utf-8'
        );

        console.log('📖 Loaded SQL optimization script');

        // Split the script into individual statements
        const statements = sqlScript
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        console.log(`📝 Found ${statements.length} SQL statements to execute`);

        let successCount = 0;
        let errorCount = 0;

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];

            // Skip comments and empty statements
            if (statement.startsWith('--') || statement.trim().length === 0) {
                continue;
            }

            try {
                console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);

                // Handle different types of statements
                if (statement.toUpperCase().includes('CREATE INDEX CONCURRENTLY')) {
                    console.log('   Creating index concurrently...');
                } else if (statement.toUpperCase().includes('ALTER TABLE')) {
                    console.log('   Altering table structure...');
                } else if (statement.toUpperCase().includes('CREATE OR REPLACE FUNCTION')) {
                    console.log('   Creating/updating function...');
                } else if (statement.toUpperCase().includes('CREATE OR REPLACE VIEW')) {
                    console.log('   Creating/updating view...');
                }

                await prisma.$executeRawUnsafe(statement);
                successCount++;
                console.log('   ✅ Success');

            } catch (error) {
                errorCount++;
                console.error(`   ❌ Error executing statement ${i + 1}:`, error);

                // Continue with other statements even if one fails
                // Some statements might fail if indexes already exist, etc.
                if (error instanceof Error) {
                    if (error.message.includes('already exists')) {
                        console.log('   ℹ️  Resource already exists, skipping...');
                        successCount++; // Count as success since it's not a real error
                        errorCount--;
                    } else if (error.message.includes('does not exist')) {
                        console.log('   ℹ️  Resource does not exist, skipping...');
                        successCount++; // Count as success since it's not a real error
                        errorCount--;
                    }
                }
            }
        }

        console.log('\n📊 Database optimization summary:');
        console.log(`   ✅ Successful operations: ${successCount}`);
        console.log(`   ❌ Failed operations: ${errorCount}`);
        console.log(`   📈 Success rate: ${((successCount / (successCount + errorCount)) * 100).toFixed(1)}%`);

        // Verify some key optimizations
        console.log('\n🔍 Verifying optimizations...');

        try {
            // Check if key indexes exist
            const indexCheck = await prisma.$queryRaw`
                SELECT indexname, tablename 
                FROM pg_indexes 
                WHERE schemaname = 'public' 
                AND indexname LIKE 'idx_%'
                ORDER BY tablename, indexname
            `;

            console.log(`   📋 Found ${Array.isArray(indexCheck) ? indexCheck.length : 0} custom indexes`);

            // Check connection pool stats
            const connectionStats = await prisma.$queryRaw`
                SELECT COUNT(*) as active_connections
                FROM pg_stat_activity 
                WHERE datname = current_database()
            `;

            console.log(`   🔗 Active database connections: ${Array.isArray(connectionStats) && connectionStats[0] ? (connectionStats[0] as any).active_connections : 'unknown'}`);

            // Test a sample query performance
            const startTime = Date.now();
            await prisma.project.findMany({
                where: { deletedAt: null },
                take: 10,
            });
            const queryTime = Date.now() - startTime;

            console.log(`   ⚡ Sample query performance: ${queryTime}ms`);

        } catch (verificationError) {
            console.warn('   ⚠️  Verification checks failed:', verificationError);
        }

        console.log('\n🎉 Database performance optimization completed!');
        console.log('\n📋 Next steps:');
        console.log('   1. Run performance tests: npm run test:performance');
        console.log('   2. Monitor query performance in production');
        console.log('   3. Set up regular maintenance jobs for cleanup functions');
        console.log('   4. Review slow query logs periodically');

    } catch (error) {
        console.error('💥 Fatal error during database optimization:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Validate database connection and prerequisites
 */
async function validatePrerequisites() {
    const prisma = new PrismaClient();

    try {
        console.log('🔍 Validating database connection...');

        // Test basic connectivity
        await prisma.$queryRaw`SELECT 1`;
        console.log('   ✅ Database connection successful');

        // Check PostgreSQL version
        const versionResult = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
        const version = versionResult[0]?.version || 'unknown';
        console.log(`   📋 PostgreSQL version: ${version.split(' ')[1] || 'unknown'}`);

        // Check if we have necessary permissions
        const permissionCheck = await prisma.$queryRaw`
            SELECT has_database_privilege(current_user, current_database(), 'CREATE') as can_create
        `;

        const canCreate = Array.isArray(permissionCheck) && permissionCheck[0] ?
            (permissionCheck[0] as any).can_create : false;

        if (!canCreate) {
            throw new Error('Insufficient database permissions. CREATE privilege required.');
        }

        console.log('   ✅ Database permissions validated');

        // Check current schema
        const tableCount = await prisma.$queryRaw`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `;

        const count = Array.isArray(tableCount) && tableCount[0] ?
            (tableCount[0] as any).count : 0;

        console.log(`   📊 Found ${count} tables in public schema`);

        if (count === 0) {
            throw new Error('No tables found. Please run database migrations first.');
        }

        console.log('✅ Prerequisites validation passed');

    } catch (error) {
        console.error('❌ Prerequisites validation failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

/**
 * Main execution function
 */
async function main() {
    console.log('🔧 Database Performance Optimization Tool');
    console.log('==========================================\n');

    try {
        await validatePrerequisites();
        console.log('');
        await runDatabaseFixes();

    } catch (error) {
        console.error('\n💥 Optimization failed:', error);
        process.exit(1);
    }
}

// Run the script if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

export { runDatabaseFixes, validatePrerequisites };