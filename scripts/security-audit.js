#!/usr/bin/env node

/**
 * Security Audit Script
 * Performs comprehensive security audits and vulnerability assessments
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityAuditor {
    constructor() {
        this.auditResults = {
            timestamp: new Date().toISOString(),
            summary: {
                totalChecks: 0,
                passed: 0,
                failed: 0,
                warnings: 0,
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            },
            vulnerabilities: [],
            recommendations: [],
            compliance: {}
        };
    }

    async runFullAudit() {
        console.log('🔒 Starting comprehensive security audit...');

        try {
            await this.auditDependencies();
            await this.auditConfiguration();
            await this.auditCodeSecurity();
            await this.auditInfrastructure();
            await this.auditAuthentication();
            await this.auditDataProtection();
            await this.auditNetworkSecurity();
            await this.auditLogging();
            await this.generateReport();

            console.log('✅ Security audit completed successfully!');
            console.log(`📊 Results: ${this.auditResults.summary.passed} passed, ${this.auditResults.summary.failed} failed, ${this.auditResults.summary.warnings} warnings`);

            return this.auditResults;
        } catch (error) {
            console.error('❌ Security audit failed:', error.message);
            throw error;
        }
    }

    async auditDependencies() {
        console.log('📦 Auditing dependencies...');

        try {
            // Run npm audit
            const auditOutput = execSync('npm audit --json', { encoding: 'utf8' });
            const auditData = JSON.parse(auditOutput);

            if (auditData.vulnerabilities) {
                Object.entries(auditData.vulnerabilities).forEach(([pkg, vuln]) => {
                    this.addVulnerability({
                        type: 'dependency',
                        package: pkg,
                        severity: vuln.severity,
                        title: vuln.title,
                        description: vuln.via?.[0]?.title || 'Dependency vulnerability',
                        recommendation: `Update ${pkg} to a secure version`
                    });
                });
            }

            // Check for outdated packages
            try {
                const outdatedOutput = execSync('npm outdated --json', { encoding: 'utf8' });
                const outdatedData = JSON.parse(outdatedOutput);

                Object.entries(outdatedData).forEach(([pkg, info]) => {
                    if (this.isSecurityCriticalPackage(pkg)) {
                        this.addVulnerability({
                            type: 'outdated-dependency',
                            package: pkg,
                            severity: 'medium',
                            title: `Outdated security-critical package: ${pkg}`,
                            description: `${pkg} is outdated (current: ${info.current}, latest: ${info.latest})`,
                            recommendation: `Update ${pkg} to the latest version`
                        });
                    }
                });
            } catch (error) {
                // npm outdated returns non-zero exit code when packages are outdated
                if (error.stdout) {
                    const outdatedData = JSON.parse(error.stdout);
                    Object.entries(outdatedData).forEach(([pkg, info]) => {
                        if (this.isSecurityCriticalPackage(pkg)) {
                            this.addVulnerability({
                                type: 'outdated-dependency',
                                package: pkg,
                                severity: 'medium',
                                title: `Outdated security-critical package: ${pkg}`,
                                description: `${pkg} is outdated (current: ${info.current}, latest: ${info.latest})`,
                                recommendation: `Update ${pkg} to the latest version`
                            });
                        }
                    });
                }
            }

            this.addCheck('Dependencies audit', 'passed');
        } catch (error) {
            this.addCheck('Dependencies audit', 'failed', error.message);
        }
    }

    async auditConfiguration() {
        console.log('⚙️ Auditing configuration...');

        // Check environment variables
        const requiredEnvVars = [
            'JWT_SECRET',
            'TOKEN_ENCRYPTION_KEY',
            'DATABASE_URL',
            'SESSION_SECRET'
        ];

        requiredEnvVars.forEach(envVar => {
            const value = process.env[envVar];
            if (!value) {
                this.addVulnerability({
                    type: 'configuration',
                    severity: 'high',
                    title: `Missing environment variable: ${envVar}`,
                    description: `Required environment variable ${envVar} is not set`,
                    recommendation: `Set ${envVar} environment variable with a secure value`
                });
            } else if (this.isWeakSecret(value)) {
                this.addVulnerability({
                    type: 'configuration',
                    severity: 'high',
                    title: `Weak secret in ${envVar}`,
                    description: `${envVar} appears to use a weak or default value`,
                    recommendation: `Use a strong, randomly generated secret for ${envVar}`
                });
            }
        });

        // Check package.json for security configurations
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

        if (!packageJson.scripts?.['security:audit']) {
            this.addVulnerability({
                type: 'configuration',
                severity: 'low',
                title: 'Missing security audit script',
                description: 'No security audit script defined in package.json',
                recommendation: 'Add security audit script to package.json'
            });
        }

        // Check for security-related dependencies
        const securityDeps = ['helmet', 'express-rate-limit', 'bcrypt', 'jsonwebtoken'];
        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        securityDeps.forEach(dep => {
            if (!allDeps[dep] && !this.hasAlternative(dep, allDeps)) {
                this.addVulnerability({
                    type: 'configuration',
                    severity: 'medium',
                    title: `Missing security dependency: ${dep}`,
                    description: `Security-related package ${dep} is not installed`,
                    recommendation: `Consider installing ${dep} for enhanced security`
                });
            }
        });

        this.addCheck('Configuration audit', 'passed');
    }

    async auditCodeSecurity() {
        console.log('💻 Auditing code security...');

        // Check for common security anti-patterns
        const securityPatterns = [
            {
                pattern: /password\s*=\s*['"]\w+['"]/gi,
                severity: 'critical',
                title: 'Hardcoded password',
                description: 'Password appears to be hardcoded in source code'
            },
            {
                pattern: /api[_-]?key\s*=\s*['"]\w+['"]/gi,
                severity: 'critical',
                title: 'Hardcoded API key',
                description: 'API key appears to be hardcoded in source code'
            },
            {
                pattern: /secret\s*=\s*['"]\w+['"]/gi,
                severity: 'high',
                title: 'Hardcoded secret',
                description: 'Secret appears to be hardcoded in source code'
            },
            {
                pattern: /eval\s*\(/gi,
                severity: 'high',
                title: 'Use of eval()',
                description: 'eval() function can execute arbitrary code and is dangerous'
            },
            {
                pattern: /innerHTML\s*=/gi,
                severity: 'medium',
                title: 'Use of innerHTML',
                description: 'innerHTML can lead to XSS vulnerabilities'
            },
            {
                pattern: /document\.write\s*\(/gi,
                severity: 'medium',
                title: 'Use of document.write',
                description: 'document.write can lead to XSS vulnerabilities'
            }
        ];

        const sourceFiles = this.getSourceFiles();

        sourceFiles.forEach(filePath => {
            const content = fs.readFileSync(filePath, 'utf8');

            securityPatterns.forEach(pattern => {
                const matches = content.match(pattern.pattern);
                if (matches) {
                    matches.forEach(match => {
                        this.addVulnerability({
                            type: 'code-security',
                            severity: pattern.severity,
                            title: pattern.title,
                            description: `${pattern.description} in ${filePath}`,
                            recommendation: `Remove or secure the ${pattern.title.toLowerCase()} in ${filePath}`,
                            file: filePath,
                            code: match
                        });
                    });
                }
            });
        });

        this.addCheck('Code security audit', 'passed');
    }

    async auditInfrastructure() {
        console.log('🏗️ Auditing infrastructure...');

        // Check Docker configuration if present
        if (fs.existsSync('Dockerfile')) {
            const dockerfile = fs.readFileSync('Dockerfile', 'utf8');

            if (dockerfile.includes('FROM node:latest')) {
                this.addVulnerability({
                    type: 'infrastructure',
                    severity: 'medium',
                    title: 'Using latest tag in Dockerfile',
                    description: 'Using latest tag can lead to unpredictable builds',
                    recommendation: 'Use specific version tags instead of latest'
                });
            }

            if (dockerfile.includes('USER root') || !dockerfile.includes('USER ')) {
                this.addVulnerability({
                    type: 'infrastructure',
                    severity: 'high',
                    title: 'Running as root in Docker',
                    description: 'Container runs as root user, which is a security risk',
                    recommendation: 'Create and use a non-root user in Dockerfile'
                });
            }
        }

        // Check for .env files in version control
        if (fs.existsSync('.env')) {
            try {
                execSync('git ls-files .env', { stdio: 'pipe' });
                this.addVulnerability({
                    type: 'infrastructure',
                    severity: 'critical',
                    title: '.env file in version control',
                    description: '.env file is tracked in git, potentially exposing secrets',
                    recommendation: 'Remove .env from git and add to .gitignore'
                });
            } catch (error) {
                // .env is not in git, which is good
            }
        }

        // Check .gitignore for security-sensitive files
        if (fs.existsSync('.gitignore')) {
            const gitignore = fs.readFileSync('.gitignore', 'utf8');
            const sensitivePatterns = ['.env', '*.key', '*.pem', 'secrets/', 'config/local.*'];

            sensitivePatterns.forEach(pattern => {
                if (!gitignore.includes(pattern)) {
                    this.addVulnerability({
                        type: 'infrastructure',
                        severity: 'medium',
                        title: `Missing ${pattern} in .gitignore`,
                        description: `Sensitive files matching ${pattern} might be committed to git`,
                        recommendation: `Add ${pattern} to .gitignore`
                    });
                }
            });
        }

        this.addCheck('Infrastructure audit', 'passed');
    }

    async auditAuthentication() {
        console.log('🔐 Auditing authentication...');

        // Check for authentication-related files
        const authFiles = this.findFiles(['auth', 'login', 'signin', 'jwt', 'token']);

        authFiles.forEach(filePath => {
            const content = fs.readFileSync(filePath, 'utf8');

            // Check for weak JWT configurations
            if (content.includes('jwt') || content.includes('jsonwebtoken')) {
                if (content.includes('algorithm: "none"') || content.includes("algorithm: 'none'")) {
                    this.addVulnerability({
                        type: 'authentication',
                        severity: 'critical',
                        title: 'JWT with no algorithm',
                        description: 'JWT configured with "none" algorithm is insecure',
                        recommendation: 'Use a secure algorithm like HS256 or RS256',
                        file: filePath
                    });
                }

                if (!content.includes('expiresIn') && !content.includes('exp:')) {
                    this.addVulnerability({
                        type: 'authentication',
                        severity: 'high',
                        title: 'JWT without expiration',
                        description: 'JWT tokens should have expiration time',
                        recommendation: 'Set expiresIn option for JWT tokens',
                        file: filePath
                    });
                }
            }

            // Check for password hashing
            if (content.includes('password') && !content.includes('bcrypt') && !content.includes('scrypt') && !content.includes('argon2')) {
                if (content.includes('md5') || content.includes('sha1') || content.includes('sha256')) {
                    this.addVulnerability({
                        type: 'authentication',
                        severity: 'high',
                        title: 'Weak password hashing',
                        description: 'Using weak hashing algorithm for passwords',
                        recommendation: 'Use bcrypt, scrypt, or argon2 for password hashing',
                        file: filePath
                    });
                }
            }
        });

        this.addCheck('Authentication audit', 'passed');
    }

    async auditDataProtection() {
        console.log('🛡️ Auditing data protection...');

        // Check for data validation
        const modelFiles = this.findFiles(['model', 'schema', 'entity']);

        modelFiles.forEach(filePath => {
            const content = fs.readFileSync(filePath, 'utf8');

            // Check for input validation
            if (content.includes('email') && !content.includes('validate') && !content.includes('isEmail')) {
                this.addVulnerability({
                    type: 'data-protection',
                    severity: 'medium',
                    title: 'Missing email validation',
                    description: 'Email field without proper validation',
                    recommendation: 'Add email validation to prevent invalid data',
                    file: filePath
                });
            }

            // Check for SQL injection protection
            if (content.includes('query') || content.includes('sql')) {
                if (content.includes('${') || content.includes('`${')) {
                    this.addVulnerability({
                        type: 'data-protection',
                        severity: 'high',
                        title: 'Potential SQL injection',
                        description: 'String interpolation in SQL queries can lead to injection',
                        recommendation: 'Use parameterized queries or ORM methods',
                        file: filePath
                    });
                }
            }
        });

        // Check for sensitive data logging
        const logFiles = this.findFiles(['log', 'logger']);

        logFiles.forEach(filePath => {
            const content = fs.readFileSync(filePath, 'utf8');

            if (content.includes('password') || content.includes('token') || content.includes('secret')) {
                this.addVulnerability({
                    type: 'data-protection',
                    severity: 'medium',
                    title: 'Potential sensitive data logging',
                    description: 'Logging configuration might expose sensitive data',
                    recommendation: 'Ensure sensitive data is not logged',
                    file: filePath
                });
            }
        });

        this.addCheck('Data protection audit', 'passed');
    }

    async auditNetworkSecurity() {
        console.log('🌐 Auditing network security...');

        // Check for HTTPS enforcement
        const serverFiles = this.findFiles(['server', 'app', 'main']);

        serverFiles.forEach(filePath => {
            const content = fs.readFileSync(filePath, 'utf8');

            if (content.includes('http.createServer') && !content.includes('https.createServer')) {
                this.addVulnerability({
                    type: 'network-security',
                    severity: 'high',
                    title: 'HTTP server without HTTPS',
                    description: 'Server configured to use HTTP instead of HTTPS',
                    recommendation: 'Configure HTTPS for secure communication',
                    file: filePath
                });
            }

            // Check for CORS configuration
            if (content.includes('cors') || content.includes('Access-Control-Allow-Origin')) {
                if (content.includes('*')) {
                    this.addVulnerability({
                        type: 'network-security',
                        severity: 'medium',
                        title: 'Permissive CORS configuration',
                        description: 'CORS configured to allow all origins',
                        recommendation: 'Restrict CORS to specific trusted origins',
                        file: filePath
                    });
                }
            }
        });

        this.addCheck('Network security audit', 'passed');
    }

    async auditLogging() {
        console.log('📝 Auditing logging and monitoring...');

        // Check for security event logging
        const hasSecurityLogging = this.findFiles(['audit', 'security', 'log']).length > 0;

        if (!hasSecurityLogging) {
            this.addVulnerability({
                type: 'logging',
                severity: 'medium',
                title: 'Missing security event logging',
                description: 'No security event logging implementation found',
                recommendation: 'Implement security event logging for audit trails'
            });
        }

        // Check for error handling that might expose information
        const errorFiles = this.findFiles(['error', 'exception', 'handler']);

        errorFiles.forEach(filePath => {
            const content = fs.readFileSync(filePath, 'utf8');

            if (content.includes('stack') && content.includes('response')) {
                this.addVulnerability({
                    type: 'logging',
                    severity: 'medium',
                    title: 'Potential information disclosure in errors',
                    description: 'Error handling might expose stack traces to users',
                    recommendation: 'Sanitize error responses in production',
                    file: filePath
                });
            }
        });

        this.addCheck('Logging audit', 'passed');
    }

    async generateReport() {
        console.log('📊 Generating security audit report...');

        // Calculate compliance scores
        this.auditResults.compliance = {
            owasp: this.calculateOWASPCompliance(),
            gdpr: this.calculateGDPRCompliance(),
            security: this.calculateSecurityScore()
        };

        // Generate recommendations
        this.generateRecommendations();

        // Save report
        const reportPath = path.join(process.cwd(), 'security-audit-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(this.auditResults, null, 2));

        // Generate HTML report
        await this.generateHTMLReport();

        console.log(`📄 Security audit report saved to: ${reportPath}`);
    }

    async generateHTMLReport() {
        const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Audit Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 2.5em; }
        .header p { margin: 10px 0 0 0; opacity: 0.9; }
        .content { padding: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; }
        .metric-card.critical { border-left: 4px solid #dc3545; }
        .metric-card.high { border-left: 4px solid #fd7e14; }
        .metric-card.medium { border-left: 4px solid #ffc107; }
        .metric-card.low { border-left: 4px solid #28a745; }
        .metric-value { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
        .metric-label { color: #6c757d; font-size: 0.9em; }
        .vulnerability { background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 15px; border-left: 4px solid #dc3545; }
        .vulnerability.high { border-left-color: #fd7e14; }
        .vulnerability.medium { border-left-color: #ffc107; }
        .vulnerability.low { border-left-color: #28a745; }
        .vulnerability h3 { margin: 0 0 10px 0; color: #dc3545; }
        .vulnerability.high h3 { color: #fd7e14; }
        .vulnerability.medium h3 { color: #e67e22; }
        .vulnerability.low h3 { color: #28a745; }
        .compliance { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0; }
        .compliance-card { background: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; }
        .compliance-score { font-size: 3em; font-weight: bold; margin-bottom: 10px; }
        .compliance-score.good { color: #28a745; }
        .compliance-score.fair { color: #ffc107; }
        .compliance-score.poor { color: #dc3545; }
        .recommendations { background: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 8px; padding: 20px; margin: 30px 0; }
        .recommendations h2 { margin-top: 0; color: #0066cc; }
        .recommendations ul { margin: 0; padding-left: 20px; }
        .recommendations li { margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Security Audit Report</h1>
            <p>Generated on ${new Date(this.auditResults.timestamp).toLocaleString()}</p>
        </div>
        
        <div class="content">
            <div class="summary">
                <div class="metric-card critical">
                    <div class="metric-value">${this.auditResults.summary.critical}</div>
                    <div class="metric-label">Critical Issues</div>
                </div>
                <div class="metric-card high">
                    <div class="metric-value">${this.auditResults.summary.high}</div>
                    <div class="metric-label">High Severity</div>
                </div>
                <div class="metric-card medium">
                    <div class="metric-value">${this.auditResults.summary.medium}</div>
                    <div class="metric-label">Medium Severity</div>
                </div>
                <div class="metric-card low">
                    <div class="metric-value">${this.auditResults.summary.low}</div>
                    <div class="metric-label">Low Severity</div>
                </div>
            </div>
            
            <div class="compliance">
                <div class="compliance-card">
                    <div class="compliance-score ${this.getScoreClass(this.auditResults.compliance.security)}">${this.auditResults.compliance.security}%</div>
                    <div>Security Score</div>
                </div>
                <div class="compliance-card">
                    <div class="compliance-score ${this.getScoreClass(this.auditResults.compliance.owasp)}">${this.auditResults.compliance.owasp}%</div>
                    <div>OWASP Compliance</div>
                </div>
                <div class="compliance-card">
                    <div class="compliance-score ${this.getScoreClass(this.auditResults.compliance.gdpr)}">${this.auditResults.compliance.gdpr}%</div>
                    <div>GDPR Compliance</div>
                </div>
            </div>
            
            <h2>🚨 Vulnerabilities</h2>
            ${this.auditResults.vulnerabilities.map(vuln => `
                <div class="vulnerability ${vuln.severity}">
                    <h3>${vuln.title}</h3>
                    <p><strong>Severity:</strong> ${vuln.severity.toUpperCase()}</p>
                    <p><strong>Description:</strong> ${vuln.description}</p>
                    <p><strong>Recommendation:</strong> ${vuln.recommendation}</p>
                    ${vuln.file ? `<p><strong>File:</strong> ${vuln.file}</p>` : ''}
                </div>
            `).join('')}
            
            <div class="recommendations">
                <h2>💡 Recommendations</h2>
                <ul>
                    ${this.auditResults.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        </div>
    </div>
</body>
</html>
    `;

        const htmlPath = path.join(process.cwd(), 'security-audit-report.html');
        fs.writeFileSync(htmlPath, htmlTemplate);
        console.log(`🌐 HTML report saved to: ${htmlPath}`);
    }

    // Helper methods
    addVulnerability(vulnerability) {
        this.auditResults.vulnerabilities.push(vulnerability);
        this.auditResults.summary[vulnerability.severity]++;
        this.auditResults.summary.totalChecks++;
        this.auditResults.summary.failed++;
    }

    addCheck(name, status, message = '') {
        if (status === 'passed') {
            this.auditResults.summary.passed++;
        } else if (status === 'failed') {
            this.auditResults.summary.failed++;
        } else if (status === 'warning') {
            this.auditResults.summary.warnings++;
        }
        this.auditResults.summary.totalChecks++;
    }

    isWeakSecret(value) {
        const weakSecrets = ['secret', 'password', 'key', '123456', 'admin', 'test'];
        return weakSecrets.some(weak => value.toLowerCase().includes(weak)) || value.length < 16;
    }

    isSecurityCriticalPackage(packageName) {
        const criticalPackages = ['express', 'jsonwebtoken', 'bcrypt', 'helmet', 'cors', 'passport'];
        return criticalPackages.includes(packageName);
    }

    hasAlternative(packageName, dependencies) {
        const alternatives = {
            'helmet': ['express-security', 'lusca'],
            'express-rate-limit': ['rate-limiter-flexible'],
            'bcrypt': ['scrypt', 'argon2'],
            'jsonwebtoken': ['jose']
        };

        return alternatives[packageName]?.some(alt => dependencies[alt]) || false;
    }

    getSourceFiles() {
        const extensions = ['.js', '.ts', '.jsx', '.tsx'];
        const files = [];

        const scanDir = (dir) => {
            if (dir.includes('node_modules') || dir.includes('.git')) return;

            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    scanDir(fullPath);
                } else if (extensions.some(ext => item.endsWith(ext))) {
                    files.push(fullPath);
                }
            });
        };

        scanDir('./src');
        return files;
    }

    findFiles(keywords) {
        const files = this.getSourceFiles();
        return files.filter(file =>
            keywords.some(keyword =>
                file.toLowerCase().includes(keyword.toLowerCase())
            )
        );
    }

    calculateOWASPCompliance() {
        // Simplified OWASP Top 10 compliance calculation
        const owaspChecks = {
            'injection': this.auditResults.vulnerabilities.filter(v => v.type === 'code-security' && v.title.includes('injection')).length === 0,
            'authentication': this.auditResults.vulnerabilities.filter(v => v.type === 'authentication').length === 0,
            'data-exposure': this.auditResults.vulnerabilities.filter(v => v.type === 'data-protection').length === 0,
            'xxe': true, // Assume protected if using modern frameworks
            'access-control': this.auditResults.vulnerabilities.filter(v => v.title.includes('access')).length === 0,
            'security-config': this.auditResults.vulnerabilities.filter(v => v.type === 'configuration').length === 0,
            'xss': this.auditResults.vulnerabilities.filter(v => v.title.includes('XSS')).length === 0,
            'deserialization': true, // Assume protected
            'components': this.auditResults.vulnerabilities.filter(v => v.type === 'dependency').length === 0,
            'logging': this.auditResults.vulnerabilities.filter(v => v.type === 'logging').length === 0
        };

        const passedChecks = Object.values(owaspChecks).filter(Boolean).length;
        return Math.round((passedChecks / Object.keys(owaspChecks).length) * 100);
    }

    calculateGDPRCompliance() {
        // Simplified GDPR compliance calculation
        const gdprChecks = {
            'data-protection': this.auditResults.vulnerabilities.filter(v => v.type === 'data-protection').length === 0,
            'encryption': this.auditResults.vulnerabilities.filter(v => v.title.includes('encryption')).length === 0,
            'access-control': this.auditResults.vulnerabilities.filter(v => v.title.includes('access')).length === 0,
            'audit-logging': this.auditResults.vulnerabilities.filter(v => v.type === 'logging').length === 0,
            'secure-config': this.auditResults.vulnerabilities.filter(v => v.type === 'configuration').length === 0
        };

        const passedChecks = Object.values(gdprChecks).filter(Boolean).length;
        return Math.round((passedChecks / Object.keys(gdprChecks).length) * 100);
    }

    calculateSecurityScore() {
        const totalVulns = this.auditResults.vulnerabilities.length;
        const criticalWeight = 10;
        const highWeight = 5;
        const mediumWeight = 2;
        const lowWeight = 1;

        const weightedScore =
            (this.auditResults.summary.critical * criticalWeight) +
            (this.auditResults.summary.high * highWeight) +
            (this.auditResults.summary.medium * mediumWeight) +
            (this.auditResults.summary.low * lowWeight);

        const maxScore = 100;
        const score = Math.max(0, maxScore - weightedScore);

        return Math.round(score);
    }

    generateRecommendations() {
        const recommendations = [
            'Regularly update dependencies to patch known vulnerabilities',
            'Implement comprehensive input validation and sanitization',
            'Use strong, unique secrets for all cryptographic operations',
            'Enable HTTPS for all communications',
            'Implement proper authentication and authorization mechanisms',
            'Add security headers to all HTTP responses',
            'Implement rate limiting to prevent abuse',
            'Use parameterized queries to prevent SQL injection',
            'Implement proper error handling to prevent information disclosure',
            'Add comprehensive security testing to CI/CD pipeline',
            'Implement security event logging and monitoring',
            'Regular security audits and penetration testing',
            'Train development team on secure coding practices',
            'Implement data encryption for sensitive information',
            'Use Content Security Policy (CSP) to prevent XSS attacks'
        ];

        // Add specific recommendations based on found vulnerabilities
        const vulnTypes = [...new Set(this.auditResults.vulnerabilities.map(v => v.type))];

        vulnTypes.forEach(type => {
            switch (type) {
                case 'dependency':
                    recommendations.push('Set up automated dependency vulnerability scanning');
                    break;
                case 'configuration':
                    recommendations.push('Review and harden application configuration');
                    break;
                case 'authentication':
                    recommendations.push('Implement multi-factor authentication where possible');
                    break;
                case 'data-protection':
                    recommendations.push('Implement data classification and protection policies');
                    break;
            }
        });

        this.auditResults.recommendations = [...new Set(recommendations)];
    }

    getScoreClass(score) {
        if (score >= 80) return 'good';
        if (score >= 60) return 'fair';
        return 'poor';
    }
}

// CLI execution
if (require.main === module) {
    const auditor = new SecurityAuditor();
    auditor.runFullAudit().catch(error => {
        console.error('Security audit failed:', error);
        process.exit(1);
    });
}

module.exports = SecurityAuditor;