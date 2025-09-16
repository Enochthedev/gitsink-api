#!/usr/bin/env node

/**
 * Test Failure Analysis and Debugging Tools
 * Analyzes test failures, generates debugging information, and provides recommendations
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestFailureAnalyzer {
    constructor() {
        this.resultsDir = path.join(process.cwd(), 'test-results');
        this.reportsDir = path.join(process.cwd(), 'test-reports');
        this.debugDir = path.join(process.cwd(), 'debug-info');

        // Ensure directories exist
        [this.resultsDir, this.reportsDir, this.debugDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Analyze all test failures
     */
    async analyzeFailures() {
        console.log('🔍 Analyzing test failures...');

        const analysis = {
            timestamp: new Date().toISOString(),
            summary: {
                totalFailures: 0,
                failuresByType: {},
                failuresByModule: {},
                commonPatterns: []
            },
            failures: [],
            recommendations: [],
            debugInfo: {}
        };

        // Collect failure data from different sources
        await this.collectJestFailures(analysis);
        await this.collectE2EFailures(analysis);
        await this.collectPerformanceFailures(analysis);

        // Analyze patterns and generate recommendations
        this.analyzeFailurePatterns(analysis);
        this.generateRecommendations(analysis);

        // Generate debug information
        await this.generateDebugInfo(analysis);

        // Save analysis
        const analysisFile = path.join(this.reportsDir, `failure-analysis-${Date.now()}.json`);
        fs.writeFileSync(analysisFile, JSON.stringify(analysis, null, 2));

        // Generate HTML report
        await this.generateFailureReport(analysis);

        console.log(`🔍 Failure analysis complete: ${analysisFile}`);
        return analysis;
    }

    /**
     * Collect Jest test failures
     */
    async collectJestFailures(analysis) {
        const jestResultsFile = path.join(this.resultsDir, 'jest-results.json');

        if (!fs.existsSync(jestResultsFile)) {
            console.log('⚠️ Jest results file not found');
            return;
        }

        try {
            const jestResults = JSON.parse(fs.readFileSync(jestResultsFile, 'utf8'));

            jestResults.testResults?.forEach(testFile => {
                testFile.assertionResults?.forEach(test => {
                    if (test.status === 'failed') {
                        const failure = {
                            type: 'unit/integration',
                            file: testFile.name,
                            testName: test.title,
                            fullName: test.fullName,
                            error: test.failureMessages?.[0] || 'Unknown error',
                            location: test.location,
                            duration: test.duration,
                            ancestorTitles: test.ancestorTitles
                        };

                        analysis.failures.push(failure);
                        analysis.summary.totalFailures++;

                        // Categorize by module
                        const module = this.extractModuleName(testFile.name);
                        analysis.summary.failuresByModule[module] = (analysis.summary.failuresByModule[module] || 0) + 1;

                        // Categorize by error type
                        const errorType = this.categorizeError(failure.error);
                        analysis.summary.failuresByType[errorType] = (analysis.summary.failuresByType[errorType] || 0) + 1;
                    }
                });
            });

            console.log(`📊 Collected ${analysis.failures.length} Jest failures`);
        } catch (error) {
            console.error('❌ Error parsing Jest results:', error.message);
        }
    }

    /**
     * Collect E2E test failures
     */
    async collectE2EFailures(analysis) {
        const e2eResultsFile = path.join(this.resultsDir, 'e2e-results.json');

        if (!fs.existsSync(e2eResultsFile)) {
            console.log('⚠️ E2E results file not found');
            return;
        }

        try {
            const e2eResults = JSON.parse(fs.readFileSync(e2eResultsFile, 'utf8'));

            e2eResults.suites?.forEach(suite => {
                suite.tests?.forEach(test => {
                    if (test.status === 'failed') {
                        const failure = {
                            type: 'e2e',
                            file: suite.file,
                            testName: test.title,
                            error: test.error?.message || 'Unknown E2E error',
                            screenshot: test.screenshot,
                            video: test.video,
                            duration: test.duration,
                            browser: test.browser
                        };

                        analysis.failures.push(failure);
                        analysis.summary.totalFailures++;

                        const errorType = this.categorizeError(failure.error);
                        analysis.summary.failuresByType[errorType] = (analysis.summary.failuresByType[errorType] || 0) + 1;
                    }
                });
            });

            console.log(`📊 Collected E2E failures`);
        } catch (error) {
            console.error('❌ Error parsing E2E results:', error.message);
        }
    }

    /**
     * Collect performance test failures
     */
    async collectPerformanceFailures(analysis) {
        const perfResultsDir = path.join(process.cwd(), 'performance', 'results');

        if (!fs.existsSync(perfResultsDir)) {
            console.log('⚠️ Performance results directory not found');
            return;
        }

        try {
            const perfFiles = fs.readdirSync(perfResultsDir).filter(f => f.endsWith('.json'));

            perfFiles.forEach(file => {
                const perfData = JSON.parse(fs.readFileSync(path.join(perfResultsDir, file), 'utf8'));

                // Check for performance failures
                if (perfData.metrics) {
                    Object.entries(perfData.metrics).forEach(([metric, data]) => {
                        if (this.isPerformanceFailure(metric, data)) {
                            const failure = {
                                type: 'performance',
                                file: file,
                                testName: `Performance: ${metric}`,
                                error: `Performance threshold exceeded: ${metric}`,
                                actualValue: data.value,
                                threshold: data.threshold,
                                duration: perfData.duration
                            };

                            analysis.failures.push(failure);
                            analysis.summary.totalFailures++;

                            analysis.summary.failuresByType['performance'] = (analysis.summary.failuresByType['performance'] || 0) + 1;
                        }
                    });
                }
            });

            console.log(`📊 Collected performance failures`);
        } catch (error) {
            console.error('❌ Error parsing performance results:', error.message);
        }
    }

    /**
     * Extract module name from file path
     */
    extractModuleName(filePath) {
        const parts = filePath.split('/');
        const srcIndex = parts.findIndex(part => part === 'src');

        if (srcIndex !== -1 && srcIndex + 1 < parts.length) {
            return parts[srcIndex + 1];
        }

        return 'unknown';
    }

    /**
     * Categorize error by type
     */
    categorizeError(errorMessage) {
        const error = errorMessage.toLowerCase();

        if (error.includes('timeout')) return 'timeout';
        if (error.includes('connection') || error.includes('econnrefused')) return 'connection';
        if (error.includes('authentication') || error.includes('unauthorized')) return 'authentication';
        if (error.includes('validation') || error.includes('invalid')) return 'validation';
        if (error.includes('permission') || error.includes('access')) return 'permission';
        if (error.includes('database') || error.includes('prisma')) return 'database';
        if (error.includes('redis') || error.includes('cache')) return 'cache';
        if (error.includes('network') || error.includes('fetch')) return 'network';
        if (error.includes('memory') || error.includes('heap')) return 'memory';
        if (error.includes('syntax') || error.includes('parse')) return 'syntax';

        return 'unknown';
    }

    /**
     * Check if performance metric indicates failure
     */
    isPerformanceFailure(metric, data) {
        const thresholds = {
            'http_req_duration': 200, // ms
            'http_req_failed': 0.01,  // 1% error rate
            'http_reqs': 100,         // requests per second
            'data_received': 1000000  // bytes per second
        };

        const threshold = thresholds[metric];
        if (!threshold) return false;

        if (metric === 'http_req_failed') {
            return data.rate > threshold;
        } else if (metric === 'http_req_duration') {
            return data.avg > threshold;
        } else {
            return data.value < threshold;
        }
    }

    /**
     * Analyze failure patterns
     */
    analyzeFailurePatterns(analysis) {
        console.log('🔍 Analyzing failure patterns...');

        const patterns = {};

        analysis.failures.forEach(failure => {
            // Extract error patterns
            const errorWords = failure.error.toLowerCase().split(/\s+/);
            errorWords.forEach(word => {
                if (word.length > 3) { // Ignore short words
                    patterns[word] = (patterns[word] || 0) + 1;
                }
            });
        });

        // Find common patterns (appearing in multiple failures)
        analysis.summary.commonPatterns = Object.entries(patterns)
            .filter(([word, count]) => count > 1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word, count]) => ({ word, count }));
    }

    /**
     * Generate recommendations based on failure analysis
     */
    generateRecommendations(analysis) {
        console.log('💡 Generating recommendations...');

        const recommendations = [];

        // Timeout-related recommendations
        if (analysis.summary.failuresByType.timeout > 0) {
            recommendations.push({
                category: 'timeout',
                priority: 'high',
                title: 'Address Timeout Issues',
                description: 'Multiple tests are failing due to timeouts',
                actions: [
                    'Increase test timeout values in Jest configuration',
                    'Optimize async operations and database queries',
                    'Check for deadlocks or infinite loops',
                    'Consider using test.concurrent for parallel execution'
                ],
                affectedTests: analysis.failures.filter(f => f.error.toLowerCase().includes('timeout')).length
            });
        }

        // Connection-related recommendations
        if (analysis.summary.failuresByType.connection > 0) {
            recommendations.push({
                category: 'connection',
                priority: 'high',
                title: 'Fix Connection Issues',
                description: 'Tests are failing due to connection problems',
                actions: [
                    'Verify database and Redis services are running',
                    'Check connection strings and credentials',
                    'Ensure proper test environment setup',
                    'Add connection retry logic with exponential backoff'
                ],
                affectedTests: analysis.failures.filter(f => f.error.toLowerCase().includes('connection')).length
            });
        }

        // Authentication-related recommendations
        if (analysis.summary.failuresByType.authentication > 0) {
            recommendations.push({
                category: 'authentication',
                priority: 'medium',
                title: 'Fix Authentication Issues',
                description: 'Authentication-related test failures detected',
                actions: [
                    'Verify test JWT tokens are properly generated',
                    'Check API key validation in test setup',
                    'Ensure test users have correct permissions',
                    'Review authentication middleware configuration'
                ],
                affectedTests: analysis.failures.filter(f => f.error.toLowerCase().includes('auth')).length
            });
        }

        // Database-related recommendations
        if (analysis.summary.failuresByType.database > 0) {
            recommendations.push({
                category: 'database',
                priority: 'high',
                title: 'Resolve Database Issues',
                description: 'Database-related test failures need attention',
                actions: [
                    'Check database migrations are up to date',
                    'Verify test data seeding is working correctly',
                    'Review database connection pool configuration',
                    'Add proper transaction handling in tests'
                ],
                affectedTests: analysis.failures.filter(f => f.error.toLowerCase().includes('database')).length
            });
        }

        // Performance-related recommendations
        if (analysis.summary.failuresByType.performance > 0) {
            recommendations.push({
                category: 'performance',
                priority: 'medium',
                title: 'Improve Performance',
                description: 'Performance thresholds are being exceeded',
                actions: [
                    'Profile and optimize slow database queries',
                    'Implement proper caching strategies',
                    'Review API endpoint performance',
                    'Consider database indexing improvements'
                ],
                affectedTests: analysis.failures.filter(f => f.type === 'performance').length
            });
        }

        // Module-specific recommendations
        Object.entries(analysis.summary.failuresByModule).forEach(([module, count]) => {
            if (count > 2) { // Multiple failures in same module
                recommendations.push({
                    category: 'module',
                    priority: 'medium',
                    title: `Fix Issues in ${module} Module`,
                    description: `Multiple test failures detected in the ${module} module`,
                    actions: [
                        `Review ${module} service implementation`,
                        `Check ${module} test setup and mocking`,
                        `Verify ${module} dependencies are properly configured`,
                        `Consider refactoring complex logic in ${module}`
                    ],
                    affectedTests: count
                });
            }
        });

        analysis.recommendations = recommendations.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    /**
     * Generate debug information
     */
    async generateDebugInfo(analysis) {
        console.log('🐛 Generating debug information...');

        const debugInfo = {
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                memory: process.memoryUsage(),
                uptime: process.uptime()
            },
            dependencies: {},
            systemInfo: {},
            logs: {}
        };

        try {
            // Get package.json info
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            debugInfo.dependencies = {
                main: packageJson.dependencies,
                dev: packageJson.devDependencies
            };

            // Get system information
            debugInfo.systemInfo = {
                timestamp: new Date().toISOString(),
                cwd: process.cwd(),
                env: {
                    NODE_ENV: process.env.NODE_ENV,
                    DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
                    REDIS_URL: process.env.REDIS_URL ? 'SET' : 'NOT_SET'
                }
            };

            // Collect recent logs
            await this.collectRecentLogs(debugInfo);

            // Get Docker container status
            await this.getDockerStatus(debugInfo);

            analysis.debugInfo = debugInfo;
        } catch (error) {
            console.error('❌ Error generating debug info:', error.message);
            analysis.debugInfo.error = error.message;
        }
    }

    /**
     * Collect recent logs
     */
    async collectRecentLogs(debugInfo) {
        const logsDir = path.join(process.cwd(), 'logs');

        if (fs.existsSync(logsDir)) {
            const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));

            logFiles.forEach(file => {
                const logPath = path.join(logsDir, file);
                const stats = fs.statSync(logPath);

                // Only collect recent logs (last 24 hours)
                if (Date.now() - stats.mtime.getTime() < 24 * 60 * 60 * 1000) {
                    try {
                        const content = fs.readFileSync(logPath, 'utf8');
                        const lines = content.split('\n').slice(-100); // Last 100 lines
                        debugInfo.logs[file] = lines.join('\n');
                    } catch (error) {
                        debugInfo.logs[file] = `Error reading log: ${error.message}`;
                    }
                }
            });
        }
    }

    /**
     * Get Docker container status
     */
    async getDockerStatus(debugInfo) {
        try {
            const dockerPs = execSync('docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"', { encoding: 'utf8' });
            debugInfo.systemInfo.dockerContainers = dockerPs;
        } catch (error) {
            debugInfo.systemInfo.dockerContainers = `Error getting Docker status: ${error.message}`;
        }
    }

    /**
     * Generate HTML failure report
     */
    async generateFailureReport(analysis) {
        const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Failure Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center; }
        .metric.danger { border-left: 4px solid #dc3545; }
        .metric.warning { border-left: 4px solid #ffc107; }
        .metric-value { font-size: 32px; font-weight: bold; color: #dc3545; }
        .metric-label { font-size: 14px; color: #666; margin-top: 5px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #333; border-bottom: 2px solid #dc3545; padding-bottom: 10px; }
        .failure { margin: 15px 0; padding: 15px; background: #fff5f5; border-left: 4px solid #dc3545; border-radius: 4px; }
        .failure-header { font-weight: bold; color: #dc3545; margin-bottom: 10px; }
        .failure-details { font-family: monospace; background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto; }
        .recommendation { margin: 15px 0; padding: 15px; background: #f0f8ff; border-left: 4px solid #007acc; border-radius: 4px; }
        .recommendation.high { border-left-color: #dc3545; background: #fff5f5; }
        .recommendation.medium { border-left-color: #ffc107; background: #fffbf0; }
        .recommendation-title { font-weight: bold; margin-bottom: 10px; }
        .recommendation-actions { margin-top: 10px; }
        .recommendation-actions li { margin: 5px 0; }
        .chart { margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
        .debug-info { background: #f8f9fa; padding: 15px; border-radius: 4px; font-family: monospace; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Test Failure Analysis Report</h1>
            <p>Generated on ${new Date(analysis.timestamp).toLocaleString()}</p>
        </div>

        <div class="summary">
            <div class="metric danger">
                <div class="metric-value">${analysis.summary.totalFailures}</div>
                <div class="metric-label">Total Failures</div>
            </div>
            <div class="metric warning">
                <div class="metric-value">${Object.keys(analysis.summary.failuresByType).length}</div>
                <div class="metric-label">Error Types</div>
            </div>
            <div class="metric warning">
                <div class="metric-value">${Object.keys(analysis.summary.failuresByModule).length}</div>
                <div class="metric-label">Affected Modules</div>
            </div>
            <div class="metric warning">
                <div class="metric-value">${analysis.recommendations.length}</div>
                <div class="metric-label">Recommendations</div>
            </div>
        </div>

        <div class="section">
            <h2>📊 Failure Distribution</h2>
            ${this.generateFailureDistributionTable(analysis)}
        </div>

        <div class="section">
            <h2>💡 Recommendations</h2>
            ${this.generateRecommendationsHtml(analysis.recommendations)}
        </div>

        <div class="section">
            <h2>❌ Detailed Failures</h2>
            ${this.generateFailuresHtml(analysis.failures.slice(0, 20))} <!-- Show first 20 -->
            ${analysis.failures.length > 20 ? `<p><em>Showing first 20 of ${analysis.failures.length} failures</em></p>` : ''}
        </div>

        <div class="section">
            <h2>🐛 Debug Information</h2>
            ${this.generateDebugInfoHtml(analysis.debugInfo)}
        </div>
    </div>
</body>
</html>`;

        const htmlFile = path.join(this.reportsDir, 'failure-analysis.html');
        fs.writeFileSync(htmlFile, htmlTemplate);
        console.log(`📄 HTML failure report generated: ${htmlFile}`);
    }

    generateFailureDistributionTable(analysis) {
        let html = '<table><tr><th>Category</th><th>Count</th><th>Percentage</th></tr>';

        // Failures by type
        Object.entries(analysis.summary.failuresByType).forEach(([type, count]) => {
            const percentage = ((count / analysis.summary.totalFailures) * 100).toFixed(1);
            html += `<tr><td>Error Type: ${type}</td><td>${count}</td><td>${percentage}%</td></tr>`;
        });

        // Failures by module
        Object.entries(analysis.summary.failuresByModule).forEach(([module, count]) => {
            const percentage = ((count / analysis.summary.totalFailures) * 100).toFixed(1);
            html += `<tr><td>Module: ${module}</td><td>${count}</td><td>${percentage}%</td></tr>`;
        });

        html += '</table>';
        return html;
    }

    generateRecommendationsHtml(recommendations) {
        return recommendations.map(rec => `
      <div class="recommendation ${rec.priority}">
        <div class="recommendation-title">${rec.title} (${rec.priority.toUpperCase()} Priority)</div>
        <p>${rec.description}</p>
        <p><strong>Affected Tests:</strong> ${rec.affectedTests}</p>
        <div class="recommendation-actions">
          <strong>Recommended Actions:</strong>
          <ul>
            ${rec.actions.map(action => `<li>${action}</li>`).join('')}
          </ul>
        </div>
      </div>
    `).join('');
    }

    generateFailuresHtml(failures) {
        return failures.map(failure => `
      <div class="failure">
        <div class="failure-header">${failure.type.toUpperCase()}: ${failure.testName}</div>
        <p><strong>File:</strong> ${failure.file}</p>
        ${failure.duration ? `<p><strong>Duration:</strong> ${failure.duration}ms</p>` : ''}
        <div class="failure-details">${failure.error}</div>
      </div>
    `).join('');
    }

    generateDebugInfoHtml(debugInfo) {
        return `
      <div class="debug-info">
        <strong>Environment:</strong><br>
        Node.js: ${debugInfo.environment?.nodeVersion}<br>
        Platform: ${debugInfo.environment?.platform}<br>
        Memory Usage: ${JSON.stringify(debugInfo.environment?.memory, null, 2)}<br><br>
        
        <strong>System Info:</strong><br>
        ${JSON.stringify(debugInfo.systemInfo, null, 2)}<br><br>
        
        ${debugInfo.logs ? `<strong>Recent Logs:</strong><br>${Object.keys(debugInfo.logs).join(', ')}` : ''}
      </div>
    `;
    }

    /**
     * Generate debugging commands
     */
    generateDebuggingCommands(analysis) {
        console.log('🛠️ Generating debugging commands...');

        const commands = [];

        // Database debugging commands
        if (analysis.summary.failuresByType.database > 0) {
            commands.push({
                category: 'database',
                description: 'Check database connection and status',
                commands: [
                    'docker-compose ps postgres',
                    'docker-compose logs postgres',
                    'npx prisma db pull',
                    'npx prisma migrate status'
                ]
            });
        }

        // Redis debugging commands
        if (analysis.summary.failuresByType.cache > 0) {
            commands.push({
                category: 'redis',
                description: 'Check Redis connection and status',
                commands: [
                    'docker-compose ps redis',
                    'docker-compose logs redis',
                    'redis-cli ping',
                    'redis-cli info'
                ]
            });
        }

        // Application debugging commands
        commands.push({
            category: 'application',
            description: 'Debug application issues',
            commands: [
                'npm run test:unit -- --verbose',
                'npm run test:integration -- --detectOpenHandles',
                'npm run lint',
                'npm audit'
            ]
        });

        const commandsFile = path.join(this.debugDir, 'debugging-commands.json');
        fs.writeFileSync(commandsFile, JSON.stringify(commands, null, 2));

        console.log(`🛠️ Debugging commands saved: ${commandsFile}`);
        return commands;
    }
}

// CLI interface
async function main() {
    const analyzer = new TestFailureAnalyzer();
    const command = process.argv[2];

    try {
        switch (command) {
            case 'analyze':
                const analysis = await analyzer.analyzeFailures();
                analyzer.generateDebuggingCommands(analysis);
                break;
            default:
                console.log(`
Usage: node test-failure-analysis.js <command>

Commands:
  analyze     Analyze test failures and generate report

Examples:
  node test-failure-analysis.js analyze
        `);
                break;
        }
    } catch (error) {
        console.error('❌ Test failure analysis failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = TestFailureAnalyzer;