#!/usr/bin/env node

/**
 * Test Reporting and Analysis Script
 * Generates comprehensive test reports and coverage analysis
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestReporter {
    constructor() {
        this.coverageDir = path.join(process.cwd(), 'coverage');
        this.reportsDir = path.join(process.cwd(), 'test-reports');
        this.resultsDir = path.join(process.cwd(), 'test-results');

        // Ensure directories exist
        [this.reportsDir, this.resultsDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Merge multiple coverage reports
     */
    async mergeCoverageReports() {
        console.log('📊 Merging coverage reports...');

        const coverageDirs = [
            path.join(this.coverageDir, 'unit'),
            path.join(this.coverageDir, 'integration'),
            path.join(this.coverageDir, 'e2e')
        ];

        const mergedDir = path.join(this.coverageDir, 'merged');
        if (!fs.existsSync(mergedDir)) {
            fs.mkdirSync(mergedDir, { recursive: true });
        }

        try {
            // Use nyc to merge coverage reports
            const lcovFiles = coverageDirs
                .filter(dir => fs.existsSync(dir))
                .map(dir => path.join(dir, 'lcov.info'))
                .filter(file => fs.existsSync(file));

            if (lcovFiles.length > 0) {
                const mergedLcov = path.join(mergedDir, 'lcov.info');

                // Merge LCOV files
                let mergedContent = '';
                lcovFiles.forEach(file => {
                    mergedContent += fs.readFileSync(file, 'utf8') + '\n';
                });

                fs.writeFileSync(mergedLcov, mergedContent);

                // Generate HTML report from merged LCOV
                execSync(`npx genhtml ${mergedLcov} --output-directory ${mergedDir}/html`, {
                    stdio: 'inherit'
                });

                // Generate coverage summary
                this.generateCoverageSummary(mergedDir);

                console.log('✅ Coverage reports merged successfully');
            } else {
                console.log('⚠️ No coverage files found to merge');
            }
        } catch (error) {
            console.error('❌ Error merging coverage reports:', error.message);
            throw error;
        }
    }

    /**
     * Generate coverage summary JSON
     */
    generateCoverageSummary(coverageDir) {
        const lcovFile = path.join(coverageDir, 'lcov.info');
        if (!fs.existsSync(lcovFile)) return;

        try {
            // Parse LCOV file and generate summary
            const lcovContent = fs.readFileSync(lcovFile, 'utf8');
            const summary = this.parseLcovSummary(lcovContent);

            const summaryFile = path.join(coverageDir, 'coverage-summary.json');
            fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

            console.log('📋 Coverage summary generated');
        } catch (error) {
            console.error('❌ Error generating coverage summary:', error.message);
        }
    }

    /**
     * Parse LCOV content to generate summary
     */
    parseLcovSummary(lcovContent) {
        const lines = lcovContent.split('\n');
        let totalLines = 0, coveredLines = 0;
        let totalFunctions = 0, coveredFunctions = 0;
        let totalBranches = 0, coveredBranches = 0;

        lines.forEach(line => {
            if (line.startsWith('LF:')) totalLines += parseInt(line.split(':')[1]);
            if (line.startsWith('LH:')) coveredLines += parseInt(line.split(':')[1]);
            if (line.startsWith('FNF:')) totalFunctions += parseInt(line.split(':')[1]);
            if (line.startsWith('FNH:')) coveredFunctions += parseInt(line.split(':')[1]);
            if (line.startsWith('BRF:')) totalBranches += parseInt(line.split(':')[1]);
            if (line.startsWith('BRH:')) coveredBranches += parseInt(line.split(':')[1]);
        });

        const calculatePct = (covered, total) => total > 0 ? Math.round((covered / total) * 100 * 100) / 100 : 0;

        return {
            total: {
                lines: { total: totalLines, covered: coveredLines, pct: calculatePct(coveredLines, totalLines) },
                functions: { total: totalFunctions, covered: coveredFunctions, pct: calculatePct(coveredFunctions, totalFunctions) },
                branches: { total: totalBranches, covered: coveredBranches, pct: calculatePct(coveredBranches, totalBranches) },
                statements: { total: totalLines, covered: coveredLines, pct: calculatePct(coveredLines, totalLines) }
            }
        };
    }

    /**
     * Generate test execution report
     */
    async generateTestReport() {
        console.log('📝 Generating test execution report...');

        const report = {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            git: this.getGitInfo(),
            testSuites: {},
            coverage: {},
            performance: {},
            security: {}
        };

        // Collect test results from different suites
        await this.collectTestResults(report);

        // Generate HTML report
        await this.generateHtmlReport(report);

        // Save JSON report
        const reportFile = path.join(this.reportsDir, `test-report-${Date.now()}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

        console.log(`✅ Test report generated: ${reportFile}`);
        return report;
    }

    /**
     * Get Git information
     */
    getGitInfo() {
        try {
            return {
                branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
                commit: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
                author: execSync('git log -1 --pretty=format:"%an"', { encoding: 'utf8' }).trim(),
                message: execSync('git log -1 --pretty=format:"%s"', { encoding: 'utf8' }).trim()
            };
        } catch (error) {
            return { error: 'Git information not available' };
        }
    }

    /**
     * Collect test results from various sources
     */
    async collectTestResults(report) {
        // Unit test results
        const unitResultsFile = path.join(this.resultsDir, 'unit-test-results.json');
        if (fs.existsSync(unitResultsFile)) {
            report.testSuites.unit = JSON.parse(fs.readFileSync(unitResultsFile, 'utf8'));
        }

        // Integration test results
        const integrationResultsFile = path.join(this.resultsDir, 'integration-test-results.json');
        if (fs.existsSync(integrationResultsFile)) {
            report.testSuites.integration = JSON.parse(fs.readFileSync(integrationResultsFile, 'utf8'));
        }

        // E2E test results
        const e2eResultsFile = path.join(this.resultsDir, 'e2e-test-results.json');
        if (fs.existsSync(e2eResultsFile)) {
            report.testSuites.e2e = JSON.parse(fs.readFileSync(e2eResultsFile, 'utf8'));
        }

        // Coverage summary
        const coverageSummaryFile = path.join(this.coverageDir, 'merged', 'coverage-summary.json');
        if (fs.existsSync(coverageSummaryFile)) {
            report.coverage = JSON.parse(fs.readFileSync(coverageSummaryFile, 'utf8'));
        }

        // Performance results
        const perfResultsDir = path.join(process.cwd(), 'performance', 'results');
        if (fs.existsSync(perfResultsDir)) {
            const perfFiles = fs.readdirSync(perfResultsDir).filter(f => f.endsWith('.json'));
            perfFiles.forEach(file => {
                const perfData = JSON.parse(fs.readFileSync(path.join(perfResultsDir, file), 'utf8'));
                report.performance[file.replace('.json', '')] = perfData;
            });
        }

        // Security results
        const securityResultsFile = path.join(this.resultsDir, 'security-results.json');
        if (fs.existsSync(securityResultsFile)) {
            report.security = JSON.parse(fs.readFileSync(securityResultsFile, 'utf8'));
        }
    }

    /**
     * Generate HTML report
     */
    async generateHtmlReport(report) {
        const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gitsink Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #333; border-bottom: 2px solid #007acc; padding-bottom: 10px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #f8f9fa; border-radius: 5px; min-width: 150px; text-align: center; }
        .metric.success { border-left: 4px solid #28a745; }
        .metric.warning { border-left: 4px solid #ffc107; }
        .metric.danger { border-left: 4px solid #dc3545; }
        .metric-value { font-size: 24px; font-weight: bold; }
        .metric-label { font-size: 14px; color: #666; }
        .test-suite { margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; }
        .git-info { background: #e9ecef; padding: 15px; border-radius: 5px; font-family: monospace; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
        .status-pass { color: #28a745; font-weight: bold; }
        .status-fail { color: #dc3545; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 Gitsink Test Report</h1>
            <p>Generated on ${new Date(report.timestamp).toLocaleString()}</p>
        </div>

        <div class="section">
            <h2>📋 Git Information</h2>
            <div class="git-info">
                <strong>Branch:</strong> ${report.git.branch || 'N/A'}<br>
                <strong>Commit:</strong> ${report.git.commit || 'N/A'}<br>
                <strong>Author:</strong> ${report.git.author || 'N/A'}<br>
                <strong>Message:</strong> ${report.git.message || 'N/A'}
            </div>
        </div>

        <div class="section">
            <h2>📊 Coverage Summary</h2>
            ${this.generateCoverageMetrics(report.coverage)}
        </div>

        <div class="section">
            <h2>🧪 Test Suites</h2>
            ${this.generateTestSuitesSummary(report.testSuites)}
        </div>

        <div class="section">
            <h2>⚡ Performance Results</h2>
            ${this.generatePerformanceSummary(report.performance)}
        </div>

        <div class="section">
            <h2>🔒 Security Results</h2>
            ${this.generateSecuritySummary(report.security)}
        </div>
    </div>
</body>
</html>`;

        const htmlFile = path.join(this.reportsDir, 'test-report.html');
        fs.writeFileSync(htmlFile, htmlTemplate);
        console.log(`📄 HTML report generated: ${htmlFile}`);
    }

    generateCoverageMetrics(coverage) {
        if (!coverage.total) return '<p>No coverage data available</p>';

        const { lines, functions, branches, statements } = coverage.total;

        return `
      <div class="metric ${lines.pct >= 80 ? 'success' : lines.pct >= 60 ? 'warning' : 'danger'}">
        <div class="metric-value">${lines.pct}%</div>
        <div class="metric-label">Lines</div>
      </div>
      <div class="metric ${functions.pct >= 80 ? 'success' : functions.pct >= 60 ? 'warning' : 'danger'}">
        <div class="metric-value">${functions.pct}%</div>
        <div class="metric-label">Functions</div>
      </div>
      <div class="metric ${branches.pct >= 80 ? 'success' : branches.pct >= 60 ? 'warning' : 'danger'}">
        <div class="metric-value">${branches.pct}%</div>
        <div class="metric-label">Branches</div>
      </div>
      <div class="metric ${statements.pct >= 80 ? 'success' : statements.pct >= 60 ? 'warning' : 'danger'}">
        <div class="metric-value">${statements.pct}%</div>
        <div class="metric-label">Statements</div>
      </div>
    `;
    }

    generateTestSuitesSummary(testSuites) {
        if (!testSuites || Object.keys(testSuites).length === 0) {
            return '<p>No test suite data available</p>';
        }

        let html = '';
        Object.entries(testSuites).forEach(([suite, results]) => {
            html += `
        <div class="test-suite">
          <h3>${suite.charAt(0).toUpperCase() + suite.slice(1)} Tests</h3>
          <p><strong>Status:</strong> <span class="${results.success ? 'status-pass' : 'status-fail'}">${results.success ? 'PASS' : 'FAIL'}</span></p>
          <p><strong>Tests:</strong> ${results.numTotalTests || 0} total, ${results.numPassedTests || 0} passed, ${results.numFailedTests || 0} failed</p>
          <p><strong>Duration:</strong> ${results.testResults?.[0]?.perfStats?.runtime || 0}ms</p>
        </div>
      `;
        });

        return html;
    }

    generatePerformanceSummary(performance) {
        if (!performance || Object.keys(performance).length === 0) {
            return '<p>No performance data available</p>';
        }

        let html = '<table><tr><th>Test</th><th>Avg Response Time</th><th>Throughput</th><th>Status</th></tr>';

        Object.entries(performance).forEach(([test, results]) => {
            const avgTime = results.http_req_duration?.avg || 'N/A';
            const throughput = results.http_reqs?.rate || 'N/A';
            const status = avgTime !== 'N/A' && avgTime < 200 ? 'PASS' : 'WARN';

            html += `
        <tr>
          <td>${test}</td>
          <td>${avgTime}ms</td>
          <td>${throughput} req/s</td>
          <td><span class="status-${status.toLowerCase()}">${status}</span></td>
        </tr>
      `;
        });

        html += '</table>';
        return html;
    }

    generateSecuritySummary(security) {
        if (!security || Object.keys(security).length === 0) {
            return '<p>No security test data available</p>';
        }

        return `
      <div class="test-suite">
        <p><strong>Vulnerabilities Found:</strong> ${security.vulnerabilities || 0}</p>
        <p><strong>Security Score:</strong> ${security.score || 'N/A'}</p>
        <p><strong>Status:</strong> <span class="${security.passed ? 'status-pass' : 'status-fail'}">${security.passed ? 'PASS' : 'FAIL'}</span></p>
      </div>
    `;
    }

    /**
     * Analyze test failures and generate debugging information
     */
    async analyzeFailures() {
        console.log('🔍 Analyzing test failures...');

        const failureAnalysis = {
            timestamp: new Date().toISOString(),
            failures: [],
            recommendations: []
        };

        // Analyze Jest test results
        const jestResults = path.join(this.resultsDir, 'jest-results.json');
        if (fs.existsSync(jestResults)) {
            const results = JSON.parse(fs.readFileSync(jestResults, 'utf8'));

            results.testResults?.forEach(testFile => {
                testFile.assertionResults?.forEach(test => {
                    if (test.status === 'failed') {
                        failureAnalysis.failures.push({
                            file: testFile.name,
                            test: test.title,
                            error: test.failureMessages?.[0] || 'Unknown error',
                            location: test.location
                        });
                    }
                });
            });
        }

        // Generate recommendations based on failure patterns
        this.generateFailureRecommendations(failureAnalysis);

        const analysisFile = path.join(this.reportsDir, 'failure-analysis.json');
        fs.writeFileSync(analysisFile, JSON.stringify(failureAnalysis, null, 2));

        console.log(`🔍 Failure analysis saved: ${analysisFile}`);
        return failureAnalysis;
    }

    generateFailureRecommendations(analysis) {
        const errorPatterns = {
            'timeout': 'Consider increasing test timeout or optimizing async operations',
            'connection': 'Check database/Redis connections and service availability',
            'authentication': 'Verify test authentication setup and token generation',
            'validation': 'Review input validation and schema definitions',
            'permission': 'Check file permissions and access rights'
        };

        analysis.failures.forEach(failure => {
            const error = failure.error.toLowerCase();
            Object.entries(errorPatterns).forEach(([pattern, recommendation]) => {
                if (error.includes(pattern)) {
                    analysis.recommendations.push({
                        pattern,
                        recommendation,
                        affectedTests: [failure.test]
                    });
                }
            });
        });
    }

    /**
     * Clean up old test artifacts
     */
    async cleanup() {
        console.log('🧹 Cleaning up old test artifacts...');

        const directories = [this.reportsDir, this.resultsDir, this.coverageDir];
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

        directories.forEach(dir => {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);

                    if (Date.now() - stats.mtime.getTime() > maxAge) {
                        if (stats.isDirectory()) {
                            fs.rmSync(filePath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(filePath);
                        }
                        console.log(`🗑️ Removed old artifact: ${filePath}`);
                    }
                });
            }
        });
    }
}

// CLI interface
async function main() {
    const reporter = new TestReporter();
    const command = process.argv[2];

    try {
        switch (command) {
            case 'merge-coverage':
                await reporter.mergeCoverageReports();
                break;
            case 'generate-report':
                await reporter.generateTestReport();
                break;
            case 'analyze-failures':
                await reporter.analyzeFailures();
                break;
            case 'cleanup':
                await reporter.cleanup();
                break;
            case 'all':
            default:
                await reporter.mergeCoverageReports();
                await reporter.generateTestReport();
                await reporter.analyzeFailures();
                break;
        }
    } catch (error) {
        console.error('❌ Test reporting failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = TestReporter;