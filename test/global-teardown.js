/**
 * Global Test Teardown
 * Runs once after all tests to clean up the test environment
 */

const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
    console.log('🧹 Tearing down global test environment...');

    try {
        // Generate test reports
        console.log('📊 Generating test reports...');
        try {
            execSync('node scripts/test-reporting.js generate-report', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });
        } catch (error) {
            console.warn('⚠️ Test report generation failed:', error.message);
        }

        // Analyze failures if any
        console.log('🔍 Analyzing test failures...');
        try {
            execSync('node scripts/test-failure-analysis.js analyze', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });
        } catch (error) {
            console.warn('⚠️ Failure analysis failed:', error.message);
        }

        // Clean up test data (but keep services running for other test suites)
        console.log('🗑️ Cleaning up test data...');
        try {
            execSync('node scripts/test-data-management.js cleanup test', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });
        } catch (error) {
            console.warn('⚠️ Test data cleanup failed:', error.message);
        }

        console.log('✅ Global test teardown complete');
    } catch (error) {
        console.error('❌ Global test teardown failed:', error.message);
        // Don't throw error to avoid masking test failures
    }
};