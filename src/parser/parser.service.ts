import { Injectable, Logger } from '@nestjs/common';
import matter from 'gray-matter';
import { PortfolioMetadataSchema } from './types/portfolio.schema';
import {
  ParseResult,
  ParserOptions,
  ParseError,
  ParseWarning,
  ParseMetadata,
  PortfolioMetadata,
  ValidationContext,
} from './types/portfolio.types';
import { ZodError, ZodIssue } from 'zod';

@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);
  private readonly defaultOptions: ParserOptions = {
    validationLevel: 'lenient',
    allowCustomFields: true,
    enableRecovery: true,
    maxRecoveryAttempts: 3,
    schemaVersion: '1.0.0',
    customValidators: {},
  };

  /**
   * Parse Portfolio.md content with enhanced error handling and recovery
   */
  parseMarkdown(md: string, options: ParserOptions = {}): ParseResult {
    const startTime = Date.now();
    const mergedOptions = { ...this.defaultOptions, ...options };
    const warnings: ParseWarning[] = [];
    let recoveryAttempts = 0;

    try {
      // Parse frontmatter
      const parsedMatter = this.parseFrontmatter(md);
      if (!parsedMatter.success) {
        return {
          valid: false,
          errors: parsedMatter.errors,
          warnings,
        };
      }

      let rawData = {
        ...parsedMatter.data,
        body: parsedMatter.content.trim(),
        validatedAt: new Date().toISOString(),
        schemaVersion: mergedOptions.schemaVersion,
      };

      // Pre-process to clean up empty strings
      if (mergedOptions.validationLevel === 'lenient') {
        rawData = this.preprocessEmptyStrings(rawData, warnings);
      }

      // Attempt validation with recovery
      let validationResult = PortfolioMetadataSchema.safeParse(rawData);

      // Only attempt recovery in lenient mode
      while (
        !validationResult.success &&
        mergedOptions.enableRecovery &&
        mergedOptions.validationLevel === 'lenient' &&
        recoveryAttempts < mergedOptions.maxRecoveryAttempts!
      ) {
        recoveryAttempts++;
        this.logger.debug(
          `Attempting recovery ${recoveryAttempts}/${mergedOptions.maxRecoveryAttempts}`,
        );

        const recoveryResult = this.attemptRecovery(rawData, validationResult.error, mergedOptions);
        rawData = recoveryResult.data;
        warnings.push(...recoveryResult.warnings);

        validationResult = PortfolioMetadataSchema.safeParse(rawData);
      }

      const parseTime = Date.now() - startTime;
      const metadata: ParseMetadata = {
        parseTime,
        schemaVersion: mergedOptions.schemaVersion!,
        validationLevel: mergedOptions.validationLevel!,
        recoveryAttempts,
        customFieldsFound: this.extractCustomFields(rawData),
      };

      if (!validationResult.success) {
        const errors = this.formatZodErrors(validationResult.error, mergedOptions);

        // If lenient mode, try to return partial data
        if (mergedOptions.validationLevel === 'lenient') {
          const recoveredData = this.extractValidData(rawData, validationResult.error);
          if (recoveredData && (recoveredData.title || recoveredData.description)) {
            warnings.push({
              message: 'Partial data recovered due to validation errors',
              code: 'PARTIAL_RECOVERY',
              suggestion: 'Review and fix validation errors for complete data',
            });

            return {
              valid: false,
              errors,
              warnings,
              recoveredData,
            };
          }
        }

        return {
          valid: false,
          errors,
          warnings,
        };
      }

      // Add performance warnings
      if (parseTime > 100) {
        warnings.push({
          message: `Parsing took ${parseTime}ms, consider optimizing Portfolio.md structure`,
          code: 'PERFORMANCE_WARNING',
          suggestion: 'Reduce complexity or size of Portfolio.md file',
        });
      }

      // Add custom validation warnings
      const customValidationWarnings = this.validateCustomMetadata(
        validationResult.data,
        mergedOptions,
      );
      warnings.push(...customValidationWarnings);

      // Add custom field warnings
      const customFields = this.extractCustomFields(rawData);
      if (customFields.length > 10) {
        warnings.push({
          message: `Found ${customFields.length} custom fields, consider using nested objects`,
          code: 'CUSTOM_FIELDS_WARNING',
          suggestion: 'Group related custom fields under nested objects',
        });
      }

      return {
        valid: true,
        data: validationResult.data,
        warnings,
        metadata,
      };
    } catch (error) {
      const parseTime = Date.now() - startTime;
      this.logger.error(
        `Unexpected error during parsing: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        valid: false,
        errors: [
          {
            message: `Unexpected parsing error: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
            code: 'UNEXPECTED_ERROR',
            severity: 'critical' as const,
          },
        ],
        warnings,
      };
    }
  }

  /**
   * Parse frontmatter with error handling
   */
  private parseFrontmatter(
    md: string,
  ): { success: true; data: any; content: string } | { success: false; errors: ParseError[] } {
    try {
      const parsedMatter = matter(md);
      return {
        success: true,
        data: parsedMatter.data,
        content: parsedMatter.content,
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            message: `Failed to parse frontmatter: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`,
            code: 'FRONTMATTER_PARSE_ERROR',
            severity: 'critical' as const,
          },
        ],
      };
    }
  }

  /**
   * Attempt to recover from validation errors
   */
  private attemptRecovery(
    data: any,
    error: ZodError,
    options: ParserOptions,
  ): { data: any; warnings: ParseWarning[] } {
    const warnings: ParseWarning[] = [];
    const recoveredData = { ...data };

    for (const issue of error.errors) {
      const fieldPath = issue.path.join('.');

      // Check for empty strings regardless of error code
      const value = this.getNestedValue(recoveredData, issue.path);
      if (typeof value === 'string' && value.trim().length === 0) {
        const fieldName = issue.path[issue.path.length - 1] as string;
        const requiredFields = ['title', 'description'];

        if (requiredFields.includes(fieldName)) {
          // For required fields, provide a default value
          const defaultValue =
            fieldName === 'title' ? 'Untitled Project' : 'No description provided';
          this.setNestedValue(recoveredData, issue.path, defaultValue);
          warnings.push({
            field: fieldPath,
            message: `Replaced empty ${fieldName} with default value`,
            code: 'EMPTY_STRING_RECOVERY',
            suggestion: `Provide a meaningful ${fieldName}`,
          });
        } else {
          // For optional fields, remove them
          this.setNestedValue(recoveredData, issue.path, undefined);
          warnings.push({
            field: fieldPath,
            message: `Removed empty string for field '${fieldPath}'`,
            code: 'EMPTY_STRING_RECOVERY',
            suggestion: `Provide a value for field '${fieldPath}' or remove it`,
          });
        }
        continue; // Skip the switch statement for this issue
      }

      switch (issue.code) {
        case 'invalid_type':
          const recovered = this.recoverInvalidType(recoveredData, issue);
          if (recovered.success) {
            warnings.push({
              field: fieldPath,
              message: `Auto-corrected type for field '${fieldPath}': ${recovered.message}`,
              code: 'TYPE_RECOVERY',
              suggestion: `Update field '${fieldPath}' to use correct type`,
            });
          }
          break;

        case 'invalid_string':
          if (issue.validation === 'url') {
            const urlRecovered = this.recoverInvalidUrl(recoveredData, issue);
            if (urlRecovered.success) {
              warnings.push({
                field: fieldPath,
                message: `Auto-corrected URL for field '${fieldPath}'`,
                code: 'URL_RECOVERY',
                suggestion: `Verify the corrected URL for field '${fieldPath}'`,
              });
            }
          }
          break;

        case 'too_small':
          const value = this.getNestedValue(recoveredData, issue.path);
          if (typeof value === 'string' && value.trim().length === 0) {
            const fieldName = issue.path[issue.path.length - 1] as string;
            const requiredFields = ['title', 'description'];

            if (requiredFields.includes(fieldName)) {
              // For required fields, provide a default value
              const defaultValue =
                fieldName === 'title' ? 'Untitled Project' : 'No description provided';
              this.setNestedValue(recoveredData, issue.path, defaultValue);
              warnings.push({
                field: fieldPath,
                message: `Replaced empty ${fieldName} with default value`,
                code: 'EMPTY_STRING_RECOVERY',
                suggestion: `Provide a meaningful ${fieldName}`,
              });
            } else {
              // For optional fields, remove them
              this.setNestedValue(recoveredData, issue.path, undefined);
              warnings.push({
                field: fieldPath,
                message: `Removed empty string for field '${fieldPath}'`,
                code: 'EMPTY_STRING_RECOVERY',
                suggestion: `Provide a value for field '${fieldPath}' or remove it`,
              });
            }
          }
          break;
      }
    }

    return { data: recoveredData, warnings };
  }

  /**
   * Recover from invalid type errors
   */
  private recoverInvalidType(data: any, issue: ZodIssue): { success: boolean; message?: string } {
    const value = this.getNestedValue(data, issue.path);

    // Handle invalid_type issues
    if (issue.code === 'invalid_type') {
      const invalidTypeIssue = issue as any; // Type assertion for expected property

      if (invalidTypeIssue.expected === 'boolean' && typeof value === 'string') {
        const boolValue = value.toLowerCase();
        if (['true', 'yes', '1', 'on'].includes(boolValue)) {
          this.setNestedValue(data, issue.path, true);
          return { success: true, message: `converted '${value}' to true` };
        } else if (['false', 'no', '0', 'off'].includes(boolValue)) {
          this.setNestedValue(data, issue.path, false);
          return { success: true, message: `converted '${value}' to false` };
        }
      }

      if (invalidTypeIssue.expected === 'number' && typeof value === 'string') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          this.setNestedValue(data, issue.path, numValue);
          return {
            success: true,
            message: `converted '${value}' to ${numValue}`,
          };
        }
      }

      if (invalidTypeIssue.expected === 'array' && typeof value === 'string') {
        // Try to split comma-separated values
        const arrayValue = value
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        if (arrayValue.length > 0) {
          this.setNestedValue(data, issue.path, arrayValue);
          return {
            success: true,
            message: `converted comma-separated string to array`,
          };
        }
      }
    }

    return { success: false };
  }

  /**
   * Recover from invalid URL errors
   */
  private recoverInvalidUrl(data: any, issue: ZodIssue): { success: boolean } {
    const value = this.getNestedValue(data, issue.path);

    if (typeof value === 'string') {
      // Try to fix common URL issues
      let fixedUrl = value.trim();

      // Add protocol if missing
      if (!/^https?:\/\//.test(fixedUrl) && fixedUrl.includes('.')) {
        fixedUrl = `https://${fixedUrl}`;
      }

      // Try to validate the fixed URL
      try {
        new URL(fixedUrl);
        this.setNestedValue(data, issue.path, fixedUrl);
        return { success: true };
      } catch {
        // If still invalid, remove the field
        this.setNestedValue(data, issue.path, undefined);
        return { success: true };
      }
    }

    return { success: false };
  }

  /**
   * Extract valid data from failed validation
   */
  private extractValidData(data: any, error: ZodError): Partial<PortfolioMetadata> | null {
    const validData: any = {};
    const errorPaths = new Set(error.errors.map(e => e.path.join('.')));

    // Copy fields that don't have errors
    for (const [key, value] of Object.entries(data)) {
      if (!errorPaths.has(key)) {
        validData[key] = value;
      }
    }

    // Ensure we have at least title or description
    if (validData.title || validData.description) {
      return validData;
    }

    return null;
  }

  /**
   * Format Zod errors into ParseError format
   */
  private formatZodErrors(error: ZodError, options: ParserOptions): ParseError[] {
    return error.errors.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code.toUpperCase(),
      severity: options.validationLevel === 'strict' ? 'critical' : 'error',
    }));
  }

  /**
   * Extract custom field names
   */
  private extractCustomFields(data: any): string[] {
    const standardFields = new Set([
      'title',
      'description',
      'tags',
      'featured',
      'published',
      'demoUrl',
      'repoUrl',
      'icon',
      'image',
      'category',
      'order',
      'githubSync',
      'version',
      'license',
      'status',
      'visibility',
      'priority',
      'startDate',
      'endDate',
      'lastUpdated',
      'homepage',
      'documentation',
      'changelog',
      'issues',
      'wiki',
      'socialLinks',
      'technologyStack',
      'requirements',
      'installation',
      'usage',
      'metrics',
      'contributors',
      'sponsors',
      'acknowledgments',
      'seo',
      'custom',
      'body',
      'schemaVersion',
      'validatedAt',
    ]);

    // Count top-level custom fields
    const topLevelCustomFields = Object.keys(data).filter(key => !standardFields.has(key));

    // Count fields inside the custom object
    const customObjectFields =
      data.custom && typeof data.custom === 'object' ? Object.keys(data.custom) : [];

    return [...topLevelCustomFields, ...customObjectFields];
  }

  /**
   * Get nested value from object using path array
   */
  private getNestedValue(obj: any, path: (string | number)[]): any {
    return path.reduce((current, key) => current?.[key], obj);
  }

  /**
   * Set nested value in object using path array
   */
  private setNestedValue(obj: any, path: (string | number)[], value: any): void {
    const lastKey = path[path.length - 1];
    const parent = path.slice(0, -1).reduce((current, key) => {
      if (current[key] === undefined) {
        current[key] = {};
      }
      return current[key];
    }, obj);

    if (value === undefined) {
      delete parent[lastKey];
    } else {
      parent[lastKey] = value;
    }
  }

  /**
   * Validate custom metadata against custom validators
   */
  private validateCustomMetadata(data: any, options: ParserOptions): ParseWarning[] {
    const warnings: ParseWarning[] = [];

    if (data.custom && options.customValidators) {
      for (const [field, validator] of Object.entries(options.customValidators)) {
        if (data.custom[field] !== undefined) {
          try {
            if (!validator(data.custom[field])) {
              warnings.push({
                field: `custom.${field}`,
                message: `Custom validation failed for field '${field}'`,
                code: 'CUSTOM_VALIDATION_FAILED',
                suggestion: `Review the value for custom field '${field}'`,
              });
            }
          } catch (error) {
            warnings.push({
              field: `custom.${field}`,
              message: `Custom validator error for field '${field}': ${error}`,
              code: 'CUSTOM_VALIDATOR_ERROR',
              suggestion: `Check the custom validator for field '${field}'`,
            });
          }
        }
      }
    }

    return warnings;
  }

  /**
   * Get parser performance metrics
   */
  getPerformanceMetrics(): { averageParseTime: number; totalParses: number } {
    // This would be implemented with actual metrics collection
    return {
      averageParseTime: 0,
      totalParses: 0,
    };
  }

  /**
   * Validate schema version compatibility
   */
  validateSchemaVersion(version: string): boolean {
    const supportedVersions = ['1.0.0', '1.1.0'];
    return supportedVersions.includes(version);
  }

  /**
   * Pre-process data to clean up empty strings
   */
  private preprocessEmptyStrings(data: any, warnings: ParseWarning[]): any {
    const processed = { ...data };
    const requiredFields = ['title', 'description'];

    for (const [key, value] of Object.entries(processed)) {
      if (typeof value === 'string' && value.trim().length === 0) {
        if (requiredFields.includes(key)) {
          // For required fields, provide a default value
          const defaultValue = key === 'title' ? 'Untitled Project' : 'No description provided';
          processed[key] = defaultValue;
          warnings.push({
            field: key,
            message: `Replaced empty ${key} with default value`,
            code: 'EMPTY_STRING_RECOVERY',
            suggestion: `Provide a meaningful ${key}`,
          });
        } else {
          // For optional fields, remove them
          delete processed[key];
          warnings.push({
            field: key,
            message: `Removed empty string for field '${key}'`,
            code: 'EMPTY_STRING_RECOVERY',
            suggestion: `Provide a value for field '${key}' or remove it`,
          });
        }
      }
    }

    return processed;
  }
}
