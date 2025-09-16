#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface VersionInfo {
    version: string;
    date: string;
    commit?: string;
    branch?: string;
    changes: string[];
}

interface DocVersioningOptions {
    version?: string;
    createArchive: boolean;
    updateIndex: boolean;
    generateChangelog: boolean;
}

class DocumentationVersioning {
    private versionsDir: string;
    private currentVersion: string;
    private options: DocVersioningOptions;

    constructor(options: DocVersioningOptions) {
        this.options = options;
        this.versionsDir = path.join(process.cwd(), 'docs', 'versions');
        this.currentVersion = options.version || this.getCurrentVersion();

        // Ensure versions directory exists
        if (!fs.existsSync(this.versionsDir)) {
            fs.mkdirSync(this.versionsDir, { recursive: true });
        }
    }

    async createVersion(): Promise<void> {
        console.log(`📦 Creating documentation version ${this.currentVersion}...`);

        const versionDir = path.join(this.versionsDir, this.currentVersion);

        if (fs.existsSync(versionDir)) {
            console.log(`⚠️  Version ${this.currentVersion} already exists. Updating...`);
        } else {
            fs.mkdirSync(versionDir, { recursive: true });
        }

        // Copy current documentation
        await this.copyDocumentation(versionDir);

        // Create version metadata
        await this.createVersionMetadata(versionDir);

        if (this.options.createArchive) {
            await this.createArchive(versionDir);
        }

        if (this.options.updateIndex) {
            await this.updateVersionIndex();
        }

        if (this.options.generateChangelog) {
            await this.generateVersionChangelog();
        }

        console.log(`✅ Documentation version ${this.currentVersion} created successfully`);
    }

    private getCurrentVersion(): string {
        try {
            // Try to get version from package.json
            const packagePath = path.join(process.cwd(), 'package.json');
            if (fs.existsSync(packagePath)) {
                const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                return packageJson.version || '1.0.0';
            }
        } catch (error) {
            console.warn('Could not read version from package.json');
        }

        // Fallback to timestamp-based version
        const now = new Date();
        return `${now.getFullYear()}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getDate().toString().padStart(2, '0')}`;
    }

    private async copyDocumentation(versionDir: string): Promise<void> {
        console.log('📋 Copying documentation files...');

        const sourcePaths = [
            'docs/api',
            'docs/generated',
            'docs/api-reference.md',
            'docs/CHANGELOG.md'
        ];

        for (const sourcePath of sourcePaths) {
            if (fs.existsSync(sourcePath)) {
                const targetPath = path.join(versionDir, path.basename(sourcePath));
                await this.copyRecursive(sourcePath, targetPath);
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
            fs.copyFileSync(source, target);
        }
    }

    private async createVersionMetadata(versionDir: string): Promise<void> {
        console.log('📝 Creating version metadata...');

        const metadata: VersionInfo = {
            version: this.currentVersion,
            date: new Date().toISOString(),
            changes: await this.detectChanges()
        };

        // Add git information if available
        try {
            metadata.commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
            metadata.branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
        } catch (error) {
            console.warn('Git information not available');
        }

        const metadataPath = path.join(versionDir, 'version.json');
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        // Create human-readable version info
        const versionInfo = `# Documentation Version ${metadata.version}

**Generated:** ${new Date(metadata.date).toLocaleString()}
**Git Commit:** ${metadata.commit || 'N/A'}
**Git Branch:** ${metadata.branch || 'N/A'}

## Changes in this version:
${metadata.changes.map(change => `- ${change}`).join('\\n')}

## Files included:
- API Reference Documentation
- Interactive Swagger UI
- Authentication Guide
- Projects API Guide
- GraphQL API Guide
- Quick Start Guide
- SDK Examples (JavaScript, Python, cURL)
- Postman Collection
`;

        const readmePath = path.join(versionDir, 'README.md');
        fs.writeFileSync(readmePath, versionInfo);
    }

    private async detectChanges(): Promise<string[]> {
        const changes: string[] = [];

        try {
            // Get git changes since last tag
            const lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
            const gitLog = execSync(`git log ${lastTag}..HEAD --oneline --grep="docs\\|documentation" --grep="API" --grep="swagger"`, { encoding: 'utf8' });

            const commits = gitLog.trim().split('\\n').filter(line => line.trim());
            changes.push(...commits.map(commit => commit.substring(8))); // Remove commit hash
        } catch (error) {
            // Fallback to generic changes
            changes.push('Updated API documentation');
            changes.push('Enhanced code examples');
            changes.push('Improved authentication guide');
        }

        // Add automatic changes based on file modifications
        const docFiles = [
            'docs/api-reference.md',
            'docs/api/authentication-guide.md',
            'docs/api/projects-guide.md',
            'docs/api/graphql-guide.md',
            'docs/api/quick-start.md'
        ];

        for (const file of docFiles) {
            if (fs.existsSync(file)) {
                const stat = fs.statSync(file);
                const daysSinceModified = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);

                if (daysSinceModified < 7) { // Modified in last week
                    changes.push(`Updated ${path.basename(file)}`);
                }
            }
        }

        return changes.length > 0 ? changes : ['Documentation updates and improvements'];
    }

    private async createArchive(versionDir: string): Promise<void> {
        console.log('🗜️  Creating documentation archive...');

        try {
            const archiveName = `docs-v${this.currentVersion}.tar.gz`;
            const archivePath = path.join(this.versionsDir, archiveName);

            execSync(`tar -czf "${archivePath}" -C "${versionDir}" .`, { stdio: 'pipe' });

            console.log(`📦 Archive created: ${archivePath}`);
        } catch (error) {
            console.warn('Could not create archive:', error.message);
        }
    }

    private async updateVersionIndex(): Promise<void> {
        console.log('📚 Updating version index...');

        const indexPath = path.join(this.versionsDir, 'index.json');
        let index: any = { versions: [] };

        if (fs.existsSync(indexPath)) {
            index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        }

        // Remove existing entry for this version
        index.versions = index.versions.filter((v: any) => v.version !== this.currentVersion);

        // Add new version entry
        const versionMetadataPath = path.join(this.versionsDir, this.currentVersion, 'version.json');
        if (fs.existsSync(versionMetadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(versionMetadataPath, 'utf8'));
            index.versions.unshift({
                version: metadata.version,
                date: metadata.date,
                commit: metadata.commit,
                branch: metadata.branch,
                path: this.currentVersion,
                latest: true
            });
        }

        // Mark all other versions as not latest
        index.versions.forEach((v: any, i: number) => {
            if (i > 0) v.latest = false;
        });

        // Sort versions by date (newest first)
        index.versions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Update index metadata
        index.lastUpdated = new Date().toISOString();
        index.totalVersions = index.versions.length;

        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

        // Create human-readable index
        const indexMd = `# Documentation Versions

This directory contains versioned documentation for the GitSink API.

## Available Versions

| Version | Date | Branch | Commit | Status |
|---------|------|--------|--------|--------|
${index.versions.map((v: any) =>
            `| [${v.version}](./${v.path}/) | ${new Date(v.date).toLocaleDateString()} | ${v.branch || 'N/A'} | ${v.commit ? v.commit.substring(0, 8) : 'N/A'} | ${v.latest ? '**Latest**' : ''} |`
        ).join('\\n')}

## Usage

Each version directory contains:
- Complete API documentation
- Interactive Swagger UI
- Code examples and guides
- Postman collection
- Version metadata

## Latest Version

The latest version is **${index.versions[0]?.version || 'N/A'}** (${new Date(index.versions[0]?.date || Date.now()).toLocaleDateString()})

Access it at: [./${index.versions[0]?.path || 'latest'}/](./${index.versions[0]?.path || 'latest'}/)
`;

        fs.writeFileSync(path.join(this.versionsDir, 'README.md'), indexMd);
    }

    private async generateVersionChangelog(): Promise<void> {
        console.log('📝 Generating version changelog...');

        const changelogPath = path.join(process.cwd(), 'docs', 'CHANGELOG.md');
        const versionMetadataPath = path.join(this.versionsDir, this.currentVersion, 'version.json');

        if (!fs.existsSync(versionMetadataPath)) {
            console.warn('Version metadata not found, skipping changelog update');
            return;
        }

        const metadata: VersionInfo = JSON.parse(fs.readFileSync(versionMetadataPath, 'utf8'));

        const changelogEntry = `
## [${metadata.version}] - ${new Date(metadata.date).toISOString().split('T')[0]}

### Documentation Updates
${metadata.changes.map(change => `- ${change}`).join('\\n')}

### Technical Details
- **Git Commit:** ${metadata.commit || 'N/A'}
- **Git Branch:** ${metadata.branch || 'N/A'}
- **Generated:** ${new Date(metadata.date).toLocaleString()}

`;

        if (fs.existsSync(changelogPath)) {
            const existingContent = fs.readFileSync(changelogPath, 'utf8');

            // Insert new entry after the main title
            const lines = existingContent.split('\\n');
            const titleIndex = lines.findIndex(line => line.startsWith('# '));

            if (titleIndex !== -1) {
                lines.splice(titleIndex + 1, 0, changelogEntry);
                fs.writeFileSync(changelogPath, lines.join('\\n'));
            } else {
                // If no title found, prepend to file
                fs.writeFileSync(changelogPath, `# Changelog${changelogEntry}\\n${existingContent}`);
            }
        } else {
            // Create new changelog
            fs.writeFileSync(changelogPath, `# Changelog${changelogEntry}`);
        }
    }

    async listVersions(): Promise<void> {
        console.log('📚 Available documentation versions:');

        const indexPath = path.join(this.versionsDir, 'index.json');

        if (!fs.existsSync(indexPath)) {
            console.log('No versions found. Create your first version with: npm run docs:version');
            return;
        }

        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

        console.log(`\\nTotal versions: ${index.totalVersions}`);
        console.log(`Last updated: ${new Date(index.lastUpdated).toLocaleString()}\\n`);

        for (const version of index.versions) {
            const status = version.latest ? ' (Latest)' : '';
            const date = new Date(version.date).toLocaleDateString();
            const commit = version.commit ? version.commit.substring(0, 8) : 'N/A';

            console.log(`📖 ${version.version}${status}`);
            console.log(`   Date: ${date}`);
            console.log(`   Commit: ${commit}`);
            console.log(`   Path: docs/versions/${version.path}/`);
            console.log('');
        }
    }

    async cleanupOldVersions(keepCount: number = 10): Promise<void> {
        console.log(`🧹 Cleaning up old versions (keeping ${keepCount} most recent)...`);

        const indexPath = path.join(this.versionsDir, 'index.json');

        if (!fs.existsSync(indexPath)) {
            console.log('No version index found');
            return;
        }

        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

        if (index.versions.length <= keepCount) {
            console.log(`Only ${index.versions.length} versions found, no cleanup needed`);
            return;
        }

        const versionsToRemove = index.versions.slice(keepCount);

        for (const version of versionsToRemove) {
            const versionDir = path.join(this.versionsDir, version.path);
            const archivePath = path.join(this.versionsDir, `docs-v${version.version}.tar.gz`);

            // Remove version directory
            if (fs.existsSync(versionDir)) {
                fs.rmSync(versionDir, { recursive: true, force: true });
                console.log(`🗑️  Removed version directory: ${version.path}`);
            }

            // Remove archive
            if (fs.existsSync(archivePath)) {
                fs.unlinkSync(archivePath);
                console.log(`🗑️  Removed archive: docs-v${version.version}.tar.gz`);
            }
        }

        // Update index
        index.versions = index.versions.slice(0, keepCount);
        index.lastUpdated = new Date().toISOString();
        index.totalVersions = index.versions.length;

        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

        console.log(`✅ Cleanup completed. Removed ${versionsToRemove.length} old versions`);
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const options: DocVersioningOptions = {
        createArchive: true,
        updateIndex: true,
        generateChangelog: true,
    };

    // Parse command line arguments
    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--version':
                options.version = args[++i];
                break;
            case '--no-archive':
                options.createArchive = false;
                break;
            case '--no-index':
                options.updateIndex = false;
                break;
            case '--no-changelog':
                options.generateChangelog = false;
                break;
            case '--help':
                console.log(`
Usage: npm run docs:version <command> [options]

Commands:
  create                     Create a new documentation version
  list                       List all available versions
  cleanup [keep-count]       Remove old versions (default: keep 10)

Options:
  --version <version>        Specify version number
  --no-archive              Skip creating tar.gz archive
  --no-index                Skip updating version index
  --no-changelog            Skip updating changelog
  --help                    Show this help message

Examples:
  npm run docs:version create
  npm run docs:version create -- --version 2.1.0
  npm run docs:version list
  npm run docs:version cleanup 5
        `);
                process.exit(0);
        }
    }

    const versioning = new DocumentationVersioning(options);

    try {
        switch (command) {
            case 'create':
                await versioning.createVersion();
                break;
            case 'list':
                await versioning.listVersions();
                break;
            case 'cleanup':
                const keepCount = parseInt(args[1]) || 10;
                await versioning.cleanupOldVersions(keepCount);
                break;
            default:
                console.error('Unknown command. Use --help for usage information.');
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { DocumentationVersioning, DocVersioningOptions };