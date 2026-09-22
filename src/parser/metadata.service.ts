import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import {
  CustomMetadataEntry,
  MetadataSearchOptions,
  MetadataStatistics,
  MetadataValidationResult,
  MetadataVersion,
} from './types/metadata.types';
import { PortfolioMetadata } from './types/portfolio.types';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';

@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Store custom metadata for a project with versioning
   */
  async storeCustomMetadata(
    projectId: string,
    metadata: Record<string, any>,
    userId: string,
    version?: number,
  ): Promise<CustomMetadataEntry> {
    try {
      // Get the next version number if not provided
      if (!version) {
        const latestVersion = await this.prisma.customMetadata.findFirst({
          where: { projectId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        version = (latestVersion?.version || 0) + 1;
      }

      // Validate and sanitize metadata
      const validationResult = await this.validateMetadata(metadata);
      if (!validationResult.isValid) {
        throw new Error(`Metadata validation failed: ${validationResult.errors.join(', ')}`);
      }

      const sanitizedMetadata = this.sanitizeMetadata(metadata);

      // Store metadata entry
      const metadataEntry = await this.prisma.customMetadata.create({
        data: {
          projectId,
          userId,
          version,
          metadata: sanitizedMetadata as Prisma.InputJsonValue,
          hash: this.generateMetadataHash(sanitizedMetadata),
          size: JSON.stringify(sanitizedMetadata).length,
          fieldCount: this.countFields(sanitizedMetadata),
          createdAt: new Date(),
        },
      });

      // Update project's current metadata reference
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          customMetadata: sanitizedMetadata as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });

      // Clear cache
      await this.clearMetadataCache(projectId);

      this.logger.log(`Stored custom metadata for project ${projectId}, version ${version}`);

      return {
        id: metadataEntry.id,
        projectId: metadataEntry.projectId,
        userId: metadataEntry.userId,
        version: metadataEntry.version,
        metadata: sanitizedMetadata,
        hash: metadataEntry.hash,
        size: metadataEntry.size,
        fieldCount: metadataEntry.fieldCount,
        createdAt: metadataEntry.createdAt,
      };
    } catch (error) {
      this.logger.error(`Failed to store custom metadata for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve custom metadata for a project
   */
  async getCustomMetadata(
    projectId: string,
    version?: number,
  ): Promise<CustomMetadataEntry | null> {
    try {
      const cacheKey = `metadata:${projectId}:${version || 'latest'}`;
      const cached = await this.cache.get<CustomMetadataEntry>(cacheKey);
      if (cached) {
        return cached;
      }

      const whereClause: Prisma.CustomMetadataWhereInput = { projectId };
      if (version) {
        whereClause.version = version;
      }

      const metadataEntry = await this.prisma.customMetadata.findFirst({
        where: whereClause,
        orderBy: { version: 'desc' },
      });

      if (!metadataEntry) {
        return null;
      }

      const result: CustomMetadataEntry = {
        id: metadataEntry.id,
        projectId: metadataEntry.projectId,
        userId: metadataEntry.userId,
        version: metadataEntry.version,
        metadata: metadataEntry.metadata as Record<string, any>,
        hash: metadataEntry.hash,
        size: metadataEntry.size,
        fieldCount: metadataEntry.fieldCount,
        createdAt: metadataEntry.createdAt,
      };

      // Cache for 1 hour
      await this.cache.set(cacheKey, result, 3600);

      return result;
    } catch (error) {
      this.logger.error(`Failed to retrieve custom metadata for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get metadata version history for a project
   */
  async getMetadataHistory(
    projectId: string,
    limit: number = 10,
    offset: number = 0,
  ): Promise<MetadataVersion[]> {
    try {
      const cacheKey = `metadata:history:${projectId}:${limit}:${offset}`;
      const cached = await this.cache.get<MetadataVersion[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const entries = await this.prisma.customMetadata.findMany({
        where: { projectId },
        orderBy: { version: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          version: true,
          hash: true,
          size: true,
          fieldCount: true,
          createdAt: true,
          userId: true,
        },
      });

      const history: MetadataVersion[] = entries.map(entry => ({
        id: entry.id,
        version: entry.version,
        hash: entry.hash,
        size: entry.size,
        fieldCount: entry.fieldCount,
        createdAt: entry.createdAt,
        userId: entry.userId,
      }));

      // Cache for 30 minutes
      await this.cache.set(cacheKey, history, 1800);

      return history;
    } catch (error) {
      this.logger.error(`Failed to retrieve metadata history for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Compare two metadata versions
   */
  async compareMetadataVersions(
    projectId: string,
    version1: number,
    version2: number,
  ): Promise<{
    added: Record<string, any>;
    removed: Record<string, any>;
    modified: Record<string, { old: any; new: any }>;
  }> {
    try {
      const [metadata1, metadata2] = await Promise.all([
        this.getCustomMetadata(projectId, version1),
        this.getCustomMetadata(projectId, version2),
      ]);

      if (!metadata1 || !metadata2) {
        throw new Error('One or both metadata versions not found');
      }

      return this.diffMetadata(metadata1.metadata, metadata2.metadata);
    } catch (error) {
      this.logger.error(`Failed to compare metadata versions for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Search projects by custom metadata
   */
  async searchByMetadata(userId: string, searchOptions: MetadataSearchOptions): Promise<string[]> {
    try {
      const { field, value, operator = 'equals', dataType = 'string' } = searchOptions;

      switch (operator) {
        case 'equals':
          const equalsProjects = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
            `SELECT id FROM "Project" WHERE "ownerId" = $1 AND "customMetadata"->>'${field}' = $2`,
            userId,
            String(value),
          );
          return equalsProjects.map(p => p.id);
        case 'contains':
          if (dataType === 'string') {
            // Use raw query for string contains
            const projects = await this.prisma.$queryRaw<{ id: string }[]>`
              SELECT id FROM "Project" 
              WHERE "ownerId" = ${userId}
              AND "customMetadata"->>${field} ILIKE ${`%${value}%`}
            `;
            return projects.map(p => p.id);
          }
          break;
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
          if (dataType === 'number') {
            const op =
              operator === 'gt' ? '>' : operator === 'gte' ? '>=' : operator === 'lt' ? '<' : '<=';
            const projects = await this.prisma.$queryRaw<{ id: string }[]>`
              SELECT id FROM "Project" 
              WHERE "ownerId" = ${userId}
              AND ("customMetadata"->>${field})::numeric ${Prisma.raw(op)} ${value}
            `;
            return projects.map(p => p.id);
          }
          break;
        case 'in':
          if (Array.isArray(value)) {
            const placeholders = value.map((_, i) => `$${i + 2}`).join(',');
            const inProjects = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
              `SELECT id FROM "Project" WHERE "ownerId" = $1 AND "customMetadata"->>'${field}' IN (${placeholders})`,
              userId,
              ...value.map(String),
            );
            return inProjects.map(p => p.id);
          }
          break;
        case 'exists':
          const existsProjects = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
            'SELECT id FROM "Project" WHERE "ownerId" = $1 AND "customMetadata" ? $2',
            userId,
            field,
          );
          return existsProjects.map(p => p.id);
      }

      // If no specific operator matched, return empty array
      return [];
    } catch (error) {
      this.logger.error('Failed to search by metadata:', error);
      throw error;
    }
  }

  /**
   * Get metadata statistics for a user
   */
  async getMetadataStatistics(userId: string): Promise<MetadataStatistics> {
    try {
      const cacheKey = `metadata:stats:${userId}`;
      const cached = await this.cache.get<MetadataStatistics>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get basic counts
      const [projectsWithMetadata, totalMetadataEntries, avgFieldCount] = await Promise.all([
        this.prisma.project.count({
          where: {
            ownerId: userId,
            customMetadata: { not: Prisma.DbNull },
          },
        }),
        this.prisma.customMetadata.count({
          where: { userId },
        }),
        this.prisma.customMetadata.aggregate({
          where: { userId },
          _avg: { fieldCount: true },
        }),
      ]);

      // Get most common fields
      const commonFields = await this.getMostCommonFields(userId);

      // Get size statistics
      const sizeStats = await this.prisma.customMetadata.aggregate({
        where: { userId },
        _avg: { size: true },
        _max: { size: true },
        _min: { size: true },
      });

      const statistics: MetadataStatistics = {
        projectsWithMetadata,
        totalMetadataEntries,
        averageFieldCount: Math.round(avgFieldCount._avg.fieldCount || 0),
        mostCommonFields: commonFields,
        averageSize: Math.round(sizeStats._avg.size || 0),
        maxSize: sizeStats._max.size || 0,
        minSize: sizeStats._min.size || 0,
      };

      // Cache for 1 hour
      await this.cache.set(cacheKey, statistics, 3600);

      return statistics;
    } catch (error) {
      this.logger.error(`Failed to get metadata statistics for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Delete metadata version
   */
  async deleteMetadataVersion(projectId: string, version: number, userId: string): Promise<void> {
    try {
      // Verify ownership
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, ownerId: userId },
      });

      if (!project) {
        throw new Error('Project not found or access denied');
      }

      // Delete the specific version
      await this.prisma.customMetadata.delete({
        where: {
          projectId_version: {
            projectId,
            version,
          },
        },
      });

      // If this was the latest version, update project's current metadata
      const latestVersion = await this.prisma.customMetadata.findFirst({
        where: { projectId },
        orderBy: { version: 'desc' },
      });

      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          customMetadata: latestVersion?.metadata || Prisma.DbNull,
          updatedAt: new Date(),
        },
      });

      // Clear cache
      await this.clearMetadataCache(projectId);

      this.logger.log(`Deleted metadata version ${version} for project ${projectId}`);
    } catch (error) {
      this.logger.error('Failed to delete metadata version:', error);
      throw error;
    }
  }

  /**
   * Validate metadata structure and content
   */
  private async validateMetadata(metadata: Record<string, any>): Promise<MetadataValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check size limits
    const metadataString = JSON.stringify(metadata);
    if (metadataString.length > 100000) {
      // 100KB limit
      errors.push('Metadata size exceeds 100KB limit');
    }

    // Check field count
    const fieldCount = this.countFields(metadata);
    if (fieldCount > 100) {
      warnings.push(`High field count (${fieldCount}), consider restructuring`);
    }

    // Check for reserved field names
    const reservedFields = ['id', 'createdAt', 'updatedAt', 'userId', 'projectId'];
    for (const field of Object.keys(metadata)) {
      if (reservedFields.includes(field)) {
        errors.push(`Field '${field}' is reserved and cannot be used`);
      }
    }

    // Check for potentially dangerous content
    const dangerousPatterns = [/<script/i, /javascript:/i, /on\w+\s*=/i, /eval\s*\(/i];

    const checkValue = (value: any, path: string = '') => {
      if (typeof value === 'string') {
        for (const pattern of dangerousPatterns) {
          if (pattern.test(value)) {
            warnings.push(`Potentially dangerous content detected in ${path || 'metadata'}`);
            break;
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
          checkValue(val, path ? `${path}.${key}` : key);
        }
      }
    };

    checkValue(metadata);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Sanitize metadata by removing dangerous content
   */
  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized = JSON.parse(JSON.stringify(metadata));

    const sanitizeValue = (value: any): any => {
      if (typeof value === 'string') {
        // Remove potentially dangerous HTML/JS
        return value
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .replace(/eval\s*\(/gi, '');
      } else if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      } else if (typeof value === 'object' && value !== null) {
        const sanitizedObj: Record<string, any> = {};
        for (const [key, val] of Object.entries(value)) {
          sanitizedObj[key] = sanitizeValue(val);
        }
        return sanitizedObj;
      }
      return value;
    };

    return sanitizeValue(sanitized);
  }

  /**
   * Generate hash for metadata content
   */
  private generateMetadataHash(metadata: Record<string, any>): string {
    const content = JSON.stringify(metadata, Object.keys(metadata).sort());
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Count total fields in nested metadata
   */
  private countFields(obj: any): number {
    let count = 0;

    const countRecursive = (value: any) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const [key, val] of Object.entries(value)) {
          count++;
          countRecursive(val);
        }
      }
    };

    countRecursive(obj);
    return count;
  }

  /**
   * Compare two metadata objects and return differences
   */
  private diffMetadata(
    old: Record<string, any>,
    new_: Record<string, any>,
  ): {
    added: Record<string, any>;
    removed: Record<string, any>;
    modified: Record<string, { old: any; new: any }>;
  } {
    const added: Record<string, any> = {};
    const removed: Record<string, any> = {};
    const modified: Record<string, { old: any; new: any }> = {};

    // Find added and modified fields
    for (const [key, newValue] of Object.entries(new_)) {
      if (!(key in old)) {
        added[key] = newValue;
      } else if (JSON.stringify(old[key]) !== JSON.stringify(newValue)) {
        modified[key] = { old: old[key], new: newValue };
      }
    }

    // Find removed fields
    for (const [key, oldValue] of Object.entries(old)) {
      if (!(key in new_)) {
        removed[key] = oldValue;
      }
    }

    return { added, removed, modified };
  }

  /**
   * Get most common metadata fields for a user
   */
  private async getMostCommonFields(
    userId: string,
    limit: number = 10,
  ): Promise<Array<{ field: string; count: number }>> {
    try {
      // This would require a more complex query to extract all field names from JSON
      // For now, return a simplified version
      const projects = await this.prisma.project.findMany({
        where: {
          ownerId: userId,
          customMetadata: { not: Prisma.DbNull },
        },
        select: { customMetadata: true },
      });

      const fieldCounts: Record<string, number> = {};

      for (const project of projects) {
        if (project.customMetadata && typeof project.customMetadata === 'object') {
          const metadata = project.customMetadata as Record<string, any>;
          for (const field of Object.keys(metadata)) {
            fieldCounts[field] = (fieldCounts[field] || 0) + 1;
          }
        }
      }

      return Object.entries(fieldCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([field, count]) => ({ field, count }));
    } catch (error) {
      this.logger.error('Failed to get common fields:', error);
      return [];
    }
  }

  /**
   * Clear metadata cache for a project
   */
  private async clearMetadataCache(projectId: string): Promise<void> {
    const keys = [`metadata:${projectId}:latest`, `metadata:history:${projectId}:*`];

    for (const key of keys) {
      await this.cache.del(key);
    }
  }
}
