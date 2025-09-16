#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
    suite: string;
    passed: boolean;
    duration: number;
    coverage?: number;
    errors?: string[];
}

class SystemTestRunner {
    private results: TestResult[] = [];
    private startTime: number = Date.now();

    async runAllTests(): Promise<void> {
        console.log('🚀 Starting System Integration Tests...\n');

        const testSuites = [
            {
                name: 'System Integration Tests',
                command: 'npm run test:e2e -- test/system-integration.e2e-spec.ts --verbose',
                file: 'test/system-integration.e2e-spec.ts',
            },
            {
                name: 'Comprehensive System Tests',
                command: 'npm run test:e2e -- test/system-comprehensive.e2e-spec.ts --verbose',
                file: 'test/system-comprehensive.e2e-spec.ts',
            },
            {
                name: 'System Performance Tests',
                command: 'npm run test:e2e -- test/system-performance.e2e-spec.ts --verbose',
                file: 'test/system-performance.e2e-spec.ts',
            },
            {
                name: 'System Security Tests',
                command: 'npm run test:e2e -- test/system-security.e2e-spec.ts --verbose',
                file: 'test/system-security.e2e-spec.ts',
            },
        ];

        for (const suite of testSuites) {
            await this.runTestSuite(suite);
        }

        this.generateReport();
    }

    private async runTestSuite(suite: { name: string; command: string; file: string }): Promise<void> {
        console.log(`📋 Running ${suite.name}...`);
        const startTime = Date.now();

        try {
            // Check if test file exists
            if (!fs.existsSync(suite.file)) {
                throw new Error(`Test file not found: ${suite.file}`);
            }

            // Run the test suite
            const output = execSync(suite.command, {
                encoding: 'utf8',
                stdio: 'pipe',
                timeout: 300000, // 5 minutes timeout
            });

            const duration = Date.now() - startTime;

            // Parse test results
            const passed = !output.includes('FAILED') && !output.includes('Error:');
            const coverage = this.extractCoverage(output);

            this.results.push({
                suite: suite.name,
                passed,
                duration,
                coverage,
            });

            console.log(`✅ ${suite.name} completed in ${duration}ms`);
            if (coverage) {
                console.log(`📊 Coverage: ${coverage}%`);
            }
            console.log('');

        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            this.results.push({
                suite: suite.name,
                passed: false,
                duration,
                errors: [errorMessage],
            });

            console.log(`❌ ${suite.name} failed after ${duration}ms`);
            console.log(`Error: ${errorMessage}`);
            console.log('');
        }
    }

    private extractCoverage(output: string): number | undefined {
        const coverageMatch = output.match(/All files\s+\|\s+([\d.]+)/);
        return coverageMatch ? parseFloat(coverageMatch[1]) : undefined;
    }

    private generateReport(): void {
        const totalDuration = Date.now() - this.startTime;
        const passedTests = this.results.filter(r => r.passed).length;
        const totalTests = this.results.length;
        const overallPassed = passedTests === totalTests;

        console.log('📊 System Integration Test Report');
        console.log('='.repeat(50));
        console.log(`Total Duration: ${totalDuration}ms`);
        console.log(`Tests Passed: ${passedTests}/${totalTests}`);
        console.log(`Overall Status: ${overallPassed ? '✅ PASSED' : '❌ FAILED'}`);
        console.log('');

        // Detailed results
        console.log('📋 Detailed Results:');
        console.log('-'.repeat(50));

        this.results.forEach(result => {
            const status = result.passed ? '✅' : '❌';
            const coverage = result.coverage ? ` (${result.coverage}% coverage)` : '';

            console.log(`${status} ${result.suite}: ${result.duration}ms${coverage}`);

            if (result.errors && result.errors.length > 0) {
                result.errors.forEach(error => {
                    console.log(`   Error: ${error}`);
                });
            }
        });

        console.log('');

        // Performance summary
        const performanceResult = this.results.find(r => r.suite.includes('Performance'));
        if (performanceResult) {
            console.log('⚡ Performance Summary:');
            console.log('-'.repeat(30));
            console.log(`Performance Tests: ${performanceResult.passed ? 'PASSED' : 'FAILED'}`);
            console.log(`Duration: ${performanceResult.duration}ms`);
            console.log('');
        }

        // Security summary
        const securityResult = this.results.find(r => r.suite.includes('Security'));
        if (securityResult) {
            console.log('🔒 Security Summary:');
            console.log('-'.repeat(30));
            console.log(`Security Tests: ${securityResult.passed ? 'PASSED' : 'FAILED'}`);
            console.log(`Duration: ${securityResult.duration}ms`);
            console.log('');
        }

        // Coverage summary
        const coverageResults = this.results.filter(r => r.coverage !== undefined);
        if (coverageResults.length > 0) {
            const avgCoverage = coverageResults.reduce((sum, r) => sum + (r.coverage || 0), 0) / coverageResults.length;
            console.log('📈 Coverage Summary:');
            console.log('-'.repeat(30));
            console.log(`Average Coverage: ${avgCoverage.toFixed(1)}%`);
            console.log('');
        }

        // Recommendations
        this.generateRecommendations();

        // Save report to file
        this.saveReportToFile();

        // Exit with appropriate code
        process.exit(overallPassed ? 0 : 1);
    }

    private generateRecommendations(): void {
        console.log('💡 Recommendations:');
        console.log('-'.repeat(30));

        const failedTests = this.results.filter(r => !r.passed);
        if (failedTests.length > 0) {
            console.log('❗ Failed Tests:');
            failedTests.forEach(test => {
                console.log(`   - Fix issues in ${test.suite}`);
            });
            console.log('');
        }

        const slowTests = this.results.filter(r => r.duration > 60000); // > 1 minute
        if (slowTests.length > 0) {
            console.log('🐌 Slow Tests (>1 minute):');
            slowTests.forEach(test => {
                console.log(`   - Optimize ${test.suite} (${test.duration}ms)`);
            });
            console.log('');
        }

        const lowCoverageTests = this.results.filter(r => r.coverage && r.coverage < 80);
        if (lowCoverageTests.length > 0) {
            console.log('📉 Low Coverage (<80%):');
            lowCoverageTests.forEach(test => {
                console.log(`   - Improve coverage for ${test.suite} (${test.coverage}%)`);
            });
            console.log('');
        }

        if (failedTests.length === 0 && slowTests.length === 0 && lowCoverageTests.length === 0) {
            console.log('🎉 All tests are performing well!');
            console.log('   - Consider adding more edge case tests');
            console.log('   - Monitor performance trends over time');
            console.log('   - Keep security tests updated with latest threats');
            console.log('');
        }
    }

    private saveReportToFile(): void {
        const reportDir = path.join(process.cwd(), 'test-reports');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportFile = path.join(reportDir, `system-integration-report-${timestamp}.json`);

        const report = {
            timestamp: new Date().toISOString(),
            totalDuration: Date.now() - this.startTime,
            results: this.results,
            summary: {
                totalTests: this.results.length,
                passedTests: this.results.filter(r => r.passed).length,
                failedTests: this.results.filter(r => !r.passed).length,
                averageDuration: this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length,
                overallPassed: this.results.every(r => r.passed),
            },
        };

        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
        console.log(`📄 Report saved to: ${reportFile}`);
        console.log('');
    }
}

// Run the tests if this script is executed directly
if (require.main === module) {
    const runner = new SystemTestRunner();
    runner.runAllTests().catch(error => {
        console.error('❌ Test runner failed:', error);
        process.exit(1);
    });
}

export { SystemTestRunner };