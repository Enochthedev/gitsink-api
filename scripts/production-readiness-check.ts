#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

interface CheckResult {
    name: string;
    status: 'pass' | 'fail' | 'warning';
    message: string;
    details?: string[];
}

class ProductionReadinessValidator {
    private results: CheckResult[] = [];

    async runAllChecks(): Promise<void> {
        console.log('🚀 Production Readiness Validation\n');

        await this.checkEnvironmentConfiguration();
        await this.checkDatabaseMigrations();
        await this.checkSecurityConfiguration();
        await this.checkMonitoringSetup();
        await this.checkDockerConfiguration();
        await this.checkBackupProcedures();
        await this.checkScalabilityRequirements();
        await this.checkDisasterRecovery();
        await this.checkPerformanceRequirements();
        await this.checkComplianceRequirements();

        this.generateReport();
    }

    private async checkEnvironmentConfiguration(): Promise<void> {
        console.log('🔧 Checking Environment Configuration...');

        // Check required environment files
        const envFiles = ['.env.production', '.env.staging', '.env.example'];
        const missingFiles: string[] = [];

        envFiles.forEach(file => {
            if (!fs.existsSync(file)) {
                missingFiles.push(file);
            }
        });

        if (missingFiles.length === 0) {
            this.results.push({
                name: 'Environment Files',
                status: 'pass',
                message: 'All required environment files are present',
            });
        } else {
            this.results.push({
                name: 'Environment Files',
                status: 'fail',
                message: 'Missing environment files',
                details: missingFiles,
            });
        }

        // Check environment variable validation
        try {
            execSync('npm run config:validate:prod', { stdio: 'pipe' });
            this.results.push({
                name: 'Environment Validation',
                status: 'pass',
                message: 'Production environment configuration is valid',
            });
        } catch (error) {
            this.results.push({
                name: 'Environment Validation',
                status: 'fail',
                message: 'Production environment configuration validation failed',
                details: [error instanceof Error ? error.message : String(error)],
            });
        }

        // Check for sensitive data in environment files
        const sensitivePatterns = [
            /password\s*=\s*[^#\n]+/i,
            /secret\s*=\s*[^#\n]+/i,
            /key\s*=\s*[^#\n]+/i,
        ];

        const exampleEnvContent = fs.readFileSync('.env.example', 'utf8');
        const hasSensitiveData = sensitivePatterns.some(pattern =>
            pattern.test(exampleEnvContent) && !exampleEnvContent.includes('your_')
        );

        if (!hasSensitiveData) {
            this.results.push({
                name: 'Environment Security',
                status: 'pass',
                message: 'No sensitive data found in example environment file',
            });
        } else {
            this.results.push({
                name: 'Environment Security',
                status: 'warning',
                message: 'Potential sensitive data in example environment file',
            });
        }
    }

    private async checkDatabaseMigrations(): Promise<void> {
        console.log('🗄️ Checking Database Configuration...');

        // Check if migrations are up to date
        try {
            const migrationStatus = execSync('npx prisma migrate status', {
                encoding: 'utf8',
                stdio: 'pipe'
            });

            if (migrationStatus.includes('Database is up to date')) {
                this.results.push({
                    name: 'Database Migrations',
                    status: 'pass',
                    message: 'Database migrations are up to date',
                });
            } else {
                this.results.push({
                    name: 'Database Migrations',
                    status: 'warning',
                    message: 'Database migrations may need attention',
                    details: [migrationStatus.trim()],
                });
            }
        } catch (error) {
            this.results.push({
                name: 'Database Migrations',
                status: 'fail',
                message: 'Failed to check migration status',
                details: [error instanceof Error ? error.message : String(error)],
            });
        }

        // Check for backup migration scripts
        const migrationDir = 'prisma/migrations';
        if (fs.existsSync(migrationDir)) {
            const migrations = fs.readdirSync(migrationDir);
            if (migrations.length > 0) {
                this.results.push({
                    name: 'Migration History',
                    status: 'pass',
                    message: `Found ${migrations.length} migration files`,
                });
            } else {
                this.results.push({
                    name: 'Migration History',
                    status: 'warning',
                    message: 'No migration files found',
                });
            }
        }

        // Check database indexes
        const schemaContent = fs.readFileSync('prisma/schema.prisma', 'utf8');
        const indexCount = (schemaContent.match(/@@index/g) || []).length;

        if (indexCount > 10) {
            this.results.push({
                name: 'Database Indexes',
                status: 'pass',
                message: `Found ${indexCount} database indexes for performance`,
            });
        } else {
            this.results.push({
                name: 'Database Indexes',
                status: 'warning',
                message: `Only ${indexCount} database indexes found - consider adding more for performance`,
            });
        }
    }

    private async checkSecurityConfiguration(): Promise<void> {
        console.log('🔒 Checking Security Configuration...');

        // Check for security-related packages
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const securityPackages = ['helmet', 'bcryptjs', '@nestjs/throttler'];
        const missingPackages = securityPackages.filter(pkg =>
            !packageJson.dependencies[pkg] && !packageJson.devDependencies[pkg]
        );

        if (missingPackages.length === 0) {
            this.results.push({
                name: 'Security Packages',
                status: 'pass',
                message: 'All required security packages are installed',
            });
        } else {
            this.results.push({
                name: 'Security Packages',
                status: 'fail',
                message: 'Missing security packages',
                details: missingPackages,
            });
        }

        // Check for security tests
        try {
            execSync('npm run test:security', { stdio: 'pipe' });
            this.results.push({
                name: 'Security Tests',
                status: 'pass',
                message: 'Security tests are passing',
            });
        } catch (error) {
            this.results.push({
                name: 'Security Tests',
                status: 'fail',
                message: 'Security tests are failing or missing',
            });
        }

        // Check for HTTPS configuration
        const dockerFiles = ['docker-compose.prod.yml', 'docker/caddy/Caddyfile.prod'];
        const httpsConfigured = dockerFiles.some(file => {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');
                return content.includes('https') || content.includes('tls') || content.includes('ssl');
            }
            return false;
        });

        if (httpsConfigured) {
            this.results.push({
                name: 'HTTPS Configuration',
                status: 'pass',
                message: 'HTTPS/TLS configuration found',
            });
        } else {
            this.results.push({
                name: 'HTTPS Configuration',
                status: 'warning',
                message: 'HTTPS/TLS configuration not clearly configured',
            });
        }
    }

    private async checkMonitoringSetup(): Promise<void> {
        console.log('📊 Checking Monitoring and Observability...');

        // Check for monitoring configuration files
        const monitoringFiles = [
            'docker/prometheus/prometheus.yml',
            'docker/grafana/provisioning/datasources',
            'docker/grafana/provisioning/dashboards',
        ];

        const existingFiles = monitoringFiles.filter(file => fs.existsSync(file));

        if (existingFiles.length === monitoringFiles.length) {
            this.results.push({
                name: 'Monitoring Configuration',
                status: 'pass',
                message: 'All monitoring configuration files are present',
            });
        } else {
            this.results.push({
                name: 'Monitoring Configuration',
                status: 'warning',
                message: 'Some monitoring configuration files are missing',
                details: monitoringFiles.filter(file => !fs.existsSync(file)),
            });
        }

        // Check for metrics endpoints
        const srcFiles = this.findFiles('src', '.ts');
        const metricsFiles = srcFiles.filter(file =>
            file.includes('metrics') || file.includes('prometheus')
        );

        if (metricsFiles.length > 0) {
            this.results.push({
                name: 'Metrics Implementation',
                status: 'pass',
                message: `Found ${metricsFiles.length} metrics-related files`,
            });
        } else {
            this.results.push({
                name: 'Metrics Implementation',
                status: 'warning',
                message: 'No metrics implementation files found',
            });
        }

        // Check for health check endpoints
        const healthFiles = srcFiles.filter(file => file.includes('health'));
        if (healthFiles.length > 0) {
            this.results.push({
                name: 'Health Checks',
                status: 'pass',
                message: `Found ${healthFiles.length} health check files`,
            });
        } else {
            this.results.push({
                name: 'Health Checks',
                status: 'fail',
                message: 'No health check implementation found',
            });
        }
    }

    private async checkDockerConfiguration(): Promise<void> {
        console.log('🐳 Checking Docker Configuration...');

        // Check for Docker files
        const dockerFiles = [
            'Dockerfile',
            'Dockerfile.dev',
            'docker-compose.yaml',
            'docker-compose.prod.yml',
            '.dockerignore',
        ];

        const existingDockerFiles = dockerFiles.filter(file => fs.existsSync(file));

        if (existingDockerFiles.length >= 4) {
            this.results.push({
                name: 'Docker Files',
                status: 'pass',
                message: `Found ${existingDockerFiles.length}/${dockerFiles.length} Docker configuration files`,
            });
        } else {
            this.results.push({
                name: 'Docker Files',
                status: 'warning',
                message: 'Some Docker configuration files are missing',
                details: dockerFiles.filter(file => !fs.existsSync(file)),
            });
        }

        // Check Dockerfile for production best practices
        if (fs.existsSync('Dockerfile')) {
            const dockerfileContent = fs.readFileSync('Dockerfile', 'utf8');
            const bestPractices = [
                { pattern: /USER \w+/, name: 'Non-root user' },
                { pattern: /HEALTHCHECK/, name: 'Health check' },
                { pattern: /--no-cache/, name: 'Cache optimization' },
            ];

            const passedPractices = bestPractices.filter(practice =>
                practice.pattern.test(dockerfileContent)
            );

            if (passedPractices.length >= 2) {
                this.results.push({
                    name: 'Dockerfile Best Practices',
                    status: 'pass',
                    message: `Dockerfile follows ${passedPractices.length}/${bestPractices.length} best practices`,
                });
            } else {
                this.results.push({
                    name: 'Dockerfile Best Practices',
                    status: 'warning',
                    message: 'Dockerfile could follow more best practices',
                    details: bestPractices
                        .filter(practice => !practice.pattern.test(dockerfileContent))
                        .map(practice => practice.name),
                });
            }
        }
    }

    private async checkBackupProcedures(): Promise<void> {
        console.log('💾 Checking Backup and Recovery Procedures...');

        // Check for backup scripts
        const backupScripts = this.findFiles('scripts', '.ts').filter(file =>
            file.includes('backup') || file.includes('restore')
        );

        if (backupScripts.length > 0) {
            this.results.push({
                name: 'Backup Scripts',
                status: 'pass',
                message: `Found ${backupScripts.length} backup/restore scripts`,
            });
        } else {
            this.results.push({
                name: 'Backup Scripts',
                status: 'warning',
                message: 'No backup/restore scripts found',
            });
        }

        // Check for database backup configuration in Docker
        const dockerComposeFiles = ['docker-compose.yaml', 'docker-compose.prod.yml'];
        const hasBackupConfig = dockerComposeFiles.some(file => {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');
                return content.includes('backup') || content.includes('volumes');
            }
            return false;
        });

        if (hasBackupConfig) {
            this.results.push({
                name: 'Database Backup Configuration',
                status: 'pass',
                message: 'Database backup configuration found in Docker setup',
            });
        } else {
            this.results.push({
                name: 'Database Backup Configuration',
                status: 'warning',
                message: 'No clear database backup configuration found',
            });
        }

        // Check for backup documentation
        const docs = this.findFiles('docs', '.md');
        const backupDocs = docs.filter(file =>
            file.toLowerCase().includes('backup') ||
            file.toLowerCase().includes('disaster') ||
            file.toLowerCase().includes('recovery')
        );

        if (backupDocs.length > 0) {
            this.results.push({
                name: 'Backup Documentation',
                status: 'pass',
                message: 'Backup/recovery documentation found',
            });
        } else {
            this.results.push({
                name: 'Backup Documentation',
                status: 'warning',
                message: 'No backup/recovery documentation found',
            });
        }
    }

    private async checkScalabilityRequirements(): Promise<void> {
        console.log('📈 Checking Scalability Requirements...');

        // Check for caching implementation
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const cachingPackages = ['cache-manager', 'ioredis', '@nestjs/cache-manager'];
        const hasCaching = cachingPackages.some(pkg =>
            packageJson.dependencies[pkg] || packageJson.devDependencies[pkg]
        );

        if (hasCaching) {
            this.results.push({
                name: 'Caching Implementation',
                status: 'pass',
                message: 'Caching packages are installed',
            });
        } else {
            this.results.push({
                name: 'Caching Implementation',
                status: 'warning',
                message: 'No caching packages found',
            });
        }

        // Check for queue system
        const queuePackages = ['bullmq', '@nestjs/bullmq'];
        const hasQueues = queuePackages.some(pkg =>
            packageJson.dependencies[pkg] || packageJson.devDependencies[pkg]
        );

        if (hasQueues) {
            this.results.push({
                name: 'Queue System',
                status: 'pass',
                message: 'Queue system packages are installed',
            });
        } else {
            this.results.push({
                name: 'Queue System',
                status: 'warning',
                message: 'No queue system packages found',
            });
        }

        // Check for load balancer configuration
        const caddyFiles = this.findFiles('docker/caddy', '.prod');
        if (caddyFiles.length > 0) {
            this.results.push({
                name: 'Load Balancer Configuration',
                status: 'pass',
                message: 'Load balancer configuration found',
            });
        } else {
            this.results.push({
                name: 'Load Balancer Configuration',
                status: 'warning',
                message: 'No load balancer configuration found',
            });
        }

        // Check for performance tests
        const perfTests = this.findFiles('test', '.ts').filter(file =>
            file.includes('performance') || file.includes('load')
        );

        if (perfTests.length > 0) {
            this.results.push({
                name: 'Performance Tests',
                status: 'pass',
                message: `Found ${perfTests.length} performance test files`,
            });
        } else {
            this.results.push({
                name: 'Performance Tests',
                status: 'warning',
                message: 'No performance test files found',
            });
        }
    }

    private async checkDisasterRecovery(): Promise<void> {
        console.log('🚨 Checking Disaster Recovery Procedures...');

        // Check for disaster recovery documentation
        const docs = this.findFiles('docs', '.md');
        const drDocs = docs.filter(file =>
            file.toLowerCase().includes('disaster') ||
            file.toLowerCase().includes('recovery') ||
            file.toLowerCase().includes('incident')
        );

        if (drDocs.length > 0) {
            this.results.push({
                name: 'Disaster Recovery Documentation',
                status: 'pass',
                message: 'Disaster recovery documentation found',
            });
        } else {
            this.results.push({
                name: 'Disaster Recovery Documentation',
                status: 'warning',
                message: 'No disaster recovery documentation found',
            });
        }

        // Check for rollback procedures
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const rollbackScripts = Object.keys(packageJson.scripts || {}).filter(script =>
            script.includes('rollback') || script.includes('revert')
        );

        if (rollbackScripts.length > 0) {
            this.results.push({
                name: 'Rollback Procedures',
                status: 'pass',
                message: `Found ${rollbackScripts.length} rollback scripts`,
            });
        } else {
            this.results.push({
                name: 'Rollback Procedures',
                status: 'warning',
                message: 'No rollback procedures found in package.json scripts',
            });
        }

        // Check for multi-environment support
        const envFiles = ['.env.development', '.env.staging', '.env.production'];
        const existingEnvs = envFiles.filter(file => fs.existsSync(file));

        if (existingEnvs.length >= 2) {
            this.results.push({
                name: 'Multi-Environment Support',
                status: 'pass',
                message: `Found ${existingEnvs.length} environment configurations`,
            });
        } else {
            this.results.push({
                name: 'Multi-Environment Support',
                status: 'warning',
                message: 'Limited environment configurations found',
            });
        }
    }

    private async checkPerformanceRequirements(): Promise<void> {
        console.log('⚡ Checking Performance Requirements...');

        // Check for performance monitoring
        const srcFiles = this.findFiles('src', '.ts');
        const perfFiles = srcFiles.filter(file =>
            file.includes('performance') ||
            file.includes('metrics') ||
            file.includes('benchmark')
        );

        if (perfFiles.length > 0) {
            this.results.push({
                name: 'Performance Monitoring',
                status: 'pass',
                message: `Found ${perfFiles.length} performance-related files`,
            });
        } else {
            this.results.push({
                name: 'Performance Monitoring',
                status: 'warning',
                message: 'No performance monitoring files found',
            });
        }

        // Check for database optimization
        const schemaContent = fs.readFileSync('prisma/schema.prisma', 'utf8');
        const optimizations = [
            { pattern: /@@index/, name: 'Database indexes' },
            { pattern: /@@unique/, name: 'Unique constraints' },
            { pattern: /@default/, name: 'Default values' },
        ];

        const foundOptimizations = optimizations.filter(opt =>
            opt.pattern.test(schemaContent)
        );

        if (foundOptimizations.length >= 2) {
            this.results.push({
                name: 'Database Optimization',
                status: 'pass',
                message: `Database schema includes ${foundOptimizations.length} optimization techniques`,
            });
        } else {
            this.results.push({
                name: 'Database Optimization',
                status: 'warning',
                message: 'Database schema could benefit from more optimization',
            });
        }
    }

    private async checkComplianceRequirements(): Promise<void> {
        console.log('📋 Checking Compliance Requirements...');

        // Check for audit logging
        const auditFiles = this.findFiles('src', '.ts').filter(file =>
            file.includes('audit') || file.includes('log')
        );

        if (auditFiles.length > 0) {
            this.results.push({
                name: 'Audit Logging',
                status: 'pass',
                message: `Found ${auditFiles.length} audit/logging files`,
            });
        } else {
            this.results.push({
                name: 'Audit Logging',
                status: 'warning',
                message: 'No audit logging implementation found',
            });
        }

        // Check for data privacy measures
        const privacyFiles = this.findFiles('src', '.ts').filter(file =>
            file.includes('privacy') ||
            file.includes('gdpr') ||
            file.includes('encryption')
        );

        if (privacyFiles.length > 0) {
            this.results.push({
                name: 'Data Privacy',
                status: 'pass',
                message: 'Data privacy implementation found',
            });
        } else {
            this.results.push({
                name: 'Data Privacy',
                status: 'warning',
                message: 'No explicit data privacy implementation found',
            });
        }

        // Check for license and legal files
        const legalFiles = ['LICENSE', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md'];
        const existingLegalFiles = legalFiles.filter(file => fs.existsSync(file));

        if (existingLegalFiles.length >= 2) {
            this.results.push({
                name: 'Legal Documentation',
                status: 'pass',
                message: `Found ${existingLegalFiles.length} legal documentation files`,
            });
        } else {
            this.results.push({
                name: 'Legal Documentation',
                status: 'warning',
                message: 'Some legal documentation files are missing',
                details: legalFiles.filter(file => !fs.existsSync(file)),
            });
        }
    }

    private findFiles(directory: string, extension: string): string[] {
        if (!fs.existsSync(directory)) {
            return [];
        }

        const files: string[] = [];

        const scanDirectory = (dir: string) => {
            const items = fs.readdirSync(dir);

            items.forEach(item => {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    scanDirectory(fullPath);
                } else if (item.endsWith(extension)) {
                    files.push(fullPath);
                }
            });
        };

        scanDirectory(directory);
        return files;
    }

    private generateReport(): void {
        console.log('\n📊 Production Readiness Report');
        console.log('='.repeat(50));

        const passedChecks = this.results.filter(r => r.status === 'pass').length;
        const warningChecks = this.results.filter(r => r.status === 'warning').length;
        const failedChecks = this.results.filter(r => r.status === 'fail').length;
        const totalChecks = this.results.length;

        console.log(`Total Checks: ${totalChecks}`);
        console.log(`✅ Passed: ${passedChecks}`);
        console.log(`⚠️  Warnings: ${warningChecks}`);
        console.log(`❌ Failed: ${failedChecks}`);
        console.log('');

        // Calculate readiness score
        const score = Math.round(((passedChecks + warningChecks * 0.5) / totalChecks) * 100);
        console.log(`🎯 Production Readiness Score: ${score}%`);
        console.log('');

        // Detailed results
        console.log('📋 Detailed Results:');
        console.log('-'.repeat(50));

        this.results.forEach(result => {
            const icon = result.status === 'pass' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
            console.log(`${icon} ${result.name}: ${result.message}`);

            if (result.details && result.details.length > 0) {
                result.details.forEach(detail => {
                    console.log(`   - ${detail}`);
                });
            }
        });

        console.log('');

        // Recommendations
        this.generateRecommendations(score);

        // Save report
        this.saveReport(score);

        // Exit with appropriate code
        const isReady = failedChecks === 0 && score >= 80;
        process.exit(isReady ? 0 : 1);
    }

    private generateRecommendations(score: number): void {
        console.log('💡 Recommendations:');
        console.log('-'.repeat(30));

        if (score >= 90) {
            console.log('🎉 Excellent! Your application is production-ready.');
            console.log('   - Consider setting up automated monitoring alerts');
            console.log('   - Plan regular security audits');
            console.log('   - Document incident response procedures');
        } else if (score >= 80) {
            console.log('👍 Good! Your application is mostly production-ready.');
            console.log('   - Address the warning items for better reliability');
            console.log('   - Consider implementing missing monitoring features');
        } else if (score >= 60) {
            console.log('⚠️  Caution! Several areas need attention before production.');
            console.log('   - Fix all failed checks before deploying');
            console.log('   - Implement proper monitoring and alerting');
            console.log('   - Set up backup and recovery procedures');
        } else {
            console.log('❌ Not Ready! Significant work needed before production.');
            console.log('   - Address all failed checks immediately');
            console.log('   - Implement comprehensive testing');
            console.log('   - Set up proper security measures');
        }

        console.log('');

        // Specific recommendations based on failed checks
        const failedChecks = this.results.filter(r => r.status === 'fail');
        if (failedChecks.length > 0) {
            console.log('🔥 Critical Issues to Address:');
            failedChecks.forEach(check => {
                console.log(`   - ${check.name}: ${check.message}`);
            });
            console.log('');
        }

        // High-priority warnings
        const warningChecks = this.results.filter(r => r.status === 'warning');
        const highPriorityWarnings = warningChecks.filter(check =>
            check.name.includes('Security') ||
            check.name.includes('Backup') ||
            check.name.includes('Monitoring')
        );

        if (highPriorityWarnings.length > 0) {
            console.log('⚠️  High Priority Warnings:');
            highPriorityWarnings.forEach(check => {
                console.log(`   - ${check.name}: ${check.message}`);
            });
            console.log('');
        }
    }

    private saveReport(score: number): void {
        const reportDir = path.join(process.cwd(), 'test-reports');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFile = path.join(reportDir, `production-readiness-${timestamp}.json`);

        const report = {
            timestamp: new Date().toISOString(),
            score,
            summary: {
                total: this.results.length,
                passed: this.results.filter(r => r.status === 'pass').length,
                warnings: this.results.filter(r => r.status === 'warning').length,
                failed: this.results.filter(r => r.status === 'fail').length,
            },
            results: this.results,
            isProductionReady: this.results.filter(r => r.status === 'fail').length === 0 && score >= 80,
        };

        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        console.log(`📄 Report saved to: ${reportFile}`);
        console.log('');
    }
}

// Run the validation if this script is executed directly
if (require.main === module) {
    const validator = new ProductionReadinessValidator();
    validator.runAllChecks().catch(error => {
        console.error('❌ Production readiness validation failed:', error);
        process.exit(1);
    });
}

export { ProductionReadinessValidator };