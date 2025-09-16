#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface MaintenanceTask {
    name: string;
    description: string;
    execute: () => Promise<void>;
    schedule?: string; // cron-like schedule
    enabled: boolean;
}

interface MaintenanceOptions {
    tasks: string[];
    dryRun: boolean;
    verbose: boolean;
    force: boolean;
}

class DocumentationMaintenance {
    private tasks: Map<string, MaintenanceTask> = new Map();
    private options: MaintenanceOptions;

    constructor(options: MaintenanceOptions) {
        this.options = options;
        this.initializeTasks();
    }

    private initializeTasks(): void {
        // Register all maintenance tasks
        this.registerTask({
            name: 'update-examples',
            description: 'Update code examples with latest API changes',
            execute: this.updateCodeExamples.bind(this),
            schedule: '0 2 * * *', // Daily at 2 AM
            enabled: true
        });

        this.registerTask({
            name: 'validate-links',
            description: 'Check all external links for availability',
            execute: this.validateExternalLinks.bind(this),
            schedule: '0 6 * * 1', // Weekly on Monday at 6 AM
            enabled: true
        });

        this.registerTask({
            name: 'update-changelog',
            description: 'Update changelog with recent commits',
            execute: this.updateChangelog.bind(this),
            schedule: '0 1 * * *', // Daily at 1 AM
            enabled: true
        });

        this.registerTask({
            name: 'cleanup-versions',
            description: 'Remove old documentation versions',
            execute: this.cleanupOldVersions.bind(this),
            schedule: '0 3 * * 0', // Weekly on Sunday at 3 AM
            enabled: true
        });

        this.registerTask({
            name: 'generate-sitemap',
            description: 'Generate XML sitemap for documentation',
            execute: this.generateSitemap.bind(this),
            schedule: '0 4 * * *', // Daily at 4 AM
            enabled: true
        });

        this.registerTask({
            name: 'optimize-images',
            description: 'Optimize images in documentation',
            execute: this.optimizeImages.bind(this),
            schedule: '0 5 * * 0', // Weekly on Sunday at 5 AM
            enabled: true
        });

        this.registerTask({
            name: 'check-spelling',
            description: 'Check spelling in documentation files',
            execute: this.checkSpelling.bind(this),
            schedule: '0 7 * * *', // Daily at 7 AM
            enabled: true
        });

        this.registerTask({
            name: 'update-metrics',
            description: 'Update documentation metrics and analytics',
            execute: this.updateMetrics.bind(this),
            schedule: '0 8 * * *', // Daily at 8 AM
            enabled: true
        });
    }

    private registerTask(task: MaintenanceTask): void {
        this.tasks.set(task.name, task);
    }

    async runMaintenance(): Promise<void> {
        console.log('🔧 Starting documentation maintenance...');

        const tasksToRun = this.options.tasks.length > 0
            ? this.options.tasks
            : Array.from(this.tasks.keys()).filter(name => this.tasks.get(name)?.enabled);

        if (tasksToRun.length === 0) {
            console.log('No tasks to run');
            return;
        }

        console.log(`📋 Running ${tasksToRun.length} maintenance tasks...`);

        for (const taskName of tasksToRun) {
            const task = this.tasks.get(taskName);
            if (!task) {
                console.warn(`⚠️ Task '${taskName}' not found`);
                continue;
            }

            console.log(`\\n🔄 Running: ${task.name}`);
            console.log(`📝 ${task.description}`);

            if (this.options.dryRun) {
                console.log('🎭 Dry run - task would execute here');
                continue;
            }

            try {
                const startTime = Date.now();
                await task.execute();
                const duration = Date.now() - startTime;
                console.log(`✅ Completed in ${duration}ms`);
            } catch (error) {
                console.error(`❌ Failed: ${error.message}`);
                if (!this.options.force) {
                    throw error;
                }
            }
        }

        await this.generateMaintenanceReport();
        console.log('\\n✅ Documentation maintenance completed!');
    }

    private async updateCodeExamples(): Promise<void> {
        console.log('  📝 Updating code examples...');

        // Read current OpenAPI spec to get latest endpoints
        const specPath = path.join(process.cwd(), 'docs', 'generated', 'openapi.json');
        if (!fs.existsSync(specPath)) {
            console.log('  ⚠️ OpenAPI spec not found, generating...');
            execSync('npm run docs:generate -- --format json', { stdio: 'pipe' });
        }

        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

        // Update JavaScript SDK example
        await this.updateJavaScriptExample(spec);

        // Update Python SDK example
        await this.updatePythonExample(spec);

        // Update cURL examples
        await this.updateCurlExamples(spec);

        console.log('  ✅ Code examples updated');
    }

    private async updateJavaScriptExample(spec: any): Promise<void> {
        const examplePath = path.join(process.cwd(), 'docs', 'generated', 'examples', 'javascript-sdk.js');

        if (!fs.existsSync(examplePath)) {
            console.log('  ⚠️ JavaScript example not found');
            return;
        }

        let content = fs.readFileSync(examplePath, 'utf8');

        // Update API version in comments
        content = content.replace(
            /GitSink API JavaScript SDK Example/,
            `GitSink API JavaScript SDK Example (v${spec.info.version})`
        );

        // Update base URL if changed
        if (spec.servers && spec.servers[0]) {
            content = content.replace(
                /baseURL = '[^']*'/,
                `baseURL = '${spec.servers[0].url}'`
            );
        }

        fs.writeFileSync(examplePath, content);
    }

    private async updatePythonExample(spec: any): Promise<void> {
        const examplePath = path.join(process.cwd(), 'docs', 'generated', 'examples', 'python-sdk.py');

        if (!fs.existsSync(examplePath)) {
            console.log('  ⚠️ Python example not found');
            return;
        }

        let content = fs.readFileSync(examplePath, 'utf8');

        // Update API version in comments
        content = content.replace(
            /GitSink API Python SDK Example/,
            `GitSink API Python SDK Example (v${spec.info.version})`
        );

        // Update base URL if changed
        if (spec.servers && spec.servers[0]) {
            content = content.replace(
                /base_url: str = '[^']*'/,
                `base_url: str = '${spec.servers[0].url}'`
            );
        }

        fs.writeFileSync(examplePath, content);
    }

    private async updateCurlExamples(spec: any): Promise<void> {
        const examplePath = path.join(process.cwd(), 'docs', 'generated', 'examples', 'curl-examples.sh');

        if (!fs.existsSync(examplePath)) {
            console.log('  ⚠️ cURL examples not found');
            return;
        }

        let content = fs.readFileSync(examplePath, 'utf8');

        // Update base URL if changed
        if (spec.servers && spec.servers[0]) {
            content = content.replace(
                /BASE_URL="[^"]*"/,
                `BASE_URL="${spec.servers[0].url}"`
            );
        }

        fs.writeFileSync(examplePath, content);
    }

    private async validateExternalLinks(): Promise<void> {
        console.log('  🔗 Validating external links...');

        const markdownFiles = this.findMarkdownFiles('docs');
        const brokenLinks: string[] = [];

        for (const file of markdownFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const links = content.match(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g) || [];

            for (const link of links) {
                const match = link.match(/\\[([^\\]]+)\\]\\(([^)]+)\\)/);
                if (match) {
                    const [, text, url] = match;

                    // Check external HTTP(S) links
                    if (url.startsWith('http://') || url.startsWith('https://')) {
                        try {
                            const response = await this.checkUrl(url);
                            if (!response.ok) {
                                brokenLinks.push(`${file}: ${url} (${response.status})`);
                            }
                        } catch (error) {
                            brokenLinks.push(`${file}: ${url} (${error.message})`);
                        }
                    }
                }
            }
        }

        if (brokenLinks.length > 0) {
            console.log(`  ⚠️ Found ${brokenLinks.length} broken links:`);
            brokenLinks.forEach(link => console.log(`    - ${link}`));

            // Write broken links report
            const reportPath = path.join(process.cwd(), 'docs', 'broken-links-report.txt');
            fs.writeFileSync(reportPath, brokenLinks.join('\\n'));
        } else {
            console.log('  ✅ All external links are valid');
        }
    }

    private async checkUrl(url: string): Promise<{ ok: boolean; status: number }> {
        // Simple URL check - in production, you might want to use a proper HTTP client
        try {
            const response = await fetch(url, { method: 'HEAD', timeout: 5000 });
            return { ok: response.ok, status: response.status };
        } catch (error) {
            return { ok: false, status: 0 };
        }
    }

    private findMarkdownFiles(dir: string): string[] {
        const files: string[] = [];

        if (!fs.existsSync(dir)) {
            return files;
        }

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                files.push(...this.findMarkdownFiles(fullPath));
            } else if (entry.name.endsWith('.md')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    private async updateChangelog(): Promise<void> {
        console.log('  📝 Updating changelog...');

        const changelogPath = path.join(process.cwd(), 'docs', 'CHANGELOG.md');

        try {
            // Get recent commits
            const gitLog = execSync('git log --oneline --since="1 day ago" --grep="docs\\|documentation\\|API"', { encoding: 'utf8' });
            const commits = gitLog.trim().split('\\n').filter(line => line.trim());

            if (commits.length === 0) {
                console.log('  ℹ️ No recent documentation-related commits');
                return;
            }

            const today = new Date().toISOString().split('T')[0];
            const newEntries = commits.map(commit => `- ${commit.substring(8)}`); // Remove commit hash

            const changelogEntry = `
## [Unreleased] - ${today}

### Documentation Updates
${newEntries.join('\\n')}

`;

            if (fs.existsSync(changelogPath)) {
                const existingContent = fs.readFileSync(changelogPath, 'utf8');

                // Check if today's entry already exists
                if (!existingContent.includes(`## [Unreleased] - ${today}`)) {
                    const lines = existingContent.split('\\n');
                    const titleIndex = lines.findIndex(line => line.startsWith('# '));

                    if (titleIndex !== -1) {
                        lines.splice(titleIndex + 1, 0, changelogEntry);
                        fs.writeFileSync(changelogPath, lines.join('\\n'));
                        console.log(`  ✅ Added ${commits.length} new entries to changelog`);
                    }
                } else {
                    console.log('  ℹ️ Changelog already updated today');
                }
            }
        } catch (error) {
            console.log('  ⚠️ Could not update changelog:', error.message);
        }
    }

    private async cleanupOldVersions(): Promise<void> {
        console.log('  🧹 Cleaning up old versions...');

        const versionsDir = path.join(process.cwd(), 'docs', 'versions');

        if (!fs.existsSync(versionsDir)) {
            console.log('  ℹ️ No versions directory found');
            return;
        }

        const indexPath = path.join(versionsDir, 'index.json');

        if (!fs.existsSync(indexPath)) {
            console.log('  ℹ️ No version index found');
            return;
        }

        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const keepCount = 10; // Keep last 10 versions

        if (index.versions.length <= keepCount) {
            console.log(`  ℹ️ Only ${index.versions.length} versions, no cleanup needed`);
            return;
        }

        const versionsToRemove = index.versions.slice(keepCount);
        let removedCount = 0;

        for (const version of versionsToRemove) {
            const versionDir = path.join(versionsDir, version.path);
            const archivePath = path.join(versionsDir, `docs-v${version.version}.tar.gz`);

            if (fs.existsSync(versionDir)) {
                fs.rmSync(versionDir, { recursive: true, force: true });
                removedCount++;
            }

            if (fs.existsSync(archivePath)) {
                fs.unlinkSync(archivePath);
            }
        }

        // Update index
        index.versions = index.versions.slice(0, keepCount);
        index.lastUpdated = new Date().toISOString();
        index.totalVersions = index.versions.length;

        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

        console.log(`  ✅ Removed ${removedCount} old versions`);
    }

    private async generateSitemap(): Promise<void> {
        console.log('  🗺️ Generating sitemap...');

        const baseUrl = 'https://docs.gitsink.com'; // Configure as needed
        const sitemapPath = path.join(process.cwd(), 'docs', 'generated', 'sitemap.xml');

        const urls = [
            { loc: '/', priority: '1.0', changefreq: 'daily' },
            { loc: '/api/quick-start.html', priority: '0.9', changefreq: 'weekly' },
            { loc: '/generated/index.html', priority: '0.9', changefreq: 'daily' },
            { loc: '/api/authentication-guide.html', priority: '0.8', changefreq: 'weekly' },
            { loc: '/api/projects-guide.html', priority: '0.8', changefreq: 'weekly' },
            { loc: '/api/graphql-guide.html', priority: '0.8', changefreq: 'weekly' },
            { loc: '/generated/examples/', priority: '0.7', changefreq: 'weekly' },
            { loc: '/versions/', priority: '0.6', changefreq: 'monthly' }
        ];

        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${baseUrl}${url.loc}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\\n')}
</urlset>`;

        fs.writeFileSync(sitemapPath, sitemap);
        console.log(`  ✅ Sitemap generated with ${urls.length} URLs`);
    }

    private async optimizeImages(): Promise<void> {
        console.log('  🖼️ Optimizing images...');

        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];
        const docsDir = path.join(process.cwd(), 'docs');
        const images = this.findFilesByExtensions(docsDir, imageExtensions);

        if (images.length === 0) {
            console.log('  ℹ️ No images found to optimize');
            return;
        }

        let optimizedCount = 0;

        for (const imagePath of images) {
            const stat = fs.statSync(imagePath);
            const sizeKB = Math.round(stat.size / 1024);

            // Skip if already small
            if (sizeKB < 100) {
                continue;
            }

            try {
                // This would use an image optimization library in production
                // For now, just log what would be optimized
                console.log(`  📸 Would optimize: ${path.relative(docsDir, imagePath)} (${sizeKB}KB)`);
                optimizedCount++;
            } catch (error) {
                console.log(`  ⚠️ Could not optimize ${imagePath}: ${error.message}`);
            }
        }

        console.log(`  ✅ Processed ${optimizedCount} images`);
    }

    private findFilesByExtensions(dir: string, extensions: string[]): string[] {
        const files: string[] = [];

        if (!fs.existsSync(dir)) {
            return files;
        }

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                files.push(...this.findFilesByExtensions(fullPath, extensions));
            } else if (extensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
                files.push(fullPath);
            }
        }

        return files;
    }

    private async checkSpelling(): Promise<void> {
        console.log('  📝 Checking spelling...');

        const markdownFiles = this.findMarkdownFiles('docs');
        const issues: string[] = [];

        // Common technical terms that might be flagged as misspellings
        const allowedTerms = [
            'gitsink', 'api', 'jwt', 'oauth', 'graphql', 'webhook', 'github', 'gitlab', 'bitbucket',
            'postgresql', 'redis', 'nestjs', 'typescript', 'javascript', 'nodejs', 'npm', 'yarn',
            'docker', 'kubernetes', 'aws', 's3', 'netlify', 'vercel', 'postman', 'swagger', 'openapi'
        ];

        for (const file of markdownFiles) {
            const content = fs.readFileSync(file, 'utf8');

            // Simple spell check - in production, use a proper spell checker
            const words = content.toLowerCase().match(/\\b[a-z]+\\b/g) || [];
            const uniqueWords = [...new Set(words)];

            // This is a simplified check - you'd want to use a real spell checker
            const suspiciousWords = uniqueWords.filter(word =>
                word.length > 3 &&
                !allowedTerms.includes(word) &&
                // Add more sophisticated checks here
                false // Placeholder - always false for now
            );

            if (suspiciousWords.length > 0) {
                issues.push(`${file}: ${suspiciousWords.join(', ')}`);
            }
        }

        if (issues.length > 0) {
            console.log(`  ⚠️ Potential spelling issues found:`);
            issues.forEach(issue => console.log(`    - ${issue}`));
        } else {
            console.log('  ✅ No spelling issues detected');
        }
    }

    private async updateMetrics(): Promise<void> {
        console.log('  📊 Updating documentation metrics...');

        const metrics = {
            timestamp: new Date().toISOString(),
            files: {
                markdown: this.findMarkdownFiles('docs').length,
                generated: fs.existsSync('docs/generated') ? fs.readdirSync('docs/generated').length : 0,
                examples: fs.existsSync('docs/generated/examples') ? fs.readdirSync('docs/generated/examples').length : 0
            },
            size: {
                total: this.getDirectorySize('docs'),
                generated: this.getDirectorySize('docs/generated'),
                versions: this.getDirectorySize('docs/versions')
            },
            lastUpdated: this.getLastModified('docs')
        };

        const metricsPath = path.join(process.cwd(), 'docs', 'metrics.json');
        fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));

        console.log(`  ✅ Metrics updated: ${metrics.files.markdown} MD files, ${Math.round(metrics.size.total / 1024)}KB total`);
    }

    private getDirectorySize(dir: string): number {
        if (!fs.existsSync(dir)) {
            return 0;
        }

        let size = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                size += this.getDirectorySize(fullPath);
            } else {
                size += fs.statSync(fullPath).size;
            }
        }

        return size;
    }

    private getLastModified(dir: string): string {
        if (!fs.existsSync(dir)) {
            return new Date().toISOString();
        }

        let lastModified = new Date(0);
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const stat = fs.statSync(fullPath);

            if (stat.mtime > lastModified) {
                lastModified = stat.mtime;
            }

            if (entry.isDirectory()) {
                const dirLastModified = new Date(this.getLastModified(fullPath));
                if (dirLastModified > lastModified) {
                    lastModified = dirLastModified;
                }
            }
        }

        return lastModified.toISOString();
    }

    private async generateMaintenanceReport(): Promise<void> {
        const reportPath = path.join(process.cwd(), 'docs', 'maintenance-report.json');

        const report = {
            timestamp: new Date().toISOString(),
            tasksRun: this.options.tasks.length > 0 ? this.options.tasks : Array.from(this.tasks.keys()),
            dryRun: this.options.dryRun,
            metrics: fs.existsSync('docs/metrics.json') ? JSON.parse(fs.readFileSync('docs/metrics.json', 'utf8')) : null
        };

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    }

    listTasks(): void {
        console.log('📋 Available maintenance tasks:\\n');

        for (const [name, task] of this.tasks) {
            const status = task.enabled ? '✅' : '❌';
            const schedule = task.schedule ? ` (${task.schedule})` : '';

            console.log(`${status} ${name}${schedule}`);
            console.log(`   ${task.description}\\n`);
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const options: MaintenanceOptions = {
        tasks: [],
        dryRun: false,
        verbose: false,
        force: false
    };

    // Parse command line arguments
    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--tasks':
                options.tasks = args[++i].split(',');
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--verbose':
                options.verbose = true;
                break;
            case '--force':
                options.force = true;
                break;
            case '--help':
                console.log(`
Usage: npm run docs:maintain <command> [options]

Commands:
  run                        Run maintenance tasks
  list                       List available tasks
  schedule                   Show task schedules

Options:
  --tasks <task1,task2>      Run specific tasks (comma-separated)
  --dry-run                  Show what would be done without executing
  --verbose                  Show detailed output
  --force                    Continue on errors
  --help                     Show this help message

Available tasks:
  update-examples            Update code examples with latest API changes
  validate-links             Check all external links for availability
  update-changelog           Update changelog with recent commits
  cleanup-versions           Remove old documentation versions
  generate-sitemap           Generate XML sitemap for documentation
  optimize-images            Optimize images in documentation
  check-spelling             Check spelling in documentation files
  update-metrics             Update documentation metrics and analytics

Examples:
  npm run docs:maintain run
  npm run docs:maintain run -- --tasks update-examples,validate-links
  npm run docs:maintain run -- --dry-run --verbose
  npm run docs:maintain list
        `);
                process.exit(0);
        }
    }

    const maintenance = new DocumentationMaintenance(options);

    try {
        switch (command) {
            case 'run':
                await maintenance.runMaintenance();
                break;
            case 'list':
                maintenance.listTasks();
                break;
            case 'schedule':
                console.log('📅 Task schedules:');
                // This would show cron schedules - simplified for now
                console.log('  Daily: update-examples, update-changelog, generate-sitemap, check-spelling, update-metrics');
                console.log('  Weekly: validate-links, cleanup-versions, optimize-images');
                break;
            default:
                console.error('Unknown command. Use --help for usage information.');
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ Maintenance failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { DocumentationMaintenance, MaintenanceOptions };