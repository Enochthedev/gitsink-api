#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface SecurityCheck {
    name: string;
    status: 'pass' | 'fail' | 'warning';
    message: string;
    details?: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
}

class SecurityAuditor {
    private results: SecurityCheck[] = [];

    async runComprehensiveAudit(): Promise<void> {
        console.log('🔒 Comprehensive Security Audit\n');

        await this.checkDependencyVulnerabilities();
        await this.checkCodeSecurity();
        await this.checkConfigurationSecurity();
        await this.checkAuthenticationSecurity();
        await this.checkDataProtection();
        await this.checkInfrastructureSecurity();
        await this.checkComplianceSecurity();

        this.generateSecurityReport();
    }

    private async checkDependencyVulnerabilities(): Promise<void> {
        console.log('📦 Checking Dependency Vulnerabilities...');

        try {
            // Run npm audit
            const auditOutput = execSync('npm audit --json', { encoding: 'utf8' });
            const auditData = JSON.parse(auditOutput);

            if (auditData.vulnerabilities && Object.keys(auditData.vulnerabilities).length > 0) {
                const criticalVulns = Object.values(auditData.vulnerabilities).filter(
                    (vuln: any) => vuln.severity === 'critical'
                ).length;
                const highVulns = Object.values(auditData.vulnerabilities).filter(
                    (vuln: any) => vuln.severity === 'high'
                ).length;

                if (criticalVulns > 0) {
                    this.results.push({
                        name: 'Critical Vulnerabilities',
                        status: 'fail',
                        message: `Found ${criticalVulns} critical vulnerabilities`,
                        severity: 'critical',
                        details: [`Run 'npm audit fix' to resolve`],
                    });
                }

                if (highVulns > 0) {
                    this.results.push({
                        name: 'High Severity Vulnerabilities',
                        status: 'warning',
                        message: `Found ${highVulns} high severity vulnerabilities`,
                        severity: 'high',
                        details: [`Run 'npm audit fix' to resolve`],
                    });
                }
            } else {
                this.results.push({
                    name: 'Dependency Vulnerabilities',
                    status: 'pass',
                    message: 'No known vulnerabilities found',
                    severity: 'low',
                });
            }
        } catch (error) {
            this.results.push({
                name: 'Dependency Audit',
                status: 'warning',
                message: 'Could not run dependency audit',
                severity: 'medium',
                details: [error instanceof Error ? error.message : String(error)],
            });
        }
    }

    private async checkCodeSecurity(): Promise<void> {
        console.log('🔍 Checking Code Security...');

        // Check for hardcoded secrets
        const secretPatterns = [
            { pattern: /password\s*=\s*["'][^"']+["']/gi, name: 'Hardcoded passwords' },
            { pattern: /api[_-]?key\s*=\s*["'][^"']+["']/gi, name: 'Hardcoded API keys' },
            { pattern: /secret\s*=\s*["'][^"']+["']/gi, name: 'Hardcoded secrets' },
            { pattern: /token\s*=\s*["'][^"']+["']/gi, name: 'Hardcoded tokens' },
            { pattern: /jwt[_-]?secret\s*=\s*["'][^"']+["']/gi, name: 'Hardcoded JWT secrets' },
        ];

        const sourceFiles = this.findSourceFiles();
        const secretFindings: string[] = [];

        sourceFiles.forEach(file => {
            const content = fs.readFileSync(file, 'utf8');
            secretPatterns.forEach(({ pattern, name }) => {
                const matches = content.match(pattern);
                if (matches) {
                    secretFindings.push(`${name} in ${file}`);
                }
            });
        });

        if (secretFindings.length === 0) {
            this.results.push({
                name: 'Hardcoded Secrets',
                status: 'pass',
                message: 'No hardcoded secrets found',
                severity: 'low',
            });
        } else {
            this.results.push({
                name: 'Hardcoded Secrets',
                status: 'fail',
                message: `Found ${secretFindings.length} potential hardcoded secrets`,
                severity: 'critical',
                details: secretFindings,
            });
        }

        // Check for SQL injection vulnerabilities
        const sqlInjectionPatterns = [
            /query\s*\+\s*['"]/gi,
            /\$\{.*\}\s*INTO\s+/gi,
            /WHERE\s+.*\+.*['"]/gi,
        ];

        const sqlFindings: string[] = [];
        sourceFiles.forEach(file => {
            const content = fs.readFileSync(file, 'utf8');
            sqlInjectionPatterns.forEach(pattern => {
                if (pattern.test(content)) {
                    sqlFindings.push(`Potential SQL injection in ${file}`);
                }
            });
        });

        if (sqlFindings.length === 0) {
            this.results.push({
                name: 'SQL Injection Protection',
                status: 'pass',
                message: 'No obvious SQL injection vulnerabilities found',
                severity: 'low',
            });
        } else {
            this.results.push({
                name: 'SQL Injection Protection',
                status: 'warning',
                message: `Found ${sqlFindings.length} potential SQL injection vulnerabilities`,
                severity: 'high',
                details: sqlFindings,
            });
        }
    }

    private async checkConfigurationSecurity(): Promise<void> {
        console.log('⚙️ Checking Configuration Security...');

        // Check environment files for security
        const envFiles = ['.env', '.env.example', '.env.production', '.env.staging'];
        const envIssues: string[] = [];

        envFiles.forEach(file => {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');

                // Check for weak default values
                if (content.includes('password=password') || content.includes('secret=secret')) {
                    envIssues.push(`Weak default values in ${file}`);
                }

                // Check for production secrets in example files
                if (file.includes('example') && /[A-Za-z0-9]{32,}/.test(content)) {
                    envIssues.push(`Potential real secrets in ${file}`);
                }
            }
        });

        if (envIssues.length === 0) {
            this.results.push({
                name: 'Environment Configuration',
                status: 'pass',
                message: 'Environment configuration appears secure',
                severity: 'low',
            });
        } else {
            this.results.push({
                name: 'Environment Configuration',
                status: 'warning',
                message: 'Environment configuration issues found',
                severity: 'medium',
                details: envIssues,
            });
        }

        // Check Docker security
        if (fs.existsSync('Dockerfile')) {
            const dockerContent = fs.readFileSync('Dockerfile', 'utf8');
            const dockerIssues: string[] = [];

            if (!dockerContent.includes('USER ')) {
                dockerIssues.push('Container runs as root user');
            }

            if (dockerContent.includes('ADD ') && !dockerContent.includes('COPY ')) {
                dockerIssues.push('Using ADD instead of COPY (security risk)');
            }

            if (!dockerContent.includes('HEALTHCHECK')) {
                dockerIssues.push('No health check configured');
            }

            if (dockerIssues.length === 0) {
                this.results.push({
                    name: 'Docker Security',
                    status: 'pass',
                    message: 'Docker configuration follows security best practices',
                    severity: 'low',
                });
            } else {
                this.results.push({
                    name: 'Docker Security',
                    status: 'warning',
                    message: 'Docker security improvements needed',
                    severity: 'medium',
                    details: dockerIssues,
                });
            }
        }
    }

    private async checkAuthenticationSecurity(): Promise<void> {
        console.log('🔐 Checking Authentication Security...');

        const authFiles = this.findSourceFiles().filter(file =>
            file.includes('auth') || file.includes('jwt') || file.includes('password')
        );

        const authIssues: string[] = [];

        authFiles.forEach(file => {
            const content = fs.readFileSync(file, 'utf8');

            // Check for weak password hashing
            if (content.includes('md5') || content.includes('sha1')) {
                authIssues.push(`Weak hashing algorithm in ${file}`);
            }

            // Check for JWT without expiration
            if (content.includes('jwt.sign') && !content.includes('expiresIn')) {
                authIssues.push(`JWT without expiration in ${file}`);
            }

            // Check for missing rate limiting
            if (content.includes('/login') && !content.includes('throttle')) {
                authIssues.push(`Login endpoint without rate limiting in ${file}`);
            }
        });

        // Check for bcrypt usage (good)
        const hasBcrypt = authFiles.some(file => {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes('bcrypt');
        });

        if (hasBcrypt) {
            this.results.push({
                name: 'Password Hashing',
                status: 'pass',
                message: 'Using bcrypt for password hashing',
                severity: 'low',
            });
        } else {
            authIssues.push('No bcrypt password hashing found');
        }

        if (authIssues.length === 0) {
            this.results.push({
                name: 'Authentication Security',
                status: 'pass',
                message: 'Authentication implementation appears secure',
                severity: 'low',
            });
        } else {
            this.results.push({
                name: 'Authentication Security',
                status: 'warning',
                message: 'Authentication security improvements needed',
                severity: 'high',
                details: authIssues,
            });
        }
    }

    private async checkDataProtection(): Promise<void> {
        console.log('🛡️ Checking Data Protection...');

        const dataIssues: string[] = [];

        // Check for encryption usage
        const encryptionFiles = this.findSourceFiles().filter(file => {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes('encrypt') || content.includes('crypto');
        });

        if (encryptionFiles.length > 0) {
            this.results.push({
                name: 'Data Encryption',
                status: 'pass',
                message: `Found encryption implementation in ${encryptionFiles.length} files`,
                severity: 'low',
            });
        } else {
            dataIssues.push('No encryption implementation found');
        }

        // Check for input validation
        const validationFiles = this.findSourceFiles().filter(file => {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes('validate') || content.includes('sanitize') || content.includes('class-validator');
        });

        if (validationFiles.length > 0) {
            this.results.push({
                name: 'Input Validation',
                status: 'pass',
                message: `Found input validation in ${validationFiles.length} files`,
                severity: 'low',
            });
        } else {
            dataIssues.push('No input validation implementation found');
        }

        // Check for CORS configuration
        const corsFiles = this.findSourceFiles().filter(file => {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes('cors') || content.includes('origin');
        });

        if (corsFiles.length > 0) {
            this.results.push({
                name: 'CORS Configuration',
                status: 'pass',
                message: 'CORS configuration found',
                severity: 'low',
            });
        } else {
            dataIssues.push('No CORS configuration found');
        }

        if (dataIssues.length > 0) {
            this.results.push({
                name: 'Data Protection Issues',
                status: 'warning',
                message: 'Data protection improvements needed',
                severity: 'medium',
                details: dataIssues,
            });
        }
    }

    private async checkInfrastructureSecurity(): Promise<void> {
        console.log('🏗️ Checking Infrastructure Security...');

        const infraIssues: string[] = [];

        // Check for HTTPS configuration
        const httpsConfigured = this.checkForHttpsConfig();
        if (httpsConfigured) {
            this.results.push({
                name: 'HTTPS Configuration',
                status: 'pass',
                message: 'HTTPS configuration found',
                severity: 'low',
            });
        } else {
            infraIssues.push('No HTTPS configuration found');
        }

        // Check for security headers
        const securityHeaders = this.checkForSecurityHeaders();
        if (securityHeaders) {
            this.results.push({
                name: 'Security Headers',
                status: 'pass',
                message: 'Security headers implementation found',
                severity: 'low',
            });
        } else {
            infraIssues.push('No security headers implementation found');
        }

        // Check for rate limiting
        const rateLimiting = this.checkForRateLimiting();
        if (rateLimiting) {
            this.results.push({
                name: 'Rate Limiting',
                status: 'pass',
                message: 'Rate limiting implementation found',
                severity: 'low',
            });
        } else {
            infraIssues.push('No rate limiting implementation found');
        }

        if (infraIssues.length > 0) {
            this.results.push({
                name: 'Infrastructure Security Issues',
                status: 'warning',
                message: 'Infrastructure security improvements needed',
                severity: 'high',
                details: infraIssues,
            });
        }
    }

    private async checkComplianceSecurity(): Promise<void> {
        console.log('📋 Checking Compliance Security...');

        const complianceIssues: string[] = [];

        // Check for audit logging
        const auditFiles = this.findSourceFiles().filter(file =>
            file.includes('audit') || file.includes('log')
        );

        if (auditFiles.length > 0) {
            this.results.push({
                name: 'Audit Logging',
                status: 'pass',
                message: `Found audit logging in ${auditFiles.length} files`,
                severity: 'low',
            });
        } else {
            complianceIssues.push('No audit logging implementation found');
        }

        // Check for privacy controls
        const privacyFiles = this.findSourceFiles().filter(file => {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes('privacy') || content.includes('gdpr') || content.includes('consent');
        });

        if (privacyFiles.length > 0) {
            this.results.push({
                name: 'Privacy Controls',
                status: 'pass',
                message: 'Privacy controls implementation found',
                severity: 'low',
            });
        } else {
            complianceIssues.push('No privacy controls implementation found');
        }

        if (complianceIssues.length > 0) {
            this.results.push({
                name: 'Compliance Issues',
                status: 'warning',
                message: 'Compliance improvements needed',
                severity: 'medium',
                details: complianceIssues,
            });
        }
    }

    private findSourceFiles(): string[] {
        const files: string[] = [];

        const scanDirectory = (dir: string) => {
            if (!fs.existsSync(dir)) return;

            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
                    scanDirectory(fullPath);
                } else if (item.endsWith('.ts') || item.endsWith('.js')) {
                    files.push(fullPath);
                }
            });
        };

        scanDirectory('src');
        return files;
    }

    private checkForHttpsConfig(): boolean {
        const configFiles = ['docker/caddy/Caddyfile.prod', 'docker-compose.prod.yml'];
        return configFiles.some(file => {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');
                return content.includes('https') || content.includes('tls') || content.includes('ssl');
            }
            return false;
        });
    }

    private checkForSecurityHeaders(): boolean {
        const sourceFiles = this.findSourceFiles();
        return sourceFiles.some(file => {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes('helmet') || content.includes('x-frame-options') || content.includes('csp');
        });
    }

    private checkForRateLimiting(): boolean {
        const sourceFiles = this.findSourceFiles();
        return sourceFiles.some(file => {
            const content = fs.readFileSync(file, 'utf8');
            return content.includes('throttle') || content.includes('rate-limit') || content.includes('express-rate-limit');
        });
    }

    private generateSecurityReport(): void {
        console.log('\n🔒 Security Audit Report');
        console.log('='.repeat(50));

        const criticalIssues = this.results.filter(r => r.severity === 'critical').length;
        const highIssues = this.results.filter(r => r.severity === 'high').length;
        const mediumIssues = this.results.filter(r => r.severity === 'medium').length;
        const lowIssues = this.results.filter(r => r.severity === 'low').length;

        console.log(`Total Checks: ${this.results.length}`);
        console.log(`🔴 Critical: ${criticalIssues}`);
        console.log(`🟠 High: ${highIssues}`);
        console.log(`🟡 Medium: ${mediumIssues}`);
        console.log(`🟢 Low: ${lowIssues}`);
        console.log('');

        // Calculate security score
        const failedChecks = this.results.filter(r => r.status === 'fail').length;
        const warningChecks = this.results.filter(r => r.status === 'warning').length;
        const passedChecks = this.results.filter(r => r.status === 'pass').length;

        const score = Math.round(((passedChecks + warningChecks * 0.5) / this.results.length) * 100);
        console.log(`🎯 Security Score: ${score}%`);
        console.log('');

        // Detailed results
        console.log('📋 Detailed Results:');
        console.log('-'.repeat(50));

        this.results.forEach(result => {
            const icon = result.status === 'pass' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
            const severityIcon = {
                critical: '🔴',
                high: '🟠',
                medium: '🟡',
                low: '🟢',
            }[result.severity];

            console.log(`${icon} ${severityIcon} ${result.name}: ${result.message}`);

            if (result.details && result.details.length > 0) {
                result.details.forEach(detail => {
                    console.log(`   - ${detail}`);
                });
            }
        });

        console.log('');

        // Security recommendations
        this.generateSecurityRecommendations(score, criticalIssues, highIssues);

        // Save report
        this.saveSecurityReport(score);

        // Exit with appropriate code
        const isSecure = criticalIssues === 0 && highIssues === 0;
        process.exit(isSecure ? 0 : 1);
    }

    private generateSecurityRecommendations(score: number, criticalIssues: number, highIssues: number): void {
        console.log('💡 Security Recommendations:');
        console.log('-'.repeat(30));

        if (criticalIssues > 0) {
            console.log('🚨 CRITICAL: Address critical security issues immediately!');
            console.log('   - Do not deploy to production until resolved');
            console.log('   - Review all hardcoded secrets and credentials');
            console.log('   - Implement proper secret management');
        } else if (highIssues > 0) {
            console.log('⚠️  HIGH: Address high-priority security issues');
            console.log('   - Review authentication and authorization');
            console.log('   - Implement missing security controls');
            console.log('   - Consider security code review');
        } else if (score < 80) {
            console.log('📋 MEDIUM: Improve overall security posture');
            console.log('   - Implement comprehensive input validation');
            console.log('   - Add security headers and HTTPS');
            console.log('   - Set up proper monitoring and alerting');
        } else {
            console.log('✅ GOOD: Security posture is acceptable');
            console.log('   - Continue regular security audits');
            console.log('   - Keep dependencies updated');
            console.log('   - Monitor for new vulnerabilities');
        }

        console.log('');
        console.log('🔧 General Security Best Practices:');
        console.log('   - Regular dependency updates');
        console.log('   - Automated security testing in CI/CD');
        console.log('   - Security training for development team');
        console.log('   - Incident response plan');
        console.log('   - Regular penetration testing');
        console.log('');
    }

    private saveSecurityReport(score: number): void {
        const reportDir = path.join(process.cwd(), 'test-reports');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFile = path.join(reportDir, `security-audit-${timestamp}.json`);

        const report = {
            timestamp: new Date().toISOString(),
            score,
            summary: {
                total: this.results.length,
                critical: this.results.filter(r => r.severity === 'critical').length,
                high: this.results.filter(r => r.severity === 'high').length,
                medium: this.results.filter(r => r.severity === 'medium').length,
                low: this.results.filter(r => r.severity === 'low').length,
                passed: this.results.filter(r => r.status === 'pass').length,
                warnings: this.results.filter(r => r.status === 'warning').length,
                failed: this.results.filter(r => r.status === 'fail').length,
            },
            results: this.results,
            isSecure: this.results.filter(r => r.severity === 'critical' || r.severity === 'high').length === 0,
        };

        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        console.log(`📄 Security report saved to: ${reportFile}`);
        console.log('');
    }
}

// Run the audit if this script is executed directly
if (require.main === module) {
    const auditor = new SecurityAuditor();
    auditor.runComprehensiveAudit().catch(error => {
        console.error('❌ Security audit failed:', error);
        process.exit(1);
    });
}

export { SecurityAuditor };