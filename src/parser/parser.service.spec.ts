import { Test, TestingModule } from '@nestjs/testing';
import { ParserService } from './parser.service';
import { ParserOptions } from './types/portfolio.types';

describe('ParserService', () => {
  let service: ParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ParserService],
    }).compile();

    service = module.get<ParserService>(ParserService);
  });

  describe('parseMarkdown', () => {
    it('should correctly parse valid markdown with basic fields', () => {
      const md = `---
title: "Test Project"
description: "Just testing."
tags: ["test", "demo"]
featured: true
published: true
---

Some more body content.`;

      const result = service.parseMarkdown(md);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.title).toBe('Test Project');
        expect(result.data.description).toBe('Just testing.');
        expect(result.data.tags).toEqual(['test', 'demo']);
        expect(result.data.featured).toBe(true);
        expect(result.data.published).toBe(true);
        expect(result.data.body).toBe('Some more body content.');
        expect(result.data.validatedAt).toBeDefined();
        expect(result.data.schemaVersion).toBe('1.0.0');
        expect(result.metadata).toBeDefined();
        expect(result.metadata!.parseTime).toBeGreaterThan(0);
      }
    });

    it('should parse enhanced metadata fields', () => {
      const md = `---
title: "Advanced Project"
description: "A complex project with enhanced metadata"
version: "2.1.0"
license: "MIT"
status: "active"
visibility: "public"
priority: "high"
startDate: "2024-01-01T00:00:00Z"
endDate: "2024-12-31T23:59:59Z"
homepage: "https://example.com"
documentation: "https://docs.example.com"
socialLinks:
  - platform: "github"
    url: "https://github.com/user/repo"
    username: "user"
  - platform: "twitter"
    url: "https://twitter.com/user"
technologyStack:
  languages: ["TypeScript", "Python"]
  frameworks: ["NestJS", "React"]
  databases: ["PostgreSQL", "Redis"]
metrics:
  complexity: "complex"
  estimatedHours: 120
  teamSize: 3
seo:
  keywords: ["project", "demo", "test"]
  ogTitle: "Advanced Project"
  ogDescription: "A complex project demo"
custom:
  customField1: "value1"
  customField2: 42
  customField3: ["a", "b", "c"]
---

Enhanced project content.`;

      const result = service.parseMarkdown(md);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.version).toBe('2.1.0');
        expect(result.data.license).toBe('MIT');
        expect(result.data.status).toBe('active');
        expect(result.data.visibility).toBe('public');
        expect(result.data.priority).toBe('high');
        expect(result.data.startDate).toBe('2024-01-01T00:00:00Z');
        expect(result.data.socialLinks).toHaveLength(2);
        expect(result.data.socialLinks![0].platform).toBe('github');
        expect(result.data.technologyStack?.languages).toEqual(['TypeScript', 'Python']);
        expect(result.data.metrics?.complexity).toBe('complex');
        expect(result.data.seo?.keywords).toEqual(['project', 'demo', 'test']);
        expect(result.data.custom?.customField1).toBe('value1');
        expect(result.data.custom?.customField2).toBe(42);
      }
    });

    it('should return errors for missing required fields', () => {
      const md = `---
tags: ["test"]
---
Missing title and description`;

      const result = service.parseMarkdown(md);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(e => e.field === 'title')).toBe(true);
        expect(result.errors.some(e => e.field === 'description')).toBe(true);
      }
    });

    it('should handle invalid frontmatter gracefully', () => {
      const md = `---
title: "Test"
description: "Test"
invalid: yaml: content: [
---
Content`;

      const result = service.parseMarkdown(md);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe('FRONTMATTER_PARSE_ERROR');
        expect(result.errors[0].severity).toBe('critical');
      }
    });

    it('should recover from type errors in lenient mode', () => {
      const md = `---
title: "Test Project"
description: "Test description"
featured: "true"
order: "5"
tags: "tag1,tag2,tag3"
---
Content`;

      const result = service.parseMarkdown(md, { validationLevel: 'lenient' });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.featured).toBe(true);
        expect(result.data.order).toBe(5);
        expect(result.data.tags).toEqual(['tag1', 'tag2', 'tag3']);
        expect(result.warnings).toBeDefined();
        expect(result.warnings!.some(w => w.code === 'TYPE_RECOVERY')).toBe(true);
      }
    });

    it('should recover from invalid URLs', () => {
      const md = `---
title: "Test Project"
description: "Test description"
demoUrl: "example.com"
homepage: "www.example.com"
documentation: "invalid-url"
---
Content`;

      const result = service.parseMarkdown(md, { validationLevel: 'lenient' });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.demoUrl).toBe('https://example.com');
        expect(result.data.homepage).toBe('https://www.example.com');
        expect(result.data.documentation).toBeUndefined();
        expect(result.warnings!.some(w => w.code === 'URL_RECOVERY')).toBe(true);
      }
    });

    it('should handle empty strings by removing them', () => {
      const md = `---
title: "Test Project"
description: ""
category: "   "
version: ""
---
Content`;

      const result = service.parseMarkdown(md, { validationLevel: 'lenient' });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.description).toBe('No description provided');
        expect(result.data.category).toBeUndefined();
        expect(result.data.version).toBeUndefined();
        expect(result.warnings!.some(w => w.code === 'EMPTY_STRING_RECOVERY')).toBe(true);
      }
    });

    it('should return partial data in lenient mode when some fields are invalid', () => {
      const md = `---
title: "Valid Title"
description: 123
featured: "invalid-boolean"
demoUrl: "not-a-url"
validField: "this is valid"
---
Content`;

      const result = service.parseMarkdown(md, { validationLevel: 'lenient' });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.recoveredData).toBeDefined();
        expect(result.recoveredData!.title).toBe('Valid Title');
        expect((result.recoveredData as any)!.validField).toBe('this is valid');
        expect(result.warnings!.some(w => w.code === 'PARTIAL_RECOVERY')).toBe(true);
      }
    });

    it('should validate custom metadata with custom validators', () => {
      const md = `---
title: "Test Project"
description: "Test description"
custom:
  customField: "invalid-value"
  validField: "valid-value"
---
Content`;

      const customValidators = {
        customField: (value: any) => value === 'valid-value',
        validField: (value: any) => typeof value === 'string',
      };

      const result = service.parseMarkdown(md, { customValidators });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.warnings!.some(w => w.code === 'CUSTOM_VALIDATION_FAILED')).toBe(true);
        expect(result.warnings!.some(w => w.field === 'custom.customField')).toBe(true);
      }
    });

    it('should warn about performance issues with large files', () => {
      // Create a large markdown file
      const largeContent = 'x'.repeat(10000);
      const md = `---
title: "Large Project"
description: "A project with large content"
custom:
${Array.from({ length: 15 }, (_, i) => `  field${i}: "value${i}"`).join('\n')}
---
${largeContent}`;

      const result = service.parseMarkdown(md);

      expect(result.valid).toBe(true);
      if (result.valid) {
        // Should warn about too many custom fields
        expect(result.warnings!.some(w => w.code === 'CUSTOM_FIELDS_WARNING')).toBe(true);
      }
    });

    it('should handle strict validation mode', () => {
      const md = `---
title: "Test Project"
description: "Test description"
featured: "true"
---
Content`;

      const result = service.parseMarkdown(md, { validationLevel: 'strict' });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0].severity).toBe('critical');
        expect(result.recoveredData).toBeUndefined();
      }
    });

    it('should disable recovery when enableRecovery is false', () => {
      const md = `---
title: "Test Project"
description: "Test description"
featured: "true"
---
Content`;

      const result = service.parseMarkdown(md, {
        validationLevel: 'lenient',
        enableRecovery: false,
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.warnings?.some(w => w.code === 'TYPE_RECOVERY')).toBeFalsy();
      }
    });

    it('should limit recovery attempts', () => {
      const md = `---
title: "Test Project"
description: "Test description"
featured: "invalid"
order: "invalid"
priority: "invalid"
---
Content`;

      const result = service.parseMarkdown(md, {
        validationLevel: 'lenient',
        maxRecoveryAttempts: 1,
      });

      if (result.valid) {
        expect(result.metadata?.recoveryAttempts).toBeLessThanOrEqual(1);
      }
    });

    it('should handle unexpected errors gracefully', () => {
      // Test with completely invalid content that will cause parsing to fail
      const result = service.parseMarkdown('---\ninvalid: yaml: content: [\n---\nContent');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0].code).toBe('FRONTMATTER_PARSE_ERROR');
        expect(result.errors[0].severity).toBe('critical');
      }
    });
  });

  describe('utility methods', () => {
    it('should validate schema versions', () => {
      expect(service.validateSchemaVersion('1.0.0')).toBe(true);
      expect(service.validateSchemaVersion('1.1.0')).toBe(true);
      expect(service.validateSchemaVersion('2.0.0')).toBe(false);
      expect(service.validateSchemaVersion('invalid')).toBe(false);
    });

    it('should return performance metrics', () => {
      const metrics = service.getPerformanceMetrics();
      expect(metrics).toHaveProperty('averageParseTime');
      expect(metrics).toHaveProperty('totalParses');
      expect(typeof metrics.averageParseTime).toBe('number');
      expect(typeof metrics.totalParses).toBe('number');
    });
  });

  describe('edge cases', () => {
    it('should handle empty markdown', () => {
      const result = service.parseMarkdown('');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some(e => e.field === 'title')).toBe(true);
        expect(result.errors.some(e => e.field === 'description')).toBe(true);
      }
    });

    it('should handle markdown without frontmatter', () => {
      const result = service.parseMarkdown('Just content without frontmatter');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some(e => e.field === 'title')).toBe(true);
        expect(result.errors.some(e => e.field === 'description')).toBe(true);
      }
    });

    it('should handle malformed YAML', () => {
      const md = `---
title: "Test"
description: "Test"
malformed: [unclosed array
---
Content`;

      const result = service.parseMarkdown(md);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors[0].code).toBe('FRONTMATTER_PARSE_ERROR');
      }
    });

    it('should handle very large custom metadata', () => {
      const largeCustom = Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => [`field${i}`, `value${i}`]),
      );

      const md = `---
title: "Test Project"
description: "Test description"
custom:
${Object.entries(largeCustom)
  .map(([k, v]) => `  ${k}: "${v}"`)
  .join('\n')}
---
Content`;

      const result = service.parseMarkdown(md);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.warnings!.some(w => w.code === 'CUSTOM_FIELDS_WARNING')).toBe(true);
      }
    });
  });
});
