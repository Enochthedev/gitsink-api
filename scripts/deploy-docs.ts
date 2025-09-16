#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface DeploymentConfig {
    target: 'github-pages' | 's3' | 'netlify' | 'vercel' | 'local';
    buildDir: string;
    outputDir: string;
    domain?: string;
    branch?: string;
    accessKey?: string;
    secretKey?: string;
    bucket?: string;
    region?: string;
}

interface DeploymentOptions {
    environment: 'production' | 'staging' | 'development';
    skipBuild: boolean;
    skipValidation: boolean;
    dryRun: boolean;
    verbose: boolean;
}

class DocumentationDeployment {
    private config: DeploymentConfig;
    private options: DeploymentOptions;

    constructor(config: DeploymentConfig, options: DeploymentOptions) {
        this.config = config;
        this.options = options;
    }

    async deploy(): Promise<void> {
        console.log(`🚀 Starting documentation deployment to ${this.config.target}...`);
        console.log(`📍 Environment: ${this.options.environment}`);

        if (!this.options.skipBuild) {
            await this.buildDocumentation();
        }

        if (!this.options.skipValidation) {
            await this.validateDocumentation();
        }

        if (this.options.dryRun) {
            console.log('🔍 Dry run mode - no actual deployment will occur');
            await this.simulateDeployment();
            return;
        }

        switch (this.config.target) {
            case 'github-pages':
                await this.deployToGitHubPages();
                break;
            case 's3':
                await this.deployToS3();
                break;
            case 'netlify':
                await this.deployToNetlify();
                break;
            case 'vercel':
                await this.deployToVercel();
                break;
            case 'local':
                await this.deployLocally();
                break;
            default:
                throw new Error(`Unsupported deployment target: ${this.config.target}`);
        }

        await this.postDeploymentTasks();
        console.log('✅ Documentation deployment completed successfully!');
    }

    private async buildDocumentation(): Promise<void> {
        console.log('🔨 Building documentation...');

        // Ensure build directory exists
        if (!fs.existsSync(this.config.buildDir)) {
            fs.mkdirSync(this.config.buildDir, { recursive: true });
        }

        // Generate OpenAPI documentation
        console.log('📋 Generating OpenAPI specification...');
        execSync('npm run docs:generate -- --format html --format json --format yaml', {
            stdio: this.options.verbose ? 'inherit' : 'pipe'
        });

        // Validate documentation
        console.log('🔍 Validating documentation...');
        execSync('npm run docs:validate', {
            stdio: this.options.verbose ? 'pipe' : 'pipe'
        });

        // Copy static assets
        await this.copyStaticAssets();

        // Generate index page
        await this.generateIndexPage();

        console.log('✅ Documentation build completed');
    }

    private async copyStaticAssets(): Promise<void> {
        console.log('📁 Copying static assets...');

        const assetSources = [
            { src: 'docs/api', dest: 'api' },
            { src: 'docs/generated', dest: 'generated' },
            { src: 'docs/versions', dest: 'versions' },
            { src: 'docs/api-reference.md', dest: 'api-reference.md' },
            { src: 'docs/CHANGELOG.md', dest: 'CHANGELOG.md' }
        ];

        for (const asset of assetSources) {
            const srcPath = path.join(process.cwd(), asset.src);
            const destPath = path.join(this.config.buildDir, asset.dest);

            if (fs.existsSync(srcPath)) {
                await this.copyRecursive(srcPath, destPath);
                console.log(`  ✓ Copied ${asset.src} → ${asset.dest}`);
            }
        }

        // Copy favicon and other static files
        const staticFiles = [
            'favicon.ico',
            'logo.png',
            'robots.txt'
        ];

        for (const file of staticFiles) {
            const srcPath = path.join(process.cwd(), 'public', file);
            const destPath = path.join(this.config.buildDir, file);

            if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, destPath);
                console.log(`  ✓ Copied ${file}`);
            }
        }
    }

    private async copyRecursive(source: string, target: string): Promise<void> {
        const stat = fs.statSync(source);

        if (stat.isDirectory()) {
            if (!fs.existsSync(target)) {
                fs.mkdirSync(target, { recursive: true });
            }

            const entries = fs.readdirSync(source);
            for (const entry of entries) {
                const sourcePath = path.join(source, entry);
                const targetPath = path.join(target, entry);
                await this.copyRecursive(sourcePath, targetPath);
            }
        } else {
            const targetDir = path.dirname(target);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            fs.copyFileSync(source, target);
        }
    }

    private async generateIndexPage(): Promise<void> {
        console.log('📄 Generating index page...');

        const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitSink API Documentation</title>
    <meta name="description" content="Complete API documentation for GitSink - sync, enrich, and showcase your repositories">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6; 
            color: #333; 
            background: #f8f9fa;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
        .header { text-align: center; margin-bottom: 3rem; }
        .logo { width: 80px; height: 80px; margin-bottom: 1rem; }
        h1 { color: #2c3e50; margin-bottom: 0.5rem; font-size: 2.5rem; }
        .subtitle { color: #7f8c8d; font-size: 1.2rem; margin-bottom: 2rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; }
        .card { 
            background: white; 
            border-radius: 8px; 
            padding: 2rem; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .card:hover { 
            transform: translateY(-2px); 
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
        .card h3 { color: #2c3e50; margin-bottom: 1rem; }
        .card p { color: #7f8c8d; margin-bottom: 1.5rem; }
        .btn { 
            display: inline-block; 
            background: #3498db; 
            color: white; 
            padding: 0.75rem 1.5rem; 
            text-decoration: none; 
            border-radius: 5px;
            transition: background 0.2s;
        }
        .btn:hover { background: #2980b9; }
        .btn.secondary { background: #95a5a6; }
        .btn.secondary:hover { background: #7f8c8d; }
        .footer { 
            text-align: center; 
            margin-top: 3rem; 
            padding-top: 2rem; 
            border-top: 1px solid #ecf0f1;
            color: #7f8c8d;
        }
        .version-badge {
            display: inline-block;
            background: #27ae60;
            color: white;
            padding: 0.25rem 0.75rem;
            border-radius: 15px;
            font-size: 0.8rem;
            margin-left: 1rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="/logo.png" alt="GitSink Logo" class="logo" onerror="this.style.display='none'">
            <h1>GitSink API Documentation</h1>
            <p class="subtitle">
                Sync, enrich, and showcase your repositories with AI-powered insights
                <span class="version-badge">v${this.getCurrentVersion()}</span>
            </p>
        </div>

        <div class="grid">
            <div class="card">
                <h3>🚀 Quick Start</h3>
                <p>Get up and running with GitSink API in under 5 minutes. Perfect for developers new to the platform.</p>
                <a href="/api/quick-start.html" class="btn">Get Started</a>
            </div>

            <div class="card">
                <h3>📖 API Reference</h3>
                <p>Interactive Swagger UI with complete API documentation, examples, and testing capabilities.</p>
                <a href="/generated/index.html" class="btn">Browse API</a>
            </div>

            <div class="card">
                <h3>🔐 Authentication</h3>
                <p>Comprehensive guide covering API keys, JWT tokens, magic links, and OAuth integration.</p>
                <a href="/api/authentication-guide.html" class="btn">Learn Auth</a>
            </div>

            <div class="card">
                <h3>📁 Projects API</h3>
                <p>Detailed guide for syncing repositories, AI enrichment, and project management features.</p>
                <a href="/api/projects-guide.html" class="btn">Explore Projects</a>
            </div>

            <div class="card">
                <h3>🔍 GraphQL API</h3>
                <p>Flexible data fetching with GraphQL queries, mutations, and real-time subscriptions.</p>
                <a href="/api/graphql-guide.html" class="btn">Try GraphQL</a>
            </div>

            <div class="card">
                <h3>💻 SDK Examples</h3>
                <p>Ready-to-use code examples in JavaScript, Python, and cURL for quick integration.</p>
                <a href="/generated/examples/" class="btn secondary">View Examples</a>
            </div>

            <div class="card">
                <h3>📮 Postman Collection</h3>
                <p>Import our complete API collection into Postman for easy testing and exploration.</p>
                <a href="/generated/GitSink-API.postman_collection.json" class="btn secondary" download>Download</a>
            </div>

            <div class="card">
                <h3>📚 Version History</h3>
                <p>Browse previous versions of the documentation and track API changes over time.</p>
                <a href="/versions/" class="btn secondary">View Versions</a>
            </div>
        </div>

        <div class="footer">
            <p>
                Generated on ${new Date().toLocaleDateString()} | 
                <a href="https://gitsink.com">GitSink</a> | 
                <a href="https://github.com/gitsink/api">GitHub</a> | 
                <a href="mailto:support@gitsink.com">Support</a>
            </p>
        </div>
    </div>

    <script>
        // Add simple analytics if needed
        console.log('GitSink API Documentation loaded');
        
        // Track page views (replace with your analytics)
        if (typeof gtag !== 'undefined') {
            gtag('config', 'GA_MEASUREMENT_ID', {
                page_title: 'API Documentation Home',
                page_location: window.location.href
            });
        }
    </script>
</body>
</html>`;

        const indexPath = path.join(this.config.buildDir, 'index.html');
        fs.writeFileSync(indexPath, indexHtml);
    }

    private getCurrentVersion(): string {
        try {
            const packagePath = path.join(process.cwd(), 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            return packageJson.version || '1.0.0';
        } catch {
            return '1.0.0';
        }
    }

    private async validateDocumentation(): Promise<void> {
        console.log('🔍 Validating documentation before deployment...');

        try {
            execSync('npm run docs:validate', { stdio: 'pipe' });
            console.log('✅ Documentation validation passed');
        } catch (error) {
            console.error('❌ Documentation validation failed');
            throw error;
        }
    }

    private async simulateDeployment(): Promise<void> {
        console.log('🎭 Simulating deployment...');

        const files = this.getDeploymentFiles();
        console.log(`📁 Would deploy ${files.length} files:`);

        files.slice(0, 10).forEach(file => {
            console.log(`  - ${file}`);
        });

        if (files.length > 10) {
            console.log(`  ... and ${files.length - 10} more files`);
        }

        console.log(`🌐 Target: ${this.config.target}`);
        console.log(`📍 Environment: ${this.options.environment}`);
    }

    private getDeploymentFiles(): string[] {
        const files: string[] = [];

        const scanDirectory = (dir: string, basePath: string = '') => {
            if (!fs.existsSync(dir)) return;

            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.join(basePath, entry.name);

                if (entry.isDirectory()) {
                    scanDirectory(fullPath, relativePath);
                } else {
                    files.push(relativePath);
                }
            }
        };

        scanDirectory(this.config.buildDir);
        return files;
    }

    private async deployToGitHubPages(): Promise<void> {
        console.log('📚 Deploying to GitHub Pages...');

        const branch = this.config.branch || 'gh-pages';

        try {
            // Check if gh-pages branch exists
            execSync(`git show-ref --verify --quiet refs/heads/${branch}`, { stdio: 'pipe' });
        } catch {
            // Create gh-pages branch
            console.log(`Creating ${branch} branch...`);
            execSync(`git checkout --orphan ${branch}`, { stdio: 'pipe' });
            execSync('git rm -rf .', { stdio: 'pipe' });
        }

        // Switch to gh-pages branch
        execSync(`git checkout ${branch}`, { stdio: 'pipe' });

        // Copy built documentation
        execSync(`cp -r ${this.config.buildDir}/* .`, { stdio: 'pipe' });

        // Create .nojekyll file to bypass Jekyll processing
        fs.writeFileSync('.nojekyll', '');

        // Create CNAME file if domain is specified
        if (this.config.domain) {
            fs.writeFileSync('CNAME', this.config.domain);
        }

        // Commit and push
        execSync('git add .', { stdio: 'pipe' });
        execSync(`git commit -m "Deploy documentation - ${new Date().toISOString()}"`, { stdio: 'pipe' });
        execSync(`git push origin ${branch}`, { stdio: 'pipe' });

        console.log(`✅ Deployed to GitHub Pages (${branch} branch)`);

        if (this.config.domain) {
            console.log(`🌐 Available at: https://${this.config.domain}`);
        }
    }

    private async deployToS3(): Promise<void> {
        console.log('☁️ Deploying to AWS S3...');

        if (!this.config.bucket || !this.config.accessKey || !this.config.secretKey) {
            throw new Error('S3 deployment requires bucket, accessKey, and secretKey');
        }

        // Set AWS credentials
        process.env.AWS_ACCESS_KEY_ID = this.config.accessKey;
        process.env.AWS_SECRET_ACCESS_KEY = this.config.secretKey;
        process.env.AWS_DEFAULT_REGION = this.config.region || 'us-east-1';

        // Sync files to S3
        const syncCommand = `aws s3 sync ${this.config.buildDir} s3://${this.config.bucket} --delete`;

        if (this.options.verbose) {
            execSync(syncCommand, { stdio: 'inherit' });
        } else {
            execSync(syncCommand, { stdio: 'pipe' });
        }

        // Set up website configuration
        const websiteConfig = {
            IndexDocument: { Suffix: 'index.html' },
            ErrorDocument: { Key: '404.html' }
        };

        fs.writeFileSync('/tmp/website-config.json', JSON.stringify(websiteConfig));
        execSync(`aws s3api put-bucket-website --bucket ${this.config.bucket} --website-configuration file:///tmp/website-config.json`, { stdio: 'pipe' });

        console.log(`✅ Deployed to S3 bucket: ${this.config.bucket}`);
        console.log(`🌐 Available at: http://${this.config.bucket}.s3-website-${this.config.region || 'us-east-1'}.amazonaws.com`);
    }

    private async deployToNetlify(): Promise<void> {
        console.log('🌐 Deploying to Netlify...');

        // This would require Netlify CLI or API integration
        // For now, just show instructions
        console.log('📋 To deploy to Netlify:');
        console.log('1. Install Netlify CLI: npm install -g netlify-cli');
        console.log('2. Login: netlify login');
        console.log(`3. Deploy: netlify deploy --prod --dir ${this.config.buildDir}`);
    }

    private async deployToVercel(): Promise<void> {
        console.log('⚡ Deploying to Vercel...');

        // This would require Vercel CLI
        console.log('📋 To deploy to Vercel:');
        console.log('1. Install Vercel CLI: npm install -g vercel');
        console.log('2. Login: vercel login');
        console.log(`3. Deploy: vercel --prod ${this.config.buildDir}`);
    }

    private async deployLocally(): Promise<void> {
        console.log('💻 Deploying locally...');

        const outputDir = this.config.outputDir || path.join(process.cwd(), 'public');

        if (fs.existsSync(outputDir)) {
            fs.rmSync(outputDir, { recursive: true, force: true });
        }

        await this.copyRecursive(this.config.buildDir, outputDir);

        console.log(`✅ Documentation deployed to: ${outputDir}`);
        console.log('🌐 Serve locally with: npx serve public');
    }

    private async postDeploymentTasks(): Promise<void> {
        console.log('🔧 Running post-deployment tasks...');

        // Update deployment log
        const deploymentLog = {
            timestamp: new Date().toISOString(),
            environment: this.options.environment,
            target: this.config.target,
            version: this.getCurrentVersion(),
            commit: this.getGitCommit(),
            branch: this.getGitBranch()
        };

        const logPath = path.join(process.cwd(), 'docs', 'deployment-log.json');
        let logs: any[] = [];

        if (fs.existsSync(logPath)) {
            logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        }

        logs.unshift(deploymentLog);
        logs = logs.slice(0, 50); // Keep last 50 deployments

        fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

        // Ping search engines (if production)
        if (this.options.environment === 'production' && this.config.domain) {
            await this.pingSearchEngines();
        }

        console.log('✅ Post-deployment tasks completed');
    }

    private getGitCommit(): string {
        try {
            return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
        } catch {
            return 'unknown';
        }
    }

    private getGitBranch(): string {
        try {
            return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        } catch {
            return 'unknown';
        }
    }

    private async pingSearchEngines(): Promise<void> {
        console.log('🔍 Notifying search engines...');

        const sitemapUrl = `https://${this.config.domain}/sitemap.xml`;

        const searchEngines = [
            `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
            `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
        ];

        for (const url of searchEngines) {
            try {
                execSync(`curl -s "${url}"`, { stdio: 'pipe' });
                console.log(`  ✓ Pinged ${url.includes('google') ? 'Google' : 'Bing'}`);
            } catch {
                console.log(`  ⚠️ Failed to ping ${url.includes('google') ? 'Google' : 'Bing'}`);
            }
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    const config: DeploymentConfig = {
        target: 'local',
        buildDir: path.join(process.cwd(), 'docs', 'build'),
        outputDir: path.join(process.cwd(), 'public')
    };

    const options: DeploymentOptions = {
        environment: 'development',
        skipBuild: false,
        skipValidation: false,
        dryRun: false,
        verbose: false
    };

    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--target':
                config.target = args[++i] as any;
                break;
            case '--environment':
                options.environment = args[++i] as any;
                break;
            case '--build-dir':
                config.buildDir = args[++i];
                break;
            case '--output-dir':
                config.outputDir = args[++i];
                break;
            case '--domain':
                config.domain = args[++i];
                break;
            case '--branch':
                config.branch = args[++i];
                break;
            case '--bucket':
                config.bucket = args[++i];
                break;
            case '--region':
                config.region = args[++i];
                break;
            case '--skip-build':
                options.skipBuild = true;
                break;
            case '--skip-validation':
                options.skipValidation = true;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--verbose':
                options.verbose = true;
                break;
            case '--help':
                console.log(`
Usage: npm run docs:deploy [options]

Options:
  --target <target>          Deployment target (local|github-pages|s3|netlify|vercel)
  --environment <env>        Environment (production|staging|development)
  --build-dir <dir>          Build directory (default: docs/build)
  --output-dir <dir>         Output directory for local deployment
  --domain <domain>          Custom domain name
  --branch <branch>          Git branch for GitHub Pages (default: gh-pages)
  --bucket <bucket>          S3 bucket name
  --region <region>          AWS region (default: us-east-1)
  --skip-build               Skip documentation build step
  --skip-validation          Skip documentation validation
  --dry-run                  Simulate deployment without actual changes
  --verbose                  Show detailed output
  --help                     Show this help message

Environment Variables:
  AWS_ACCESS_KEY_ID          AWS access key for S3 deployment
  AWS_SECRET_ACCESS_KEY      AWS secret key for S3 deployment

Examples:
  npm run docs:deploy
  npm run docs:deploy -- --target github-pages --environment production
  npm run docs:deploy -- --target s3 --bucket my-docs-bucket --region us-west-2
  npm run docs:deploy -- --dry-run --verbose
        `);
                process.exit(0);
        }
    }

    // Set AWS credentials from environment if available
    if (process.env.AWS_ACCESS_KEY_ID) {
        config.accessKey = process.env.AWS_ACCESS_KEY_ID;
    }
    if (process.env.AWS_SECRET_ACCESS_KEY) {
        config.secretKey = process.env.AWS_SECRET_ACCESS_KEY;
    }

    const deployment = new DocumentationDeployment(config, options);

    try {
        await deployment.deploy();
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { DocumentationDeployment, DeploymentConfig, DeploymentOptions };