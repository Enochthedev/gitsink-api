/**
 * E2E Global Test Teardown
 * Cleans up the E2E test environment
 */

const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
    console.log('🧹 Tearing down E2E test environment...');

    try {
        // Stop the application
        if (process.env.E2E_APP_PID) {
            console.log('🛑 Stopping E2E application...');
            try {
                process.kill(process.env.E2E_APP_PID);
            } catch (error) {
                console.warn('⚠️ Failed to stop E2E app process:', error.message);
            }
        }

        // Clean up E2E data
        console.log('🗑️ Cleaning up E2E data...');
        execSync('node scripts/test-data-management.js cleanup e2e', {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });

        // Optionally tear down E2E services (comment out to keep running)
        // console.log('🐳 Stopping E2E services...');
        // execSync('./scripts/test-environment-setup.sh teardown e2e', {
        //   stdio: 'inherit',
        //   cwd: path.join(__dirname, '..')
        // });

        console.log('✅ E2E test teardown complete');
    } catch (error) {
        console.error('❌ E2E test teardown failed:', error.message);
        // Don't throw error to avoid masking test failures
    }
};