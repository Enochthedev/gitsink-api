#!/usr/bin/env ts-node

import { ConfigService } from '@nestjs/config';
import { ConfigValidationService } from '../src/common/config/config-validation.service';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

interface ValidationOptions {
    environment?: string;
    envFile?: string;
    strict?: boolean;
    verbose?: boolean;
}

class ConfigurationValidator {
    private configService: ConfigService;
    private validationService: ConfigValidationService;

    constructor() {
        this.configService = new ConfigService();
        this.validationService = new ConfigValidationService(this.configService);
    }

    async validateConfiguration(options: ValidationOptions = {}) {
        console.log('🔧 GitSink Configuration Validator\n');

        // Load environment file if specified
        if (options.envFile) {
            this.loadEnvironmentFile(options.envFile);
        } else if (options.environment) {
            this.loadEnvironmentForEnvironment(options.environment);
        }

        // Run validation
        const result = this.validationService.validateConfiguration();

        // Display results
        this.displayValidationResults(result, options);

        // Return exit code
        return result.isValid ? 0 : 1;
    }

    private loadEnvironmentFile(envFile: string) {
        const envPath = path.resolve(envFile);

        if (!fs.existsSync(envPath)) {
            console.error(`❌ Environment file not found: ${envPath}`);
            process.exit(1);
        }

        console.log(`📁 Loading environment from: ${envPath}`);
        dotenv.config({ path: envPath });
    }

    private loadEnvironmentForEnvironment(environment: string) {
        const envFiles = [
            `.env.${environment}`,
            `.env.${environment}.local`,
            '.env.local',
            '.env',
        ];

        for (const envFile of envFiles) {
            const envPath = path.resolve(envFile);
            if (fs.existsSync(envPath)) {
                console.log(`📁 Loading environment from: ${envPath}`);
                dotenv.config({ path: envPath });
                break;
            }
        }
    }

    private displayValidationResults(result: any, options: ValidationOptions) {
        console.log('📊 Validation Results:');
        console.log('═'.repeat(50));

        // Overall status
        if (result.isValid) {
            console.log('✅ Configuration is valid');
        } else {
            console.log('❌ Configuration validation failed');
        }

        console.log(`📈 Summary: ${result.errors.length} errors, ${result.warnings.length} warnings\n`);

        // Errors
        if (result.errors.length > 0) {
            console.log('🚨 Errors:');
            result.errors.forEach((error: string, index: number) => {
                console.log(`   ${index + 1}. ${error}`);
            });
            console.log();
        }

        // Missing required variables
        if (result.missingRequired.length > 0) {
            console.log('📋 Missing Required Variables:');
            result.missingRequired.forEach((variable: string) => {
                console.log(`   • ${variable}`);
            });
            console.log();
        }

        // Invalid values
        if (result.invalidValues.length > 0) {
            console.log('⚠️  Invalid Values:');
            result.invalidValues.forEach((variable: string) => {
                console.log(`   • ${variable}`);
            });
            console.log();
        }

        // Warnings
        if (result.warnings.length > 0) {
            console.log('⚠️  Warnings:');
            result.warnings.forEach((warning: string, index: number) => {
                console.log(`   ${index + 1}. ${warning}`);
            });
            console.log();
        }

        // Verbose output
        if (options.verbose) {
            this.displayVerboseInformation();
        }

        // Recommendations
        this.displayRecommendations(result, options);
    }

    private displayVerboseInformation() {
        console.log('🔍 Detailed Configuration:');
        console.log('─'.repeat(30));

        const config = this.validationService.getConfigWithDefaults();

        const sections = [
            {
                title: 'Database',
                vars: ['DATABASE_URL'],
            },
            {
                title: 'Redis',
                vars: ['REDIS_URL', 'REDIS_HOST', 'REDIS_PORT'],
            },
            {
                title: 'Server',
                vars: ['PORT', 'NODE_ENV', 'APP_NAME'],
            },
            {
                title: 'Security',
                vars: ['JWT_SECRET', 'TOKEN_ENCRYPTION_KEY'],
            },
            {
                title: 'GitHub',
                vars: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITHUB_CALLBACK_URL'],
            },
            {
                title: 'Email',
                vars: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'EMAIL_FROM'],
            },
        ];

        sections.forEach(section => {
            console.log(`\n${section.title}:`);
            section.vars.forEach(varName => {
                const value = (config as any)[varName];
                const displayValue = this.maskSensitiveValue(varName, value);
                const status = value ? '✓' : '✗';
                console.log(`   ${status} ${varName}: ${displayValue || 'not set'}`);
            });
        });

        console.log();
    }

    private maskSensitiveValue(varName: string, value: string): string {
        const sensitiveVars = [
            'JWT_SECRET',
            'TOKEN_ENCRYPTION_KEY',
            'GITHUB_CLIENT_SECRET',
            'SMTP_PASS',
            'DATABASE_URL',
        ];

        if (sensitiveVars.includes(varName) && value) {
            return value.length > 8 ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : '***';
        }

        return value;
    }

    private displayRecommendations(result: any, options: ValidationOptions) {
        console.log('💡 Recommendations:');
        console.log('─'.repeat(20));

        if (result.isValid) {
            console.log('✨ Your configuration looks good!');

            if (result.warnings.length > 0) {
                console.log('📝 Consider addressing the warnings above for optimal performance.');
            }
        } else {
            console.log('🔧 To fix your configuration:');
            console.log('   1. Set all missing required environment variables');
            console.log('   2. Fix invalid values identified above');
            console.log('   3. Run this validator again to verify fixes');
        }

        const nodeEnv = process.env.NODE_ENV;
        if (nodeEnv === 'production') {
            console.log('\n🏭 Production Environment Checklist:');
            console.log('   • Ensure all secrets are properly set');
            console.log('   • Verify database connection string');
            console.log('   • Check CORS origins are correctly configured');
            console.log('   • Confirm email service is properly configured');
            console.log('   • Validate monitoring services (Sentry, etc.)');
        }

        console.log('\n📚 For more information, see: docs/deployment-guide.md');
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const options: ValidationOptions = {};

    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '--environment':
            case '-e':
                options.environment = args[++i];
                break;
            case '--env-file':
            case '-f':
                options.envFile = args[++i];
                break;
            case '--strict':
            case '-s':
                options.strict = true;
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--help':
            case '-h':
                displayHelp();
                process.exit(0);
                break;
            default:
                console.error(`Unknown option: ${arg}`);
                displayHelp();
                process.exit(1);
        }
    }

    try {
        const validator = new ConfigurationValidator();
        const exitCode = await validator.validateConfiguration(options);
        process.exit(exitCode);
    } catch (error) {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    }
}

function displayHelp() {
    console.log(`
🔧 GitSink Configuration Validator

Usage: npm run config:validate [options]

Options:
  -e, --environment <env>    Load configuration for specific environment (dev, staging, prod)
  -f, --env-file <file>      Load specific .env file
  -s, --strict               Fail on warnings in addition to errors
  -v, --verbose              Show detailed configuration information
  -h, --help                 Show this help message

Examples:
  npm run config:validate                           # Validate current environment
  npm run config:validate -e production            # Validate production environment
  npm run config:validate -f .env.staging          # Validate specific env file
  npm run config:validate -v                       # Verbose output
  npm run config:validate -e production -s         # Strict validation for production

Exit Codes:
  0 - Configuration is valid
  1 - Configuration has errors or validation failed
`);
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

export { ConfigurationValidator, ValidationOptions };