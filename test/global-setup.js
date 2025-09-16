/**
 * Global Test Setup
 * Runs once before all tests to set up the test environment
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async () => {
    console.log('🚀 Setting up global test environment...');

    try {
        // Set test environment
        process.env.NODE_ENV = 'test';

        // Ensure test directories exist
        const testDirs = [
            path.join(__dirname, '..', 'test-results'),
            path.join(__dirname, '..', 'coverage'),
            path.join(__dirname, '..', 'test-reports'),
            path.join(__dirname, '..', 'debug-info')
        ];

        testDirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        // Start test services if not already running
        console.log('🐳 Starting test services...');
        try {
            execSync('./scripts/test-environment-setup.sh setup test', {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
            });
        } catch (error) {
            console.warn('⚠️ Test services may already be running or setup failed:', error.message);
        }

        // Wait a moment for services to be ready
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log('✅ Global test setup complete');
    } catch (error) {
        console.error('❌ Global test setup failed:', error.message);
        throw error;
    }
};