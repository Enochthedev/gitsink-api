/**
 * E2E Global Test Setup
 * Sets up the E2E test environment
 */

const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
    console.log('🎭 Setting up E2E test environment...');

    try {
        // Set E2E environment
        process.env.NODE_ENV = 'test';
        process.env.E2E_MODE = 'true';

        // Start E2E services
        console.log('🐳 Starting E2E services...');
        execSync('./scripts/test-environment-setup.sh setup e2e', {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });

        // Start the application for E2E testing
        console.log('🚀 Starting application for E2E tests...');
        const appProcess = execSync('npm run start:e2e &', {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..'),
            detached: true
        });

        // Store process ID for cleanup
        process.env.E2E_APP_PID = appProcess.pid;

        // Wait for application to be ready
        await new Promise(resolve => setTimeout(resolve, 10000));

        console.log('✅ E2E test setup complete');
    } catch (error) {
        console.error('❌ E2E test setup failed:', error.message);
        throw error;
    }
};