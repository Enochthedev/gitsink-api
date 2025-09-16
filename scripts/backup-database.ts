#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface BackupOptions {
    environment?: string;
    outputDir?: string;
    compress?: boolean;
    verbose?: boolean;
}

class DatabaseBackup {
    private environment: string;
    private outputDir: string;
    private compress: boolean;
    private verbose: boolean;

    constructor(options: BackupOptions = {}) {
        this.environment = options.environment || 'production';
        this.outputDir = options.outputDir || path.join(process.cwd(), 'backups');
        this.compress = options.compress !== false;
        this.verbose = options.verbose || false;
    }

    async createBackup(): Promise<string> {
        try {
            // Ensure backup directory exists
            if (!fs.existsSync(this.outputDir)) {
                fs.mkdirSync(this.outputDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFileName = `gitsink-backup-${this.environment}-${timestamp}.sql`;
            const backupPath = path.join(this.outputDir, backupFileName);

            this.log(`Creating database backup for ${this.environment} environment...`);

            // Get database URL from environment
            const databaseUrl = this.getDatabaseUrl();

            // Create backup using pg_dump
            const pgDumpCommand = `pg_dump "${databaseUrl}" > "${backupPath}"`;

            this.log(`Executing: ${pgDumpCommand}`);
            execSync(pgDumpCommand, { stdio: this.verbose ? 'inherit' : 'pipe' });

            // Compress backup if requested
            if (this.compress) {
                this.log('Compressing backup...');
                execSync(`gzip "${backupPath}"`, { stdio: this.verbose ? 'inherit' : 'pipe' });
                const compressedPath = `${backupPath}.gz`;

                this.log(`Backup created successfully: ${compressedPath}`);
                return compressedPath;
            }

            this.log(`Backup created successfully: ${backupPath}`);
            return backupPath;

        } catch (error) {
            console.error('Backup failed:', error);
            throw error;
        }
    }

    async restoreBackup(backupFile: string): Promise<void> {
        try {
            if (!fs.existsSync(backupFile)) {
                throw new Error(`Backup file not found: ${backupFile}`);
            }

            this.log(`Restoring database from backup: ${backupFile}`);

            // Get database URL from environment
            const databaseUrl = this.getDatabaseUrl();

            // Decompress if needed
            let sqlFile = backupFile;
            if (backupFile.endsWith('.gz')) {
                this.log('Decompressing backup...');
                const decompressedFile = backupFile.replace('.gz', '');
                execSync(`gunzip -c "${backupFile}" > "${decompressedFile}"`, {
                    stdio: this.verbose ? 'inherit' : 'pipe'
                });
                sqlFile = decompressedFile;
            }

            // Restore using psql
            const restoreCommand = `psql "${databaseUrl}" < "${sqlFile}"`;

            this.log(`Executing: ${restoreCommand}`);
            execSync(restoreCommand, { stdio: this.verbose ? 'inherit' : 'pipe' });

            // Clean up decompressed file if we created it
            if (sqlFile !== backupFile && fs.existsSync(sqlFile)) {
                fs.unlinkSync(sqlFile);
            }

            this.log('Database restored successfully');

        } catch (error) {
            console.error('Restore failed:', error);
            throw error;
        }
    }

    async listBackups(): Promise<string[]> {
        if (!fs.existsSync(this.outputDir)) {
            return [];
        }

        const files = fs.readdirSync(this.outputDir);
        return files
            .filter(file => file.startsWith('gitsink-backup-') && (file.endsWith('.sql') || file.endsWith('.sql.gz')))
            .sort()
            .reverse(); // Most recent first
    }

    async cleanupOldBackups(keepCount: number = 10): Promise<void> {
        const backups = await this.listBackups();

        if (backups.length <= keepCount) {
            this.log(`Found ${backups.length} backups, keeping all (limit: ${keepCount})`);
            return;
        }

        const toDelete = backups.slice(keepCount);
        this.log(`Cleaning up ${toDelete.length} old backups...`);

        for (const backup of toDelete) {
            const backupPath = path.join(this.outputDir, backup);
            fs.unlinkSync(backupPath);
            this.log(`Deleted: ${backup}`);
        }
    }

    private getDatabaseUrl(): string {
        // Try to get database URL from environment variables
        const envFile = `.env.${this.environment}`;

        if (fs.existsSync(envFile)) {
            const envContent = fs.readFileSync(envFile, 'utf8');
            const match = envContent.match(/DATABASE_URL=(.+)/);
            if (match) {
                return match[1].replace(/["']/g, '');
            }
        }

        // Fallback to process environment
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
            throw new Error(`DATABASE_URL not found in ${envFile} or environment variables`);
        }

        return databaseUrl;
    }

    private log(message: string): void {
        if (this.verbose) {
            console.log(`[${new Date().toISOString()}] ${message}`);
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const options: BackupOptions = {
        environment: args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'production',
        outputDir: args.find(arg => arg.startsWith('--output='))?.split('=')[1],
        compress: !args.includes('--no-compress'),
        verbose: args.includes('--verbose') || args.includes('-v'),
    };

    const backup = new DatabaseBackup(options);

    try {
        switch (command) {
            case 'create':
                const backupPath = await backup.createBackup();
                console.log(`✅ Backup created: ${backupPath}`);
                break;

            case 'restore':
                const backupFile = args[1];
                if (!backupFile) {
                    console.error('❌ Please specify backup file to restore');
                    process.exit(1);
                }
                await backup.restoreBackup(backupFile);
                console.log('✅ Database restored successfully');
                break;

            case 'list':
                const backups = await backup.listBackups();
                if (backups.length === 0) {
                    console.log('No backups found');
                } else {
                    console.log('Available backups:');
                    backups.forEach((backup, index) => {
                        console.log(`  ${index + 1}. ${backup}`);
                    });
                }
                break;

            case 'cleanup':
                const keepCount = parseInt(args[1]) || 10;
                await backup.cleanupOldBackups(keepCount);
                console.log('✅ Cleanup completed');
                break;

            default:
                console.log(`
Database Backup Utility

Usage:
  npm run backup:create [options]     Create a new backup
  npm run backup:restore <file>       Restore from backup file
  npm run backup:list                 List available backups
  npm run backup:cleanup [count]      Keep only the latest N backups (default: 10)

Options:
  --env=<environment>    Environment (default: production)
  --output=<directory>   Output directory (default: ./backups)
  --no-compress         Don't compress the backup
  --verbose, -v         Verbose output

Examples:
  npm run backup:create --env=production --verbose
  npm run backup:restore backups/gitsink-backup-production-2024-01-01.sql.gz
  npm run backup:cleanup 5
        `);
                break;
        }
    } catch (error) {
        console.error('❌ Operation failed:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { DatabaseBackup };