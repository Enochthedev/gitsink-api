import { z } from 'zod';

export const PortfolioMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()).optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
  demoUrl: z.string().optional(),
  repoUrl: z.string().optional(),
  icon: z.string().optional(),
  image: z.string().optional(),
  category: z.string().optional(),
  order: z.number().optional(),
  githubSync: z.boolean().optional(),
  custom: z.record(z.unknown()).optional(),
  body: z.string().optional(), // populated during parsing
});

export type PortfolioMetadata = z.infer<typeof PortfolioMetadataSchema>;
