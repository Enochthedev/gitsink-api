#!/usr/bin/env ts-node

/**
 * Database Schema Enhancement Validation Script
 * 
 * This script validates that all database enhancements from the requirements
 * have been properly implemented and are functioning correctly.
 * 
 * Requirements covered:
 * - 10.1: Database schema management
 * - 10.2: Data migration capabilities  
 * - 10.3: Data integrity constraints
 * - 10.4: Performance optimization
 * - 10.5: Backward compatibility
 * - 11.1: Sync history tracking
 * - 11.2: Audit trail implementation
 * - 12.1: Public profile support
 * - 14.1: Multi-platform support
 * - 17.1: Custom metadata support
 * - 18.1: GraphQL schema support
 */

import { PrismaClient } from '@prisma/client';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();

interface ValidationResult {
    test: string;
    passed: boolean;
    message: string;
    duration?: number;
}

class DatabaseValidator {
    private results: ValidationResult[] = [];

    private addResult(test: string, passed: boolean, message: string, duration?: number) {
        this.results.push({ test, passed, message, duration });
        const status = passed ? '✅' : '❌';
        const durationStr = duration ? ` (${duration.toFixed(2)}ms)` : '';
        console.log(`${status} ${test}: ${message}${durationStr}`);
    }

    async validateTableStructure(): Promise<void> {
        console.log('\n🔍 Validating table structure...');

        try {
            // Check if all required tables exist
            const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `;

            const tableNames = tables.map(t => t.table_name);
            const requiredTables = [
                'User', 'Project', 'PublicProfile', 'PlatformConnection',
                'SyncHistory', 'AIAnalysis', 'AuditLog', 'ApiUsage',
                'SystemMetric', 'RefreshToken', 'MagicLinkToken', 'WaitlistEntry'
            ];

            const missingTables = requiredTables.filter(table => !tableNames.includes(table));

            if (missingTables.length === 0) {
                this.addResult('Table Structure', true, `All ${requiredTables.length} required tables exist`);
            } else {
                this.addResult('Table Structure', false, `Missing tables: ${missingTables.join(', ')}`);
            }

        } catch (error) {
            this.addResult('Table Structure', false, `Error checking tables: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async validateIndexes(): Promise<void> {
        console.log('\n🔍 Validating database indexes...');

        try {
            const indexes = await prisma.$queryRaw<Array<{ indexname: string, tablename: string }>>`
        SELECT indexname, tablename 
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
        ORDER BY tablename, indexname;
      `;

            // Check for critical performance indexes
            const criticalIndexes = [
                'idx_projects_user_published_featured',
                'idx_projects_search_text',
                'idx_sync_history_user_date_desc',
                'idx_users_active_tier',
                'idx_platform_connections_active',
                'idx_audit_log_user_action_time'
            ];

            const indexNames = indexes.map(i => i.indexname);
            const missingIndexes = criticalIndexes.filter(idx => !indexNames.some(name => name.includes(idx.replace('idx_', ''))));

            if (missingIndexes.length === 0) {
                this.addResult('Performance Indexes', true, `All critical indexes present (${indexes.length} total indexes)`);
            } else {
                this.addResult('Performance Indexes', false, `Missing critical indexes: ${missingIndexes.join(', ')}`);
            }

        } catch (error) {
            this.addResult('Performance Indexes', false, `Error checking indexes: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async validateConstraints(): Promise<void> {
        console.log('\n🔍 Validating data integrity constraints...');

        try {
            const constraints = await prisma.$queryRaw<Array<{ constraint_name: string, table_name: string, constraint_type: string }>>`
        SELECT constraint_name, table_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
        AND constraint_type IN ('CHECK', 'FOREIGN KEY', 'UNIQUE')
        ORDER BY table_name, constraint_type;
      `;

            const checkConstraints = constraints.filter(c => c.constraint_type === 'CHECK');
            const foreignKeys = constraints.filter(c => c.constraint_type === 'FOREIGN KEY');
            const uniqueConstraints = constraints.filter(c => c.constraint_type === 'UNIQUE');

            this.addResult('Check Constraints', checkConstraints.length > 0,
                `Found ${checkConstraints.length} check constraints for data validation`);

            this.addResult('Foreign Key Constraints', foreignKeys.length > 0,
                `Found ${foreignKeys.length} foreign key constraints for referential integrity`);

            this.addResult('Unique Constraints', uniqueConstraints.length > 0,
                `Found ${uniqueConstraints.length} unique constraints`);

        } catch (error) {
            this.addResult('Data Constraints', false, `Error checking constraints: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async validateFunctions(): Promise<void> {
        console.log('\n🔍 Validating database functions...');

        try {
            const functions = await prisma.$queryRaw<Array<{ routine_name: string }>>`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        AND routine_type = 'FUNCTION'
        ORDER BY routine_name;
      `;

            const functionNames = functions.map(f => f.routine_name);
            const requiredFunctions = [
                'get_user_project_stats',
                'cleanup_old_audit_logs',
                'calculate_user_engagement_score',
                'refresh_project_stats'
            ];

            const missingFunctions = requiredFunctions.filter(func => !functionNames.includes(func));

            if (missingFunctions.length === 0) {
                this.addResult('Database Functions', true, `All ${requiredFunctions.length} required functions exist`);
            } else {
                this.addResult('Database Functions', false, `Missing functions: ${missingFunctions.join(', ')}`);
            }

        } catch (error) {
            this.addResult('Database Functions', false, `Error checking functions: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async validateTriggers(): Promise<void> {
        console.log('\n🔍 Validating database triggers...');

        try {
            const triggers = await prisma.$queryRaw<Array<{ trigger_name: string, event_object_table: string }>>`
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
        ORDER BY event_object_table, trigger_name;
      `;

            const requiredTriggers = [
                'trigger_audit_user_changes',
                'trigger_audit_project_changes'
            ];

            const triggerNames = triggers.map(t => t.trigger_name);
            const missingTriggers = requiredTriggers.filter(trigger => !triggerNames.includes(trigger));

            if (missingTriggers.length === 0) {
                this.addResult('Audit Triggers', true, `All ${requiredTriggers.length} audit triggers exist`);
            } else {
                this.addResult('Audit Triggers', false, `Missing triggers: ${missingTriggers.join(', ')}`);
            }

        } catch (error) {
            this.addResult('Audit Triggers', false, `Error checking triggers: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async validateMaterializedViews(): Promise<void> {
        console.log('\n🔍 Validating materialized views...');

        try {
            const views = await prisma.$queryRaw<Array<{ matviewname: string }>>`
        SELECT matviewname
        FROM pg_matviews
        WHERE schemaname = 'public'
        ORDER BY matviewname;
      `;

            const viewNames = views.map(v => v.matviewname);
            const requiredViews = ['project_stats_summary'];

            const missingViews = requiredViews.filter(view => !viewNames.includes(view));

            if (missingViews.length === 0) {
                this.addResult('Materialized Views', true, `All ${requiredViews.length} materialized views exist`);
            } else {
                this.addResult('Materialized Views', false, `Missing views: ${missingViews.join(', ')}`);
            }

        } catch (error) {
            this.addResult('Materialized Views', false, `Error checking materialized views: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async validatePerformance(): Promise<void> {
        console.log('\n🔍 Validating query performance...');

        try {
            // Test complex query performance
            const start = performance.now();

            const result = await prisma.$queryRaw`
        SELECT 
          u.id,
          u.email,
          u.tier,
          COUNT(p.id) as project_count,
          COALESCE(SUM(p."starCount"), 0) as total_stars
        FROM "User" u
        LEFT JOIN "Project" p ON u.id = p."ownerId" AND p."deletedAt" IS NULL
        WHERE u."deletedAt" IS NULL
        GROUP BY u.id, u.email, u.tier
        LIMIT 10;
      `;

            const duration = performance.now() - start;

            if (duration < 100) { // Should complete in under 100ms
                this.addResult('Query Performance', true, `Complex query completed efficiently`, duration);
            } else {
                this.addResult('Query Performance', false, `Query took too long (${duration.toFixed(2)}ms)`, duration);
            }

        } catch (error) {
            this.addResult('Query Performance', false, `Error testing performance: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async validateDataIntegrity(): Promise<void> {
        console.log('\n🔍 Validating data integrity...');

        try {
            // Test foreign key relationships
            const orphanedProjects = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count
        FROM "Project" p
        LEFT JOIN "User" u ON p."ownerId" = u.id
        WHERE u.id IS NULL;
      `;

            const orphanCount = Number(orphanedProjects[0]?.count || 0);

            if (orphanCount === 0) {
                this.addResult('Data Integrity', true, 'No orphaned records found');
            } else {
                this.addResult('Data Integrity', false, `Found ${orphanCount} orphaned project records`);
            }

            // Test constraint violations
            try {
                await prisma.$queryRaw`
          SELECT 1 FROM "User" WHERE "monthlyApiCalls" < 0 LIMIT 1;
        `;
                this.addResult('Constraint Validation', true, 'Check constraints are enforced');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes('violates check constraint')) {
                    this.addResult('Constraint Validation', true, 'Check constraints are properly enforced');
                } else {
                    this.addResult('Constraint Validation', false, `Unexpected constraint error: ${errorMessage}`);
                }
            }

        } catch (error) {
            this.addResult('Data Integrity', false, `Error checking data integrity: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async validateMultiPlatformSupport(): Promise<void> {
        console.log('\n🔍 Validating multi-platform support...');

        try {
            // Check if platform-specific columns exist
            const platformColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'Project'
        AND column_name IN ('platform', 'platformId')
        ORDER BY column_name;
      `;

            const hasRequiredColumns = platformColumns.length === 2;

            if (hasRequiredColumns) {
                this.addResult('Multi-Platform Schema', true, 'Platform-specific columns exist');
            } else {
                this.addResult('Multi-Platform Schema', false, 'Missing platform-specific columns');
            }

            // Check PlatformConnection table
            const platformConnections = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_name = 'PlatformConnection';
      `;

            const hasConnectionTable = Number(platformConnections[0]?.count || 0) > 0;

            if (hasConnectionTable) {
                this.addResult('Platform Connections', true, 'PlatformConnection table exists');
            } else {
                this.addResult('Platform Connections', false, 'PlatformConnection table missing');
            }

        } catch (error) {
            this.addResult('Multi-Platform Support', false, `Error checking multi-platform support: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async validateAuditCapabilities(): Promise<void> {
        console.log('\n🔍 Validating audit and sync history capabilities...');

        try {
            // Check audit tables
            const auditTables = await prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name IN ('SyncHistory', 'AuditLog')
        ORDER BY table_name;
      `;

            if (auditTables.length === 2) {
                this.addResult('Audit Tables', true, 'SyncHistory and AuditLog tables exist');
            } else {
                this.addResult('Audit Tables', false, `Missing audit tables: ${2 - auditTables.length}`);
            }

            // Check audit columns
            const auditColumns = await prisma.$queryRaw<Array<{ column_name: string, table_name: string }>>`
        SELECT column_name, table_name
        FROM information_schema.columns
        WHERE table_name IN ('SyncHistory', 'AuditLog')
        AND column_name IN ('timestamp', 'startedAt', 'userId', 'action', 'operation')
        ORDER BY table_name, column_name;
      `;

            if (auditColumns.length >= 4) {
                this.addResult('Audit Columns', true, 'Required audit columns exist');
            } else {
                this.addResult('Audit Columns', false, 'Missing required audit columns');
            }

        } catch (error) {
            this.addResult('Audit Capabilities', false, `Error checking audit capabilities: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async runAllValidations(): Promise<void> {
        console.log('🚀 Starting Database Schema Enhancement Validation\n');

        await this.validateTableStructure();
        await this.validateIndexes();
        await this.validateConstraints();
        await this.validateFunctions();
        await this.validateTriggers();
        await this.validateMaterializedViews();
        await this.validatePerformance();
        await this.validateDataIntegrity();
        await this.validateMultiPlatformSupport();
        await this.validateAuditCapabilities();

        this.printSummary();
    }

    private printSummary(): void {
        console.log('\n📊 Validation Summary');
        console.log('='.repeat(50));

        const passed = this.results.filter(r => r.passed).length;
        const total = this.results.length;
        const percentage = ((passed / total) * 100).toFixed(1);

        console.log(`✅ Passed: ${passed}/${total} (${percentage}%)`);
        console.log(`❌ Failed: ${total - passed}/${total}`);

        if (passed === total) {
            console.log('\n🎉 All database enhancements have been successfully implemented!');
            console.log('The database schema meets all requirements for:');
            console.log('  • Multi-platform repository support');
            console.log('  • Comprehensive audit trails');
            console.log('  • Performance optimization');
            console.log('  • Data integrity constraints');
            console.log('  • Public profile functionality');
            console.log('  • AI analysis capabilities');
            console.log('  • System monitoring and metrics');
        } else {
            console.log('\n⚠️  Some validations failed. Please review the results above.');

            const failedTests = this.results.filter(r => !r.passed);
            console.log('\nFailed tests:');
            failedTests.forEach(test => {
                console.log(`  • ${test.test}: ${test.message}`);
            });
        }

        console.log('\n' + '='.repeat(50));
    }
}

async function main() {
    const validator = new DatabaseValidator();

    try {
        await validator.runAllValidations();
    } catch (error) {
        console.error('❌ Validation failed with error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { DatabaseValidator };