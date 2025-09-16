import { z } from 'zod';

// Enhanced schema with validation for custom metadata
const CustomMetadataSchema = z.record(
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
    z.record(z.unknown()),
  ]),
);

// Social links schema
const SocialLinkSchema = z.object({
  platform: z.string(),
  url: z.string().url(),
  username: z.string().optional(),
});

// Technology stack schema
const TechnologyStackSchema = z.object({
  languages: z.array(z.string()).optional(),
  frameworks: z.array(z.string()).optional(),
  databases: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  platforms: z.array(z.string()).optional(),
});

// Project metrics schema
const ProjectMetricsSchema = z.object({
  complexity: z.enum(['simple', 'moderate', 'complex', 'enterprise']).optional(),
  estimatedHours: z.number().positive().optional(),
  teamSize: z.number().positive().optional(),
  linesOfCode: z.number().positive().optional(),
});

// SEO metadata schema
const SEOMetadataSchema = z.object({
  keywords: z.array(z.string()).optional(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImage: z.string().url().optional(),
  twitterCard: z.enum(['summary', 'summary_large_image', 'app', 'player']).optional(),
});

// Enhanced Portfolio metadata schema
export const PortfolioMetadataSchema = z.object({
  // Core fields (required)
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),

  // Basic metadata (optional)
  tags: z.array(z.string()).optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
  demoUrl: z.string().url().optional(),
  repoUrl: z.string().url().optional(),
  icon: z.string().optional(),
  image: z.string().url().optional(),
  category: z.string().optional(),
  order: z.number().optional(),
  githubSync: z.boolean().optional(),

  // Enhanced metadata
  version: z.string().optional(),
  license: z.string().optional(),
  status: z.enum(['active', 'maintenance', 'deprecated', 'archived']).optional(),
  visibility: z.enum(['public', 'private', 'unlisted']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),

  // Dates
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  lastUpdated: z.string().datetime().optional(),

  // URLs and links
  homepage: z.string().url().optional(),
  documentation: z.string().url().optional(),
  changelog: z.string().url().optional(),
  issues: z.string().url().optional(),
  wiki: z.string().url().optional(),
  socialLinks: z.array(SocialLinkSchema).optional(),

  // Technology and development
  technologyStack: TechnologyStackSchema.optional(),
  requirements: z.array(z.string()).optional(),
  installation: z.string().optional(),
  usage: z.string().optional(),

  // Project metadata
  metrics: ProjectMetricsSchema.optional(),
  contributors: z.array(z.string()).optional(),
  sponsors: z.array(z.string()).optional(),
  acknowledgments: z.array(z.string()).optional(),

  // SEO and marketing
  seo: SEOMetadataSchema.optional(),

  // Custom metadata (flexible)
  custom: CustomMetadataSchema.optional(),

  // Content (populated during parsing)
  body: z.string().optional(),

  // Validation metadata
  schemaVersion: z.string().optional(),
  validatedAt: z.string().datetime().optional(),
});

export type PortfolioMetadata = z.infer<typeof PortfolioMetadataSchema>;

// Export sub-schemas for reuse
export {
  CustomMetadataSchema,
  SocialLinkSchema,
  TechnologyStackSchema,
  ProjectMetricsSchema,
  SEOMetadataSchema,
};
